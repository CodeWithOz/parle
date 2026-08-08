import type {
  DurableDataMigrationMetadata,
  DurableDataMigrationName,
  DurableDataIntegrityCounts,
  DurableDataMismatchCounts,
  DurableDataRepairCounts,
  Scenario,
  ScenarioMigrationMetadata,
  TefExerciseType,
  TefSavedAd,
  TefTopicArchive,
  TefTopicSuggestion,
  TopicArchiveMigrationMetadata,
} from '../types';

const TOPIC_ARCHIVES_KEY = 'parle-tef-topic-archives';
const SCENARIOS_KEY = 'parle-scenarios';
const TOPIC_ARCHIVES_MIRROR_DIRTY_KEY = 'parle-tef-topic-archives-mirror-dirty';
const SCENARIOS_MIRROR_DIRTY_KEY = 'parle-scenarios-mirror-dirty';
const TOPIC_ARCHIVES_BRIDGE_DIRTY_KEY = 'parle-tef-topic-archives-bridge-dirty';
const SCENARIOS_BRIDGE_DIRTY_KEY = 'parle-scenarios-bridge-dirty';
const TOPIC_ARCHIVES_PRIMARY_KEY = 'parle-tef-topic-archives-idb-primary';
const SCENARIOS_PRIMARY_KEY = 'parle-scenarios-idb-primary';
const TOPIC_ARCHIVES_PENDING_KEY = 'parle-tef-topic-archives-pending-mutations';
const SCENARIOS_PENDING_KEY = 'parle-scenarios-pending-mutations';
const MAX_TOPIC_ARCHIVES = 50;
const MAX_SAVED_ADS_PER_TYPE = 20;
const DB_NAME = 'parle-tef';
export const TEF_DB_VERSION = 3;
const SAVED_ADS_STORE = 'savedAds';
const TOPIC_ARCHIVES_STORE = 'topicArchives';
const SCENARIOS_STORE = 'scenarios';
const MIGRATION_METADATA_STORE = 'migrationMetadata';
const TOPIC_ARCHIVE_MIGRATION_NAME = 'topic-archives-localstorage-to-idb';
const SCENARIO_MIGRATION_NAME = 'scenarios-localstorage-to-idb';
const MAX_MIRROR_STABILITY_ATTEMPTS = 5;
const rollbackBridgeDirtyInMemory = new Set<string>();

export interface DurableDataMirrorDiagnostic {
  operation: 'backfill' | 'shadow-verify' | 'save' | 'delete' | 'delete-for-ad';
  success: boolean;
  sourceRecordCount: number;
  destinationRecordCount?: number;
  completedAt: number;
  error?: string;
  /** Stage 2 pre-repair shadow comparison. IDs make the result directly testable. */
  comparison?: DurableDataShadowComparison;
  /** Integrity of the reconciled canonical IndexedDB mirror. */
  postRepairIntegrity?: DurableDataIntegrityDiagnostic;
  repairs?: DurableDataRepairCounts;
}

export interface DurableDataIntegrityDiagnostic {
  relationshipInvalidIds: string[];
  legacyShapeIds: string[];
}

export interface DurableDataShadowComparison {
  missingIds: string[];
  extraIds: string[];
  differingIds: string[];
  /** Topic archives whose adId does not resolve in the savedAds store. */
  relationshipInvalidIds: string[];
  /** Valid pre-roadmap/pre-character scenarios retained without normalization. */
  legacyShapeIds: string[];
}

export type TopicArchiveMirrorDiagnostic = DurableDataMirrorDiagnostic;
export type ScenarioMirrorDiagnostic = DurableDataMirrorDiagnostic;

interface DurableRecord {
  id: string;
}

interface MirrorSource<T extends DurableRecord> {
  records: T[];
  readable: boolean;
}

interface MirrorConfig<T extends DurableRecord> {
  storageKey: string;
  dirtyKey: string;
  bridgeDirtyKey: string;
  primaryKey: string;
  pendingMutationsKey: string;
  storeName: string;
  metadataName: DurableDataMigrationName;
  label: string;
  inspectRelationships?: (records: T[]) => Promise<string[]>;
  inspectLegacyShapes?: (records: T[]) => string[];
}

interface PendingMutation {
  id: string;
  kind: 'upsert' | 'delete-id' | 'delete-for-ad';
  record?: DurableRecord;
  targetId?: string;
  adId?: string;
}

interface MirrorState {
  queue: Promise<void>;
  lastDiagnostic: DurableDataMirrorDiagnostic | null;
  dirtyTokenSequence: number;
}

export type DurableDataReadSource = 'indexeddb' | 'localstorage-fallback';

export interface DurableDataReadResult<T> {
  records: T[];
  source: DurableDataReadSource;
  fallbackReason?: 'indexeddb-unavailable' | 'migration-unverified' | 'unexpected-empty-store';
}

const topicArchiveMirrorConfig: MirrorConfig<TefTopicArchive> = {
  storageKey: TOPIC_ARCHIVES_KEY,
  dirtyKey: TOPIC_ARCHIVES_MIRROR_DIRTY_KEY,
  bridgeDirtyKey: TOPIC_ARCHIVES_BRIDGE_DIRTY_KEY,
  primaryKey: TOPIC_ARCHIVES_PRIMARY_KEY,
  pendingMutationsKey: TOPIC_ARCHIVES_PENDING_KEY,
  storeName: TOPIC_ARCHIVES_STORE,
  metadataName: TOPIC_ARCHIVE_MIGRATION_NAME,
  label: 'TEF topic archive',
  inspectRelationships: findArchivesWithMissingAds,
};

const scenarioMirrorConfig: MirrorConfig<Scenario> = {
  storageKey: SCENARIOS_KEY,
  dirtyKey: SCENARIOS_MIRROR_DIRTY_KEY,
  bridgeDirtyKey: SCENARIOS_BRIDGE_DIRTY_KEY,
  primaryKey: SCENARIOS_PRIMARY_KEY,
  pendingMutationsKey: SCENARIOS_PENDING_KEY,
  storeName: SCENARIOS_STORE,
  metadataName: SCENARIO_MIGRATION_NAME,
  label: 'saved scenario',
  inspectLegacyShapes: (records) => records
    .filter((record) => !Object.prototype.hasOwnProperty.call(record, 'characters')
      || !Object.prototype.hasOwnProperty.call(record, 'steps'))
    .map((record) => record.id),
};

