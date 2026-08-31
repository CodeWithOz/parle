import type {
  Scenario,
  TefExerciseType,
  TefSavedAd,
  TefTopicArchive,
  TefTopicSuggestion,
} from '../types';
import { BackupValidationError } from './backupFormat';

const MAX_TOPIC_ARCHIVES = 50;
const MAX_SAVED_ADS_PER_TYPE = 20;
const DB_NAME = 'parle-tef';
export const TEF_DB_VERSION = 3;
const SAVED_ADS_STORE = 'savedAds';
const TOPIC_ARCHIVES_STORE = 'topicArchives';
const SCENARIOS_STORE = 'scenarios';
const MIGRATION_METADATA_STORE = 'migrationMetadata';

/**
 * Legacy localStorage keys from the staged IndexedDB migration. IndexedDB is now
 * the only database: these keys are read once at startup, folded into IndexedDB,
 * and then removed. Nothing writes them again.
 */
const LEGACY_TOPIC_ARCHIVES_KEY = 'parle-tef-topic-archives';
const LEGACY_SCENARIOS_KEY = 'parle-scenarios';

interface DurableRecord {
  id: string;
  createdAt: number;
}

interface LegacyKeys {
  /** Legacy authoritative/rollback snapshot of the whole dataset. */
  data: string;
  /** Legacy exact-match control markers. */
  markers: string[];
  /** Legacy journal key prefixes; entries are stored as `${prefix}:${id}`. */
  journalPrefixes: string[];
}

interface DurableDataset<T extends DurableRecord> {
  storeName: string;
  label: string;
  legacy: LegacyKeys;
  /** Newest-first cap applied after every mutation. Unlimited when omitted. */
  maxRecords?: number;
}

/** Shape of the legacy Stage 3/4 recovery journal, replayed once during adoption. */
interface LegacyPendingMutation {
  id: string;
  createdAt?: number;
  kind: 'upsert' | 'delete-id' | 'delete-for-ad';
  record?: DurableRecord;
  targetId?: string;
  adId?: string;
}

export interface DurableDataAdoption {
  /** Legacy records folded into IndexedDB because no record with that ID existed. */
  adoptedRecordCount: number;
  /** Journaled legacy operations that had never reached IndexedDB. */
  replayedMutationCount: number;
  /** Unreadable journal entries dropped during adoption. */
  discardedMutationCount: number;
  /** True once every legacy key for this dataset has been removed. */
  legacyStorageCleared: boolean;
}

export interface DurableDataAdoptionResult {
  topicArchives: DurableDataAdoption;
  scenarios: DurableDataAdoption;
}

const topicArchiveDataset: DurableDataset<TefTopicArchive> = {
  storeName: TOPIC_ARCHIVES_STORE,
  label: 'TEF topic archive',
  maxRecords: MAX_TOPIC_ARCHIVES,
  legacy: {
    data: LEGACY_TOPIC_ARCHIVES_KEY,
    markers: [
      `${LEGACY_TOPIC_ARCHIVES_KEY}-mirror-dirty`,
      `${LEGACY_TOPIC_ARCHIVES_KEY}-bridge-dirty`,
      `${LEGACY_TOPIC_ARCHIVES_KEY}-idb-primary`,
    ],
    journalPrefixes: [
      `${LEGACY_TOPIC_ARCHIVES_KEY}-pending-mutations`,
      `${LEGACY_TOPIC_ARCHIVES_KEY}-quarantined-mutations`,
    ],
  },
};

const scenarioDataset: DurableDataset<Scenario> = {
  storeName: SCENARIOS_STORE,
  label: 'saved scenario',
  legacy: {
    data: LEGACY_SCENARIOS_KEY,
    markers: [
      `${LEGACY_SCENARIOS_KEY}-mirror-dirty`,
      `${LEGACY_SCENARIOS_KEY}-bridge-dirty`,
      `${LEGACY_SCENARIOS_KEY}-idb-primary`,
    ],
    journalPrefixes: [
      `${LEGACY_SCENARIOS_KEY}-pending-mutations`,
      `${LEGACY_SCENARIOS_KEY}-quarantined-mutations`,
    ],
  },
};

