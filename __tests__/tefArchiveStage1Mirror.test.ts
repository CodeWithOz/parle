import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type {
  DurableDataMigrationMetadata,
  Scenario,
  TefSavedAd,
  TefTopicArchive,
} from '../types';

const TOPIC_ARCHIVES_KEY = 'parle-tef-topic-archives';
const SCENARIOS_KEY = 'parle-scenarios';

const topics = [
  {
    topic: 'Pricing',
    examples: [
      { french: 'Quel est le prix ?', english: 'What is the price?' },
      { french: 'Y a-t-il une réduction ?', english: 'Is there a discount?' },
    ],
  },
];

function archive(id: string, adId = 'ad-1', createdAt = 100): TefTopicArchive {
  return {
    id,
    adId,
    exerciseType: 'persuasion',
    createdAt,
    topicSuggestions: topics,
  };
}

function savedAd(id = 'existing-ad'): TefSavedAd {
  return {
    id,
    exerciseType: 'questioning',
    imageDataUrl: 'data:image/png;base64,abc',
    mimeType: 'image/png',
    confirmation: { summary: 'summary', roleSummary: 'role' },
    createdAt: 10,
    lastUsedAt: 20,
  };
}

function legacyScenario(id = 'legacy-scenario'): Scenario {
  return {
    id,
    name: 'Legacy bakery',
    description: 'Saved before roadmap steps existed',
    createdAt: 100,
    isActive: true,
  };
}

function currentScenario(id = 'current-scenario'): Scenario {
  return {
    id,
    name: 'Current bakery',
    description: 'Buy bread from two people',
    aiSummary: 'Greet, order, and pay.',
    createdAt: 200,
    isActive: true,
    characters: [
      { id: 'baker', name: 'Amélie', role: 'Baker', voiceName: 'aoede' },
      { id: 'cashier', name: 'Luc', role: 'Cashier', voiceName: 'puck' },
    ],
    steps: [
      { id: 'step-1', text: 'Greet the baker' },
      { id: 'step-2', text: 'Order bread' },
      { id: 'step-3', text: 'Pay the cashier' },
    ],
  };
}

