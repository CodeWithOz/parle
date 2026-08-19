import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Character, Scenario, ScenarioStep, TefTopicArchive } from '../types';

// Stage 4 proves the rollback window: ordinary CRUD must leave the IndexedDB
// primary store and the localStorage rollback bridge equal by content (not
// just count), an old/rolled-back build reading raw localStorage directly
// must see complete and correct data, and legacy/current saved scenarios must
// keep every supported field through save/update/delete cycles in both
// copies. See docs/data-portability/stages/04-rollback-window.md.

const TOPIC_ARCHIVES_KEY = 'parle-tef-topic-archives';
const SCENARIOS_KEY = 'parle-scenarios';

const archive = (
  adId: string,
  topic = 'Pricing'
): Omit<TefTopicArchive, 'id' | 'createdAt'> & { adId: string } => ({
  adId,
  exerciseType: 'persuasion',
  topicSuggestions: [{
    topic,
    examples: [
      { french: 'Quel est le prix ?', english: 'What is the price?' },
      { french: 'Avez-vous une réduction ?', english: 'Do you have a discount?' },
    ],
  }],
});

const legacyScenario = (id: string, createdAt = 100): Scenario => ({
  id,
  name: `Legacy ${id}`,
  description: `Legacy description for ${id}`,
  createdAt,
  isActive: true,
});

const currentScenario = (id: string, createdAt = 100): Scenario => {
  const characters: Character[] = [
    { id: 'char-1', name: 'Claire', role: 'Client', voiceName: 'fr-FR-Wavenet-A', description: 'A skeptical client' },
    { id: 'char-2', name: 'Marc', role: 'Vendor', voiceName: 'fr-FR-Wavenet-B' },
  ];
  const steps: ScenarioStep[] = [
    { id: 'step-1', text: 'Greet the client' },
    { id: 'step-2', text: 'Present the offer' },
  ];
  return {
    id,
    name: `Current ${id}`,
    description: `Current description for ${id}`,
    aiSummary: `Summary for ${id}`,
    createdAt,
    isActive: true,
    characters,
    isTefQuestioning: false,
    steps,
  };
};

function readRawLocalStorageArray<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}

