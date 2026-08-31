import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { strToU8, zipSync } from 'fflate';
import type { Scenario, TefSavedAd, TefTopicArchive } from '../types';
import { BACKUP_LIMITS } from '../services/backupLimits';

const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0)
);
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const sampleTopics = [{
  topic: 'Pricing',
  examples: [
    { french: 'Quel est le prix ?', english: 'What is the price?' },
    { french: 'Avez-vous une réduction ?', english: 'Do you have a discount?' },
  ],
}];

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function packageFromManifest(
  manifest: unknown,
  images: Record<string, Uint8Array> = { 'images/tef_ad_1.png': PNG_BYTES }
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 | 6 }]> = {
    'manifest.json': [strToU8(`${JSON.stringify(manifest)}\n`), { level: 6 }],
  };
  for (const [path, bytes] of Object.entries(images)) {
    files[path] = [bytes, { level: 0 }];
  }
  return zipSync(files);
}

async function validManifest(overrides: Record<string, unknown> = {}) {
  const sha256 = await sha256Hex(PNG_BYTES);
  return {
    format: 'parle-backup',
    version: 1,
    exportedAt: '2026-08-28T00:00:00.000Z',
    savedAds: [{
      id: 'tef_ad_1',
      exerciseType: 'persuasion',
      imagePath: 'images/tef_ad_1.png',
      mimeType: 'image/png',
      sha256,
      confirmation: { summary: 'Gym ad', roleSummary: 'Customer' },
      createdAt: 10,
      lastUsedAt: 20,
    }],
    topicArchives: [{
      id: 'archive_1',
      adId: 'tef_ad_1',
      exerciseType: 'persuasion',
      createdAt: 11,
      topicSuggestions: sampleTopics,
    }],
    scenarios: [{
      id: 'scenario_1',
      name: 'Bakery',
      description: 'Order bread',
      createdAt: 12,
      isActive: true,
    }],
    ...overrides,
  };
}

async function seedLocalDifferentAd() {
  const archive = await import('../services/tefArchiveService');
  await archive.upsertSavedAd({
    id: 'tef_ad_1',
    exerciseType: 'persuasion',
    imageDataUrl: PNG_DATA_URL,
    mimeType: 'image/png',
    confirmation: { summary: 'Different local ad', roleSummary: 'Different role' },
  });
  await archive.saveSavedScenario({
    id: 'scenario_1',
    name: 'Local bakery',
    description: 'Local description',
    createdAt: 99,
    isActive: true,
  });
}