function createArchiveId(): string {
  return `scenario_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, TEF_DB_VERSION);
    let settled = false;
    request.onerror = () => {
      settled = true;
      reject(request.error ?? new Error('Failed to open IndexedDB'));
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error('IndexedDB upgrade is blocked by another open connection'));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      const upgradeTransaction = request.transaction;
      if (!db.objectStoreNames.contains(SAVED_ADS_STORE)) {
        const store = db.createObjectStore(SAVED_ADS_STORE, { keyPath: 'id' });
        store.createIndex('exerciseType', 'exerciseType', { unique: false });
        store.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(TOPIC_ARCHIVES_STORE)) {
        const store = db.createObjectStore(TOPIC_ARCHIVES_STORE, { keyPath: 'id' });
        store.createIndex('adId', 'adId', { unique: false });
        store.createIndex('exerciseType', 'exerciseType', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(SCENARIOS_STORE)) {
        const store = db.createObjectStore(SCENARIOS_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      } else if (upgradeTransaction) {
        const store = upgradeTransaction.objectStore(SCENARIOS_STORE);
        if (!store.indexNames.contains('createdAt')) {
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      }
      // Retained so version-3 databases keep an identical schema whether they
      // were created fresh or upgraded from the staged migration. The migration
      // metadata it holds is no longer read or written.
      if (!db.objectStoreNames.contains(MIGRATION_METADATA_STORE)) {
        db.createObjectStore(MIGRATION_METADATA_STORE, { keyPath: 'name' });
      }
    };
  });
}

function idbGetAll<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as T[]) ?? []);
    request.onerror = () => reject(request.error);
  });
}

function idbGet<T>(store: IDBObjectStore, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function idbPut<T>(store: IDBObjectStore, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function idbDelete(store: IDBObjectStore, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function runReadTransaction<T>(
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVED_ADS_STORE, 'readonly');
    const store = tx.objectStore(SAVED_ADS_STORE);
    fn(store)
      .then(resolve)
      .catch(reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function runWriteTransaction(fn: (store: IDBObjectStore) => Promise<void>): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVED_ADS_STORE, 'readwrite');
    const store = tx.objectStore(SAVED_ADS_STORE);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    fn(store).catch(reject);
  });
}

async function readAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, 'readonly');
    const records = await idbRequest(tx.objectStore(storeName).getAll()) as T[];
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error(`Failed reading ${storeName}`));
      tx.onabort = () => reject(tx.error ?? new Error(`Reading ${storeName} was aborted`));
    });
    return records;
  } finally {
    db.close();
  }
}

/**
 * Read-modify-write inside one IndexedDB transaction. IndexedDB serializes it
 * against other tabs, so concurrent writers cannot lose each other's records.
 */
async function mutateAllInStore<T extends DurableRecord>(
  storeName: string,
  mutate: (records: T[]) => T[]
): Promise<T[]> {
  const db = await openDb();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      let next: T[] = [];
      let failed = false;
      request.onsuccess = () => {
        try {
          next = mutate((request.result as T[]) ?? []);
        } catch (error) {
          failed = true;
          reject(error);
          tx.abort();
          return;
        }
        store.clear();
        for (const record of next) store.put(record);
      };
      request.onerror = () => reject(request.error ?? new Error(`Failed reading ${storeName}`));
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error ?? new Error(`Failed writing ${storeName}`));
      tx.onabort = () => {
        if (failed) return;
        reject(tx.error ?? new Error(`Writing ${storeName} was aborted`));
      };
    });
  } finally {
    db.close();
  }
}

/** Newest first, capped for datasets that declare a limit. */
function normalize<T extends DurableRecord>(dataset: DurableDataset<T>, records: T[]): T[] {
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt);
  return dataset.maxRecords === undefined ? sorted : sorted.slice(0, dataset.maxRecords);
}

async function readDataset<T extends DurableRecord>(dataset: DurableDataset<T>): Promise<T[]> {
  return normalize(dataset, await readAllFromStore<T>(dataset.storeName));
}

async function upsertRecord<T extends DurableRecord>(
  dataset: DurableDataset<T>,
  record: T
): Promise<T[]> {
  return mutateAllInStore<T>(dataset.storeName, (records) =>
    normalize(dataset, [record, ...records.filter((item) => item.id !== record.id)]));
}

async function deleteRecord<T extends DurableRecord>(
  dataset: DurableDataset<T>,
  recordId: string
): Promise<T[]> {
  return mutateAllInStore<T>(dataset.storeName, (records) =>
    normalize(dataset, records.filter((record) => record.id !== recordId)));
}

// ---------------------------------------------------------------------------
// One-time adoption of pre-IndexedDB localStorage data
// ---------------------------------------------------------------------------

function readLegacyRecords<T extends DurableRecord>(
  dataset: DurableDataset<T>
): { present: boolean; readable: boolean; records: T[] } {
  let stored: string | null;
  try {
    stored = localStorage.getItem(dataset.legacy.data);
  } catch (error) {
    console.error(`Unable to read legacy ${dataset.label} storage:`, error);
    return { present: false, readable: true, records: [] };
  }
  if (stored === null) return { present: false, readable: true, records: [] };
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return { present: true, readable: false, records: [] };
    const records = parsed.filter(
      (record): record is T => !!record
        && typeof record === 'object'
        && typeof (record as T).id === 'string'
        && typeof (record as T).createdAt === 'number'
    );
    return { present: true, readable: records.length === parsed.length, records };
  } catch {
    return { present: true, readable: false, records: [] };
  }
}

function isLegacyPendingMutation(value: unknown): value is LegacyPendingMutation {
  if (!value || typeof value !== 'object') return false;
  const intent = value as Partial<LegacyPendingMutation>;
  if (typeof intent.id !== 'string' || intent.id.length === 0) return false;
  if (intent.createdAt !== undefined && typeof intent.createdAt !== 'number') return false;
  if (intent.kind === 'upsert') {
    return !!intent.record
      && typeof intent.record === 'object'
      && typeof intent.record.id === 'string'
      && typeof intent.record.createdAt === 'number';
  }
  if (intent.kind === 'delete-id') return typeof intent.targetId === 'string';
  if (intent.kind === 'delete-for-ad') return typeof intent.adId === 'string';
  return false;
}

function legacyKeysWithPrefix(prefix: string): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch (error) {
    console.error('Unable to enumerate legacy localStorage keys:', error);
  }
  return keys;
}

function readLegacyPendingMutations<T extends DurableRecord>(
  dataset: DurableDataset<T>
): { mutations: LegacyPendingMutation[]; discarded: number } {
  // Only the pending journal replays; quarantined entries were already known to
  // be unusable when they were quarantined.
  const prefix = `${dataset.legacy.journalPrefixes[0]}:`;
  const mutations: LegacyPendingMutation[] = [];
  let discarded = 0;
  for (const key of legacyKeysWithPrefix(prefix)) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      discarded += 1;
      continue;
    }
    if (!isLegacyPendingMutation(parsed)) {
      discarded += 1;
      continue;
    }
    mutations.push(parsed);
  }
  mutations.sort((left, right) =>
    (left.createdAt ?? 0) - (right.createdAt ?? 0) || left.id.localeCompare(right.id));
  return { mutations, discarded };
}

function applyLegacyMutation<T extends DurableRecord>(
  dataset: DurableDataset<T>,
  records: T[],
  intent: LegacyPendingMutation
): T[] {
  if (intent.kind === 'delete-id') {
    return records.filter((record) => record.id !== intent.targetId);
  }
  if (intent.kind === 'delete-for-ad') {
    return (records as unknown as TefTopicArchive[])
      .filter((record) => record.adId !== intent.adId) as unknown as T[];
  }
  const record = intent.record as T;
  return [record, ...records.filter((item) => item.id !== record.id)];
}

function hasLegacyStorage<T extends DurableRecord>(dataset: DurableDataset<T>): boolean {
  try {
    if (localStorage.getItem(dataset.legacy.data) !== null) return true;
    if (dataset.legacy.markers.some((key) => localStorage.getItem(key) !== null)) return true;
  } catch {
    return false;
  }
  return dataset.legacy.journalPrefixes
    .some((prefix) => legacyKeysWithPrefix(`${prefix}:`).length > 0);
}

function clearLegacyStorage<T extends DurableRecord>(dataset: DurableDataset<T>): boolean {
  const keys = [
    dataset.legacy.data,
    ...dataset.legacy.markers,
    ...dataset.legacy.journalPrefixes.flatMap((prefix) => legacyKeysWithPrefix(`${prefix}:`)),
  ];
  let cleared = true;
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Unable to remove legacy ${dataset.label} key ${key}:`, error);
      cleared = false;
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      // sessionStorage held only the mirror of a control marker; ignore.
    }
  }
  return cleared;
}