function sortById<T extends { id: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

describe('Stage 4 rollback window', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.resetModules();
  });

  describe('record equality under ordinary CRUD', () => {
    it('keeps the topic-archive IndexedDB primary store and localStorage mirror equal by content through create and delete', async () => {
      const service = await import('../services/tefArchiveService');
      await service.verifyTopicArchiveMirror();

      const first = await service.saveTopicArchive(archive('ad-1', 'Pricing'));
      const second = await service.saveTopicArchive(archive('ad-1', 'Delivery'));
      const third = await service.saveTopicArchive(archive('ad-2', 'Returns'));

      expect(sortById(await service.getTopicArchiveMirrorSnapshot())).toEqual(
        sortById(readRawLocalStorageArray<TefTopicArchive>(TOPIC_ARCHIVES_KEY))
      );
      expect(sortById(await service.getTopicArchiveMirrorSnapshot())).toEqual(
        sortById([first, second, third])
      );

      await service.deleteTopicArchive(second.id);

      expect(sortById(await service.getTopicArchiveMirrorSnapshot())).toEqual(
        sortById(readRawLocalStorageArray<TefTopicArchive>(TOPIC_ARCHIVES_KEY))
      );
      expect(sortById(await service.getTopicArchiveMirrorSnapshot())).toEqual(
        sortById([first, third])
      );

      await service.deleteTopicArchivesForAd('ad-1');

      const finalIdb = sortById(await service.getTopicArchiveMirrorSnapshot());
      const finalLocal = sortById(readRawLocalStorageArray<TefTopicArchive>(TOPIC_ARCHIVES_KEY));
      expect(finalIdb).toEqual(finalLocal);
      expect(finalIdb).toEqual([third]);
    });

    it('keeps the saved-scenario IndexedDB primary store and localStorage mirror equal by content through create, update, and delete', async () => {
      const service = await import('../services/tefArchiveService');
      await service.verifyScenarioMirror();

      await service.saveSavedScenario(legacyScenario('s1', 100));
      await service.saveSavedScenario(legacyScenario('s2', 200));

      expect(sortById(await service.getScenarioMirrorSnapshot())).toEqual(
        sortById(readRawLocalStorageArray<Scenario>(SCENARIOS_KEY))
      );

      const updated: Scenario = {
        ...legacyScenario('s1', 100),
        name: 'Updated name',
        description: 'Updated description',
        isActive: false,
      };
      await service.saveSavedScenario(updated);

      expect(sortById(await service.getScenarioMirrorSnapshot())).toEqual(
        sortById(readRawLocalStorageArray<Scenario>(SCENARIOS_KEY))
      );
      expect(sortById(await service.getScenarioMirrorSnapshot())).toEqual(
        sortById([updated, legacyScenario('s2', 200)])
      );

      await service.deleteSavedScenario('s2');

      const finalIdb = sortById(await service.getScenarioMirrorSnapshot());
      const finalLocal = sortById(readRawLocalStorageArray<Scenario>(SCENARIOS_KEY));
      expect(finalIdb).toEqual(finalLocal);
      expect(finalIdb).toEqual([updated]);
    });
  });

  describe('rollback-compatible recovery simulation', () => {
    it('leaves topic-archive localStorage complete and correct for an old build reading it directly', async () => {
      const service = await import('../services/tefArchiveService');
      await service.verifyTopicArchiveMirror();

      const survivor1 = await service.saveTopicArchive(archive('ad-1', 'Pricing'));
      const toDelete = await service.saveTopicArchive(archive('ad-1', 'Delivery'));
      const survivor2 = await service.saveTopicArchive(archive('ad-2', 'Returns'));
      const toDeleteForAd = await service.saveTopicArchive(archive('ad-3', 'Warranty'));

      await service.deleteTopicArchive(toDelete.id);
      await service.deleteTopicArchivesForAd('ad-3');

      // Simulate a rolled-back build: read the raw rollback-bridge key directly,
      // bypassing the current build's IndexedDB-aware read path entirely.
      const rolledBackView = sortById(readRawLocalStorageArray<TefTopicArchive>(TOPIC_ARCHIVES_KEY));

      expect(rolledBackView).toEqual(sortById([survivor1, survivor2]));
      expect(rolledBackView.some((item) => item.id === toDelete.id)).toBe(false);
      expect(rolledBackView.some((item) => item.id === toDeleteForAd.id)).toBe(false);
    });

    it('leaves saved-scenario localStorage complete and correct for an old build reading it directly', async () => {
      const service = await import('../services/tefArchiveService');
      await service.verifyScenarioMirror();

      await service.saveSavedScenario(legacyScenario('keep-untouched', 100));
      await service.saveSavedScenario(legacyScenario('will-update', 200));
      await service.saveSavedScenario(legacyScenario('will-delete', 300));

      const updated: Scenario = {
        ...legacyScenario('will-update', 200),
        name: 'Updated after rollback window opened',
        description: 'Updated description',
      };
      await service.saveSavedScenario(updated);
      await service.deleteSavedScenario('will-delete');

      // Simulate a rolled-back build: read the raw rollback-bridge key directly,
      // bypassing the current build's IndexedDB-aware read path entirely.
      const rolledBackView = sortById(readRawLocalStorageArray<Scenario>(SCENARIOS_KEY));

      expect(rolledBackView).toEqual(sortById([legacyScenario('keep-untouched', 100), updated]));
      expect(rolledBackView.some((item) => item.id === 'will-delete')).toBe(false);
      const updatedInRolledBackView = rolledBackView.find((item) => item.id === 'will-update');
      expect(updatedInRolledBackView).toEqual(updated);
    });
  });

  describe('legacy vs. current scenario field preservation', () => {
    it('preserves every supported field of a legacy-shaped scenario across save, update, and delete-and-recreate', async () => {
      const service = await import('../services/tefArchiveService');
      await service.verifyScenarioMirror();

      const id = 'legacy-lifecycle';
      const created = legacyScenario(id, 100);
      await service.saveSavedScenario(created);

      expect(
        (await service.getScenarioMirrorSnapshot()).find((item) => item.id === id)
      ).toEqual(created);
      expect(
        readRawLocalStorageArray<Scenario>(SCENARIOS_KEY).find((item) => item.id === id)
      ).toEqual(created);

      const updated: Scenario = { ...created, name: 'Legacy renamed', description: 'Legacy updated description' };
      await service.saveSavedScenario(updated);

      expect(
        (await service.getScenarioMirrorSnapshot()).find((item) => item.id === id)
      ).toEqual(updated);
      expect(
        readRawLocalStorageArray<Scenario>(SCENARIOS_KEY).find((item) => item.id === id)
      ).toEqual(updated);

      await service.deleteSavedScenario(id);
      const recreated = legacyScenario(id, 400);
      await service.saveSavedScenario(recreated);

      expect(
        (await service.getScenarioMirrorSnapshot()).find((item) => item.id === id)
      ).toEqual(recreated);
      expect(
        readRawLocalStorageArray<Scenario>(SCENARIOS_KEY).find((item) => item.id === id)
      ).toEqual(recreated);
      // No optional fields should have been fabricated for a legacy scenario.
      const idbFinal = (await service.getScenarioMirrorSnapshot()).find((item) => item.id === id);
      expect(idbFinal?.characters).toBeUndefined();
      expect(idbFinal?.steps).toBeUndefined();
      expect(idbFinal?.aiSummary).toBeUndefined();
    });

    it('preserves every supported field of a current-shaped scenario (characters and roadmap steps) across save, update, and delete-and-recreate', async () => {
      const service = await import('../services/tefArchiveService');
      await service.verifyScenarioMirror();

      const id = 'current-lifecycle';
      const created = currentScenario(id, 100);
      await service.saveSavedScenario(created);

      expect(
        (await service.getScenarioMirrorSnapshot()).find((item) => item.id === id)
      ).toEqual(created);
      expect(
        readRawLocalStorageArray<Scenario>(SCENARIOS_KEY).find((item) => item.id === id)
      ).toEqual(created);

      const updated: Scenario = {
        ...created,
        name: 'Current renamed',
        isTefQuestioning: true,
        characters: [
          ...created.characters!,
          { id: 'char-3', name: 'Sofie', role: 'Manager', voiceName: 'fr-FR-Wavenet-C' },
        ],
        steps: [
          ...created.steps!,
          { id: 'step-3', text: 'Close the deal' },
        ],
      };
      await service.saveSavedScenario(updated);

      expect(
        (await service.getScenarioMirrorSnapshot()).find((item) => item.id === id)
      ).toEqual(updated);
      expect(
        readRawLocalStorageArray<Scenario>(SCENARIOS_KEY).find((item) => item.id === id)
      ).toEqual(updated);

      await service.deleteSavedScenario(id);
      const recreated = currentScenario(id, 400);
      await service.saveSavedScenario(recreated);

      expect(
        (await service.getScenarioMirrorSnapshot()).find((item) => item.id === id)
      ).toEqual(recreated);
      expect(
        readRawLocalStorageArray<Scenario>(SCENARIOS_KEY).find((item) => item.id === id)
      ).toEqual(recreated);
      const idbFinal = (await service.getScenarioMirrorSnapshot()).find((item) => item.id === id);
      expect(idbFinal?.characters).toEqual(recreated.characters);
      expect(idbFinal?.steps).toEqual(recreated.steps);
      expect(idbFinal?.aiSummary).toEqual(recreated.aiSummary);
    });
  });
});