function metadata(
  name: DurableDataMigrationMetadata['name'],
  count: number
): DurableDataMigrationMetadata {
  return {
    name,
    version: 1,
    state: 'mirroring',
    lastReconciledAt: 123,
    sourceRecordCount: count,
    destinationRecordCount: count,
    verificationStatus: 'verified',
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function createSavedAdsStore(db: IDBDatabase): void {
  const store = db.createObjectStore('savedAds', { keyPath: 'id' });
  store.createIndex('exerciseType', 'exerciseType', { unique: false });
  store.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
}

function createTopicArchivesStore(db: IDBDatabase): void {
  const store = db.createObjectStore('topicArchives', { keyPath: 'id' });
  store.createIndex('adId', 'adId', { unique: false });
  store.createIndex('exerciseType', 'exerciseType', { unique: false });
  store.createIndex('createdAt', 'createdAt', { unique: false });
}

function createScenariosStore(db: IDBDatabase): void {
  const store = db.createObjectStore('scenarios', { keyPath: 'id' });
  store.createIndex('createdAt', 'createdAt', { unique: false });
}

async function seedVersionOne(ad: TefSavedAd): Promise<void> {
  const request = indexedDB.open('parle-tef', 1);
  request.onupgradeneeded = () => createSavedAdsStore(request.result);
  const db = await requestResult(request);
  const tx = db.transaction('savedAds', 'readwrite');
  tx.objectStore('savedAds').put(ad);
  await transactionDone(tx);
  db.close();
}

async function seedVersionTwo(params: {
  ad?: TefSavedAd;
  archives?: TefTopicArchive[];
  metadataRecords?: DurableDataMigrationMetadata[];
} = {}): Promise<void> {
  const request = indexedDB.open('parle-tef', 2);
  request.onupgradeneeded = () => {
    createSavedAdsStore(request.result);
    createTopicArchivesStore(request.result);
    request.result.createObjectStore('migrationMetadata', { keyPath: 'name' });
  };
  const db = await requestResult(request);
  const storeNames = ['savedAds', 'topicArchives', 'migrationMetadata'];
  const tx = db.transaction(storeNames, 'readwrite');
  if (params.ad) tx.objectStore('savedAds').put(params.ad);
  for (const record of params.archives ?? []) tx.objectStore('topicArchives').put(record);
  for (const record of params.metadataRecords ?? []) {
    tx.objectStore('migrationMetadata').put(record);
  }
  await transactionDone(tx);
  db.close();
}

async function seedVersionThree(params: {
  ads?: TefSavedAd[];
  archives?: TefTopicArchive[];
  scenarios?: Scenario[];
} = {}): Promise<void> {
  const request = indexedDB.open('parle-tef', 3);
  request.onupgradeneeded = () => {
    createSavedAdsStore(request.result);
    createTopicArchivesStore(request.result);
    createScenariosStore(request.result);
    request.result.createObjectStore('migrationMetadata', { keyPath: 'name' });
  };
  const db = await requestResult(request);
  const tx = db.transaction(['savedAds', 'topicArchives', 'scenarios'], 'readwrite');
  for (const record of params.ads ?? []) tx.objectStore('savedAds').put(record);
  for (const record of params.archives ?? []) tx.objectStore('topicArchives').put(record);
  for (const record of params.scenarios ?? []) tx.objectStore('scenarios').put(record);
  await transactionDone(tx);
  db.close();
}

async function openCurrentDatabase(): Promise<IDBDatabase> {
  return await requestResult(indexedDB.open('parle-tef'));
}

async function failReadWriteTransactionsForStore(storeName: string) {
  const db = await openCurrentDatabase();
  const databasePrototype = Object.getPrototypeOf(db) as IDBDatabase;
  db.close();
  const originalTransaction = databasePrototype.transaction;
  return vi.spyOn(databasePrototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    const [storeNames, mode] = args;
    const names = typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames);
    if (mode === 'readwrite' && names.includes(storeName)) {
      throw new Error(`Forced ${storeName} mirror transaction failure`);
    }
    return originalTransaction.apply(this, args);
  });
}

