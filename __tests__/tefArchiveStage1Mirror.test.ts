import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { TefSavedAd, TefTopicArchive } from '../types';

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

async function seedVersionOneSavedAd(ad: TefSavedAd): Promise<void> {
  const request = indexedDB.open('parle-tef', 1);
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore('savedAds', { keyPath: 'id' });
    store.createIndex('exerciseType', 'exerciseType', { unique: false });
    store.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
  };
  const db = await requestResult(request);
  const tx = db.transaction('savedAds', 'readwrite');
  tx.objectStore('savedAds').put(ad);
  await transactionDone(tx);
  db.close();
}

async function seedVersionTwoTopicArchives(records: TefTopicArchive[]): Promise<void> {
  const request = indexedDB.open('parle-tef', 2);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('savedAds')) {
      const savedAds = db.createObjectStore('savedAds', { keyPath: 'id' });
      savedAds.createIndex('exerciseType', 'exerciseType', { unique: false });
      savedAds.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
    }
    const archives = db.createObjectStore('topicArchives', { keyPath: 'id' });
    archives.createIndex('adId', 'adId', { unique: false });
    archives.createIndex('exerciseType', 'exerciseType', { unique: false });
    archives.createIndex('createdAt', 'createdAt', { unique: false });
    db.createObjectStore('migrationMetadata', { keyPath: 'name' });
  };
  const db = await requestResult(request);
  const tx = db.transaction('topicArchives', 'readwrite');
  for (const record of records) tx.objectStore('topicArchives').put(record);
  await transactionDone(tx);
  db.close();
}

