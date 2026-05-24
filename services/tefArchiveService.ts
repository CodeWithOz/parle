import type { TefExerciseType, TefSavedAd, TefTopicArchive, TefTopicSuggestion } from '../types';
import { generateId } from './scenarioService';

const TOPIC_ARCHIVES_KEY = 'parle-tef-topic-archives';
const MAX_TOPIC_ARCHIVES = 50;
const MAX_SAVED_ADS_PER_TYPE = 20;
const DB_NAME = 'parle-tef';
const DB_VERSION = 1;
const SAVED_ADS_STORE = 'savedAds';

function isQuotaExceeded(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAVED_ADS_STORE)) {
        const store = db.createObjectStore(SAVED_ADS_STORE, { keyPath: 'id' });
        store.createIndex('exerciseType', 'exerciseType', { unique: false });
        store.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
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

function idbPut(store: IDBObjectStore, value: TefSavedAd): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
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

function loadTopicArchivesRaw(): TefTopicArchive[] {
  try {
    const stored = localStorage.getItem(TOPIC_ARCHIVES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as TefTopicArchive[];
  } catch (error) {
    console.error('Error loading TEF topic archives:', error);
    return [];
  }
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
  return archive;
}

export function deleteTopicArchive(archiveId: string): void {
  const archives = loadTopicArchivesRaw().filter((a) => a.id !== archiveId);
  persistTopicArchives(archives);
}

export function deleteTopicArchivesForAd(adId: string): void {
  const archives = loadTopicArchivesRaw().filter((a) => a.adId !== adId);
  persistTopicArchives(archives);
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
  deleteTopicArchivesForAd(id);
  await runWriteTransaction((store) => idbDelete(store, id));
}

export function createSavedAdId(): string {
  return `tef_ad_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