const noAdoption: DurableDataAdoption = {
  adoptedRecordCount: 0,
  replayedMutationCount: 0,
  discardedMutationCount: 0,
  legacyStorageCleared: false,
};

/**
 * Folds one dataset's leftover localStorage state into IndexedDB and then
 * removes it. IndexedDB wins on ID conflicts because it has been the primary
 * store since the cutover; localStorage can only contribute records IndexedDB
 * has never seen. Nothing is deleted until the merged result is read back.
 */
async function adoptLegacyDataset<T extends DurableRecord>(
  dataset: DurableDataset<T>
): Promise<DurableDataAdoption> {
  if (!hasLegacyStorage(dataset)) return noAdoption;

  const legacy = readLegacyRecords(dataset);
  if (legacy.present && !legacy.readable) {
    // Unreadable legacy data is left in place rather than destroyed. Reads and
    // writes already run entirely on IndexedDB, so this blocks nothing.
    throw new Error(
      `Legacy localStorage ${dataset.label}s are unreadable; they were left untouched`
    );
  }
  const { mutations, discarded } = readLegacyPendingMutations(dataset);

  let adoptedRecordCount = 0;
  const committed = await mutateAllInStore<T>(dataset.storeName, (current) => {
    const knownIds = new Set(current.map((record) => record.id));
    const adopted = legacy.records.filter((record) => !knownIds.has(record.id));
    adoptedRecordCount = adopted.length;
    const replayed = mutations.reduce(
      (records, intent) => applyLegacyMutation(dataset, records, intent),
      [...current, ...adopted]
    );
    return normalize(dataset, replayed);
  });

  const stored = await readAllFromStore<T>(dataset.storeName);
  const storedIds = new Set(stored.map((record) => record.id));
  if (committed.length !== stored.length
    || committed.some((record) => !storedIds.has(record.id))) {
    throw new Error(
      `Adopted ${dataset.label}s could not be verified in IndexedDB; legacy storage was kept`
    );
  }

  return {
    adoptedRecordCount,
    replayedMutationCount: mutations.length,
    discardedMutationCount: discarded,
    legacyStorageCleared: clearLegacyStorage(dataset),
  };
}

