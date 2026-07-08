/**
 * TDD tests for the new roadmap-editor step of `components/ScenarioSetup.tsx`
 * (turn 3d / 4d of the approved redesign wireframe: "confirm + edit your
 * roadmap"). This is new UI — it renders inside the existing "AI summary
 * confirmed" branch of ScenarioSetup (the branch that currently shows the
 * summary, character list, and Edit/Start Practice buttons), between the
 * characters display and the action buttons.
 *
 * Contract this test file pins down for the builder:
 *
 *   ScenarioSetup gains two new CONTROLLED props (same pattern as the existing
 *   currentName/onNameChange, currentDescription/onDescriptionChange pairs):
 *
 *     roadmapSteps: string[];
 *     onRoadmapStepsChange: (steps: string[]) => void;
 *
 *   The editor is only rendered once `aiSummary` is set (i.e. in the same
 *   branch as the roadmap/characters confirmation screen), and renders one row
 *   per entry in `roadmapSteps`, in order. Required data-testid contract
 *   (builder MUST use these exact ids — tests below depend on them):
 *
 *     roadmap-step-list                    - container for the step rows
 *     roadmap-step-{index}                 - wrapper for a single step row
 *     roadmap-step-input-{index}           - <input> (or textarea) holding
 *                                             that step's editable text;
 *                                             changing it calls
 *                                             onRoadmapStepsChange with a new
 *                                             array with only that index's
 *                                             text replaced
 *     step-move-up-{index}                 - button; calls
 *                                             onRoadmapStepsChange with index
 *                                             swapped with index-1; disabled
 *                                             when index === 0
 *     step-move-down-{index}               - button; calls
 *                                             onRoadmapStepsChange with index
 *                                             swapped with index+1; disabled
 *                                             when index === roadmapSteps.length-1
 *     step-remove-{index}                  - button; calls
 *                                             onRoadmapStepsChange with that
 *                                             index removed
 *     roadmap-add-step                     - button; calls
 *                                             onRoadmapStepsChange with a new
 *                                             empty-string step appended
 *
 *   None of these interactions mutate `roadmapSteps` in place — ScenarioSetup
 *   is controlled, so each interaction is verified by asserting the argument
 *   passed to `onRoadmapStepsChange`, the same way onNameChange/onDescriptionChange
 *   are already tested implicitly as controlled inputs elsewhere in the app.
 *
 * Tests FAIL before the implementation exists (no elements with these
 * data-testids are rendered yet, and the new props are not read/used).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScenarioSetup } from '../components/ScenarioSetup';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    roadmapSteps: [
      'Enter & greet the baker',
      'Ask for a baguette',
      'Order two croissants',
      'Pay the total',
    ],
    onRoadmapStepsChange: vi.fn(),
    ...overrides,
  };
}

function renderScenarioSetup(overrides: Record<string, unknown> = {}) {
  const props = baseProps(overrides);
  // Cast via `any`: `roadmapSteps`/`onRoadmapStepsChange` are not yet part of
  // ScenarioSetupProps — that's exactly the contract this TDD file is pinning down.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<ScenarioSetup {...(props as any)} />);
  return props;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ScenarioSetup roadmap editor · rendering', () => {
  it('renders one step row per entry in roadmapSteps, in order', () => {
    renderScenarioSetup();

    const list = screen.getByTestId('roadmap-step-list');
    expect(list).toBeInTheDocument();

    expect(screen.getByTestId('roadmap-step-0')).toBeInTheDocument();
    expect(screen.getByTestId('roadmap-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('roadmap-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('roadmap-step-3')).toBeInTheDocument();
    expect(screen.queryByTestId('roadmap-step-4')).not.toBeInTheDocument();
  });

  it('renders each step input pre-filled with the step text, in order', () => {
    renderScenarioSetup();

    expect(screen.getByTestId('roadmap-step-input-0')).toHaveValue('Enter & greet the baker');
    expect(screen.getByTestId('roadmap-step-input-1')).toHaveValue('Ask for a baguette');
    expect(screen.getByTestId('roadmap-step-input-2')).toHaveValue('Order two croissants');
    expect(screen.getByTestId('roadmap-step-input-3')).toHaveValue('Pay the total');
  });

  it('renders an "add step" control', () => {
    renderScenarioSetup();
    expect(screen.getByTestId('roadmap-add-step')).toBeInTheDocument();
  });

  it('does not render the roadmap editor before the AI summary exists', () => {
    renderScenarioSetup({ aiSummary: null });
    expect(screen.queryByTestId('roadmap-step-list')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Add step
// ---------------------------------------------------------------------------

describe('ScenarioSetup roadmap editor · add step', () => {
  it('calls onRoadmapStepsChange with a new empty step appended when "+ Add step" is clicked', () => {
    const props = renderScenarioSetup();

    fireEvent.click(screen.getByTestId('roadmap-add-step'));

    expect(props.onRoadmapStepsChange).toHaveBeenCalledTimes(1);
    expect(props.onRoadmapStepsChange).toHaveBeenCalledWith([
      'Enter & greet the baker',
      'Ask for a baguette',
      'Order two croissants',
      'Pay the total',
      '',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Remove step
// ---------------------------------------------------------------------------

describe('ScenarioSetup roadmap editor · remove step', () => {
  it('calls onRoadmapStepsChange with that index removed, preserving order of the rest', () => {
    const props = renderScenarioSetup();

    fireEvent.click(screen.getByTestId('step-remove-1'));

    expect(props.onRoadmapStepsChange).toHaveBeenCalledTimes(1);
    expect(props.onRoadmapStepsChange).toHaveBeenCalledWith([
      'Enter & greet the baker',
      'Order two croissants',
      'Pay the total',
    ]);
  });

  it('removing the first step leaves the remaining steps in their original order', () => {
    const props = renderScenarioSetup();

    fireEvent.click(screen.getByTestId('step-remove-0'));

    expect(props.onRoadmapStepsChange).toHaveBeenCalledWith([
      'Ask for a baguette',
      'Order two croissants',
      'Pay the total',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Edit step text inline
// ---------------------------------------------------------------------------

describe('ScenarioSetup roadmap editor · edit step text', () => {
  it('calls onRoadmapStepsChange with only the edited index changed', () => {
    const props = renderScenarioSetup();

    fireEvent.change(screen.getByTestId('roadmap-step-input-2'), {
      target: { value: 'Order three croissants' },
    });

    expect(props.onRoadmapStepsChange).toHaveBeenCalledTimes(1);
    expect(props.onRoadmapStepsChange).toHaveBeenCalledWith([
      'Enter & greet the baker',
      'Ask for a baguette',
      'Order three croissants',
      'Pay the total',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Reorder (move up / move down)
// ---------------------------------------------------------------------------

describe('ScenarioSetup roadmap editor · reorder steps', () => {
  it('moving a step down swaps it with the next step', () => {
    const props = renderScenarioSetup();

    fireEvent.click(screen.getByTestId('step-move-down-0'));

    expect(props.onRoadmapStepsChange).toHaveBeenCalledTimes(1);
    expect(props.onRoadmapStepsChange).toHaveBeenCalledWith([
      'Ask for a baguette',
      'Enter & greet the baker',
      'Order two croissants',
      'Pay the total',
    ]);
  });

  it('moving a step up swaps it with the previous step', () => {
    const props = renderScenarioSetup();

    fireEvent.click(screen.getByTestId('step-move-up-2'));

    expect(props.onRoadmapStepsChange).toHaveBeenCalledTimes(1);
    expect(props.onRoadmapStepsChange).toHaveBeenCalledWith([
      'Enter & greet the baker',
      'Order two croissants',
      'Ask for a baguette',
      'Pay the total',
    ]);
  });

  it('disables "move up" on the first step', () => {
    renderScenarioSetup();
    expect(screen.getByTestId('step-move-up-0')).toBeDisabled();
  });

  it('disables "move down" on the last step', () => {
    renderScenarioSetup();
    const lastIndex = 3;
    expect(screen.getByTestId(`step-move-down-${lastIndex}`)).toBeDisabled();
  });

  it('does not disable "move down" on the first step or "move up" on the last step', () => {
    renderScenarioSetup();
    expect(screen.getByTestId('step-move-down-0')).not.toBeDisabled();
    expect(screen.getByTestId('step-move-up-3')).not.toBeDisabled();
  });
});
