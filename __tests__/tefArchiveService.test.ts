import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

const sampleTopics = [
  {
    topic: 'Pricing',
    examples: [
      { french: 'Quel est le prix?', english: 'What is the price?' },
      { french: 'Y a-t-il des réductions?', english: 'Any discounts?' },
    ],
  },
];

describe('tefArchiveService · topic archives (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.resetModules();
  });

  it('saveTopicArchive, listTopicArchives, getLatestTopicArchive, deleteTopicArchive', async () => {
    const {
      saveTopicArchive,
      listTopicArchives,
      getLatestTopicArchive,
      deleteTopicArchive,
      waitForTopicArchiveMirror,
    } = await import('../services/tefArchiveService');

    const a1 = await saveTopicArchive({
      adId: 'ad-1',
      exerciseType: 'persuasion',
      topicSuggestions: sampleTopics,
    });
    const a2 = await saveTopicArchive({
      adId: 'ad-1',
      exerciseType: 'persuasion',
      topicSuggestions: [{ topic: 'Later', examples: sampleTopics[0].examples }],
    });

    expect(a1.id).toBeTruthy();
    expect(await listTopicArchives()).toHaveLength(2);
    expect(await listTopicArchives('ad-1')).toHaveLength(2);
    expect(await listTopicArchives('ad-2')).toHaveLength(0);

    const latest = await getLatestTopicArchive('ad-1');
    expect(latest?.id).toBe(a2.id);

    await deleteTopicArchive(a1.id);
    expect(await listTopicArchives()).toHaveLength(1);
    await waitForTopicArchiveMirror();
  });

  it('caps archives at 50 entries', async () => {
    const { saveTopicArchive, listTopicArchives, waitForTopicArchiveMirror } =
      await import('../services/tefArchiveService');

    for (let i = 0; i < 55; i++) {
      await saveTopicArchive({
        adId: `ad-${i}`,
        exerciseType: 'persuasion',
        topicSuggestions: sampleTopics,
      });
    }
    expect((await listTopicArchives()).length).toBe(50);
    await waitForTopicArchiveMirror();
  });
});

describe('tefArchiveService · saved ads (IndexedDB)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.resetModules();
  });

  it('upsertSavedAd, listSavedAds, getSavedAd, deleteSavedAd', async () => {
    const {
      upsertSavedAd,
      listSavedAds,
      getSavedAd,
      deleteSavedAd,
      touchSavedAdLastUsed,
      waitForTopicArchiveMirror,
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
    await waitForTopicArchiveMirror();
  });

  it('deleteSavedAd removes linked topic archives', async () => {
    const { upsertSavedAd, deleteSavedAd, saveTopicArchive, listTopicArchives, waitForTopicArchiveMirror } =
      await import('../services/tefArchiveService');

    await upsertSavedAd({
      id: 'ad-linked',
      exerciseType: 'questioning',
      imageDataUrl: 'data:image/png;base64,x',
      mimeType: 'image/png',
      confirmation: { summary: 's', roleSummary: 'r' },
    });
    await saveTopicArchive({
      adId: 'ad-linked',
      exerciseType: 'questioning',
      topicSuggestions: sampleTopics,
    });
    expect(await listTopicArchives('ad-linked')).toHaveLength(1);

    await deleteSavedAd('ad-linked');
    expect(await listTopicArchives('ad-linked')).toHaveLength(0);
    await waitForTopicArchiveMirror();
  });
});