const topicArchiveMirrorState: MirrorState = {
  queue: Promise.resolve(),
  lastDiagnostic: null,
  dirtyTokenSequence: 0,
};

const scenarioMirrorState: MirrorState = {
  queue: Promise.resolve(),
  lastDiagnostic: null,
  dirtyTokenSequence: 0,
};

function createArchiveId(): string {
  return `scenario_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function isQuotaExceeded(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
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

function readMirrorSource<T extends DurableRecord>(config: MirrorConfig<T>): MirrorSource<T> {
  try {
    const stored = localStorage.getItem(config.storageKey);
    if (!stored) return { records: [], readable: true };
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return { records: [], readable: false };
    return { records: parsed as T[], readable: true };
  } catch (error) {
    console.error(`Error loading ${config.label}s:`, error);
    return { records: [], readable: false };
  }
}

function persistTopicArchives(archives: TefTopicArchive[]): boolean {
  try {
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(archives));
    return true;
  } catch (error) {
    if (isQuotaExceeded(error) && archives.length > 0) {
      const trimmed = archives.slice(0, Math.max(1, archives.length - 1));
      try {
        localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(trimmed));
        return false;
      } catch (retryError) {
        console.error('Error saving topic archives after trim:', retryError);
        throw new Error('Failed to save topic archive: storage quota exceeded');
      }
    }
    console.error('Error saving topic archives:', error);
    throw error;
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function recordCollectionsMatch<T extends DurableRecord>(
  authoritative: T[],
  mirrored: T[]
): boolean {
  if (authoritative.length !== mirrored.length) return false;
  const mirroredById = new Map(mirrored.map((record) => [record.id, record]));
  return authoritative.every((record) => {
    const mirroredRecord = mirroredById.get(record.id);
    return mirroredRecord !== undefined && canonicalJson(record) === canonicalJson(mirroredRecord);
  });
}

function compareRecordCollections<T extends DurableRecord>(
  authoritative: T[],
  mirrored: T[]
): Pick<DurableDataShadowComparison, 'missingIds' | 'extraIds' | 'differingIds'> {
  const authoritativeById = new Map(authoritative.map((record) => [record.id, record]));
  const mirroredById = new Map(mirrored.map((record) => [record.id, record]));
  const missingIds: string[] = [];
  const differingIds: string[] = [];
  const extraIds: string[] = [];

  for (const record of authoritative) {
    const mirroredRecord = mirroredById.get(record.id);
    if (mirroredRecord === undefined) {
      missingIds.push(record.id);
    } else if (canonicalJson(record) !== canonicalJson(mirroredRecord)) {
      differingIds.push(record.id);
    }
  }
  for (const record of mirrored) {
    if (!authoritativeById.has(record.id)) extraIds.push(record.id);
  }

  return { missingIds, extraIds, differingIds };
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
      request.onsuccess = () => {
        next = mutate((request.result as T[]) ?? []);
        store.clear();
        for (const record of next) store.put(record);
      };
      request.onerror = () => reject(request.error ?? new Error(`Failed reading ${storeName}`));
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error ?? new Error(`Failed writing ${storeName}`));
      tx.onabort = () => reject(tx.error ?? new Error(`Writing ${storeName} was aborted`));
    });
  } finally {
    db.close();
  }
}

async function findArchivesWithMissingAds(archives: TefTopicArchive[]): Promise<string[]> {
  const ads = await readAllFromStore<TefSavedAd>(SAVED_ADS_STORE);
  const savedAdIds = new Set(ads.map((ad) => ad.id));
  return archives
    .filter((archive) => !savedAdIds.has(archive.adId))
    .map((archive) => archive.id);
}

async function createShadowComparison<T extends DurableRecord>(
  config: MirrorConfig<T>,
  authoritative: T[],
  mirrored: T[]
): Promise<DurableDataShadowComparison> {
  const recordsSeenDuringComparison = [...authoritative, ...mirrored];
  const integrity = await inspectRecordIntegrity(config, recordsSeenDuringComparison);
  return {
    ...compareRecordCollections(authoritative, mirrored),
    ...integrity,
  };
}

async function inspectRecordIntegrity<T extends DurableRecord>(
  config: MirrorConfig<T>,
  records: T[]
): Promise<DurableDataIntegrityDiagnostic> {
  return {
    relationshipInvalidIds: config.inspectRelationships
      ? [...new Set(await config.inspectRelationships(records))]
      : [],
    legacyShapeIds: config.inspectLegacyShapes
      ? [...new Set(config.inspectLegacyShapes(records))]
      : [],
  };
}

function mismatchCounts(
  comparison: DurableDataShadowComparison
): DurableDataMismatchCounts {
  return {
    missing: comparison.missingIds.length,
    extra: comparison.extraIds.length,
    differing: comparison.differingIds.length,
  };
}

function repairCounts(
  comparison: DurableDataShadowComparison
): DurableDataRepairCounts {
  return {
    inserted: comparison.missingIds.length,
    updated: comparison.differingIds.length,
    deleted: comparison.extraIds.length,
  };
}

function integrityCounts(
  integrity: DurableDataIntegrityDiagnostic
): DurableDataIntegrityCounts {
  return {
    relationshipInvalid: integrity.relationshipInvalidIds.length,
    legacyShape: integrity.legacyShapeIds.length,
  };
}

async function reconcileMirror<T extends DurableRecord>(
  config: MirrorConfig<T>,
  authoritative: T[]
): Promise<number> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(config.storeName, 'readwrite');
      const store = tx.objectStore(config.storeName);
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const authoritativeIds = new Set(authoritative.map((record) => record.id));
        for (const record of authoritative) store.put(record);
        for (const mirrored of (getAllRequest.result as T[]) ?? []) {
          if (!authoritativeIds.has(mirrored.id)) store.delete(mirrored.id);
        }
      };
      getAllRequest.onerror = () => reject(
        getAllRequest.error ?? new Error(`Failed to inspect ${config.label} mirror`)
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error(`Failed to reconcile ${config.label} mirror`));
      tx.onabort = () => reject(tx.error ?? new Error(`${config.label} reconciliation was aborted`));
    });
  } finally {
    db.close();
  }

  const mirrored = await readAllFromStore<T>(config.storeName);
  if (!recordCollectionsMatch(authoritative, mirrored)) {
    throw new Error(`${config.label} mirror verification failed after reconciliation`);
  }

  return mirrored.length;
}

async function writeVerifiedMirrorMetadata(
  metadataName: DurableDataMigrationName,
  sourceRecordCount: number,
  destinationRecordCount: number,
  comparison: DurableDataShadowComparison,
  postRepairIntegrity: DurableDataIntegrityDiagnostic,
  repairs: DurableDataRepairCounts
): Promise<void> {
  const now = Date.now();
  const metadata: DurableDataMigrationMetadata = {
    name: metadataName,
    version: 1,
    state: 'mirroring',
    lastReconciledAt: now,
    sourceRecordCount,
    destinationRecordCount,
    verificationStatus: 'verified',
    lastVerifiedAt: now,
    mismatchCounts: mismatchCounts(comparison),
    repairCounts: repairs,
    preRepairIntegrityCounts: integrityCounts(comparison),
    postRepairIntegrityCounts: integrityCounts(postRepairIntegrity),
    relationshipInvalidRecordCount: postRepairIntegrity.relationshipInvalidIds.length,
    legacyShapeRecordCount: postRepairIntegrity.legacyShapeIds.length,
  };

  const metadataDb = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = metadataDb.transaction(MIGRATION_METADATA_STORE, 'readwrite');
      tx.objectStore(MIGRATION_METADATA_STORE).put(metadata);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save migration metadata'));
      tx.onabort = () => reject(tx.error ?? new Error('Migration metadata write was aborted'));
    });
  } finally {
    metadataDb.close();
  }
}

async function writeFailedVerificationMetadata(
  config: MirrorConfig<DurableRecord>,
  sourceRecordCount: number,
  error: string
): Promise<boolean> {
  let destinationRecordCount = 0;
  let previous: DurableDataMigrationMetadata | null = null;
  try {
    [destinationRecordCount, previous] = await Promise.all([
      readAllFromStore<DurableRecord>(config.storeName).then((records) => records.length),
      getMigrationMetadata(config.metadataName),
    ]);
  } catch {
    // If IndexedDB itself is unavailable, there is nowhere durable to record
    // the failed verification. The returned diagnostic still exposes it.
    return false;
  }

  const metadata: DurableDataMigrationMetadata = {
    name: config.metadataName,
    version: 1,
    state: hasIdbPrimaryAuthority(config, previous) ? 'idb-primary' : 'mirroring',
    lastReconciledAt: previous?.lastReconciledAt ?? 0,
    sourceRecordCount,
    destinationRecordCount,
    verificationStatus: 'failed',
    lastVerifiedAt: Date.now(),
    verificationError: error,
  };

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MIGRATION_METADATA_STORE, 'readwrite');
      tx.objectStore(MIGRATION_METADATA_STORE).put(metadata);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save failed verification metadata'));
      tx.onabort = () => reject(tx.error ?? new Error('Failed verification metadata write was aborted'));
    });
  } finally {
    db.close();
  }
  return true;
}

async function mirrorLatestSource<T extends DurableRecord>(
  config: MirrorConfig<T>,
  onSourceRead: (recordCount: number) => void
): Promise<{
  sourceRecordCount: number;
  destinationRecordCount: number;
  comparison: DurableDataShadowComparison;
  postRepairIntegrity: DurableDataIntegrityDiagnostic;
  repairs: DurableDataRepairCounts;
}> {
  for (let attempt = 1; attempt <= MAX_MIRROR_STABILITY_ATTEMPTS; attempt += 1) {
    // Read only when this task owns the queue turn. Capturing at enqueue time
    // lets a delayed operation overwrite a newer localStorage snapshot.
    const source = readMirrorSource(config);
    onSourceRead(source.records.length);
    if (!source.readable) {
      throw new Error(`Authoritative localStorage ${config.label}s are unreadable`);
    }

    // Stage 2 shadow-read: capture exact discrepancies before repairing the
    // mirror. Equal counts are insufficient because IDs/content may differ.
    const mirrorBeforeReconcile = await readAllFromStore<T>(config.storeName);
    const comparison = await createShadowComparison(
      config,
      source.records,
      mirrorBeforeReconcile
    );
    const repairs = repairCounts(comparison);
    const destinationRecordCount = await reconcileMirror(config, source.records);
    const sourceAfterReconcile = readMirrorSource(config);
    if (!sourceAfterReconcile.readable) {
      throw new Error(`Authoritative localStorage ${config.label}s are unreadable`);
    }
    if (!recordCollectionsMatch(source.records, sourceAfterReconcile.records)) {
      continue;
    }

    const mirrorAfterReconcile = await readAllFromStore<T>(config.storeName);
    if (!recordCollectionsMatch(source.records, mirrorAfterReconcile)) {
      continue;
    }
    const postRepairIntegrity = await inspectRecordIntegrity(config, mirrorAfterReconcile);

    // Metadata is only stamped verified after confirming localStorage still
    // matches the snapshot that was reconciled.
    await writeVerifiedMirrorMetadata(
      config.metadataName,
      source.records.length,
      destinationRecordCount,
      comparison,
      postRepairIntegrity,
      repairs
    );

    // Close the remaining cross-tab window: if localStorage or another tab's
    // IDB transaction changed state while metadata was written, retry latest.
    const sourceAfterMetadata = readMirrorSource(config);
    if (!sourceAfterMetadata.readable) {
      throw new Error(`Authoritative localStorage ${config.label}s are unreadable`);
    }
    const mirrorAfterMetadata = await readAllFromStore<T>(config.storeName);
    const integrityAfterMetadata = await inspectRecordIntegrity(config, mirrorAfterMetadata);
    if (
      !recordCollectionsMatch(source.records, sourceAfterMetadata.records) ||
      !recordCollectionsMatch(source.records, mirrorAfterMetadata) ||
      canonicalJson(postRepairIntegrity) !== canonicalJson(integrityAfterMetadata)
    ) {
      continue;
    }

    return {
      sourceRecordCount: source.records.length,
      destinationRecordCount: mirrorAfterMetadata.length,
      comparison,
      postRepairIntegrity,
      repairs,
    };
  }

  throw new Error(`Authoritative localStorage changed repeatedly during ${config.label} mirroring`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readMirrorDirtyToken(config: MirrorConfig<DurableRecord>): string | null {
  try {
    return localStorage.getItem(config.dirtyKey);
  } catch {
    return null;
  }
}

function isRollbackBridgeDirty(config: MirrorConfig<DurableRecord>): boolean {
  if (rollbackBridgeDirtyInMemory.has(config.bridgeDirtyKey)) return true;
  try {
    return localStorage.getItem(config.bridgeDirtyKey) !== null
      || sessionStorage.getItem(config.bridgeDirtyKey) !== null;
  } catch {
    return true;
  }
}

function markRollbackBridgeDirty(config: MirrorConfig<DurableRecord>): void {
  rollbackBridgeDirtyInMemory.add(config.bridgeDirtyKey);
  const marker = String(Date.now());
  try {
    localStorage.setItem(config.bridgeDirtyKey, marker);
  } catch (error) {
    console.error(`Failed to mark ${config.label} rollback bridge dirty:`, error);
  }
  try {
    sessionStorage.setItem(config.bridgeDirtyKey, marker);
  } catch (error) {
    console.error(`Failed to mark ${config.label} session rollback bridge dirty:`, error);
  }
}

function clearRollbackBridgeDirty(config: MirrorConfig<DurableRecord>): void {
  rollbackBridgeDirtyInMemory.delete(config.bridgeDirtyKey);
  try {
    localStorage.removeItem(config.bridgeDirtyKey);
  } catch (error) {
    console.error(`Failed to clear ${config.label} rollback bridge marker:`, error);
  }
  try {
    sessionStorage.removeItem(config.bridgeDirtyKey);
  } catch (error) {
    console.error(`Failed to clear ${config.label} session rollback bridge marker:`, error);
  }
}

function markIdbPrimary(config: MirrorConfig<DurableRecord>): void {
  try {
    localStorage.setItem(config.primaryKey, '1');
  } catch (error) {
    console.error(`Failed to persist ${config.label} primary-authority marker:`, error);
  }
}

function hasIdbPrimaryAuthority(
  config: MirrorConfig<DurableRecord>,
  metadata?: DurableDataMigrationMetadata | null
): boolean {
  if (metadata?.state === 'idb-primary') return true;
  try {
    return localStorage.getItem(config.primaryKey) === '1';
  } catch {
    return false;
  }
}

function readPendingMutations(config: MirrorConfig<DurableRecord>): PendingMutation[] {
  try {
    const raw = localStorage.getItem(config.pendingMutationsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('pending mutation journal is not an array');
    return parsed as PendingMutation[];
  } catch (error) {
    throw new Error(`Unable to read ${config.label} recovery journal: ${errorMessage(error)}`);
  }
}

function appendPendingMutation(
  config: MirrorConfig<DurableRecord>,
  intent: PendingMutation
): void {
  const pending = readPendingMutations(config);
  localStorage.setItem(config.pendingMutationsKey, JSON.stringify([...pending, intent]));
}

function clearPendingMutations(config: MirrorConfig<DurableRecord>): void {
  localStorage.removeItem(config.pendingMutationsKey);
}

function applyPendingMutation<T extends DurableRecord>(
  config: MirrorConfig<T>,
  records: T[],
  intent: PendingMutation
): T[] {
  if (intent.kind === 'delete-id') {
    return records.filter((record) => record.id !== intent.targetId);
  }
  if (intent.kind === 'delete-for-ad') {
    return (records as unknown as TefTopicArchive[])
      .filter((record) => record.adId !== intent.adId) as unknown as T[];
  }

  const record = intent.record as T | undefined;
  if (!record) throw new Error(`Invalid ${config.label} upsert recovery intent`);
  const updated = [record, ...records.filter((item) => item.id !== record.id)];
  if (config === topicArchiveMirrorConfig) {
    return (updated as unknown as TefTopicArchive[])
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_TOPIC_ARCHIVES) as unknown as T[];
  }
  return (updated as unknown as Scenario[])
    .sort((a, b) => b.createdAt - a.createdAt) as unknown as T[];
}

function markMirrorDirty(
  config: MirrorConfig<DurableRecord>,
  state: MirrorState
): string | null {
  state.dirtyTokenSequence += 1;
  const uniqueSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  const token = `${Date.now()}-${state.dirtyTokenSequence}-${uniqueSuffix}`;
  try {
    localStorage.setItem(config.dirtyKey, token);
    return token;
  } catch (error) {
    console.error(`Failed to mark ${config.label} mirror dirty:`, error);
    return null;
  }
}

function clearMirrorDirtyToken(
  config: MirrorConfig<DurableRecord>,
  expectedToken: string | null
): void {
  if (expectedToken === null) return;
  try {
    if (localStorage.getItem(config.dirtyKey) === expectedToken) {
      localStorage.removeItem(config.dirtyKey);
    }
  } catch (error) {
    console.error(`Failed to clear ${config.label} mirror dirty marker:`, error);
  }
}

function isMutationMirrorOperation(
  operation: DurableDataMirrorDiagnostic['operation']
): boolean {
  return operation === 'save' || operation === 'delete' || operation === 'delete-for-ad';
}

function enqueueMirror<T extends DurableRecord>(
  config: MirrorConfig<T>,
  state: MirrorState,
  operation: DurableDataMirrorDiagnostic['operation']
): Promise<DurableDataMirrorDiagnostic> {
  let sourceRecordCount = 0;
  const durableConfig = config as MirrorConfig<DurableRecord>;
  const dirtyToken = isMutationMirrorOperation(operation)
    ? markMirrorDirty(durableConfig, state)
    : readMirrorDirtyToken(durableConfig);

  const diagnosticPromise = state.queue.then(async () => {
    try {
      let metadata: DurableDataMigrationMetadata | null = null;
      try {
        metadata = await getMigrationMetadata(config.metadataName);
      } catch {
        // The normal mirror path below will produce the standard diagnostic.
      }
      if (hasIdbPrimaryAuthority(durableConfig, metadata)) {
        const records = await recoverPrimaryDataset(config);
        const diagnostic: DurableDataMirrorDiagnostic = {
          operation,
          success: true,
          sourceRecordCount: records.length,
          destinationRecordCount: records.length,
          completedAt: Date.now(),
        };
        state.lastDiagnostic = diagnostic;
        clearMirrorDirtyToken(durableConfig, dirtyToken);
        return diagnostic;
      }

      const result = await mirrorLatestSource(config, (recordCount) => {
        sourceRecordCount = recordCount;
      });
      sourceRecordCount = result.sourceRecordCount;
      const diagnostic: DurableDataMirrorDiagnostic = {
        operation,
        success: true,
        sourceRecordCount,
        destinationRecordCount: result.destinationRecordCount,
        completedAt: Date.now(),
        comparison: result.comparison,
        postRepairIntegrity: result.postRepairIntegrity,
        repairs: result.repairs,
      };
      state.lastDiagnostic = diagnostic;
      clearMirrorDirtyToken(durableConfig, dirtyToken);
      if (readPendingMutations(durableConfig).length > 0) {
        clearPendingMutations(durableConfig);
      }
      return diagnostic;
    } catch (error) {
      const diagnostic: DurableDataMirrorDiagnostic = {
        operation,
        success: false,
        sourceRecordCount,
        completedAt: Date.now(),
        error: errorMessage(error),
      };
      state.lastDiagnostic = diagnostic;
      let failureMetadataPersisted = false;
      try {
        // Any failed mirror operation invalidates prior verification. A later
        // successful reconciliation writes a fresh verified record.
        failureMetadataPersisted = await writeFailedVerificationMetadata(
          durableConfig,
          sourceRecordCount,
          errorMessage(error)
        );
      } catch (metadataError) {
        // The diagnostic is still returned when IndexedDB cannot persist its
        // own failure metadata. Authoritative localStorage data is never changed.
        console.error(`Failed to persist ${config.label} verification failure:`, metadataError);
      }
      if (!failureMetadataPersisted && readMirrorDirtyToken(durableConfig) === null) {
        // A localStorage latch is the only durable invalidation available when
        // IndexedDB cannot update its own metadata. It never changes the
        // authoritative archive/scenario data keys.
        markMirrorDirty(durableConfig, state);
      }
      // JSDOM and other non-browser runtimes may not provide IndexedDB at all.
      // The returned diagnostic remains observable without flooding their logs.
      if (typeof indexedDB !== 'undefined') {
        console.error(`${config.label} IndexedDB ${operation} mirror failed:`, error);
      }
      return diagnostic;
    }
  });

  state.queue = diagnosticPromise.then(() => undefined);
  return diagnosticPromise;
}

/** Stage 1-compatible backfill entry points retained for queued mirror writes/tests. */
export function initializeTopicArchiveMirror(): Promise<TopicArchiveMirrorDiagnostic> {
  return enqueueMirror(topicArchiveMirrorConfig, topicArchiveMirrorState, 'backfill');
}

export function initializeScenarioMirror(): Promise<ScenarioMirrorDiagnostic> {
  return enqueueMirror(scenarioMirrorConfig, scenarioMirrorState, 'backfill');
}

export async function initializeDurableDataMirrors(): Promise<{
  topicArchives: TopicArchiveMirrorDiagnostic;
  scenarios: ScenarioMirrorDiagnostic;
}> {
  const [topicArchives, scenarios] = await Promise.all([
    initializeTopicArchiveMirror(),
    initializeScenarioMirror(),
  ]);
  return { topicArchives, scenarios };
}

/**
 * Stage 2 background verification. Each dataset is shadow-read, compared by ID
 * and canonical content, diagnosed, and independently reconciled from its
 * authoritative localStorage source. Production reads remain unchanged.
 */
export function verifyTopicArchiveMirror(): Promise<TopicArchiveMirrorDiagnostic> {
  return enqueueMirror(topicArchiveMirrorConfig, topicArchiveMirrorState, 'shadow-verify');
}

export function verifyScenarioMirror(): Promise<ScenarioMirrorDiagnostic> {
  return enqueueMirror(scenarioMirrorConfig, scenarioMirrorState, 'shadow-verify');
}

export async function verifyDurableDataMirrors(): Promise<{
  topicArchives: TopicArchiveMirrorDiagnostic;
  scenarios: ScenarioMirrorDiagnostic;
}> {
  const [topicArchives, scenarios] = await Promise.all([
    verifyTopicArchiveMirror(),
    verifyScenarioMirror(),
  ]);
  return { topicArchives, scenarios };
}

async function recoverDatasetAtStartup<T extends DurableRecord>(
  config: MirrorConfig<T>,
  state: MirrorState
): Promise<void> {
  let metadata: DurableDataMigrationMetadata | null = null;
  try {
    metadata = await getMigrationMetadata(config.metadataName);
  } catch {
    return;
  }

  const durableConfig = config as MirrorConfig<DurableRecord>;
  const hasPending = readPendingMutations(durableConfig).length > 0;
  if (hasIdbPrimaryAuthority(durableConfig, metadata)) {
    if (metadata?.verificationStatus === 'verified'
      && readMirrorDirtyToken(durableConfig) === null
      && !isRollbackBridgeDirty(durableConfig)
      && !hasPending) {
      return;
    }
    const recovery = state.queue.then(() => recoverPrimaryDataset(config));
    state.queue = recovery.then(() => undefined, () => undefined);
    await recovery;
    return;
  }

  if (metadata?.verificationStatus !== 'verified'
    || readMirrorDirtyToken(durableConfig) !== null
    || hasPending) {
    const diagnostic = await enqueueMirror(config, state, 'backfill');
    if (!diagnostic.success) throw new Error(diagnostic.error ?? `${config.label} recovery failed`);
    if (hasPending) clearPendingMutations(durableConfig);
  }
}

/**
 * Repairs interrupted durable-data work without reversing the Stage 3 authority.
 * Pre-cutover datasets may still backfill from localStorage; post-cutover datasets
 * only replay journaled operations into the latest IndexedDB transaction and then
 * rebuild the rollback bridge from IndexedDB.
 */
export async function recoverDurableDataAtStartup(): Promise<void> {
  const results = await Promise.allSettled([
    recoverDatasetAtStartup(topicArchiveMirrorConfig, topicArchiveMirrorState),
    recoverDatasetAtStartup(scenarioMirrorConfig, scenarioMirrorState),
  ]);
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    throw new Error(`Durable data recovery failed for ${failures.length} dataset(s)`);
  }
}

/** Waits for queued fire-and-forget mirrors from synchronous public mutations. */
export async function waitForTopicArchiveMirror(): Promise<TopicArchiveMirrorDiagnostic | null> {
  await topicArchiveMirrorState.queue;
  return topicArchiveMirrorState.lastDiagnostic;
}

export async function waitForScenarioMirror(): Promise<ScenarioMirrorDiagnostic | null> {
  await scenarioMirrorState.queue;
  return scenarioMirrorState.lastDiagnostic;
}

export function getLastTopicArchiveMirrorDiagnostic(): TopicArchiveMirrorDiagnostic | null {
  return topicArchiveMirrorState.lastDiagnostic;
}

export function getLastScenarioMirrorDiagnostic(): ScenarioMirrorDiagnostic | null {
  return scenarioMirrorState.lastDiagnostic;
}

/** Diagnostic/test access only. Production reads stay on localStorage through Stage 2. */
export function getTopicArchiveMirrorSnapshot(): Promise<TefTopicArchive[]> {
  return readAllFromStore<TefTopicArchive>(TOPIC_ARCHIVES_STORE);
}

export function getScenarioMirrorSnapshot(): Promise<Scenario[]> {
  return readAllFromStore<Scenario>(SCENARIOS_STORE);
}

async function getMigrationMetadata(
  name: DurableDataMigrationName
): Promise<DurableDataMigrationMetadata | null> {
  const config = (name === TOPIC_ARCHIVE_MIGRATION_NAME
    ? topicArchiveMirrorConfig
    : scenarioMirrorConfig) as MirrorConfig<DurableRecord>;
  const db = await openDb();
  try {
    const tx = db.transaction(MIGRATION_METADATA_STORE, 'readonly');
    const result = await idbRequest(
      tx.objectStore(MIGRATION_METADATA_STORE).get(name)
    ) as DurableDataMigrationMetadata | undefined;
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed reading migration metadata'));
      tx.onabort = () => reject(tx.error ?? new Error('Migration metadata read was aborted'));
    });
    if (!result) return null;
    const pendingMutationCount = readPendingMutations(config).length;
    const legacyDirty = readMirrorDirtyToken(config) !== null;
    const rollbackBridgeDirty = isRollbackBridgeDirty(config);
    if ((legacyDirty || pendingMutationCount > 0 || rollbackBridgeDirty)
      && result.verificationStatus === 'verified') {
      return {
        ...result,
        verificationStatus: 'failed',
        verificationError: pendingMutationCount > 0
          ? 'IndexedDB recovery has pending local mutations'
          : rollbackBridgeDirty
            ? 'The localStorage rollback bridge is stale'
            : 'Authoritative localStorage changed after the last verified reconciliation',
      };
    }
    return result;
  } finally {
    db.close();
  }
}

async function markMigrationIdbPrimary(
  config: MirrorConfig<DurableRecord>,
  metadata: DurableDataMigrationMetadata
): Promise<void> {
  if (metadata.state !== 'idb-primary') {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(MIGRATION_METADATA_STORE, 'readwrite');
        tx.objectStore(MIGRATION_METADATA_STORE).put({ ...metadata, state: 'idb-primary' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to mark migration IndexedDB-primary'));
        tx.onabort = () => reject(tx.error ?? new Error('Migration metadata update was aborted'));
      });
    } finally {
      db.close();
    }
  }
  markIdbPrimary(config);
}

async function writePrimaryRecoveryMetadata<T extends DurableRecord>(
  config: MirrorConfig<T>,
  records: T[]
): Promise<void> {
  const integrity = await inspectRecordIntegrity(config, records);
  const now = Date.now();
  const metadata: DurableDataMigrationMetadata = {
    name: config.metadataName,
    version: 1,
    state: 'idb-primary',
    lastReconciledAt: now,
    sourceRecordCount: records.length,
    destinationRecordCount: records.length,
    verificationStatus: 'verified',
    lastVerifiedAt: now,
    mismatchCounts: { missing: 0, extra: 0, differing: 0 },
    repairCounts: { inserted: 0, updated: 0, deleted: 0 },
    preRepairIntegrityCounts: integrityCounts(integrity),
    postRepairIntegrityCounts: integrityCounts(integrity),
    relationshipInvalidRecordCount: integrity.relationshipInvalidIds.length,
    legacyShapeRecordCount: integrity.legacyShapeIds.length,
  };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MIGRATION_METADATA_STORE, 'readwrite');
      tx.objectStore(MIGRATION_METADATA_STORE).put(metadata);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save primary recovery metadata'));
      tx.onabort = () => reject(tx.error ?? new Error('Primary recovery metadata write was aborted'));
    });
  } finally {
    db.close();
  }
  markIdbPrimary(config as MirrorConfig<DurableRecord>);
}

async function recoverPrimaryDataset<T extends DurableRecord>(
  config: MirrorConfig<T>
): Promise<T[]> {
  const durableConfig = config as MirrorConfig<DurableRecord>;
  const pending = readPendingMutations(durableConfig);
  const records = pending.length > 0
    ? await mutateAllInStore(config.storeName, (current) => pending.reduce(
      (next, intent) => applyPendingMutation(config, next, intent),
      current
    ))
    : await readAllFromStore<T>(config.storeName);

  if (pending.length > 0) clearPendingMutations(durableConfig);

  try {
    const bridgeComplete = persistRollbackBridge(config, records);
    if (bridgeComplete) clearRollbackBridgeDirty(durableConfig);
    else markRollbackBridgeDirty(durableConfig);
  } catch (error) {
    markRollbackBridgeDirty(durableConfig);
    console.error(`Failed to rebuild ${config.label} rollback bridge:`, error);
  }

  clearMirrorDirtyToken(durableConfig, readMirrorDirtyToken(durableConfig));
  await writePrimaryRecoveryMetadata(config, records);
  return records;
}

async function readPrimaryDataset<T extends DurableRecord>(
  config: MirrorConfig<T>
): Promise<DurableDataReadResult<T>> {
  const fallback = readMirrorSource(config);
  const useFallback = (
    fallbackReason: NonNullable<DurableDataReadResult<T>['fallbackReason']>
  ): DurableDataReadResult<T> => {
    if (isRollbackBridgeDirty(config as MirrorConfig<DurableRecord>)) {
      throw new Error(
        `Unable to read ${config.label}s: IndexedDB cannot be used and the localStorage rollback bridge is stale`
      );
    }
    if (!fallback.readable) {
      throw new Error(
        `Unable to read ${config.label}s: IndexedDB cannot be used and the localStorage fallback is unreadable`
      );
    }
    return { records: fallback.records, source: 'localstorage-fallback', fallbackReason };
  };

  let metadata: DurableDataMigrationMetadata | null;
  try {
    metadata = await getMigrationMetadata(config.metadataName);
  } catch {
    return useFallback('indexeddb-unavailable');
  }

  const durableConfig = config as MirrorConfig<DurableRecord>;
  if (
    hasIdbPrimaryAuthority(durableConfig, metadata)
    && (metadata?.verificationStatus !== 'verified'
      || readMirrorDirtyToken(durableConfig) !== null
      || readPendingMutations(durableConfig).length > 0)
  ) {
    try {
      const recovered = await recoverPrimaryDataset(config);
      return { records: recovered, source: 'indexeddb' };
    } catch (error) {
      console.error(`Failed to recover ${config.label} IndexedDB primary data:`, error);
      return useFallback('indexeddb-unavailable');
    }
  }

  if (metadata?.verificationStatus !== 'verified') {
    return useFallback('migration-unverified');
  }

  let records: T[];
  try {
    records = await readAllFromStore<T>(config.storeName);
  } catch {
    return useFallback('indexeddb-unavailable');
  }

  if (records.length === 0 && fallback.readable && fallback.records.length > 0) {
    return useFallback('unexpected-empty-store');
  }

  if (isRollbackBridgeDirty(config as MirrorConfig<DurableRecord>)) {
    try {
      const bridgeComplete = persistRollbackBridge(config, records);
      if (bridgeComplete) {
        clearRollbackBridgeDirty(config as MirrorConfig<DurableRecord>);
      } else {
        markRollbackBridgeDirty(config as MirrorConfig<DurableRecord>);
      }
    } catch (error) {
      // IndexedDB remains authoritative. Keep the durable marker so a later
      // fallback cannot silently serve the stale rollback copy.
      console.error(`Failed to repair ${config.label} rollback bridge:`, error);
    }
  }

  // Record cutover only after a verified primary read. A metadata-write failure
  // must never turn a valid dataset read into an empty or error result.
  try {
    await markMigrationIdbPrimary(config as MirrorConfig<DurableRecord>, metadata);
  } catch (error) {
    console.error(`Failed to record ${config.label} IndexedDB-primary state:`, error);
  }
  return { records, source: 'indexeddb' };
}

function persistRollbackBridge<T extends DurableRecord>(
  config: MirrorConfig<T>,
  records: T[]
): boolean {
  if (config === topicArchiveMirrorConfig) {
    return persistTopicArchives(records as unknown as TefTopicArchive[]);
  }
  try {
    localStorage.setItem(config.storageKey, JSON.stringify(records));
    return true;
  } catch (error) {
    if (isQuotaExceeded(error) && records.length > 0) {
      try {
        localStorage.setItem(config.storageKey, JSON.stringify(records.slice(0, -1)));
        return false;
      } catch (retryError) {
        if (isQuotaExceeded(retryError)) {
          console.error(`Error saving ${config.label}s after trim:`, retryError);
          return false;
        }
        throw retryError;
      }
    }
    throw error;
  }
}

async function mutatePrimaryDataset<T extends DurableRecord>(
  config: MirrorConfig<T>,
  state: MirrorState,
  intent: PendingMutation
): Promise<T[]> {
  const mutationPromise = state.queue.then(async () => {
    const current = await readPrimaryDataset(config);
    const fallbackNext = applyPendingMutation(config, [...current.records], intent);

    if (current.source === 'indexeddb') {
      let committed: T[];
      try {
        // Compute from the records observed inside this read-write transaction.
        // IndexedDB serializes it with other tabs, preventing lost updates.
        committed = await mutateAllInStore(
          config.storeName,
          (records) => applyPendingMutation(config, records, intent)
        );
      } catch {
        // Persist the operation itself, not a localStorage snapshot. Recovery
        // replays it against the newest IndexedDB state, preserving records that
        // may have been committed by another tab while this bridge was stale.
        const durableConfig = config as MirrorConfig<DurableRecord>;
        appendPendingMutation(durableConfig, intent);
        const bridgeComplete = persistRollbackBridge(config, fallbackNext);
        if (!bridgeComplete || hasIdbPrimaryAuthority(durableConfig)) {
          markRollbackBridgeDirty(durableConfig);
        }
        queuePrimaryRecovery(config, state, intent.kind === 'delete-for-ad'
          ? 'delete-for-ad'
          : intent.kind === 'delete-id' ? 'delete' : 'save');
        return fallbackNext;
      }
      // IndexedDB committed first; the localStorage copy remains the rollback bridge.
      // Never roll back the primary store from an earlier snapshot if the bridge
      // itself fails, because doing so could erase another tab's committed data.
      try {
        const bridgeComplete = persistRollbackBridge(config, committed);
        if (bridgeComplete) {
          clearRollbackBridgeDirty(config as MirrorConfig<DurableRecord>);
        } else {
          markRollbackBridgeDirty(config as MirrorConfig<DurableRecord>);
        }
      } catch (bridgeError) {
        console.error(`Failed to update ${config.label} rollback bridge:`, bridgeError);
        markRollbackBridgeDirty(config as MirrorConfig<DurableRecord>);
      }
      return committed;
    }

    // A fallback mutation is journaled as an idempotent intent. Never reconcile
    // the whole localStorage snapshot into IndexedDB after the Stage 3 cutover.
    const durableConfig = config as MirrorConfig<DurableRecord>;
    appendPendingMutation(durableConfig, intent);
    const bridgeComplete = persistRollbackBridge(config, fallbackNext);
    if (!bridgeComplete || hasIdbPrimaryAuthority(durableConfig)) {
      markRollbackBridgeDirty(durableConfig);
    }
    queuePrimaryRecovery(config, state, intent.kind === 'delete-for-ad'
      ? 'delete-for-ad'
      : intent.kind === 'delete-id' ? 'delete' : 'save');
    return fallbackNext;
  });

  // Serialize same-dataset mutations so concurrent saves cannot both read the
  // same snapshot and overwrite one another. Keep the queue usable after errors.
  state.queue = mutationPromise.then(
    () => undefined,
    () => undefined
  );
  return mutationPromise;
}

function queuePrimaryRecovery<T extends DurableRecord>(
  config: MirrorConfig<T>,
  state: MirrorState,
  operation: DurableDataMirrorDiagnostic['operation']
): void {
  const recovery = state.queue.then(() => recoverPrimaryDataset(config));
  state.queue = recovery.then(
    () => undefined,
    (error) => {
      state.lastDiagnostic = {
        operation,
        success: false,
        sourceRecordCount: readMirrorSource(config).records.length,
        completedAt: Date.now(),
        error: errorMessage(error),
      };
      console.error(`${config.label} operation replay is pending:`, error);
    }
  );
}

export async function getTopicArchiveMigrationMetadata(): Promise<TopicArchiveMigrationMetadata | null> {
  return await getMigrationMetadata(TOPIC_ARCHIVE_MIGRATION_NAME) as TopicArchiveMigrationMetadata | null;
}

export async function getScenarioMigrationMetadata(): Promise<ScenarioMigrationMetadata | null> {
  return await getMigrationMetadata(SCENARIO_MIGRATION_NAME) as ScenarioMigrationMetadata | null;
}

export function mirrorScenarioSave(): void {
  void enqueueMirror(scenarioMirrorConfig, scenarioMirrorState, 'save');
}

export function mirrorScenarioDelete(): void {
  void enqueueMirror(scenarioMirrorConfig, scenarioMirrorState, 'delete');
}

export async function readTopicArchives(): Promise<DurableDataReadResult<TefTopicArchive>> {
  const result = await readPrimaryDataset(topicArchiveMirrorConfig);
  return {
    ...result,
    records: [...result.records].sort((a, b) => b.createdAt - a.createdAt),
  };
}

export async function listTopicArchives(adId?: string): Promise<TefTopicArchive[]> {
  const { records } = await readTopicArchives();
  return adId ? records.filter((archive) => archive.adId === adId) : records;
}

export async function getLatestTopicArchive(adId: string): Promise<TefTopicArchive | null> {
  const forAd = await listTopicArchives(adId);
  return forAd.length > 0 ? forAd[0] : null;
}

export async function readSavedScenarios(): Promise<DurableDataReadResult<Scenario>> {
  const result = await readPrimaryDataset(scenarioMirrorConfig);
  return {
    ...result,
    records: [...result.records].sort((a, b) => b.createdAt - a.createdAt),
  };
}

export async function listSavedScenarios(): Promise<Scenario[]> {
  return (await readSavedScenarios()).records;
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

  await mutatePrimaryDataset(
    topicArchiveMirrorConfig,
    topicArchiveMirrorState,
    { id: createArchiveId(), kind: 'upsert', record: archive }
  );
  return archive;
}

export async function deleteTopicArchive(archiveId: string): Promise<void> {
  await mutatePrimaryDataset(
    topicArchiveMirrorConfig,
    topicArchiveMirrorState,
    { id: createArchiveId(), kind: 'delete-id', targetId: archiveId }
  );
}

export async function deleteTopicArchivesForAd(adId: string): Promise<void> {
  await mutatePrimaryDataset(
    topicArchiveMirrorConfig,
    topicArchiveMirrorState,
    { id: createArchiveId(), kind: 'delete-for-ad', adId }
  );
}

export async function saveSavedScenario(scenario: Scenario): Promise<Scenario[]> {
  return mutatePrimaryDataset(
    scenarioMirrorConfig,
    scenarioMirrorState,
    { id: createArchiveId(), kind: 'upsert', record: scenario }
  );
}

export async function deleteSavedScenario(scenarioId: string): Promise<Scenario[]> {
  return mutatePrimaryDataset(
    scenarioMirrorConfig,
    scenarioMirrorState,
    { id: createArchiveId(), kind: 'delete-id', targetId: scenarioId }
  );
}

export async function listSavedAds(exerciseType: TefExerciseType): Promise<TefSavedAd[]> {
  const all = await runReadTransaction((store) => idbGetAll<TefSavedAd>(store));
  return all
    .filter((ad) => ad.exerciseType === exerciseType)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
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
