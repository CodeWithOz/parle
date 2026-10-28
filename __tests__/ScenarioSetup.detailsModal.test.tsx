/**
 * TDD tests for the ScenarioSetup wiring of the read-only scenario details
 * modal (`ScenarioDetailsSheet`):
 *   - clicking a saved-scenario ROW opens the modal (role=dialog) instead of
 *     prefilling the name/description form
 *   - the row's own Start / Delete buttons do NOT open the modal
 *   - "Use as template" inside the modal restores the old row behaviour:
 *     onNameChange + onDescriptionChange are called and the modal closes
 *   - Start inside the modal reuses the quick-start logic (onStartPractice /
 *     onRegenerateRoadmap / API key gate)
 *   - Delete inside the modal confirms, deletes, and closes the modal
 *
 * Tests FAIL before the implementation exists.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ScenarioSetup } from '../components/ScenarioSetup';
import type { Scenario } from '../types';
import * as scenarioService from '../services/scenarioService';
import { hasApiKeyOrEnv } from '../services/apiKeyService';

vi.mock('../services/apiKeyService', () => ({
  hasApiKeyOrEnv: vi.fn(() => true),
}));

vi.mock('../utils/confirmDelete', () => ({
  confirmDelete: vi.fn(() => true),
}));
import { confirmDelete } from '../utils/confirmDelete';

vi.mock('../services/scenarioService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/scenarioService')>();
  return {
    ...actual,
    loadScenarios: vi.fn(async () => []),
    saveScenario: vi.fn(async (s: Scenario) => [s]),
    deleteScenario: vi.fn(async () => []),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasApiKeyOrEnv).mockReturnValue(true);
  vi.mocked(confirmDelete).mockReturnValue(true);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    onStartPractice: vi.fn(),
    onOpenApiKeyModal: vi.fn(),
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

function renderSetup(overrides: Record<string, unknown> = {}) {
  const props = baseProps(overrides);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<ScenarioSetup {...(props as any)} />);
  return props;
}

const scenario: Scenario = {
  id: 'sc-1',
  name: 'Bakery Visit',
  description: 'I went to a bakery and bought bread',
  aiSummary: 'You visited a bakery and bought bread.',
  createdAt: Date.UTC(2024, 2, 15, 12),
  isActive: true,
  characters: [{ id: 'baker', name: 'Baker', role: 'baker', voiceName: 'aoede' }],
  steps: [{ id: 's1', text: 'Greet the baker' }, { id: 's2', text: 'Buy bread' }],
};

async function openList() {
  vi.mocked(scenarioService.loadScenarios).mockResolvedValue([scenario]);
  const props = renderSetup();
  fireEvent.click(await screen.findByText(/show saved scenarios/i));
  return props;
}

function clickRow() {
  // The row is a div[role=button] whose text contains the scenario name.
  fireEvent.click(screen.getByText('Bakery Visit'));
}

describe('ScenarioSetup · scenario details modal', () => {
  it('does not show the modal before any row is clicked', async () => {
    await openList();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the details modal when a row is clicked, without prefilling the form', async () => {
    const props = await openList();
    clickRow();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Bakery Visit' })).toBeInTheDocument();
    expect(within(dialog).getByText('Greet the baker')).toBeInTheDocument();
    expect(props.onNameChange).not.toHaveBeenCalled();
    expect(props.onDescriptionChange).not.toHaveBeenCalled();
  });

  it('opens the modal when Enter is pressed on a focused row', async () => {
    await openList();
    const row = screen.getByText('Bakery Visit').closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('row Start button starts practice without opening the modal', async () => {
    const props = await openList();
    fireEvent.click(screen.getByRole('button', { name: 'Start practicing Bakery Visit' }));
    expect(props.onStartPractice).toHaveBeenCalledWith(scenario);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('row Delete button deletes without opening the modal', async () => {
    await openList();
    fireEvent.click(screen.getByRole('button', { name: 'Delete scenario Bakery Visit' }));
    await waitFor(() => expect(scenarioService.deleteScenario).toHaveBeenCalledWith('sc-1'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Close button dismisses the modal', async () => {
    await openList();
    clickRow();
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Use as template" prefills name and description and closes the modal', async () => {
    const props = await openList();
    clickRow();
    fireEvent.click(await screen.findByRole('button', { name: 'Use as template' }));
    expect(props.onNameChange).toHaveBeenCalledWith('Bakery Visit');
    expect(props.onDescriptionChange).toHaveBeenCalledWith('I went to a bakery and bought bread');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Start in the modal calls onStartPractice for a scenario with steps', async () => {
    const props = await openList();
    clickRow();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start practicing Bakery Visit' }));
    await waitFor(() => expect(props.onStartPractice).toHaveBeenCalledWith(scenario));
    expect(props.onRegenerateRoadmap).not.toHaveBeenCalled();
  });

  it('Start in the modal calls onRegenerateRoadmap for a scenario without steps', async () => {
    const noSteps = { ...scenario, steps: undefined };
    vi.mocked(scenarioService.loadScenarios).mockResolvedValue([noSteps]);
    const props = renderSetup();
    fireEvent.click(await screen.findByText(/show saved scenarios/i));
    clickRow();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start practicing Bakery Visit' }));
    expect(props.onRegenerateRoadmap).toHaveBeenCalledWith(noSteps);
    expect(props.onStartPractice).not.toHaveBeenCalled();
  });

  it('Start in the modal opens the API key modal when the Gemini key is missing', async () => {
    vi.mocked(hasApiKeyOrEnv).mockReturnValue(false);
    vi.mocked(scenarioService.loadScenarios).mockResolvedValue([scenario]);
    const props = renderSetup();
    fireEvent.click(await screen.findByText(/show saved scenarios/i));
    clickRow();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start practicing Bakery Visit' }));
    expect(props.onOpenApiKeyModal).toHaveBeenCalled();
    expect(props.onStartPractice).not.toHaveBeenCalled();
  });

  it('Delete in the modal confirms, deletes the scenario and closes the modal', async () => {
    await openList();
    clickRow();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Bakery Visit' }));
    await waitFor(() => expect(scenarioService.deleteScenario).toHaveBeenCalledWith('sc-1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('declining the confirmation in the modal keeps the scenario and the modal', async () => {
    vi.mocked(confirmDelete).mockReturnValue(false);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openList();
    clickRow();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Bakery Visit' }));
    expect(scenarioService.deleteScenario).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('asks for delete confirmation exactly once on the modal delete path', async () => {
    await openList();
    clickRow();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Bakery Visit' }));
    await waitFor(() => expect(scenarioService.deleteScenario).toHaveBeenCalled());
    expect(confirmDelete).toHaveBeenCalledTimes(1);
  });

  it('closes the modal on Escape and returns focus to the row', async () => {
    await openList();
    const row = screen.getByText('Bakery Visit').closest('[role="button"]') as HTMLElement;
    fireEvent.click(row);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(row).toHaveFocus());
  });

  it('moves focus to the saved-scenarios toggle after a successful modal delete', async () => {
    const other: Scenario = { ...scenario, id: 'sc-2', name: 'Hotel Check-in' };
    vi.mocked(scenarioService.deleteScenario).mockResolvedValueOnce([other]);
    vi.mocked(scenarioService.loadScenarios).mockResolvedValue([scenario, other]);
    renderSetup();
    fireEvent.click(await screen.findByText(/show saved scenarios/i));
    clickRow();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Bakery Visit' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByText(/saved scenarios/i).closest('button'))
    );
  });

  it('does not move focus when the modal delete fails', async () => {
    vi.mocked(scenarioService.deleteScenario).mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    await openList();
    clickRow();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Bakery Visit' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.activeElement).not.toBe(screen.getByText(/saved scenarios/i).closest('button'));
  });
});