/**
 * Startup entry point. IndexedDB is the only database the application reads or
 * writes; this migrates any pre-IndexedDB localStorage leftovers exactly once
 * and then clears them. It is idempotent and safe to retry on the next launch.
 */
export async function initializeDurableData(): Promise<DurableDataAdoptionResult> {
  const [topicArchives, scenarios] = await Promise.allSettled([
    adoptLegacyDataset(topicArchiveDataset),
    adoptLegacyDataset(scenarioDataset),
  ]);

  const failures = [topicArchives, scenarios].filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    const reasons = failures.map((failure) => errorMessage(failure.reason));
    throw new Error(
      `Legacy data adoption failed for ${failures.length} dataset(s): ${reasons.join('; ')}`
    );
  }

  return {
    topicArchives: (topicArchives as PromiseFulfilledResult<DurableDataAdoption>).value,
    scenarios: (scenarios as PromiseFulfilledResult<DurableDataAdoption>).value,
  };
}

// ---------------------------------------------------------------------------
// Topic archives and saved scenarios
// ---------------------------------------------------------------------------

export async function listTopicArchives(adId?: string): Promise<TefTopicArchive[]> {
  const records = await readDataset(topicArchiveDataset);
  return adId ? records.filter((archive) => archive.adId === adId) : records;
}

export async function getLatestTopicArchive(adId: string): Promise<TefTopicArchive | null> {
  const forAd = await listTopicArchives(adId);
  return forAd.length > 0 ? forAd[0] : null;
}

export function listSavedScenarios(): Promise<Scenario[]> {
  return readDataset(scenarioDataset);
}