describe('Stage 1 topic archive IndexedDB mirror', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('upgrades database version 1 additively and retains saved ads', async () => {
    const savedAd: TefSavedAd = {
      id: 'existing-ad',
      exerciseType: 'questioning',
      imageDataUrl: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      confirmation: { summary: 'summary', roleSummary: 'role' },
      createdAt: 10,
      lastUsedAt: 20,
    };
    await seedVersionOneSavedAd(savedAd);

    const service = await import('../services/tefArchiveService');
    const result = await service.initializeTopicArchiveMirror();

    expect(result.success).toBe(true);
    expect((await service.getSavedAd(savedAd.id))?.confirmation.summary).toBe('summary');

    const db = await requestResult(indexedDB.open('parle-tef'));
    expect(db.version).toBe(2);
    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining(['savedAds', 'topicArchives', 'migrationMetadata'])
    );
    const tx = db.transaction('topicArchives', 'readonly');
    expect(Array.from(tx.objectStore('topicArchives').indexNames)).toEqual(
      expect.arrayContaining(['adId', 'exerciseType', 'createdAt'])
    );
    db.close();
  });

  it('backfills empty and populated localStorage and records verified metadata', async () => {
    const service = await import('../services/tefArchiveService');
    const emptyResult = await service.initializeTopicArchiveMirror();
    expect(emptyResult).toMatchObject({ success: true, sourceRecordCount: 0, destinationRecordCount: 0 });

    const authoritative = [archive('archive-1'), archive('archive-2', 'ad-2', 200)];
    localStorage.setItem('parle-tef-topic-archives', JSON.stringify(authoritative));
    const populatedResult = await service.initializeTopicArchiveMirror();

    expect(populatedResult).toMatchObject({ success: true, sourceRecordCount: 2, destinationRecordCount: 2 });
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(expect.arrayContaining(authoritative));
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      name: 'topic-archives-localstorage-to-idb',
      version: 1,
      state: 'mirroring',
      sourceRecordCount: 2,
      destinationRecordCount: 2,
      verificationStatus: 'verified',
    });
  });

  it('is idempotent when backfill runs repeatedly', async () => {
    localStorage.setItem('parle-tef-topic-archives', JSON.stringify([archive('archive-1')]));
    const service = await import('../services/tefArchiveService');

    await service.initializeTopicArchiveMirror();
    await service.initializeTopicArchiveMirror();

    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual([archive('archive-1')]);
  });

  it('retries with current localStorage when the authoritative source changes during reconciliation', async () => {
    const stale = [archive('stale-snapshot')];
    const current = [archive('current-snapshot', 'ad-current', 200)];
    localStorage.setItem('parle-tef-topic-archives', JSON.stringify(current));
    const originalGetItem = Storage.prototype.getItem;
    let topicArchiveReads = 0;
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key: string) {
      if (key === 'parle-tef-topic-archives') {
        topicArchiveReads += 1;
        if (topicArchiveReads === 1) return JSON.stringify(stale);
      }
      return originalGetItem.call(this, key);
    });
    const service = await import('../services/tefArchiveService');

    const result = await service.initializeTopicArchiveMirror();
    getItemSpy.mockRestore();

    expect(result).toMatchObject({
      success: true,
      sourceRecordCount: 1,
      destinationRecordCount: 1,
    });
    expect(topicArchiveReads).toBeGreaterThanOrEqual(4);
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(current);
    expect(await service.getTopicArchiveMigrationMetadata()).toMatchObject({
      sourceRecordCount: 1,
      destinationRecordCount: 1,
      verificationStatus: 'verified',
    });
  });

  it('mirrors synchronous creates and deletes after localStorage succeeds', async () => {
    const service = await import('../services/tefArchiveService');
    await service.initializeTopicArchiveMirror();

    const created = service.saveTopicArchive({
      adId: 'ad-1',
      exerciseType: 'persuasion',
      topicSuggestions: topics,
    });
    await service.waitForTopicArchiveMirror();
    expect(service.listTopicArchives()).toHaveLength(1);
    expect((await service.getTopicArchiveMirrorSnapshot()).map((item) => item.id)).toEqual([created.id]);

    service.deleteTopicArchive(created.id);
    await service.waitForTopicArchiveMirror();
    expect(service.listTopicArchives()).toEqual([]);
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual([]);

    service.saveTopicArchive({
      adId: 'ad-to-delete',
      exerciseType: 'persuasion',
      topicSuggestions: topics,
    });
    const retained = service.saveTopicArchive({
      adId: 'ad-to-keep',
      exerciseType: 'persuasion',
      topicSuggestions: topics,
    });
    await service.waitForTopicArchiveMirror();

    service.deleteTopicArchivesForAd('ad-to-delete');
    await service.waitForTopicArchiveMirror();
    expect(service.listTopicArchives().map((item) => item.id)).toEqual([retained.id]);
    expect((await service.getTopicArchiveMirrorSnapshot()).map((item) => item.id)).toEqual([retained.id]);
  });

  it('preserves authoritative localStorage and reports a mirror failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('simulated IndexedDB failure');
      },
    });
    const service = await import('../services/tefArchiveService');

    const created = service.saveTopicArchive({
      adId: 'ad-1',
      exerciseType: 'persuasion',
      topicSuggestions: topics,
    });
    const diagnostic = await service.waitForTopicArchiveMirror();

    expect(service.listTopicArchives().map((item) => item.id)).toEqual([created.id]);
    expect(diagnostic).toMatchObject({
      operation: 'save',
      success: false,
      sourceRecordCount: 1,
      error: 'simulated IndexedDB failure',
    });
    consoleError.mockRestore();
  });

  it('repairs partial, stale, and differing IndexedDB content on retry', async () => {
    const authoritative = [archive('archive-1'), archive('archive-2', 'ad-2', 200)];
    localStorage.setItem('parle-tef-topic-archives', JSON.stringify(authoritative));
    await seedVersionTwoTopicArchives([
      { ...archive('archive-1'), adId: 'wrong-ad' },
      archive('stale-archive', 'deleted-ad', 50),
    ]);
    const service = await import('../services/tefArchiveService');

    const result = await service.initializeTopicArchiveMirror();

    expect(result.success).toBe(true);
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual(expect.arrayContaining(authoritative));
    expect(await service.getTopicArchiveMirrorSnapshot()).toHaveLength(2);
    expect(service.listTopicArchives()).toEqual(authoritative.sort((a, b) => b.createdAt - a.createdAt));
  });

  it('does not erase an existing mirror when authoritative localStorage is malformed', async () => {
    const mirrored = archive('preserved-archive');
    await seedVersionTwoTopicArchives([mirrored]);
    localStorage.setItem('parle-tef-topic-archives', '{not valid json');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = await import('../services/tefArchiveService');

    const result = await service.initializeTopicArchiveMirror();

    expect(result).toMatchObject({
      operation: 'backfill',
      success: false,
      error: 'Authoritative localStorage topic archives are unreadable',
    });
    expect(await service.getTopicArchiveMirrorSnapshot()).toEqual([mirrored]);
    expect(localStorage.getItem('parle-tef-topic-archives')).toBe('{not valid json');
    consoleError.mockRestore();
  });
});