describe('Stage 1 durable exercise data IndexedDB mirrors', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('upgrades version 1 to version 3, retains saved ads, and creates the complete schema', async () => {
    const ad = savedAd();
    await seedVersionOne(ad);
    const service = await import('../services/tefArchiveService');

    await service.initializeDurableDataMirrors();

    expect((await service.getSavedAd(ad.id))?.confirmation.summary).toBe('summary');
    const db = await openCurrentDatabase();
    expect(db.version).toBe(3);
    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining(['savedAds', 'topicArchives', 'scenarios', 'migrationMetadata'])
    );
    expect(Array.from(db.transaction('topicArchives').objectStore('topicArchives').indexNames)).toEqual(
      expect.arrayContaining(['adId', 'exerciseType', 'createdAt'])
    );
    expect(Array.from(db.transaction('scenarios').objectStore('scenarios').indexNames)).toEqual([
      'createdAt',
    ]);
    db.close();
  });

  it('upgrades the exact topic-only version 2 layout without losing any existing records', async () => {
    const ad = savedAd('v2-ad');
    const mirroredArchive = archive('v2-archive', ad.id);
    const topicMetadata = metadata('topic-archives-localstorage-to-idb', 1);
    await seedVersionTwo({
      ad,
      archives: [mirroredArchive],
      metadataRecords: [topicMetadata],
    });
    const service = await import('../services/tefArchiveService');

    expect(await service.getScenarioMirrorSnapshot()).toEqual([]);

    const db = await openCurrentDatabase();
    expect(db.version).toBe(3);
    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining(['savedAds', 'topicArchives', 'scenarios', 'migrationMetadata'])
    );
    db.close();
    expect(await service.getSavedAd(ad.id)).toEqual(ad);
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual([mirroredArchive]);
    expect(await service.getTopicArchiveMigrationMetadata()).toEqual(topicMetadata);
  });

  it('opens an already-complete version 3 database idempotently', async () => {
    const scenario = currentScenario();
    await seedVersionThree({ scenarios: [scenario] });
    const service = await import('../services/tefArchiveService');

    expect(await service.getScenarioMirrorSnapshot()).toEqual([scenario]);
    expect(await service.getScenarioMirrorSnapshot()).toEqual([scenario]);

    const db = await openCurrentDatabase();
    expect(db.version).toBe(3);
    expect(Array.from(db.objectStoreNames)).toHaveLength(4);
    db.close();
  });

  it('backfills empty and populated archives and scenarios with independent metadata', async () => {
    const service = await import('../services/tefArchiveService');
    const empty = await service.initializeDurableDataMirrors();
    expect(empty.topicArchives).toMatchObject({ success: true, destinationRecordCount: 0 });
    expect(empty.scenarios).toMatchObject({ success: true, destinationRecordCount: 0 });

    const archives = [archive('archive-1'), archive('archive-2', 'ad-2', 200)];
    const scenarios = [legacyScenario(), currentScenario()];
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(archives));
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));

    const populated = await service.initializeDurableDataMirrors();

    expect(populated.topicArchives).toMatchObject({
      success: true,
      sourceRecordCount: 2,
      destinationRecordCount: 2,
    });
    expect(populated.scenarios).toMatchObject({
      success: true,
      sourceRecordCount: 2,
      destinationRecordCount: 2,
    });
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(expect.arrayContaining(archives));
    expect(await service.getScenarioMirrorSnapshot()).toEqual(expect.arrayContaining(scenarios));
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      name: 'topic-archives-localstorage-to-idb',
      verificationStatus: 'verified',
    });
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      name: 'scenarios-localstorage-to-idb',
      verificationStatus: 'verified',
    });
  });

  it('runs both backfills repeatedly without duplicates', async () => {
    const archives = [archive('archive-1')];
    const scenarios = [currentScenario()];
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(archives));
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    const service = await import('../services/tefArchiveService');

    await service.initializeDurableDataMirrors();
    await service.initializeDurableDataMirrors();

    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(archives);
    expect(await service.getScenarioMirrorSnapshot()).toEqual(scenarios);
  });

  it('retries with current localStorage when the authoritative source changes during reconciliation', async () => {
    const stale = [archive('stale-snapshot')];
    const current = [archive('current-snapshot', 'ad-current', 200)];
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(current));
    const originalGetItem = Storage.prototype.getItem;
    let topicArchiveReads = 0;
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key: string) {
      if (key === TOPIC_ARCHIVES_KEY) {
        topicArchiveReads += 1;
        if (topicArchiveReads === 1) return JSON.stringify(stale);
      }
      return originalGetItem.call(this, key);
    });
    const service = await import('../services/tefArchiveService');

    const result = await service.initializeTopicArchiveMirror();
    getItemSpy.mockRestore();

    expect(result.success).toBe(true);
    expect(topicArchiveReads).toBeGreaterThanOrEqual(4);
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(current);
  });

  it('mirrors archive creates and deletes after localStorage succeeds', async () => {
    const service = await import('../services/tefArchiveService');
    await service.initializeTopicArchiveMirror();

    const created = service.saveTopicArchive({
      adId: 'ad-1',
      exerciseType: 'persuasion',
      topicSuggestions: topics,
    });
    await service.waitForTopicArchiveMirror();
    expect((await service.getTopicArchiveMirrorSnapshot()).map((item) => item.id)).toEqual([created.id]);

    service.deleteTopicArchive(created.id);
    await service.waitForTopicArchiveMirror();
    expect(service.listTopicArchives()).toEqual([]);
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual([]);
  });

  it('mirrors scenario creates, updates, and deletes after localStorage succeeds', async () => {
    const service = await import('../services/tefArchiveService');
    const scenarioService = await import('../services/scenarioService');
    await service.initializeScenarioMirror();
    const created = currentScenario('scenario-to-mutate');

    scenarioService.saveScenario(created);
    await service.waitForScenarioMirror();
    expect(await service.getScenarioMirrorSnapshot()).toEqual([created]);

    const updated = {
      ...created,
      name: 'Updated bakery',
      steps: [...(created.steps ?? []), { id: 'step-4', text: 'Say goodbye' }],
    };
    scenarioService.saveScenario(updated);
    await service.waitForScenarioMirror();
    expect(await service.getScenarioMirrorSnapshot()).toEqual([updated]);

    scenarioService.deleteScenario(updated.id);
    await service.waitForScenarioMirror();
    expect(scenarioService.loadScenarios()).toEqual([]);
    expect(await service.getScenarioMirrorSnapshot()).toEqual([]);
  });

  it('diagnoses malformed scenarios independently and can retry without blocking archives', async () => {
    const archives = [archive('safe-archive')];
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(archives));
    localStorage.setItem(SCENARIOS_KEY, '{bad scenario json');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = await import('../services/tefArchiveService');

    const first = await service.initializeDurableDataMirrors();

    expect(first.topicArchives.success).toBe(true);
    expect(first.scenarios).toMatchObject({
      success: false,
      error: 'Authoritative localStorage saved scenarios are unreadable',
    });
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(archives);
    expect(localStorage.getItem(SCENARIOS_KEY)).toBe('{bad scenario json');

    const scenarios = [legacyScenario()];
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    expect((await service.initializeScenarioMirror()).success).toBe(true);
    expect(await service.getScenarioMirrorSnapshot()).toEqual(scenarios);
    consoleError.mockRestore();
  });

  it('diagnoses malformed archives independently and can retry without blocking scenarios', async () => {
    const scenarios = [currentScenario()];
    localStorage.setItem(TOPIC_ARCHIVES_KEY, '{bad archive json');
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = await import('../services/tefArchiveService');

    const first = await service.initializeDurableDataMirrors();

    expect(first.topicArchives.success).toBe(false);
    expect(first.scenarios.success).toBe(true);
    expect(await service.getScenarioMirrorSnapshot()).toEqual(scenarios);
    expect(localStorage.getItem(TOPIC_ARCHIVES_KEY)).toBe('{bad archive json');

    const archives = [archive('recovered-archive')];
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(archives));
    expect((await service.initializeTopicArchiveMirror()).success).toBe(true);
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(archives);
    consoleError.mockRestore();
  });

  it('preserves both authoritative datasets when IndexedDB is unavailable and retries safely', async () => {
    const archives = [archive('retained-archive')];
    const scenarios = [legacyScenario('retained-scenario')];
    const serializedArchives = JSON.stringify(archives);
    const serializedScenarios = JSON.stringify(scenarios);
    localStorage.setItem(TOPIC_ARCHIVES_KEY, serializedArchives);
    localStorage.setItem(SCENARIOS_KEY, serializedScenarios);
    vi.stubGlobal('indexedDB', undefined);
    const service = await import('../services/tefArchiveService');

    const unavailable = await service.initializeDurableDataMirrors();

    expect(unavailable.topicArchives.success).toBe(false);
    expect(unavailable.scenarios.success).toBe(false);
    expect(localStorage.getItem(TOPIC_ARCHIVES_KEY)).toBe(serializedArchives);
    expect(localStorage.getItem(SCENARIOS_KEY)).toBe(serializedScenarios);

    vi.stubGlobal('indexedDB', new IDBFactory());
    const retried = await service.initializeDurableDataMirrors();
    expect(retried.topicArchives.success).toBe(true);
    expect(retried.scenarios.success).toBe(true);
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(archives);
    expect(await service.getScenarioMirrorSnapshot()).toEqual(scenarios);
  });

  it('repairs partial, stale, and differing content in both mirrors on retry', async () => {
    const archives = [archive('archive-1'), archive('archive-2', 'ad-2', 200)];
    const scenarios = [legacyScenario(), currentScenario()];
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(archives));
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    await seedVersionThree({
      archives: [{ ...archive('archive-1'), adId: 'wrong-ad' }, archive('stale-archive')],
      scenarios: [{ ...legacyScenario(), name: 'Wrong name' }, legacyScenario('stale-scenario')],
    });
    const service = await import('../services/tefArchiveService');

    const result = await service.initializeDurableDataMirrors();

    expect(result.topicArchives.success).toBe(true);
    expect(result.scenarios.success).toBe(true);
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(expect.arrayContaining(archives));
    expect(await service.getTopicArchiveMirrorSnapshot()).toHaveLength(2);
    expect(await service.getScenarioMirrorSnapshot()).toEqual(expect.arrayContaining(scenarios));
    expect(await service.getScenarioMirrorSnapshot()).toHaveLength(2);
  });

  it('preserves legacy optional-field absence and current character/roadmap fields exactly', async () => {
    const legacy = legacyScenario();
    const current = currentScenario();
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([legacy, current]));
    const service = await import('../services/tefArchiveService');

    await service.initializeScenarioMirror();
    const mirrored = await service.getScenarioMirrorSnapshot();

    expect(mirrored).toEqual(expect.arrayContaining([legacy, current]));
    const mirroredLegacy = mirrored.find((scenario) => scenario.id === legacy.id);
    expect(mirroredLegacy).not.toHaveProperty('steps');
    expect(mirroredLegacy).not.toHaveProperty('characters');
    expect(mirrored.find((scenario) => scenario.id === current.id)).toEqual(current);
  });
});

