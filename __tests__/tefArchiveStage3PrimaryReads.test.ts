import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Scenario, TefTopicArchive } from '../types';

const TOPIC_ARCHIVES_KEY = 'parle-tef-topic-archives';
const SCENARIOS_KEY = 'parle-scenarios';
const SCENARIOS_BRIDGE_DIRTY_KEY = 'parle-scenarios-bridge-dirty';
const SCENARIOS_MIRROR_DIRTY_KEY = 'parle-scenarios-mirror-dirty';
const SCENARIOS_PRIMARY_KEY = 'parle-scenarios-idb-primary';
const SCENARIOS_PENDING_KEY = 'parle-scenarios-pending-mutations';
const SCENARIOS_QUARANTINE_KEY = 'parle-scenarios-quarantined-mutations';

const archive = (id: string, createdAt = 100): TefTopicArchive => ({
  id,
  adId: 'ad-1',
  exerciseType: 'persuasion',
  createdAt,
  topicSuggestions: [{
    topic: 'Pricing',
    examples: [
      { french: 'Quel est le prix ?', english: 'What is the price?' },
      { french: 'Avez-vous une réduction ?', english: 'Do you have a discount?' },
    ],
  }],
});

const scenario = (id: string, createdAt = 100): Scenario => ({
  id,
  name: id,
  description: `Description for ${id}`,
  createdAt,
  isActive: true,
});

const pendingScenarioKey = (intentId: string) =>
  `${SCENARIOS_PENDING_KEY}:${encodeURIComponent(intentId)}`;

async function openCurrentDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open('parle-tef');
  return await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openCurrentDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function failNextReadWriteTransactionForStore(storeName: string) {
  const db = await openCurrentDatabase();
  const databasePrototype = Object.getPrototypeOf(db) as IDBDatabase;
  db.close();
  const originalTransaction = databasePrototype.transaction;
  let shouldFail = true;
  return vi.spyOn(databasePrototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    const [storeNames, mode] = args;
    const names = typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames);
    if (shouldFail && mode === 'readwrite' && names.includes(storeName)) {
      shouldFail = false;
      throw new Error(`Forced ${storeName} recovery transaction failure`);
    }
    return originalTransaction.apply(this, args);
  });
}

