import type {
  TefExerciseType,
  TefSavedAd,
  TefTopicArchive,
  TefTopicSuggestion,
  TopicArchiveMigrationMetadata,
} from '../types';
import { generateId } from './scenarioService';

const TOPIC_ARCHIVES_KEY = 'parle-tef-topic-archives';
const MAX_TOPIC_ARCHIVES = 50;
const MAX_SAVED_ADS_PER_TYPE = 20;
const DB_NAME = 'parle-tef';
export const TEF_DB_VERSION = 2;
const SAVED_ADS_STORE = 'savedAds';
const TOPIC_ARCHIVES_STORE = 'topicArchives';
const MIGRATION_METADATA_STORE = 'migrationMetadata';
const TOPIC_ARCHIVE_MIGRATION_NAME = 'topic-archives-localstorage-to-idb';
const MAX_TOPIC_ARCHIVE_STABILITY_ATTEMPTS = 5;

export interface TopicArchiveMirrorDiagnostic {
  operation: 'backfill' | 'save' | 'delete' | 'delete-for-ad';
  success: boolean;
  sourceRecordCount: number;
  destinationRecordCount?: number;
  completedAt: number;
  error?: string;
}

let topicArchiveMirrorQueue: Promise<void> = Promise.resolve();
let lastTopicArchiveMirrorDiagnostic: TopicArchiveMirrorDiagnostic | null = null;

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

function readTopicArchivesSource(): { archives: TefTopicArchive[]; readable: boolean } {
  try {
    const stored = localStorage.getItem(TOPIC_ARCHIVES_KEY);
    if (!stored) return { archives: [], readable: true };
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return { archives: [], readable: false };
    return { archives: parsed as TefTopicArchive[], readable: true };
  } catch (error) {
    console.error('Error loading TEF topic archives:', error);
    return { archives: [], readable: false };
  }
}

function loadTopicArchivesRaw(): TefTopicArchive[] {
  return readTopicArchivesSource().archives;
}