describe('Stage 2 durable exercise data shadow verification', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('detects same-count content mismatches and repairs both datasets independently', async () => {
    const ads = [savedAd('ad-1'), savedAd('ad-2')];
    const archives = [archive('archive-1', 'ad-1'), archive('archive-2', 'ad-2', 200)];
    const scenarios = [legacyScenario(), currentScenario()];
    const serializedArchives = JSON.stringify(archives);
    const serializedScenarios = JSON.stringify(scenarios);
    localStorage.setItem(TOPIC_ARCHIVES_KEY, serializedArchives);
    localStorage.setItem(SCENARIOS_KEY, serializedScenarios);
    await seedVersionThree({
      ads,
      archives: [
        { ...archive('archive-1', 'missing-ad'), exerciseType: 'questioning' },
        archive('extra-archive', 'ad-1'),
      ],
      scenarios: [
        { ...legacyScenario(), name: 'Different legacy name' },
        currentScenario('extra-scenario'),
      ],
    });
    const service = await import('../services/tefArchiveService');

    const result = await service.verifyDurableDataMirrors();

    expect(result.topicArchives).toMatchObject({
      operation: 'shadow-verify',
      success: true,
      sourceRecordCount: 2,
      destinationRecordCount: 2,
      comparison: {
        missingIds: ['archive-2'],
        extraIds: ['extra-archive'],
        differingIds: ['archive-1'],
        relationshipInvalidIds: ['archive-1'],
        legacyShapeIds: [],
      },
      postRepairIntegrity: {
        relationshipInvalidIds: [],
        legacyShapeIds: [],
      },
      repairs: { inserted: 1, updated: 1, deleted: 1 },
    });
    expect(result.scenarios).toMatchObject({
      operation: 'shadow-verify',
      success: true,
      comparison: {
        missingIds: ['current-scenario'],
        extraIds: ['extra-scenario'],
        differingIds: ['legacy-scenario'],
        legacyShapeIds: ['legacy-scenario'],
      },
      repairs: { inserted: 1, updated: 1, deleted: 1 },
    });
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(expect.arrayContaining(archives));
    expect(await service.getTopicArchiveMirrorSnapshot()).toHaveLength(2);
    expect(await service.getScenarioMirrorSnapshot()).toEqual(expect.arrayContaining(scenarios));
    expect(await service.getScenarioMirrorSnapshot()).toHaveLength(2);
    expect(localStorage.getItem(TOPIC_ARCHIVES_KEY)).toBe(serializedArchives);
    expect(localStorage.getItem(SCENARIOS_KEY)).toBe(serializedScenarios);
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
      mismatchCounts: { missing: 1, extra: 1, differing: 1 },
      repairCounts: { inserted: 1, updated: 1, deleted: 1 },
      preRepairIntegrityCounts: { relationshipInvalid: 1, legacyShape: 0 },
      postRepairIntegrityCounts: { relationshipInvalid: 0, legacyShape: 0 },
      relationshipInvalidRecordCount: 0,
    });
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
      mismatchCounts: { missing: 1, extra: 1, differing: 1 },
      repairCounts: { inserted: 1, updated: 1, deleted: 1 },
      legacyShapeRecordCount: 1,
    });
  });

  it('reports invalid archive relationships without altering the authoritative archive', async () => {
    const orphan = archive('orphan-archive', 'deleted-ad');
    const serialized = JSON.stringify([orphan]);
    localStorage.setItem(TOPIC_ARCHIVES_KEY, serialized);
    const service = await import('../services/tefArchiveService');

    const result = await service.verifyTopicArchiveMirror();

    expect(result).toMatchObject({
      success: true,
      comparison: {
        missingIds: ['orphan-archive'],
        relationshipInvalidIds: ['orphan-archive'],
      },
      postRepairIntegrity: {
        relationshipInvalidIds: ['orphan-archive'],
      },
    });
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual([orphan]);
    expect(localStorage.getItem(TOPIC_ARCHIVES_KEY)).toBe(serialized);
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
      preRepairIntegrityCounts: { relationshipInvalid: 1, legacyShape: 0 },
      postRepairIntegrityCounts: { relationshipInvalid: 1, legacyShape: 0 },
      relationshipInvalidRecordCount: 1,
    });
  });

  it('persists an independent failed verification without mutating malformed localStorage', async () => {
    const safeScenario = currentScenario();
    const serializedScenarios = JSON.stringify([safeScenario]);
    localStorage.setItem(TOPIC_ARCHIVES_KEY, '{malformed');
    localStorage.setItem(SCENARIOS_KEY, serializedScenarios);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = await import('../services/tefArchiveService');

    const result = await service.verifyDurableDataMirrors();

    expect(result.topicArchives).toMatchObject({
      success: false,
      operation: 'shadow-verify',
      error: 'Authoritative localStorage TEF topic archives are unreadable',
    });
    expect(result.scenarios.success).toBe(true);
    expect(localStorage.getItem(TOPIC_ARCHIVES_KEY)).toBe('{malformed');
    expect(localStorage.getItem(SCENARIOS_KEY)).toBe(serializedScenarios);
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      verificationStatus: 'failed',
      verificationError: 'Authoritative localStorage TEF topic archives are unreadable',
    });
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
    });
    consoleError.mockRestore();
  });

  it('already-matching archive and scenario stores verify independently with zero mismatches', async () => {
    const ad = savedAd('ad-1');
    const archives = [archive('matching-archive', ad.id)];
    const scenarios = [currentScenario('matching-scenario')];
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(archives));
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    await seedVersionThree({ ads: [ad], archives, scenarios });
    const service = await import('../services/tefArchiveService');

    const archiveResult = await service.verifyTopicArchiveMirror();

    expect(archiveResult).toMatchObject({
      success: true,
      comparison: {
        missingIds: [],
        extraIds: [],
        differingIds: [],
        relationshipInvalidIds: [],
        legacyShapeIds: [],
      },
      postRepairIntegrity: {
        relationshipInvalidIds: [],
        legacyShapeIds: [],
      },
      repairs: { inserted: 0, updated: 0, deleted: 0 },
    });
    expect(await service.getScenarioMigrationMetadata()).toBeNull();

    const scenarioResult = await service.verifyScenarioMirror();

    expect(scenarioResult).toMatchObject({
      success: true,
      comparison: {
        missingIds: [],
        extraIds: [],
        differingIds: [],
        relationshipInvalidIds: [],
        legacyShapeIds: [],
      },
      postRepairIntegrity: {
        relationshipInvalidIds: [],
        legacyShapeIds: [],
      },
      repairs: { inserted: 0, updated: 0, deleted: 0 },
    });
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
      mismatchCounts: { missing: 0, extra: 0, differing: 0 },
      repairCounts: { inserted: 0, updated: 0, deleted: 0 },
      postRepairIntegrityCounts: { relationshipInvalid: 0, legacyShape: 0 },
    });
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
      mismatchCounts: { missing: 0, extra: 0, differing: 0 },
      repairCounts: { inserted: 0, updated: 0, deleted: 0 },
      postRepairIntegrityCounts: { relationshipInvalid: 0, legacyShape: 0 },
    });
  });

  it('invalidates archive verification when a later save mirror fails, then re-verifies on repair', async () => {
    const ad = savedAd('ad-1');
    const initial = archive('initial-archive', ad.id);
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify([initial]));
    await seedVersionThree({ ads: [ad], archives: [initial] });
    const service = await import('../services/tefArchiveService');
    await service.verifyTopicArchiveMirror();
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
    });

    const transactionSpy = await failReadWriteTransactionsForStore('topicArchives');
    service.saveTopicArchive({
      adId: ad.id,
      exerciseType: 'persuasion',
      topicSuggestions: topics,
    });
    const failedMirror = await service.waitForTopicArchiveMirror();
    transactionSpy.mockRestore();

    expect(failedMirror).toMatchObject({
      operation: 'save',
      success: false,
      error: 'Forced topicArchives mirror transaction failure',
    });
    expect(service.listTopicArchives()).toHaveLength(2);
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      verificationStatus: 'failed',
      verificationError: 'Forced topicArchives mirror transaction failure',
    });

    expect((await service.verifyTopicArchiveMirror()).success).toBe(true);
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
      sourceRecordCount: 2,
      destinationRecordCount: 2,
    });
  });

  it('invalidates scenario verification when a later save mirror fails, then re-verifies on repair', async () => {
    const initial = currentScenario('scenario-mutation-failure');
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([initial]));
    await seedVersionThree({ scenarios: [initial] });
    const service = await import('../services/tefArchiveService');
    const scenarioService = await import('../services/scenarioService');
    await service.verifyScenarioMirror();
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
    });

    const transactionSpy = await failReadWriteTransactionsForStore('scenarios');
    scenarioService.saveScenario({ ...initial, name: 'Saved locally only at first' });
    const failedMirror = await service.waitForScenarioMirror();
    transactionSpy.mockRestore();

    expect(failedMirror).toMatchObject({
      operation: 'save',
      success: false,
      error: 'Forced scenarios mirror transaction failure',
    });
    expect(scenarioService.loadScenarios()[0].name).toBe('Saved locally only at first');
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      verificationStatus: 'failed',
      verificationError: 'Forced scenarios mirror transaction failure',
    });

    expect((await service.verifyScenarioMirror()).success).toBe(true);
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
      sourceRecordCount: 1,
      destinationRecordCount: 1,
    });
  });

  it('keeps both datasets dirty when IndexedDB cannot persist failure metadata', async () => {
    const ad = savedAd('ad-1');
    const initialArchive = archive('initial-offline-archive', ad.id);
    const initialScenario = currentScenario('initial-offline-scenario');
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify([initialArchive]));
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([initialScenario]));
    await seedVersionThree({
      ads: [ad],
      archives: [initialArchive],
      scenarios: [initialScenario],
    });
    const service = await import('../services/tefArchiveService');
    const scenarioService = await import('../services/scenarioService');
    await service.verifyDurableDataMirrors();

    const availableIndexedDb = indexedDB;
    vi.stubGlobal('indexedDB', undefined);
    service.saveTopicArchive({
      adId: ad.id,
      exerciseType: 'persuasion',
      topicSuggestions: topics,
    });
    scenarioService.saveScenario({ ...initialScenario, name: 'Changed while IDB unavailable' });
    expect((await service.waitForTopicArchiveMirror())?.success).toBe(false);
    expect((await service.waitForScenarioMirror())?.success).toBe(false);

    vi.stubGlobal('indexedDB', availableIndexedDb);
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      verificationStatus: 'failed',
      verificationError: 'Authoritative localStorage changed after the last verified reconciliation',
    });
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      verificationStatus: 'failed',
      verificationError: 'Authoritative localStorage changed after the last verified reconciliation',
    });

    const repaired = await service.verifyDurableDataMirrors();
    expect(repaired.topicArchives.success).toBe(true);
    expect(repaired.scenarios.success).toBe(true);
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
    });
    expect(await service.getScenarioMigrationMetadata()).toMatchObject({
      verificationStatus: 'verified',
    });
  });
});
