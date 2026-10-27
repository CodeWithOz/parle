/**
 * TDD tests for a UX gap: the "Saved Scenarios" list only shows a name and the
 * first 80 characters of the description, although IndexedDB stores much more
 * (aiSummary, characters, steps, createdAt, isTefQuestioning).
 *
 * New read-only component `components/ScenarioDetailsSheet.tsx` (named export
 * `ScenarioDetailsSheet`), modelled on `TefTopicHistorySheet`:
 *   props: { open, scenario: Scenario | null, onClose, onStart, onDelete, onUseAsTemplate }
 *   - returns null when `open` is false or `scenario` is null
 *   - role="dialog" aria-modal="true" aria-labelledby -> heading with the name
 *   - header X button: aria-label="Close"
 *   - footer buttons: "Start practicing <name>", "Delete <name>", "Use as template"
 *   - Delete asks confirmDelete() (utils/confirmDelete.ts) first
 *   - sections with no data are hidden
 *
 * Tests FAIL before the implementation exists.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Scenario } from '../types';

vi.mock('../utils/confirmDelete', () => ({
  confirmDelete: vi.fn(() => true),
}));

import { confirmDelete } from '../utils/confirmDelete';
import { ScenarioDetailsSheet } from '../components/ScenarioDetailsSheet';

const mockConfirm = vi.mocked(confirmDelete);

const FULL: Scenario = {
  id: 'full-1',
  name: 'Bakery Visit',
  description: 'I went to a bakery and bought a baguette and two croissants.',
  aiSummary: 'You visit a Parisian bakery and order bread and pastries.',
  createdAt: Date.UTC(2024, 2, 15, 12, 0, 0),
  isActive: true,
  isTefQuestioning: true,
  characters: [
    { id: 'c1', name: 'Marie', role: 'baker', voiceName: 'aoede', description: 'A cheerful baker' },
    { id: 'c2', name: 'Paul', role: 'cashier', voiceName: 'kore' },
  ],
  steps: [
    { id: 's1', text: 'Greet the baker' },
    { id: 's2', text: 'Order a baguette' },
    { id: 's3', text: 'Pay at the counter' },
  ],
};

const MINIMAL: Scenario = {
  id: 'min-1',
  name: 'Quick Chat',
  description: 'Just a quick chat',
  createdAt: Date.UTC(2023, 0, 10, 12, 0, 0),
  isActive: true,
};

function setup(scenario: Scenario | null = FULL, open = true) {
  const props = {
    open,
    scenario,
    onClose: vi.fn(),
    onStart: vi.fn(),
    onDelete: vi.fn(),
    onUseAsTemplate: vi.fn(),
  };
  const utils = render(<ScenarioDetailsSheet {...props} />);
  return { props, ...utils };
}

beforeEach(() => {
  mockConfirm.mockReset();
  mockConfirm.mockReturnValue(true);
});

describe('ScenarioDetailsSheet · closed state', () => {
  it('renders nothing when open is false', () => {
    const { container } = setup(FULL, false);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when scenario is null', () => {
    const { container } = setup(null, true);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ScenarioDetailsSheet · accessibility', () => {
  it('exposes a modal dialog labelled by the scenario name heading', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy as string);
    expect(heading).not.toBeNull();
    expect(heading).toHaveTextContent('Bakery Visit');
    expect(screen.getByRole('heading', { name: 'Bakery Visit' })).toBe(heading);
  });
});

describe('ScenarioDetailsSheet · full scenario', () => {
  it('shows the formatted creation date', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/2024/)).toBeInTheDocument();
  });

  it('shows the full (untruncated) description', () => {
    setup();
    expect(
      screen.getByText('I went to a bakery and bought a baguette and two croissants.')
    ).toBeInTheDocument();
  });

  it('shows the full description even when longer than 80 characters', () => {
    const long = 'A'.repeat(60) + ' ' + 'B'.repeat(60);
    setup({ ...FULL, description: long });
    expect(screen.getByText(long)).toBeInTheDocument();
  });

  it('shows the AI summary', () => {
    setup();
    expect(
      screen.getByText('You visit a Parisian bakery and order bread and pastries.')
    ).toBeInTheDocument();
  });

  it('shows every character with name, role, voice and description', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Marie')).toBeInTheDocument();
    expect(within(dialog).getByText('baker')).toBeInTheDocument();
    expect(within(dialog).getByText(/aoede/i)).toBeInTheDocument();
    expect(within(dialog).getByText('A cheerful baker')).toBeInTheDocument();
    expect(within(dialog).getByText('Paul')).toBeInTheDocument();
    expect(within(dialog).getByText('cashier')).toBeInTheDocument();
    expect(within(dialog).getByText(/kore/i)).toBeInTheDocument();
  });

  it('shows roadmap steps as an ordered, numbered list in order', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    const items = within(dialog).getAllByRole('listitem').filter((li) =>
      /Greet the baker|Order a baguette|Pay at the counter/.test(li.textContent ?? '')
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Greet the baker');
    expect(items[1]).toHaveTextContent('Order a baguette');
    expect(items[2]).toHaveTextContent('Pay at the counter');
    expect(items[0].closest('ol')).not.toBeNull();
  });

  it('shows a TEF Questioning badge when isTefQuestioning is true', () => {
    setup();
    expect(screen.getByText(/tef questioning/i)).toBeInTheDocument();
  });
});

describe('ScenarioDetailsSheet · minimal scenario', () => {
  it('shows name, date and description only, hiding empty sections', () => {
    setup(MINIMAL);
    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('heading', { name: 'Quick Chat' })).toBeInTheDocument();
    expect(within(dialog).getByText('Just a quick chat')).toBeInTheDocument();
    expect(within(dialog).getByText(/2023/)).toBeInTheDocument();

    expect(within(dialog).queryByText(/tef questioning/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/ai summary/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/characters/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/roadmap/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument();
  });

  it('also hides characters and roadmap sections when the arrays are empty', () => {
    setup({ ...MINIMAL, characters: [], steps: [] });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/characters/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/roadmap/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument();
  });

  it('still offers the action buttons', () => {
    setup(MINIMAL);
    expect(screen.getByRole('button', { name: 'Start practicing Quick Chat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Quick Chat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use as template' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

describe('ScenarioDetailsSheet · actions', () => {
  it('calls onClose when the X button is clicked', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onStart with the scenario', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start practicing Bakery Visit' }));
    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(props.onStart).toHaveBeenCalledWith(FULL);
  });

  it('calls onUseAsTemplate with the scenario', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Use as template' }));
    expect(props.onUseAsTemplate).toHaveBeenCalledWith(FULL);
    expect(props.onStart).not.toHaveBeenCalled();
  });

  it('asks for confirmation then calls onDelete with the scenario', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Bakery Visit' }));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0]).toContain('Bakery Visit');
    expect(props.onDelete).toHaveBeenCalledWith(FULL);
  });

  it('does not call onDelete when the confirmation is declined', () => {
    mockConfirm.mockReturnValue(false);
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Bakery Visit' }));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
