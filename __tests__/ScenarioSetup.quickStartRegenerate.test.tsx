/**
 * TDD tests for a real UX gap found in live usage: clicking "Start" on a
 * saved scenario that has no roadmap steps (e.g. every scenario saved before
 * the roadmap feature existed) jumped straight into practice, permanently
 * skipping the roadmap-editor confirmation screen for that scenario. The only
 * way to get a roadmap onto it was to re-create the scenario from scratch.
 *
 * Fix: "Start" on a saved scenario branches on `scenario.steps`:
 *   - non-empty  → unchanged fast path, calls `onStartPractice(scenario)` directly.
 *   - empty/absent → calls a NEW prop `onRegenerateRoadmap(scenario)` instead,
 *     which the parent (App.tsx) uses to re-run the same AI planning call and
 *     bring the user into the roadmap-editor confirm screen — the SAME
 *     experience as creating a scenario fresh — anchored to the existing
 *     scenario's identity so "Start Practice" from there UPDATES it in place
 *     (see `regeneratingScenario` prop below) rather than creating a duplicate.
 *
 * `ScenarioSetup` gains:
 *   - `onRegenerateRoadmap: (scenario: Scenario) => void` (required)
 *   - `regeneratingScenario?: Scenario | null` — when set, the roadmap-editor
 *     screen's local "Start Practice" reuses `regeneratingScenario.id` and
 *     `regeneratingScenario.createdAt` instead of generating a new id/timestamp,
 *     so `saveScenario` updates the existing entry instead of inserting a
 *     duplicate.
 *
 * Tests FAIL before the implementation exists.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScenarioSetup } from '../components/ScenarioSetup';
import type { Scenario } from '../types';
import * as scenarioService from '../services/scenarioService';

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock('../services/scenarioService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/scenarioService')>();
  return {
    ...actual,
    loadScenarios: vi.fn(),
    saveScenario: vi.fn((s: Scenario) => [s]),
    deleteScenario: vi.fn(),
  };
});

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    onStartPractice: vi.fn(),
    onClose: vi.fn(),
    isRecordingDescription: false,
    isTranscribingDescription: false,
    onStartRecordingDescription: vi.fn(),
    onStopRecordingDescription: vi.fn().mockResolvedValue(undefined),
    onCancelRecordingDescription: vi.fn(),
    isProcessingScenario: false,
    aiSummary: null,
    onSubmitDescription: vi.fn(),
    onEditScenario: vi.fn(),
    currentDescription: '',
    currentName: '',
    onDescriptionChange: vi.fn(),
    onNameChange: vi.fn(),
    showTranscriptOptions: false,
    rawTranscript: null,
    cleanedTranscript: null,
    onSelectTranscript: vi.fn(),
    onDismissTranscriptOptions: vi.fn(),
    canRetryDescriptionAudio: false,
    onRetryDescriptionAudio: vi.fn().mockResolvedValue(undefined),
    geminiKeyMissing: false,
    openaiKeyMissing: false,
    roadmapSteps: [],
    onRoadmapStepsChange: vi.fn(),
    onRegenerateRoadmap: vi.fn(),
    regeneratingScenario: null,
    ...overrides,
  };
}

function renderScenarioSetup(overrides: Record<string, unknown> = {}) {
  const props = baseProps(overrides);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<ScenarioSetup {...(props as any)} />);
  return props;
}

const scenarioWithoutSteps: Scenario = {
  id: 'existing-no-steps',
  name: 'Bakery Visit',
  description: 'I went to a bakery and bought bread',
  aiSummary: 'You visited a bakery and bought bread.',
  createdAt: 1000,
  isActive: true,
  characters: [{ id: 'baker', name: 'Baker', role: 'baker', voiceName: 'aoede' }],
  // steps intentionally omitted — this is the pre-roadmap-feature saved scenario case
};

const scenarioWithSteps: Scenario = {
  ...scenarioWithoutSteps,
  id: 'existing-with-steps',
  steps: [{ id: 's1', text: 'Greet the baker' }, { id: 's2', text: 'Buy bread' }],
};

describe('ScenarioSetup: quick-start branching (via direct saved-scenarios mock)', () => {
  it('calls onStartPractice directly when the saved scenario already has steps', async () => {
    vi.mocked(scenarioService.loadScenarios).mockReturnValue([scenarioWithSteps]);
    const props = renderScenarioSetup({});

    fireEvent.click(await screen.findByText(/show saved scenarios/i));
    fireEvent.click(screen.getByRole('button', { name: /start practicing bakery visit/i }));

    expect(props.onStartPractice).toHaveBeenCalledWith(scenarioWithSteps);
    expect(props.onRegenerateRoadmap).not.toHaveBeenCalled();
  });

  it('calls onRegenerateRoadmap instead of onStartPractice when the saved scenario has no steps', async () => {
    vi.mocked(scenarioService.loadScenarios).mockReturnValue([scenarioWithoutSteps]);
    const props = renderScenarioSetup({});

    fireEvent.click(await screen.findByText(/show saved scenarios/i));
    fireEvent.click(screen.getByRole('button', { name: /start practicing bakery visit/i }));

    expect(props.onRegenerateRoadmap).toHaveBeenCalledWith(scenarioWithoutSteps);
    expect(props.onStartPractice).not.toHaveBeenCalled();
  });

  it('calls onRegenerateRoadmap when the saved scenario has an empty steps array', async () => {
    const emptySteps = { ...scenarioWithoutSteps, steps: [] };
    vi.mocked(scenarioService.loadScenarios).mockReturnValue([emptySteps]);
    const props = renderScenarioSetup({});

    fireEvent.click(await screen.findByText(/show saved scenarios/i));
    fireEvent.click(screen.getByRole('button', { name: /start practicing bakery visit/i }));

    expect(props.onRegenerateRoadmap).toHaveBeenCalledWith(emptySteps);
  });
});

describe('ScenarioSetup: "Start Practice" reuses the id/createdAt of the scenario being regenerated', () => {
  it('saves with the existing id and createdAt instead of generating new ones', () => {
    renderScenarioSetup({
      aiSummary: 'You visited a bakery and bought bread.',
      currentName: 'Bakery Visit',
      currentDescription: 'I went to a bakery and bought bread',
      roadmapSteps: ['Greet the baker', 'Buy bread'],
      regeneratingScenario: scenarioWithoutSteps,
    });

    fireEvent.click(screen.getByRole('button', { name: /^start practice$/i }));

    expect(scenarioService.saveScenario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'existing-no-steps', createdAt: 1000 })
    );
  });

  it('generates a new id when not regenerating an existing scenario (fresh creation, unchanged)', () => {
    renderScenarioSetup({
      aiSummary: 'A fresh scenario summary.',
      currentName: 'New Scenario',
      currentDescription: 'A brand new scenario',
      roadmapSteps: ['Step one'],
      regeneratingScenario: null,
    });

    fireEvent.click(screen.getByRole('button', { name: /^start practice$/i }));

    expect(scenarioService.saveScenario).toHaveBeenCalled();
    const savedArg = vi.mocked(scenarioService.saveScenario).mock.calls[0][0];
    expect(savedArg.id).not.toBe('existing-no-steps');
  });
});
