import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Scenario, TefTopicArchive } from '../types';

const TOPIC_ARCHIVES_KEY = 'parle-tef-topic-archives';
const SCENARIOS_KEY = 'parle-scenarios';

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

async function clearStore(storeName: string): Promise<void> {
  const request = indexedDB.open('parle-tef', 3);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe('Stage 3 IndexedDB-primary durable reads', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('falls back independently when one dataset is unverified', async () => {
    localStorage.setItem(TOPIC_ARCHIVES_KEY, JSON.stringify([archive('verified-topic')]));
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify([scenario('unverified-scenario')]));
    const service = await import('../services/tefArchiveService');
    await service.verifyTopicArchiveMirror();

    expect((await service.readTopicArchives()).source).toBe('indexeddb');
    expect(await service.readSavedScenarios()).toMatchObject({
      source: 'localstorage-fallback',
      fallbackReason: 'migration-unverified',
      records: [{ id: 'unverified-scenario' }],
    });
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
});
