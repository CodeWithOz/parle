/**
 * TDD tests for `Scenario.steps` (the new scenario-roadmap feature) persistence
 * via `services/scenarioService.ts` (localStorage-backed, key "parle-scenarios").
 *
 * Contract this test file pins down:
 *
 *   - `types.ts` gains:
 *       export interface ScenarioStep {
 *         id: string;
 *         text: string;
 *       }
 *     and `Scenario` gains an optional `steps?: ScenarioStep[]` field, in the
 *     order the steps should be displayed/followed.
 *
 *   - `saveScenario` / `loadScenarios` (already generic JSON-in-localStorage)
 *     must continue to round-trip the `steps` field with no special handling
 *     required beyond what they already do — this is a regression/contract
 *     test locking that behavior in as the roadmap feature is built.
 *
 *   - services/scenarioService.ts gains a NEW exported helper:
 *       export function getScenarioSteps(
 *         scenario: Scenario | null | undefined
 *       ): ScenarioStep[];
 *     which normalizes a possibly-legacy scenario (saved before the roadmap
 *     feature existed, so it has no `steps` key at all) to an empty array
 *     instead of `undefined`, so UI code (the roadmap sidebar, the mobile step
 *     chip, etc.) never has to null-check `scenario.steps` itself. Returns `[]`
 *     for `null`/`undefined` scenario too.
 *
 * Tests FAIL before the implementation exists: `getScenarioSteps` is not
 * exported yet, so calling it throws "getScenarioSteps is not a function".
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Scenario } from '../types';
import {
  loadScenarios,
  saveScenario,
  getScenarioSteps,
} from '../services/scenarioService';

const STORAGE_KEY = 'parle-scenarios';

beforeEach(() => {
  localStorage.clear();
});

function makeScenario(overrides: Partial<Scenario> & { id: string }): Scenario {
  return {
    name: 'Bakery Visit',
    description: 'Went to a bakery and bought bread',
    createdAt: Date.now(),
    isActive: true,
    ...overrides,
  } as Scenario;
}

// ---------------------------------------------------------------------------
// Round-trip persistence of scenario.steps
// ---------------------------------------------------------------------------

describe('Scenario.steps · save/load round trip', () => {
  it('persists steps in order through saveScenario -> loadScenarios', () => {
    const steps = [
      { id: 'step-1', text: 'Enter & greet the baker' },
      { id: 'step-2', text: 'Ask for a baguette' },
      { id: 'step-3', text: 'Order two croissants' },
      { id: 'step-4', text: 'Pay the total' },
      { id: 'step-5', text: 'Say goodbye' },
    ];
    const scenario = makeScenario({ id: 'roadmap-scenario-1', steps });

    saveScenario(scenario);
    const loaded = loadScenarios();
    const found = loaded.find((s) => s.id === 'roadmap-scenario-1');

    expect(found).toBeDefined();
    expect(found?.steps).toEqual(steps);
  });

  it('persists an empty steps array as an empty array (not omitted, not undefined)', () => {
    const scenario = makeScenario({ id: 'roadmap-scenario-empty', steps: [] });

    saveScenario(scenario);
    const loaded = loadScenarios();
    const found = loaded.find((s) => s.id === 'roadmap-scenario-empty');

    expect(found).toBeDefined();
    expect(found?.steps).toEqual([]);
  });

  it('updates steps on re-save (e.g. after the roadmap editor reorders/edits steps)', () => {
    const scenario = makeScenario({
      id: 'roadmap-scenario-update',
      steps: [
        { id: 'step-1', text: 'Greet the baker' },
        { id: 'step-2', text: 'Ask for a baguette' },
      ],
    });
    saveScenario(scenario);

    const updated: Scenario = {
      ...scenario,
      steps: [
        { id: 'step-2', text: 'Ask for a baguette' },
        { id: 'step-1', text: 'Greet the baker' },
        { id: 'step-3', text: 'Pay the total' },
      ],
    };
    saveScenario(updated);

    const loaded = loadScenarios();
    const found = loaded.find((s) => s.id === 'roadmap-scenario-update');

    expect(found?.steps).toEqual(updated.steps);
    // Must not create a duplicate entry
    expect(loaded.filter((s) => s.id === 'roadmap-scenario-update')).toHaveLength(1);
  });

  it('backward compatibility: a scenario saved before the roadmap feature existed (no steps key) still loads correctly', () => {
    // Simulate data written by an older version of the app, with no `steps` key at all.
    const legacyScenario = {
      id: 'legacy-scenario-1',
      name: 'Old Scenario',
      description: 'Saved before the roadmap feature existed',
      createdAt: Date.now() - 1000,
      isActive: true,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([legacyScenario]));

    const loaded = loadScenarios();
    const found = loaded.find((s) => s.id === 'legacy-scenario-1');

    expect(found).toBeDefined();
    expect(found?.name).toBe('Old Scenario');
    expect(found?.steps).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getScenarioSteps — defensive accessor with backward-compatible default
// ---------------------------------------------------------------------------

describe('getScenarioSteps', () => {
  it('returns the steps array unchanged when present', () => {
    const steps = [
      { id: 'step-1', text: 'Greet the baker' },
      { id: 'step-2', text: 'Ask for a baguette' },
    ];
    const scenario = makeScenario({ id: 's1', steps });

    expect(getScenarioSteps(scenario)).toEqual(steps);
  });

  it('returns an empty array (not undefined) for a legacy scenario with no steps field', () => {
    const scenario = makeScenario({ id: 's2' });
    delete (scenario as { steps?: unknown }).steps;

    expect(getScenarioSteps(scenario)).toEqual([]);
  });

  it('returns an empty array for a null scenario', () => {
    expect(getScenarioSteps(null)).toEqual([]);
  });

  it('returns an empty array for an undefined scenario', () => {
    expect(getScenarioSteps(undefined)).toEqual([]);
  });
});
