import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { strFromU8, unzipSync } from 'fflate';
import type { Character, Scenario, ScenarioStep, TefSavedAd } from '../types';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const sampleTopics = [{
  topic: 'Pricing',
  examples: [
    { french: 'Quel est le prix ?', english: 'What is the price?' },
    { french: 'Avez-vous une réduction ?', english: 'Do you have a discount?' },
  ],
}];

const legacyScenario = (id: string): Scenario => ({
  id,
  name: `Legacy ${id}`,
  description: `Legacy description for ${id}`,
  createdAt: 100,
  isActive: true,
});

const currentScenario = (id: string): Scenario => {
  const characters: Character[] = [
    { id: 'char-1', name: 'Claire', role: 'Client', voiceName: 'kore', description: 'A skeptical client' },
  ];
  const steps: ScenarioStep[] = [{ id: 'step-1', text: 'Greet the client' }];
  return {
    id,
    name: `Current ${id}`,
    description: `Current description for ${id}`,
    aiSummary: `Summary for ${id}`,
    createdAt: 200,
    isActive: true,
    characters,
    isTefQuestioning: false,
    steps,
  };
};

async function seedDurableData() {
  const archive = await import('../services/tefArchiveService');
  const persuasion = await archive.upsertSavedAd({
    id: 'tef_ad_persuasion',
    exerciseType: 'persuasion',
    imageDataUrl: PNG_DATA_URL,
    mimeType: 'image/png',
    confirmation: { summary: 'A gym membership ad', roleSummary: 'You are the customer' },
  });
  const questioning = await archive.upsertSavedAd({
    id: 'tef_ad_questioning',
    exerciseType: 'questioning',
    imageDataUrl: PNG_DATA_URL,
    mimeType: 'image/png',
    confirmation: { summary: 'A language school ad', roleSummary: 'You are calling the school' },
  });
  const archiveOne = await archive.saveTopicArchive({
    adId: persuasion.id,
    exerciseType: 'persuasion',
    topicSuggestions: sampleTopics,
  });
  const archiveTwo = await archive.saveTopicArchive({
    adId: questioning.id,
    exerciseType: 'questioning',
    topicSuggestions: [{ topic: 'Hours', examples: sampleTopics[0].examples }],
  });
  await archive.saveSavedScenario(legacyScenario('scenario_legacy'));
  await archive.saveSavedScenario(currentScenario('scenario_current'));
  return { persuasion, questioning, archiveOne, archiveTwo };
}

describe('Stage 5 backup export', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.resetModules();
  });

  it('exports ads, binary images, linked archives, and legacy/current scenarios', async () => {
    localStorage.setItem('parle_api_key_gemini', 'secret-gemini-key');
    localStorage.setItem('parle_api_key_openai', 'secret-openai-key');
    const seeded = await seedDurableData();
    const { exportParleBackup } = await import('../services/backupService');
    const result = await exportParleBackup();

    expect(result.filename).toMatch(/^parle-backup-\d{4}-\d{2}-\d{2}\.parle$/);
    expect(result.diagnostics.savedAdCount).toBe(2);
    expect(result.diagnostics.topicArchiveCount).toBe(2);
    expect(result.diagnostics.scenarioCount).toBe(2);
    expect(result.diagnostics.orphanedArchiveIds).toEqual([]);

    const unzipped = unzipSync(result.bytes);
    const names = Object.keys(unzipped);
    expect(names).toContain('manifest.json');
    expect(names).toContain('images/tef_ad_persuasion.png');
    expect(names).toContain('images/tef_ad_questioning.png');
    const manifest = JSON.parse(strFromU8(unzipped['manifest.json']));
    expect(manifest.format).toBe('parle-backup');
    expect(manifest.version).toBe(1);
    expect(manifest.savedAds.map((ad: TefSavedAd) => ad.id).sort()).toEqual([
      'tef_ad_persuasion',
      'tef_ad_questioning',
    ]);
    expect(manifest.savedAds.every((ad: { imagePath: string }) => ad.imagePath.startsWith('images/'))).toBe(true);
    expect(manifest.topicArchives).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: seeded.archiveOne.id, adId: 'tef_ad_persuasion', exerciseType: 'persuasion' }),
      expect.objectContaining({ id: seeded.archiveTwo.id, adId: 'tef_ad_questioning', exerciseType: 'questioning' }),
    ]));
    const legacy = manifest.scenarios.find((scenario: Scenario) => scenario.id === 'scenario_legacy');
    const current = manifest.scenarios.find((scenario: Scenario) => scenario.id === 'scenario_current');
    expect(legacy).toMatchObject({ name: 'Legacy scenario_legacy', description: 'Legacy description for scenario_legacy' });
    expect(legacy).not.toHaveProperty('characters');
    expect(legacy).not.toHaveProperty('steps');
    expect(current.characters).toEqual(currentScenario('scenario_current').characters);
    expect(current.steps).toEqual(currentScenario('scenario_current').steps);
    expect(JSON.stringify(manifest)).not.toContain('secret-gemini-key');
    expect(JSON.stringify(manifest)).not.toContain('secret-openai-key');
    expect(names.every((name) => !name.includes('audio') && !name.includes('message'))).toBe(true);

    const pngBytes = unzipped['images/tef_ad_persuasion.png'];
    expect(Array.from(pngBytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('reports orphaned archives instead of silently dropping them', async () => {
    const archive = await import('../services/tefArchiveService');
    await archive.saveTopicArchive({
      adId: 'missing-ad',
      exerciseType: 'persuasion',
      topicSuggestions: sampleTopics,
    });
    const { exportParleBackup } = await import('../services/backupService');
    const result = await exportParleBackup();
    expect(result.diagnostics.orphanedArchiveIds).toHaveLength(1);
    expect(result.diagnostics.topicArchiveCount).toBe(0);
    const unzipped = unzipSync(result.bytes);
    const manifest = JSON.parse(strFromU8(unzipped['manifest.json']));
    expect(manifest.topicArchives).toEqual([]);
  });

  it('produces a package the importer accepts', async () => {
    await seedDurableData();
    const backup = await import('../services/backupService');
    const exported = await backup.exportParleBackup();
    const inspected = await backup.inspectParleBackup(exported.bytes);
    expect(inspected.preview.additions).toEqual({ ads: 0, archives: 0, scenarios: 0 });
    expect(inspected.preview.skips).toEqual({ ads: 2, archives: 2, scenarios: 2 });
  });

  it('enforces uncompressed and compressed export size limits', async () => {
    await seedDurableData();
    const { BACKUP_LIMITS } = await import('../services/backupLimits');
    const backup = await import('../services/backupService');
    const originalUncompressed = BACKUP_LIMITS.maxUncompressedBytes;
    const originalCompressed = BACKUP_LIMITS.maxCompressedBytes;
    const mutableLimits = BACKUP_LIMITS as {
      maxUncompressedBytes: number;
      maxCompressedBytes: number;
    };
    try {
      mutableLimits.maxUncompressedBytes = 1;
      await expect(backup.exportParleBackup()).rejects.toMatchObject({ code: 'uncompressed-too-large' });

      mutableLimits.maxUncompressedBytes = originalUncompressed;
      mutableLimits.maxCompressedBytes = 1;
      await expect(backup.exportParleBackup()).rejects.toMatchObject({ code: 'package-too-large' });
    } finally {
      mutableLimits.maxUncompressedBytes = originalUncompressed;
      mutableLimits.maxCompressedBytes = originalCompressed;
    }
  });
});
