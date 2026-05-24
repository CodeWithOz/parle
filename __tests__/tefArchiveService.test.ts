import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TefSavedAd } from '../types';

const sampleTopics = [
  {
    topic: 'Pricing',
    examples: [
      { french: 'Quel est le prix?', english: 'What is the price?' },
      { french: 'Y a-t-il des réductions?', english: 'Any discounts?' },
    ],
  },
];

let idbStore: Map<string, TefSavedAd>;

function createIdbMock() {
  idbStore = new Map();

  const mockStore = {
    getAll: () => ({
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: [] as TefSavedAd[],
      get onsuccess() {
        return this._onsuccess;
      },
      set onsuccess(fn: (() => void) | null) {
        this._onsuccess = fn;
        if (fn) queueMicrotask(() => {
          this.result = Array.from(idbStore.values());
          fn();
        });
      },
      _onsuccess: null as (() => void) | null,
    }),
    get: (key: string) => ({
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: undefined as TefSavedAd | undefined,
      get onsuccess() {
        return this._onsuccess;
      },
      set onsuccess(fn: (() => void) | null) {
        this._onsuccess = fn;
        if (fn) queueMicrotask(() => {
          this.result = idbStore.get(key);
          fn();
        });
      },
      _onsuccess: null as (() => void) | null,
    }),
    put: (value: TefSavedAd) => ({
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      get onsuccess() {
        return this._onsuccess;
      },
      set onsuccess(fn: (() => void) | null) {
        this._onsuccess = fn;
        if (fn) queueMicrotask(() => {
          idbStore.set(value.id, value);
          fn();
        });
      },
      _onsuccess: null as (() => void) | null,
    }),
    delete: (key: string) => ({
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      get onsuccess() {
        return this._onsuccess;
      },
      set onsuccess(fn: (() => void) | null) {
        this._onsuccess = fn;
        if (fn) queueMicrotask(() => {
          idbStore.delete(key);
          fn();
        });
      },
      _onsuccess: null as (() => void) | null,
    }),
  };

  const mockDb = {
    transaction: () => ({
      objectStore: () => mockStore,
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      get oncomplete() {
        return this._oncomplete;
      },
      set oncomplete(fn: (() => void) | null) {
        this._oncomplete = fn;
        if (fn) queueMicrotask(fn);
      },
      _oncomplete: null as (() => void) | null,
    }),
    close: vi.fn(),
    objectStoreNames: { contains: () => true },
  };

  return {
    open: () => ({
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: mockDb,
      get onsuccess() {
        return this._onsuccess;
      },
      set onsuccess(fn: (() => void) | null) {
        this._onsuccess = fn;
        if (fn) queueMicrotask(() => fn());
      },
      _onsuccess: null as (() => void) | null,
      onupgradeneeded: null,
    }),
  };
}

describe('tefArchiveService · topic archives (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('saveTopicArchive, listTopicArchives, getLatestTopicArchive, deleteTopicArchive', async () => {
    const {
      saveTopicArchive,
      listTopicArchives,
      getLatestTopicArchive,
      deleteTopicArchive,
    } = await import('../services/tefArchiveService');

    const a1 = saveTopicArchive({
      adId: 'ad-1',
      exerciseType: 'persuasion',
      topicSuggestions: sampleTopics,
    });
    const a2 = saveTopicArchive({
      adId: 'ad-1',
      exerciseType: 'persuasion',
      topicSuggestions: [{ topic: 'Later', examples: sampleTopics[0].examples }],
    });

    expect(a1.id).toBeTruthy();
    expect(listTopicArchives()).toHaveLength(2);
    expect(listTopicArchives('ad-1')).toHaveLength(2);
    expect(listTopicArchives('ad-2')).toHaveLength(0);

    const latest = getLatestTopicArchive('ad-1');
    expect(latest?.id).toBe(a2.id);

    deleteTopicArchive(a1.id);
    expect(listTopicArchives()).toHaveLength(1);
  });

  it('caps archives at 50 entries', async () => {
    const { saveTopicArchive, listTopicArchives } = await import('../services/tefArchiveService');

    for (let i = 0; i < 55; i++) {
      saveTopicArchive({
        adId: `ad-${i}`,
        exerciseType: 'persuasion',
        topicSuggestions: sampleTopics,
      });
    }
    expect(listTopicArchives().length).toBe(50);
  });
});

describe('tefArchiveService · saved ads (IndexedDB)', () => {
  beforeEach(() => {
    localStorage.clear();
    idbStore = new Map();
    vi.stubGlobal('indexedDB', createIdbMock());
    vi.resetModules();
  });

  it('upsertSavedAd, listSavedAds, getSavedAd, deleteSavedAd', async () => {
    const {
      upsertSavedAd,
      listSavedAds,
      getSavedAd,
      deleteSavedAd,
      touchSavedAdLastUsed,
    } = await import('../services/tefArchiveService');

    const ad = await upsertSavedAd({
      id: 'tef_ad_test',
      exerciseType: 'persuasion',
      imageDataUrl: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      confirmation: { summary: 's', roleSummary: 'r' },
    });

    expect(ad.id).toBe('tef_ad_test');
    const listed = await listSavedAds('persuasion');
    expect(listed).toHaveLength(1);

    const fetched = await getSavedAd('tef_ad_test');
    expect(fetched?.confirmation.summary).toBe('s');

    await touchSavedAdLastUsed('tef_ad_test');
    const touched = await getSavedAd('tef_ad_test');
    expect(touched!.lastUsedAt).toBeGreaterThanOrEqual(ad.lastUsedAt);

    await deleteSavedAd('tef_ad_test');
    expect(await getSavedAd('tef_ad_test')).toBeNull();
    expect(await listSavedAds('persuasion')).toHaveLength(0);
  });

  it('deleteSavedAd removes linked topic archives', async () => {
    const { upsertSavedAd, deleteSavedAd, saveTopicArchive, listTopicArchives } =
      await import('../services/tefArchiveService');

    await upsertSavedAd({
      id: 'ad-linked',
      exerciseType: 'questioning',
      imageDataUrl: 'data:image/png;base64,x',
      mimeType: 'image/png',
      confirmation: { summary: 's', roleSummary: 'r' },
    });
    saveTopicArchive({
      adId: 'ad-linked',
      exerciseType: 'questioning',
      topicSuggestions: sampleTopics,
    });
    expect(listTopicArchives('ad-linked')).toHaveLength(1);

    await deleteSavedAd('ad-linked');
    expect(listTopicArchives('ad-linked')).toHaveLength(0);
  });
});
