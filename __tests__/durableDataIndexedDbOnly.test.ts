/**
 * IndexedDB is the only database for durable exercise data. These tests pin
 * down two things:
 *
 *   1. No read or write path touches localStorage any more — the Stage 3/4
 *      rollback bridge, its dirty markers, and its recovery journal are gone.
 *   2. A browser that still holds pre-IndexedDB localStorage data has it folded
 *      into IndexedDB exactly once, and only then is that localStorage removed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Scenario, TefTopicArchive } from '../types';

const LEGACY_TOPIC_ARCHIVES_KEY = 'parle-tef-topic-archives';
const LEGACY_SCENARIOS_KEY = 'parle-scenarios';
const LEGACY_SCENARIO_MARKERS = [
  'parle-scenarios-mirror-dirty',
  'parle-scenarios-bridge-dirty',
  'parle-scenarios-idb-primary',
];

const archive = (id: string, createdAt = 100, adId = 'ad-1'): TefTopicArchive => ({
  id,
  adId,
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

const scenario = (id: string, createdAt = 100, name = id): Scenario => ({
  id,
  name,
  description: 'Order bread',
  createdAt,
  isActive: true,
});

function localStorageKeys(): string[] {
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
});

describe('durable data · IndexedDB is the only database', () => {
  it('writes and deletes without ever touching localStorage', async () => {
    const service = await import('../services/tefArchiveService');

    const saved = await service.saveTopicArchive({
      adId: 'ad-1',
      exerciseType: 'persuasion',
      topicSuggestions: archive('seed').topicSuggestions,
    });
    await service.saveSavedScenario(scenario('scenario-1'));
    await service.deleteTopicArchive(saved.id);
    await service.deleteSavedScenario('scenario-1');

    expect(localStorageKeys()).toEqual([]);
    expect(Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i))).toEqual([]);
  });

  it('reads records back from IndexedDB, newest first', async () => {
    const service = await import('../services/tefArchiveService');

    await service.saveSavedScenario(scenario('older', 100));
    await service.saveSavedScenario(scenario('newer', 200));

    expect((await service.listSavedScenarios()).map((record) => record.id))
      .toEqual(['newer', 'older']);
  });

  it('fails the read instead of falling back to a localStorage copy', async () => {
    localStorage.setItem(LEGACY_SCENARIOS_KEY, JSON.stringify([scenario('stale-copy')]));
    const service = await import('../services/tefArchiveService');
    vi.stubGlobal('indexedDB', undefined);

    await expect(service.listSavedScenarios()).rejects.toThrow('IndexedDB is unavailable');
  });

  it('keeps a concurrent record committed by another writer during a save', async () => {
    const service = await import('../services/tefArchiveService');
    await service.saveSavedScenario(scenario('existing', 100));

    const [first, second] = await Promise.all([
      service.saveSavedScenario(scenario('a', 200)),
      service.saveSavedScenario(scenario('b', 300)),
    ]);

    expect([...first, ...second].some((record) => record.id === 'existing')).toBe(true);
    expect((await service.listSavedScenarios()).map((record) => record.id).sort())
      .toEqual(['a', 'b', 'existing']);
  });
});

describe('durable data · one-time adoption of legacy localStorage data', () => {
  it('does nothing and writes nothing when no legacy data exists', async () => {
    const service = await import('../services/tefArchiveService');

    const result = await service.initializeDurableData();

    expect(result.topicArchives).toMatchObject({
      adoptedRecordCount: 0,
      legacyStorageCleared: false,
    });
    expect(result.scenarios).toMatchObject({ adoptedRecordCount: 0 });
    expect(localStorageKeys()).toEqual([]);
  });

  it('adopts legacy records into IndexedDB and then removes every legacy key', async () => {
    localStorage.setItem(LEGACY_TOPIC_ARCHIVES_KEY, JSON.stringify([archive('legacy-archive')]));
    localStorage.setItem(LEGACY_SCENARIOS_KEY, JSON.stringify([scenario('legacy-scenario')]));
    for (const marker of LEGACY_SCENARIO_MARKERS) localStorage.setItem(marker, '1');
    sessionStorage.setItem('parle-scenarios-bridge-dirty', '1');
    localStorage.setItem('parle-scenarios-quarantined-mutations:1', '{unreadable');

    const service = await import('../services/tefArchiveService');
    const result = await service.initializeDurableData();

    expect(result.topicArchives.adoptedRecordCount).toBe(1);
    expect(result.scenarios.adoptedRecordCount).toBe(1);
    expect(result.scenarios.legacyStorageCleared).toBe(true);
    expect((await service.listTopicArchives()).map((record) => record.id))
      .toEqual(['legacy-archive']);
    expect((await service.listSavedScenarios()).map((record) => record.id))
      .toEqual(['legacy-scenario']);
    expect(localStorageKeys()).toEqual([]);
    expect(sessionStorage.getItem('parle-scenarios-bridge-dirty')).toBeNull();
  });

  it('lets IndexedDB win over a stale legacy copy of the same record', async () => {
    const service = await import('../services/tefArchiveService');
    await service.saveSavedScenario(scenario('scenario-1', 200, 'Current name'));
    localStorage.setItem(
      LEGACY_SCENARIOS_KEY,
      JSON.stringify([scenario('scenario-1', 100, 'Stale name'), scenario('only-local', 50)])
    );

    const result = await service.initializeDurableData();

    expect(result.scenarios.adoptedRecordCount).toBe(1);
    const scenarios = await service.listSavedScenarios();
    expect(scenarios.map((record) => record.id)).toEqual(['scenario-1', 'only-local']);
    expect(scenarios[0].name).toBe('Current name');
  });

  it('replays a legacy recovery journal entry that never reached IndexedDB', async () => {
    const service = await import('../services/tefArchiveService');
    await service.saveSavedScenario(scenario('committed', 100));
    localStorage.setItem(
      `parle-scenarios-pending-mutations:${encodeURIComponent('mutation_1')}`,
      JSON.stringify({
        id: 'mutation_1',
        createdAt: 1,
        kind: 'upsert',
        record: scenario('journaled', 300),
      })
    );
    localStorage.setItem(
      `parle-scenarios-pending-mutations:${encodeURIComponent('mutation_2')}`,
      '{broken json'
    );

    const result = await service.initializeDurableData();

    expect(result.scenarios).toMatchObject({
      replayedMutationCount: 1,
      discardedMutationCount: 1,
      legacyStorageCleared: true,
    });
    expect((await service.listSavedScenarios()).map((record) => record.id))
      .toEqual(['journaled', 'committed']);
    expect(localStorageKeys()).toEqual([]);
  });

  it('caps adopted topic archives at 50 newest records', async () => {
    const legacy = Array.from({ length: 55 }, (_, index) => archive(`legacy-${index}`, index));
    localStorage.setItem(LEGACY_TOPIC_ARCHIVES_KEY, JSON.stringify(legacy));

    const service = await import('../services/tefArchiveService');
    await service.initializeDurableData();

    const archives = await service.listTopicArchives();
    expect(archives).toHaveLength(50);
    expect(archives[0].id).toBe('legacy-54');
  });

  it('leaves unreadable legacy data in place and reports the failure', async () => {
    localStorage.setItem(LEGACY_SCENARIOS_KEY, '{not an array');
    localStorage.setItem(LEGACY_TOPIC_ARCHIVES_KEY, JSON.stringify([archive('legacy-archive')]));

    const service = await import('../services/tefArchiveService');

    await expect(service.initializeDurableData()).rejects.toThrow(/unreadable/);
    expect(localStorage.getItem(LEGACY_SCENARIOS_KEY)).toBe('{not an array');
    // The readable dataset is still adopted and cleaned up.
    expect((await service.listTopicArchives()).map((record) => record.id))
      .toEqual(['legacy-archive']);
    expect(localStorage.getItem(LEGACY_TOPIC_ARCHIVES_KEY)).toBeNull();
  });

  it('is idempotent across repeated startups', async () => {
    localStorage.setItem(LEGACY_SCENARIOS_KEY, JSON.stringify([scenario('legacy-scenario')]));
    const service = await import('../services/tefArchiveService');

    await service.initializeDurableData();
    await service.saveSavedScenario(scenario('added-after', 300));
    const second = await service.initializeDurableData();

    expect(second.scenarios.adoptedRecordCount).toBe(0);
    expect((await service.listSavedScenarios()).map((record) => record.id))
      .toEqual(['added-after', 'legacy-scenario']);
  });
});