function persistTopicArchives(archives: TefTopicArchive[]): void {
  try {
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(archives));
  } catch (error) {
    if (isQuotaExceeded(error) && archives.length > 0) {
      const trimmed = archives.slice(0, Math.max(1, archives.length - 1));
      try {
        localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify(trimmed));
        return;
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

function topicArchiveCollectionsMatch(
  authoritative: TefTopicArchive[],
  mirrored: TefTopicArchive[]
): boolean {
  if (authoritative.length !== mirrored.length) return false;
  const mirroredById = new Map(mirrored.map((archive) => [archive.id, archive]));
  return authoritative.every((archive) => {
    const mirroredArchive = mirroredById.get(archive.id);
    return mirroredArchive !== undefined && canonicalJson(archive) === canonicalJson(mirroredArchive);
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

async function reconcileTopicArchiveMirror(
  authoritative: TefTopicArchive[]
): Promise<number> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TOPIC_ARCHIVES_STORE, 'readwrite');
      const store = tx.objectStore(TOPIC_ARCHIVES_STORE);
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const authoritativeIds = new Set(authoritative.map((archive) => archive.id));
        for (const archive of authoritative) store.put(archive);
        for (const mirrored of (getAllRequest.result as TefTopicArchive[]) ?? []) {
          if (!authoritativeIds.has(mirrored.id)) store.delete(mirrored.id);
        }
      };
      getAllRequest.onerror = () => reject(getAllRequest.error ?? new Error('Failed to inspect topic archive mirror'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to reconcile topic archive mirror'));
      tx.onabort = () => reject(tx.error ?? new Error('Topic archive reconciliation was aborted'));
    });
  } finally {
    db.close();
  }

  const mirrored = await readAllFromStore<TefTopicArchive>(TOPIC_ARCHIVES_STORE);
  if (!topicArchiveCollectionsMatch(authoritative, mirrored)) {
    throw new Error('Topic archive mirror verification failed after reconciliation');
  }

  return mirrored.length;
}

async function writeVerifiedTopicArchiveMetadata(
  sourceRecordCount: number,
  destinationRecordCount: number
): Promise<void> {
  const metadata: TopicArchiveMigrationMetadata = {
    name: TOPIC_ARCHIVE_MIGRATION_NAME,
    version: 1,
    state: 'mirroring',
    lastReconciledAt: Date.now(),
    sourceRecordCount,
    destinationRecordCount,
    verificationStatus: 'verified',
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

async function mirrorLatestTopicArchiveSource(
  onSourceRead: (recordCount: number) => void
): Promise<{
  sourceRecordCount: number;
  destinationRecordCount: number;
}> {
  for (let attempt = 1; attempt <= MAX_TOPIC_ARCHIVE_STABILITY_ATTEMPTS; attempt += 1) {
    // Read only when this task owns the queue turn. Capturing at enqueue time
    // lets a delayed operation overwrite a newer localStorage snapshot.
    const source = readTopicArchivesSource();
    onSourceRead(source.archives.length);
    if (!source.readable) {
      throw new Error('Authoritative localStorage topic archives are unreadable');
    }

    const destinationRecordCount = await reconcileTopicArchiveMirror(source.archives);
    const sourceAfterReconcile = readTopicArchivesSource();
    if (!sourceAfterReconcile.readable) {
      throw new Error('Authoritative localStorage topic archives are unreadable');
    }
    if (!topicArchiveCollectionsMatch(source.archives, sourceAfterReconcile.archives)) {
      continue;
    }

    // Metadata is only stamped verified after confirming localStorage still
    // matches the snapshot that was reconciled.
    await writeVerifiedTopicArchiveMetadata(source.archives.length, destinationRecordCount);

    // Close the remaining cross-tab window: if localStorage or another tab's
    // IDB transaction changed state while metadata was written, retry latest.
    const sourceAfterMetadata = readTopicArchivesSource();
    if (!sourceAfterMetadata.readable) {
      throw new Error('Authoritative localStorage topic archives are unreadable');
    }
    const mirrorAfterMetadata = await readAllFromStore<TefTopicArchive>(TOPIC_ARCHIVES_STORE);
    if (
      !topicArchiveCollectionsMatch(source.archives, sourceAfterMetadata.archives) ||
      !topicArchiveCollectionsMatch(source.archives, mirrorAfterMetadata)
    ) {
      continue;
    }

    return {
      sourceRecordCount: source.archives.length,
      destinationRecordCount: mirrorAfterMetadata.length,
    };
  }

  throw new Error('Authoritative localStorage changed repeatedly during topic archive mirroring');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function enqueueTopicArchiveMirror(
  operation: TopicArchiveMirrorDiagnostic['operation']
): Promise<TopicArchiveMirrorDiagnostic> {
  let sourceRecordCount = 0;

  const diagnosticPromise = topicArchiveMirrorQueue.then(async () => {
    try {
      const result = await mirrorLatestTopicArchiveSource((recordCount) => {
        sourceRecordCount = recordCount;
      });
      sourceRecordCount = result.sourceRecordCount;
      const diagnostic: TopicArchiveMirrorDiagnostic = {
        operation,
        success: true,
        sourceRecordCount,
        destinationRecordCount: result.destinationRecordCount,
        completedAt: Date.now(),
      };
      lastTopicArchiveMirrorDiagnostic = diagnostic;
      return diagnostic;
    } catch (error) {
      const diagnostic: TopicArchiveMirrorDiagnostic = {
        operation,
        success: false,
        sourceRecordCount,
        completedAt: Date.now(),
        error: errorMessage(error),
      };
      lastTopicArchiveMirrorDiagnostic = diagnostic;
      // JSDOM and other non-browser runtimes may not provide IndexedDB at all.
      // The returned diagnostic remains observable without flooding their logs.
      if (typeof indexedDB !== 'undefined') {
        console.error(`TEF topic archive IndexedDB ${operation} mirror failed:`, error);
      }
      return diagnostic;
    }
  });

  topicArchiveMirrorQueue = diagnosticPromise.then(() => undefined);
  return diagnosticPromise;
}

/**
 * Stage 1 startup backfill. localStorage remains authoritative; this only
 * reconciles the IndexedDB mirror and records verified migration metadata.
 */
export function initializeTopicArchiveMirror(): Promise<TopicArchiveMirrorDiagnostic> {
  return enqueueTopicArchiveMirror('backfill');
}

/** Waits for queued fire-and-forget mirrors from synchronous public mutations. */
export async function waitForTopicArchiveMirror(): Promise<TopicArchiveMirrorDiagnostic | null> {
  await topicArchiveMirrorQueue;
  return lastTopicArchiveMirrorDiagnostic;
}

export function getLastTopicArchiveMirrorDiagnostic(): TopicArchiveMirrorDiagnostic | null {
  return lastTopicArchiveMirrorDiagnostic;
}

/** Diagnostic/test access only. Production topic-history reads stay on localStorage in Stage 1. */
export function getTopicArchiveMirrorSnapshot(): Promise<TefTopicArchive[]> {
  return readAllFromStore<TefTopicArchive>(TOPIC_ARCHIVES_STORE);
}

export async function getTopicArchiveMigrationMetadata(): Promise<TopicArchiveMigrationMetadata | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(MIGRATION_METADATA_STORE, 'readonly');
    const result = await idbRequest(
      tx.objectStore(MIGRATION_METADATA_STORE).get(TOPIC_ARCHIVE_MIGRATION_NAME)
    ) as TopicArchiveMigrationMetadata | undefined;
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed reading migration metadata'));
      tx.onabort = () => reject(tx.error ?? new Error('Migration metadata read was aborted'));
    });
    return result ?? null;
  } finally {
    db.close();
  }
}

export function listTopicArchives(adId?: string): TefTopicArchive[] {
  const all = loadTopicArchivesRaw();
  const filtered = adId ? all.filter((a) => a.adId === adId) : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export function getLatestTopicArchive(adId: string): TefTopicArchive | null {
  const forAd = listTopicArchives(adId);
  return forAd.length > 0 ? forAd[0] : null;
}

export function saveTopicArchive(params: {
  adId: string;
  exerciseType: TefExerciseType;
  topicSuggestions: TefTopicSuggestion[];
}): TefTopicArchive {
  const archive: TefTopicArchive = {
    id: generateId(),
    adId: params.adId,
    exerciseType: params.exerciseType,
    createdAt: Date.now(),
    topicSuggestions: params.topicSuggestions,
  };

  let archives = loadTopicArchivesRaw();
  archives.unshift(archive);

  if (archives.length > MAX_TOPIC_ARCHIVES) {
    archives = archives.slice(0, MAX_TOPIC_ARCHIVES);
  }

  persistTopicArchives(archives);
  void enqueueTopicArchiveMirror('save');
  return archive;
}

export function deleteTopicArchive(archiveId: string): void {
  const archives = loadTopicArchivesRaw().filter((a) => a.id !== archiveId);
  persistTopicArchives(archives);
  void enqueueTopicArchiveMirror('delete');
}

export function deleteTopicArchivesForAd(adId: string): void {
  const archives = loadTopicArchivesRaw().filter((a) => a.adId !== adId);
  persistTopicArchives(archives);
  void enqueueTopicArchiveMirror('delete-for-ad');
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
  deleteTopicArchivesForAd(id);
}

export function createSavedAdId(): string {
  return `tef_ad_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