export async function saveTopicArchive(params: {
  adId: string;
  exerciseType: TefExerciseType;
  topicSuggestions: TefTopicSuggestion[];
}): Promise<TefTopicArchive> {
  const archive: TefTopicArchive = {
    id: createArchiveId(),
    adId: params.adId,
    exerciseType: params.exerciseType,
    createdAt: Date.now(),
    topicSuggestions: params.topicSuggestions,
  };

  await upsertRecord(topicArchiveDataset, archive);
  return archive;
}

export async function deleteTopicArchive(archiveId: string): Promise<void> {
  await deleteRecord(topicArchiveDataset, archiveId);
}

export async function deleteTopicArchivesForAd(adId: string): Promise<void> {
  await mutateAllInStore<TefTopicArchive>(TOPIC_ARCHIVES_STORE, (records) =>
    normalize(topicArchiveDataset, records.filter((archive) => archive.adId !== adId)));
}

export function saveSavedScenario(scenario: Scenario): Promise<Scenario[]> {
  return upsertRecord(scenarioDataset, scenario);
}

export function deleteSavedScenario(scenarioId: string): Promise<Scenario[]> {
  return deleteRecord(scenarioDataset, scenarioId);
}

// ---------------------------------------------------------------------------
// Saved advertisements
// ---------------------------------------------------------------------------