describe('Stage 5 backup import', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.resetModules();
  });

  it('imports declared data and is idempotent on a second apply', async () => {
    const archive = await import('../services/tefArchiveService');
    const backup = await import('../services/backupService');
    const bytes = await packageFromManifest(await validManifest());
    const inspected = await backup.inspectParleBackup(bytes);
    expect(inspected.preview.additions).toEqual({ ads: 1, archives: 1, scenarios: 1 });

    await backup.applyParleBackupImport(inspected, { mode: 'merge' });
    expect(await archive.listAllSavedAds()).toHaveLength(1);
    expect(await archive.listTopicArchives()).toHaveLength(1);
    expect(await archive.listSavedScenarios()).toHaveLength(1);
    // IndexedDB is the only database: an import writes no localStorage copy.
    expect(localStorage.getItem('parle-tef-topic-archives')).toBeNull();
    expect(localStorage.getItem('parle-scenarios')).toBeNull();

    const second = await backup.inspectParleBackup(bytes);
    expect(second.preview.additions).toEqual({ ads: 0, archives: 0, scenarios: 0 });
    expect(second.preview.skips).toEqual({ ads: 1, archives: 1, scenarios: 1 });
    await backup.applyParleBackupImport(second, { mode: 'merge' });
    expect(await archive.listAllSavedAds()).toHaveLength(1);
    expect(await archive.listTopicArchives()).toHaveLength(1);
    expect(await archive.listSavedScenarios()).toHaveLength(1);
  });

  it('remaps differing ID collisions and rewrites archive adId references', async () => {
    await seedLocalDifferentAd();
    const backup = await import('../services/backupService');
    const archive = await import('../services/tefArchiveService');
    const bytes = await packageFromManifest(await validManifest());
    const inspected = await backup.inspectParleBackup(bytes);
    expect(inspected.preview.conflicts.some((conflict) => conflict.incomingId === 'tef_ad_1')).toBe(true);
    expect(inspected.preview.conflicts.some((conflict) => conflict.incomingId === 'scenario_1')).toBe(true);

    await backup.applyParleBackupImport(inspected, { mode: 'merge' });
    const ads = await archive.listAllSavedAds();
    expect(ads).toHaveLength(2);
    const remappedAd = ads.find((ad: TefSavedAd) => ad.id !== 'tef_ad_1');
    expect(remappedAd?.confirmation.summary).toBe('Gym ad');
    const archives = await archive.listTopicArchives();
    expect(archives).toHaveLength(1);
    expect(archives[0].adId).toBe(remappedAd?.id);
    const scenarios = await archive.listSavedScenarios();
    expect(scenarios).toHaveLength(2);
    expect(scenarios.some((scenario: Scenario) => scenario.name === 'Bakery')).toBe(true);
    expect(scenarios.some((scenario: Scenario) => scenario.name === 'Local bakery')).toBe(true);
  });

  it('rejects missing, path-traversing, signature-mismatched, and extra assets before writes', async () => {
    const archive = await import('../services/tefArchiveService');
    const backup = await import('../services/backupService');
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

    await expect(backup.inspectParleBackup(await packageFromManifest(await validManifest(), {})))
      .rejects.toMatchObject({ code: 'missing-asset' });

    await expect(backup.inspectParleBackup(await packageFromManifest(
      await validManifest(),
      { 'images/tef_ad_1.png': jpegBytes }
    ))).rejects.toMatchObject({ code: 'signature-mismatch' });

    await expect(backup.inspectParleBackup(zipSync({
      'manifest.json': strToU8('{}'),
      'images/../../secret.png': PNG_BYTES,
    }))).rejects.toMatchObject({ code: 'invalid-path' });

    const extra = await packageFromManifest(await validManifest(), {
      'images/tef_ad_1.png': PNG_BYTES,
      'images/extra.png': PNG_BYTES,
    });
    await expect(backup.inspectParleBackup(extra)).rejects.toMatchObject({ code: 'undeclared-asset' });
    expect(await archive.listAllSavedAds()).toHaveLength(0);
  });

  it('rejects unsupported versions and malformed scenarios before writes', async () => {
    const archive = await import('../services/tefArchiveService');
    await archive.upsertSavedAd({
      id: 'keep-me',
      exerciseType: 'persuasion',
      imageDataUrl: PNG_DATA_URL,
      mimeType: 'image/png',
      confirmation: { summary: 'keep', roleSummary: 'keep' },
    });
    const backup = await import('../services/backupService');

    await expect(backup.inspectParleBackup(await packageFromManifest(
      await validManifest({ version: 2 })
    ))).rejects.toMatchObject({ code: 'unsupported-version' });

    await expect(backup.inspectParleBackup(await packageFromManifest(
      await validManifest({
        scenarios: [{ id: 'bad', createdAt: 1, isActive: true }],
      })
    ))).rejects.toMatchObject({ code: 'invalid-manifest' });

    expect(await archive.getSavedAd('keep-me')).not.toBeNull();
  });

  it('leaves existing data unchanged when the import transaction fails', async () => {
    const archive = await import('../services/tefArchiveService');
    await archive.upsertSavedAd({
      id: 'keep-me',
      exerciseType: 'persuasion',
      imageDataUrl: PNG_DATA_URL,
      mimeType: 'image/png',
      confirmation: { summary: 'keep', roleSummary: 'keep' },
    });
    const backup = await import('../services/backupService');
    const inspected = await backup.inspectParleBackup(await packageFromManifest(await validManifest()));

    const openRequest = indexedDB.open('parle-tef');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });
    const databasePrototype = Object.getPrototypeOf(db) as IDBDatabase;
    db.close();
    const originalTransaction = databasePrototype.transaction;
    let shouldFail = true;
    const spy = vi.spyOn(databasePrototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const [storeNames, mode] = args;
      const names = typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames);
      if (shouldFail && mode === 'readwrite' && names.includes('savedAds') && names.includes('topicArchives')) {
        shouldFail = false;
        throw new Error('forced import failure');
      }
      return originalTransaction.apply(this, args);
    });

    await expect(backup.applyParleBackupImport(inspected, { mode: 'merge' }))
      .rejects.toThrow(/forced import failure/);
    spy.mockRestore();
    expect(await archive.getSavedAd('keep-me')).not.toBeNull();
    expect(await archive.getSavedAd('tef_ad_1')).toBeNull();
    expect(await archive.listTopicArchives()).toHaveLength(0);
  });

  it('requires explicit confirmation for replace mode and then replaces atomically', async () => {
    await seedLocalDifferentAd();
    const backup = await import('../services/backupService');
    const archive = await import('../services/tefArchiveService');
    const inspected = await backup.inspectParleBackup(await packageFromManifest(await validManifest()));

    await expect(backup.applyParleBackupImport(inspected, { mode: 'replace' }))
      .rejects.toMatchObject({ code: 'replace-not-confirmed' });
    expect(await archive.getSavedAd('tef_ad_1')).toMatchObject({ confirmation: { summary: 'Different local ad' } });

    await backup.applyParleBackupImport(inspected, { mode: 'replace', confirmReplace: true });
    const ads = await archive.listAllSavedAds();
    expect(ads).toHaveLength(1);
    expect(ads[0]).toMatchObject({ id: 'tef_ad_1', confirmation: { summary: 'Gym ad' } });
    expect(await archive.listSavedScenarios()).toEqual([
      expect.objectContaining({ id: 'scenario_1', name: 'Bakery' }),
    ]);
  });

  it('rejects orphaned archives in an incoming package', async () => {
    const backup = await import('../services/backupService');
    const manifest = await validManifest({
      topicArchives: [{
        id: 'orphan',
        adId: 'missing',
        exerciseType: 'persuasion',
        createdAt: 1,
        topicSuggestions: sampleTopics,
      }] as TefTopicArchive[],
    });
    await expect(backup.inspectParleBackup(await packageFromManifest(manifest)))
      .rejects.toMatchObject({ code: 'orphaned-archive' });
  });

  it('enforces package entry-count limits before extraction', async () => {
    const backup = await import('../services/backupService');
    const files: Record<string, Uint8Array> = {
      'manifest.json': strToU8('{}'),
    };
    for (let index = 0; index < BACKUP_LIMITS.maxZipEntries; index += 1) {
      files[`images/extra-${index}.png`] = PNG_BYTES;
    }
    await expect(backup.inspectParleBackup(zipSync(files)))
      .rejects.toMatchObject({ code: 'too-many-entries' });
  });

  it('omits undefined object properties and emits null for undefined array elements', async () => {
    const { canonicalJson, recordsEquivalent } = await import('../services/backupFormat');
    expect(canonicalJson({ id: 'scenario_1', characters: undefined })).toBe(canonicalJson({ id: 'scenario_1' }));
    expect(canonicalJson({ id: 'scenario_1', characters: undefined })).toBe('{"id":"scenario_1"}');
    expect(canonicalJson(['keep', undefined, 'also'])).toBe('["keep",null,"also"]');
    expect(recordsEquivalent(
      {
        id: 'scenario_1',
        name: 'Bakery',
        description: 'Order bread',
        createdAt: 12,
        isActive: true,
        characters: undefined,
        steps: undefined,
      },
      {
        id: 'scenario_1',
        name: 'Bakery',
        description: 'Order bread',
        createdAt: 12,
        isActive: true,
      }
    )).toBe(true);
  });

  it('skips equivalent scenarios on repeated merge when optional fields are undefined versus omitted', async () => {
    const archive = await import('../services/tefArchiveService');
    await archive.saveSavedScenario({
      id: 'scenario_1',
      name: 'Bakery',
      description: 'Order bread',
      createdAt: 12,
      isActive: true,
      characters: undefined,
      steps: undefined,
      aiSummary: undefined,
      isTefQuestioning: undefined,
    } as Scenario);

    const backup = await import('../services/backupService');
    const bytes = await packageFromManifest(
      await validManifest({
        savedAds: [],
        topicArchives: [],
        scenarios: [{
          id: 'scenario_1',
          name: 'Bakery',
          description: 'Order bread',
          createdAt: 12,
          isActive: true,
        }],
      }),
      {}
    );
    const inspected = await backup.inspectParleBackup(bytes);
    expect(inspected.preview.additions.scenarios).toBe(0);
    expect(inspected.preview.skips.scenarios).toBe(1);
    expect(inspected.preview.conflicts).toEqual([]);

    await backup.applyParleBackupImport(inspected, { mode: 'merge' });
    const scenarios = await archive.listSavedScenarios();
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].id).toBe('scenario_1');
  });

  it('rejects merge apply when local data changed since the preview', async () => {
    const archive = await import('../services/tefArchiveService');
    const backup = await import('../services/backupService');
    const inspected = await backup.inspectParleBackup(await packageFromManifest(await validManifest()));
    expect(inspected.preview.additions).toEqual({ ads: 1, archives: 1, scenarios: 1 });

    await seedLocalDifferentAd();

    await expect(backup.applyParleBackupImport(inspected, { mode: 'merge' }))
      .rejects.toMatchObject({ code: 'preview-stale' });
    expect(await archive.listAllSavedAds()).toHaveLength(1);
    expect(await archive.getSavedAd('tef_ad_1')).toMatchObject({
      confirmation: { summary: 'Different local ad' },
    });
    expect(await archive.listSavedScenarios()).toEqual([
      expect.objectContaining({ id: 'scenario_1', name: 'Local bakery' }),
    ]);
    expect(await archive.listTopicArchives()).toHaveLength(0);
  });

  it('aborts import when a dataset still has unadopted legacy localStorage data', async () => {
    const archive = await import('../services/tefArchiveService');
    const backup = await import('../services/backupService');
    const inspected = await backup.inspectParleBackup(await packageFromManifest(await validManifest()));

    localStorage.setItem(
      `parle-scenarios-pending-mutations:${encodeURIComponent('scenario_pending')}`,
      JSON.stringify({
        id: 'scenario_pending',
        kind: 'upsert',
        record: {
          id: 'scenario_pending',
          name: 'Pending',
          description: 'Unresolved',
          createdAt: 1,
          isActive: true,
        },
      })
    );

    await expect(backup.applyParleBackupImport(inspected, { mode: 'merge' }))
      .rejects.toMatchObject({ code: 'unresolved-recovery' });
    expect(await archive.listAllSavedAds()).toHaveLength(0);
    expect(await archive.listTopicArchives()).toHaveLength(0);
    expect(await archive.listSavedScenarios()).toHaveLength(0);
    expect(
      localStorage.getItem(`parle-scenarios-pending-mutations:${encodeURIComponent('scenario_pending')}`)
    ).toBeTruthy();
  });

  it('rejects ZIP entries that use unsupported compression methods', async () => {
    const backup = await import('../services/backupService');
    const bytes = await packageFromManifest(await validManifest());
    const patched = Uint8Array.from(bytes);
    const view = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
    let patchedEntry = false;
    for (let offset = 0; offset + 46 <= patched.byteLength; offset += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) continue;
      view.setUint16(offset + 10, 9, true);
      patchedEntry = true;
      break;
    }
    expect(patchedEntry).toBe(true);
    await expect(backup.inspectParleBackup(patched)).rejects.toMatchObject({ code: 'invalid-zip' });
  });
});