describe('Stage 3 IndexedDB-primary durable reads', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.resetModules();
  });

  it('reads verified topic archives and scenarios from IndexedDB and records cutover', async () => {
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify([archive('idb-archive')]));
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('idb-scenario')]));
    const service = await import('../services/tefArchiveService');
    await service.verifyDurableDataMirrors();

    // The rollback copies can be stale without becoming the primary read source.
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify([archive('rollback-only')]));
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('rollback-only')]));

    expect(await service.readTopicArchives()).toMatchObject({
      source: 'indexeddb',
      records: [{ id: 'idb-archive' }],
    });
    expect(await service.readSavedScenarios()).toMatchObject({
      source: 'indexeddb',
      records: [{ id: 'idb-scenario' }],
    });
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({ state: 'idb-primary' });
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({ state: 'idb-primary' });
  });

  it('completes Stage 2 reconciliation independently before each dataset cuts over', async () => {
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify([archive('verified-topic')]));
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('unverified-scenario')]));
    const service = await import('../services/tefArchiveService');
    await service.verifyTopicArchiveMirror();

    expect((await service.readTopicArchives()).source).toBe('indexeddb');
    expect(await service.readSavedScenarios()).toMatchObject({
      source: 'indexeddb',
      records: [{ id: 'unverified-scenario' }],
    });
  });

  it('does not cut over from Stage 1 metadata before a current Stage 2 reconciliation', async () => {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('stage-1-copy', 100)]));
    const service = await import('../services/tefArchiveService');
    await service.initializeScenarioMirror();

    const latestLocal = scenario('changed-before-stage-2', 200);
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([latestLocal]));

    expect(await service.readSavedScenarios()).toMatchObject({
      source: 'indexeddb',
      records: [{ id: 'changed-before-stage-2' }],
    });
    expect(await service.getScenarioMirrorSnapshot()).toEqual([latestLocal]);
  });

  it('uses fallback for an unexpectedly empty verified store without overwriting either copy', async () => {
    const localArchive = archive('must-survive');
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify([localArchive]));
    const service = await import('../services/tefArchiveService');
    await service.verifyTopicArchiveMirror();
    await clearStore('topicArchives');

    expect(await service.readTopicArchives()).toMatchObject({
      source: 'localstorage-fallback',
      fallbackReason: 'unexpected-empty-store',
      records: [{ id: 'must-survive' }],
    });
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(TOPIC_ARCHIVES_KEY) ?? '[]')).toEqual([localArchive]);
  });

  it('falls back when IndexedDB is unavailable and errors only if fallback data is unreadable', async () => {
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify([archive('fallback-topic')]));
    const service = await import('../services/tefArchiveService');
    vi.stubGlobal('indexedDB', undefined);

    expect(await service.readTopicArchives()).toMatchObject({
      source: 'localstorage-fallback',
      fallbackReason: 'indexeddb-unavailable',
      records: [{ id: 'fallback-topic' }],
    });

    localStorage.setItem(TOPIC_ARCHIVES_KEY, '{malformed');
    await expect(service.readTopicArchives()).rejects.toThrow(/fallback is unreadable/);
  });

  it('serializes concurrent primary writes and keeps both rollback bridges current', async () => {
    localStorage.setItem(TOPIC_ARCHIVES_KEY, '[]');
    localStorage.setItem(SCENARIOS_KEY, '[]');
    const service = await import('../services/tefArchiveService');
    await service.verifyDurableDataMirrors();

    await Promise.all([
      service.saveTopicArchive({
        adId: 'ad-1',
        exerciseType: 'persuasion',
        topicSuggestions: archive('template').topicSuggestions,
      }),
      service.saveTopicArchive({
        adId: 'ad-2',
        exerciseType: 'questioning',
        topicSuggestions: archive('template').topicSuggestions,
      }),
      service.saveSavedScenario(scenario('scenario-a')),
      service.saveSavedScenario(scenario('scenario-b')),
    ]);

    expect(await service.listTopicArchives()).toHaveLength(2);
    expect(await service.listSavedScenarios()).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(TOPIC_ARCHIVES_KEY) ?? '[]')).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]')).toHaveLength(2);
  });

  it('never serves a stale rollback bridge and repairs it from IndexedDB', async () => {
    localStorage.setItem(SCENARIOS_KEY, '[]');
    const service = await import('../services/tefArchiveService');
    await service.verifyScenarioMirror();

    const originalSetItem = Storage.prototype.setItem;
    const availableIndexedDb = indexedDB;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (this === localStorage && key === SCENARIOS_KEY) {
        throw new Error('Forced rollback bridge failure');
      }
      return originalSetItem.call(this, key, value);
    });
    let setItemSpyRestored = false;

    try {
      await service.saveSavedScenario(scenario('idb-committed'));
      setItemSpy.mockRestore();
      setItemSpyRestored = true;

      expect(await service.getScenarioMirrorSnapshot()).toEqual([
        expect.objectContaining({ id: 'idb-committed' }),
      ]);
      expect(JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]')).toEqual([]);
      expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).not.toBeNull();

      vi.stubGlobal('indexedDB', undefined);
      await expect(service.readSavedScenarios()).rejects.toThrow(/rollback bridge is stale/);

      vi.stubGlobal('indexedDB', availableIndexedDb);
      expect(await service.listSavedScenarios()).toEqual([
        expect.objectContaining({ id: 'idb-committed' }),
      ]);
      expect(JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]')).toEqual([
        expect.objectContaining({ id: 'idb-committed' }),
      ]);
      expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).toBeNull();
    } finally {
      if (!setItemSpyRestored) setItemSpy.mockRestore();
      consoleError.mockRestore();
      vi.stubGlobal('indexedDB', availableIndexedDb);
    }
  });

  it('keeps the bridge dirty when a quota failure prevents the rollback bridge write', async () => {
    localStorage.setItem(SCENARIOS_KEY, '[]');
    const service = await import('../services/tefArchiveService');
    await service.verifyScenarioMirror();

    const originalSetItem = Storage.prototype.setItem;
    let forcedQuotaFailure = false;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (this === localStorage && key === SCENARIOS_KEY && !forcedQuotaFailure) {
        forcedQuotaFailure = true;
        throw new DOMException('Forced quota failure', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    try {
      await service.saveSavedScenario(scenario('quota-committed'));
    } finally {
      setItemSpy.mockRestore();
    }

    expect(JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]')).toEqual([]);
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).not.toBeNull();

    expect(await service.listSavedScenarios()).toEqual([
      expect.objectContaining({ id: 'quota-committed' }),
    ]);
    expect(JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]')).toEqual([
      expect.objectContaining({ id: 'quota-committed' }),
    ]);
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).toBeNull();
  });

  it('replays crash-journal mutations onto the latest IndexedDB state without snapshot deletion', async () => {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([
      scenario('a', 100),
      scenario('b', 200),
    ]));
    const service = await import('../services/tefArchiveService');
    await service.verifyScenarioMirror();
    await service.readSavedScenarios();
    expect(localStorage.getItem(SCENARIOS_PRIMARY_KEY)).toBe('1');

    const updatedB = { ...scenario('b', 200), description: 'Updated after the outage' };
    const createdC = scenario('c', 300);
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('a', 100), createdC]));
    const journal = [
      { id: 'intent-update-b', createdAt: 1, kind: 'upsert', record: updatedB },
      { id: 'intent-create-c', createdAt: 2, kind: 'upsert', record: createdC },
      { id: 'intent-delete-a', createdAt: 3, kind: 'delete-id', targetId: 'a' },
    ];
    for (const intent of journal) {
      localStorage.setItem(pendingScenarioKey(intent.id), JSON.stringify(intent));
    }
    localStorage.setItem(SCENARIOS_BRIDGE_DIRTY_KEY, '1');

    await service.recoverDurableDataAtStartup();

    const recovered = await service.getScenarioMirrorSnapshot();
    expect(recovered).toHaveLength(2);
    expect(recovered).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'b', description: 'Updated after the outage' }),
      expect.objectContaining({ id: 'c' }),
    ]));
    expect(recovered.some((item) => item.id === 'a')).toBe(false);
    const bridge = JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]') as Scenario[];
    expect(bridge).toHaveLength(2);
    expect(bridge).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'b', description: 'Updated after the outage' }),
        expect.objectContaining({ id: 'c' }),
      ])
    );
    expect(bridge.some((item) => item.id === 'a')).toBe(false);
    for (const intent of journal) {
      expect(localStorage.getItem(pendingScenarioKey(intent.id))).toBeNull();
    }
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).toBeNull();
  });

  it('repairs a legacy dirty post-cutover dataset from IndexedDB at startup', async () => {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('must-survive')]));
    const service = await import('../services/tefArchiveService');
    await service.verifyScenarioMirror();
    await service.readSavedScenarios();

    localStorage.setItem(SCENARIOS_KEY, '[]');
    localStorage.setItem(SCENARIOS_MIRROR_DIRTY_KEY, 'legacy-dirty-token');

    await service.recoverDurableDataAtStartup();

    expect(await service.getScenarioMirrorSnapshot()).toEqual([
      expect.objectContaining({ id: 'must-survive' }),
    ]);
    expect(JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]')).toEqual([
      expect.objectContaining({ id: 'must-survive' }),
    ]);
    expect(localStorage.getItem(SCENARIOS_MIRROR_DIRTY_KEY)).toBeNull();
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      state: 'idb-primary',
      verificationStatus: 'verified',
    });
  });

  it('never runs destructive localStorage-to-IndexedDB verification after cutover', async () => {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([
      scenario('a', 100),
      scenario('b', 200),
    ]));
    const service = await import('../services/tefArchiveService');
    await service.verifyScenarioMirror();
    await service.readSavedScenarios();

    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('a', 100)]));
    await service.verifyScenarioMirror();

    expect(await service.getScenarioMirrorSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'b' }),
    ]));
    expect(await service.getScenarioMirrorSnapshot()).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]')).toHaveLength(2);
  });

  it('removes only replayed intent keys when another tab journals during recovery', async () => {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('a')]));
    const service = await import('../services/tefArchiveService');
    await service.verifyScenarioMirror();
    await service.readSavedScenarios();

    const firstIntent = {
      id: 'intent-first',
      createdAt: 1,
      kind: 'upsert',
      record: scenario('first', 200),
    };
    const concurrentIntent = {
      id: 'intent-concurrent',
      createdAt: 2,
      kind: 'upsert',
      record: scenario('concurrent', 300),
    };
    localStorage.setItem(pendingScenarioKey(firstIntent.id), JSON.stringify(firstIntent));
    localStorage.setItem(SCENARIOS_BRIDGE_DIRTY_KEY, '1');

    const originalSetItem = Storage.prototype.setItem;
    let injected = false;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (this === localStorage && key === SCENARIOS_KEY && !injected) {
        injected = true;
        originalSetItem.call(
          localStorage,
          pendingScenarioKey(concurrentIntent.id),
          JSON.stringify(concurrentIntent)
        );
      }
      return originalSetItem.call(this, key, value);
    });

    try {
      await service.recoverDurableDataAtStartup();
    } finally {
      setItemSpy.mockRestore();
    }

    expect(localStorage.getItem(pendingScenarioKey(firstIntent.id))).toBeNull();
    expect(localStorage.getItem(pendingScenarioKey(concurrentIntent.id))).not.toBeNull();
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).not.toBeNull();
    expect(await service.getScenarioMirrorSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'first' }),
    ]));
    expect((await service.getScenarioMirrorSnapshot()).some(
      (item) => item.id === 'concurrent'
    )).toBe(false);

    await service.recoverDurableDataAtStartup();

    expect(localStorage.getItem(pendingScenarioKey(concurrentIntent.id))).toBeNull();
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).toBeNull();
    expect(await service.getScenarioMirrorSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'first' }),
      expect.objectContaining({ id: 'concurrent' }),
    ]));
  });

  it('retains replayed intent keys until an exact rollback bridge is secured', async () => {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('a')]));
    const service = await import('../services/tefArchiveService');
    await service.verifyScenarioMirror();
    await service.readSavedScenarios();

    const intent = {
      id: 'intent-survives-bridge-failure',
      createdAt: 1,
      kind: 'upsert',
      record: scenario('survivor', 200),
    };
    localStorage.setItem(pendingScenarioKey(intent.id), JSON.stringify(intent));
    localStorage.setItem(SCENARIOS_BRIDGE_DIRTY_KEY, '1');

    const originalSetItem = Storage.prototype.setItem;
    let quotaFailures = 0;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (this === localStorage && key === SCENARIOS_KEY && quotaFailures < 2) {
        quotaFailures += 1;
        throw new DOMException('Forced quota failure', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    try {
      await service.recoverDurableDataAtStartup();
    } finally {
      setItemSpy.mockRestore();
    }

    expect(await service.getScenarioMirrorSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'survivor' }),
    ]));
    expect(localStorage.getItem(pendingScenarioKey(intent.id))).not.toBeNull();
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).not.toBeNull();

    await service.recoverDurableDataAtStartup();

    expect(localStorage.getItem(pendingScenarioKey(intent.id))).toBeNull();
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'survivor' })])
    );
  });

  it('retains replayed intent keys when metadata persistence is interrupted', async () => {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('a')]));
    const service = await import('../services/tefArchiveService');
    await service.verifyScenarioMirror();
    await service.readSavedScenarios();

    const intent = {
      id: 'intent-survives-metadata-failure',
      createdAt: 1,
      kind: 'upsert',
      record: scenario('metadata-survivor', 200),
    };
    localStorage.setItem(pendingScenarioKey(intent.id), JSON.stringify(intent));
    localStorage.setItem(SCENARIOS_BRIDGE_DIRTY_KEY, '1');
    const transactionSpy = await failNextReadWriteTransactionForStore('migrationMetadata');

    try {
      await expect(service.recoverDurableDataAtStartup()).rejects.toThrow(
        /Forced migrationMetadata recovery transaction failure/
      );
    } finally {
      transactionSpy.mockRestore();
    }

    expect(await service.getScenarioMirrorSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'metadata-survivor' }),
    ]));
    expect(JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? '[]')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'metadata-survivor' })])
    );
    expect(localStorage.getItem(pendingScenarioKey(intent.id))).not.toBeNull();
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).not.toBeNull();

    await service.recoverDurableDataAtStartup();

    expect(localStorage.getItem(pendingScenarioKey(intent.id))).toBeNull();
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).toBeNull();
  });

  it('quarantines malformed journal entries and still replays valid mutations', async () => {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('a')]));
    const service = await import('../services/tefArchiveService');
    await service.verifyScenarioMirror();
    await service.readSavedScenarios();

    const malformedKey = pendingScenarioKey('malformed');
    const validIntent = {
      id: 'valid-after-malformed',
      createdAt: 2,
      kind: 'upsert',
      record: scenario('recovered-valid', 200),
    };
    localStorage.setItem(malformedKey, '{broken-json');
    localStorage.setItem(pendingScenarioKey(validIntent.id), JSON.stringify(validIntent));

    expect(await service.readSavedScenarios()).toMatchObject({
      source: 'indexeddb',
      records: expect.arrayContaining([
        expect.objectContaining({ id: 'a' }),
        expect.objectContaining({ id: 'recovered-valid' }),
      ]),
    });
    expect(localStorage.getItem(malformedKey)).toBeNull();
    expect(localStorage.getItem(pendingScenarioKey(validIntent.id))).toBeNull();

    const quarantineKeys = Array.from(
      { length: localStorage.length },
      (_, index) => localStorage.key(index)
    ).filter((key): key is string => key?.startsWith(`${SCENARIOS_QUARANTINE_KEY}:`) ?? false);
    expect(quarantineKeys).toHaveLength(1);
    expect(localStorage.getItem(SCENARIOS_BRIDGE_DIRTY_KEY)).not.toBeNull();

    expect(await service.listSavedScenarios()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'recovered-valid' }),
    ]));
  });
});