export async function listAllSavedAds(): Promise<TefSavedAd[]> {
  const all = await runReadTransaction((store) => idbGetAll<TefSavedAd>(store));
  return all.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export async function listSavedAds(exerciseType: TefExerciseType): Promise<TefSavedAd[]> {
  return (await listAllSavedAds()).filter((ad) => ad.exerciseType === exerciseType);
}

export async function getSavedAd(id: string): Promise<TefSavedAd | null> {
  const result = await runReadTransaction((store) => idbGet<TefSavedAd>(store, id));
  return result ?? null;
}

async function evictOldestSavedAds(exerciseType: TefExerciseType, keepId: string): Promise<void> {
  const allOfType = (await listSavedAds(exerciseType)).sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  while (allOfType.length >= MAX_SAVED_ADS_PER_TYPE) {
    const oldest = allOfType.find((ad) => ad.id !== keepId);
    if (!oldest) break;
    await deleteSavedAd(oldest.id);
    const idx = allOfType.findIndex((ad) => ad.id === oldest.id);
    if (idx >= 0) allOfType.splice(idx, 1);
  }
}

export async function upsertSavedAd(
  ad: Omit<TefSavedAd, 'createdAt' | 'lastUsedAt'> & Partial<Pick<TefSavedAd, 'createdAt' | 'lastUsedAt'>>
): Promise<TefSavedAd> {
  const now = Date.now();
  const existing = await getSavedAd(ad.id);
  const record: TefSavedAd = {
    id: ad.id,
    exerciseType: ad.exerciseType,
    imageDataUrl: ad.imageDataUrl,
    mimeType: ad.mimeType,
    confirmation: ad.confirmation,
    createdAt: existing?.createdAt ?? ad.createdAt ?? now,
    lastUsedAt: ad.lastUsedAt ?? now,
  };

  if (!existing) {
    await evictOldestSavedAds(ad.exerciseType, record.id);
  }

  await runWriteTransaction((store) => idbPut(store, record));
  return record;
}

export async function touchSavedAdLastUsed(id: string): Promise<void> {
  const existing = await getSavedAd(id);
  if (!existing) return;
  await upsertSavedAd({ ...existing, lastUsedAt: Date.now() });
}

export async function deleteSavedAd(id: string): Promise<void> {
  await runWriteTransaction((store) => idbDelete(store, id));
  await deleteTopicArchivesForAd(id);
}

export function createSavedAdId(): string {
  return `tef_ad_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ---------------------------------------------------------------------------
// Backup import
// ---------------------------------------------------------------------------

export interface DurableBackupCurrentRecords {
  ads: TefSavedAd[];
  archives: TefTopicArchive[];
  scenarios: Scenario[];
}

export interface DurableBackupImportCommit {
  mode: 'merge' | 'replace';
  adsToPut: TefSavedAd[];
  archivesToPut: TefTopicArchive[];
  scenariosToPut: Scenario[];
  refreshMerge?: (current: DurableBackupCurrentRecords) => {
    adsToPut: TefSavedAd[];
    archivesToPut: TefTopicArchive[];
    scenariosToPut: Scenario[];
  };
}

export interface DurableBackupImportResult {
  ads: TefSavedAd[];
  archives: TefTopicArchive[];
  scenarios: Scenario[];
}

/**
 * Refuses to import while a browser still holds unadopted legacy localStorage
 * data, so an import cannot be silently merged over records that
 * {@link initializeDurableData} has not folded in yet.
 */
function assertNoUnadoptedLegacyData(): void {
  for (const dataset of [topicArchiveDataset, scenarioDataset]) {
    if (hasLegacyStorage(dataset)) {
      throw new BackupValidationError(
        `Cannot import while legacy ${dataset.label} data is still waiting to be adopted`,
        'unresolved-recovery'
      );
    }
  }
}

function putImportedRecords(
  adsStore: IDBObjectStore,
  archivesStore: IDBObjectStore,
  scenariosStore: IDBObjectStore,
  planned: {
    adsToPut: TefSavedAd[];
    archivesToPut: TefTopicArchive[];
    scenariosToPut: Scenario[];
  }
): void {
  for (const ad of planned.adsToPut) adsStore.put(ad);
  for (const archive of planned.archivesToPut) archivesStore.put(archive);
  for (const scenario of planned.scenariosToPut) scenariosStore.put(scenario);
}

/** Writes saved ads, topic archives, and scenarios in one IndexedDB transaction. */
export async function commitDurableBackupImport(
  commit: DurableBackupImportCommit
): Promise<DurableBackupImportResult> {
  assertNoUnadoptedLegacyData();

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [SAVED_ADS_STORE, TOPIC_ARCHIVES_STORE, SCENARIOS_STORE],
        'readwrite'
      );
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        try {
          tx.abort();
        } catch {
          // Already complete or aborted.
        }
        reject(error);
      };
      const adsStore = tx.objectStore(SAVED_ADS_STORE);
      const archivesStore = tx.objectStore(TOPIC_ARCHIVES_STORE);
      const scenariosStore = tx.objectStore(SCENARIOS_STORE);
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      tx.onerror = () => {
        if (settled) return;
        settled = true;
        reject(tx.error ?? new Error('Backup import transaction failed'));
      };
      tx.onabort = () => {
        if (settled) return;
        settled = true;
        reject(tx.error ?? new Error('Backup import transaction was aborted'));
      };

      if (commit.mode === 'replace') {
        adsStore.clear();
        archivesStore.clear();
        scenariosStore.clear();
        putImportedRecords(adsStore, archivesStore, scenariosStore, commit);
        return;
      }

      if (!commit.refreshMerge) {
        putImportedRecords(adsStore, archivesStore, scenariosStore, commit);
        return;
      }

      const adsReq = adsStore.getAll();
      const archivesReq = archivesStore.getAll();
      const scenariosReq = scenariosStore.getAll();
      let remaining = 3;
      const onCurrentReady = () => {
        remaining -= 1;
        if (remaining !== 0 || settled) return;
        try {
          const planned = commit.refreshMerge!({
            ads: (adsReq.result as TefSavedAd[]) ?? [],
            archives: (archivesReq.result as TefTopicArchive[]) ?? [],
            scenarios: (scenariosReq.result as Scenario[]) ?? [],
          });
          putImportedRecords(adsStore, archivesStore, scenariosStore, planned);
        } catch (error) {
          fail(error);
        }
      };
      adsReq.onsuccess = onCurrentReady;
      archivesReq.onsuccess = onCurrentReady;
      scenariosReq.onsuccess = onCurrentReady;
      adsReq.onerror = () => fail(adsReq.error ?? new Error('Failed reading saved ads for import'));
      archivesReq.onerror = () => fail(
        archivesReq.error ?? new Error('Failed reading topic archives for import')
      );
      scenariosReq.onerror = () => fail(
        scenariosReq.error ?? new Error('Failed reading scenarios for import')
      );
    });
  } finally {
    db.close();
  }

  const [ads, archives, scenarios] = await Promise.all([
    readAllFromStore<TefSavedAd>(SAVED_ADS_STORE),
    readAllFromStore<TefTopicArchive>(TOPIC_ARCHIVES_STORE),
    readAllFromStore<Scenario>(SCENARIOS_STORE),
  ]);

  return { ads, archives, scenarios };
}
