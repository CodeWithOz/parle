/**
 * TDD test for a real bug found in live usage: the roadmap editor's drag
 * handle (⋮⋮) was purely decorative — it had no event handlers, so dragging
 * it did nothing (only the up/down buttons actually reordered steps).
 *
 * This pins down that dragging a step row and dropping it on another row's
 * position reorders `roadmapSteps` via `onRoadmapStepsChange`, using native
 * HTML5 drag-and-drop (draggable + dragstart/dragover/drop) on the row
 * identified by the existing `roadmap-step-{index}` data-testid — no new
 * dependency, and no change to the up/down button contract already pinned
 * down in `ScenarioSetup.roadmapEditor.test.tsx`.
 *
 * Tests FAIL before the fix (rows aren't draggable / have no drop handler).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScenarioSetup } from '../components/ScenarioSetup';

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
    aiSummary: 'You will visit a bakery, greet the baker, order bread, then pay and leave.',
    onSubmitDescription: vi.fn(),
    onEditScenario: vi.fn(),
    currentDescription: 'I went to a bakery and bought bread',
    currentName: 'Bakery Visit',
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
    roadmapSteps: ['Greet the baker', 'Ask for a baguette', 'Order two croissants', 'Pay the total'],
    onRoadmapStepsChange: vi.fn(),
    ...overrides,
  };
}

function renderScenarioSetup(overrides: Record<string, unknown> = {}) {
  const props = baseProps(overrides);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<ScenarioSetup {...(props as any)} />);
  return props;
}

// jsdom doesn't implement DataTransfer; a minimal in-memory stand-in is the
// standard Testing Library workaround for native HTML5 drag-and-drop.
function makeDataTransfer() {
  const store: Record<string, string> = {};
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: (format: string, val: string) => { store[format] = val; },
    getData: (format: string) => store[format] ?? '',
  };
}

describe('roadmap editor: drag-and-drop reorder via the ⋮⋮ handle row', () => {
  it('marks each step row as draggable', () => {
    renderScenarioSetup();
    const row0 = screen.getByTestId('roadmap-step-0');
    expect(row0).toHaveAttribute('draggable', 'true');
  });

  it('reorders steps when a row is dragged and dropped onto a later row', () => {
    const props = renderScenarioSetup();
    const row0 = screen.getByTestId('roadmap-step-0'); // "Greet the baker"
    const row2 = screen.getByTestId('roadmap-step-2'); // "Order two croissants"

    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(row0, { dataTransfer });
    fireEvent.dragOver(row2, { dataTransfer });
    fireEvent.drop(row2, { dataTransfer });

    expect(props.onRoadmapStepsChange).toHaveBeenCalledWith([
      'Ask for a baguette',
      'Order two croissants',
      'Greet the baker',
      'Pay the total',
    ]);
  });

  it('reorders steps when a row is dragged and dropped onto an earlier row', () => {
    const props = renderScenarioSetup();
    const row3 = screen.getByTestId('roadmap-step-3'); // "Pay the total"
    const row1 = screen.getByTestId('roadmap-step-1'); // "Ask for a baguette"

    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(row3, { dataTransfer });
    fireEvent.dragOver(row1, { dataTransfer });
    fireEvent.drop(row1, { dataTransfer });

    expect(props.onRoadmapStepsChange).toHaveBeenCalledWith([
      'Greet the baker',
      'Pay the total',
      'Ask for a baguette',
      'Order two croissants',
    ]);
  });

  it('does nothing when a row is dropped onto itself', () => {
    const props = renderScenarioSetup();
    const row1 = screen.getByTestId('roadmap-step-1');

    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(row1, { dataTransfer });
    fireEvent.dragOver(row1, { dataTransfer });
    fireEvent.drop(row1, { dataTransfer });

    expect(props.onRoadmapStepsChange).not.toHaveBeenCalled();
  });
});
