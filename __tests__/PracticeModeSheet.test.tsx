/**
 * TDD tests for the PracticeModeSheet component.
 *
 * PracticeModeSheet is a Vaul-based bottom drawer that presents the three
 * available practice modes — "Ad Persuasion", "Role Play", and "Ad Questioning"
 * — as selectable cards.
 *
 * Props:
 *   open: boolean               — controls drawer visibility
 *   onOpenChange: (open: boolean) => void
 *   onSelectMode: (modeId: 'ad-persuasion' | 'role-play' | 'ad-questioning') => void
 *
 * Tests FAIL before the implementation exists.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PracticeModeSheet } from '../components/PracticeModeSheet';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSheet(
  open: boolean,
  onOpenChange = vi.fn(),
  onSelectMode = vi.fn()
) {
  return render(
    <PracticeModeSheet open={open} onOpenChange={onOpenChange} onSelectMode={onSelectMode} />
  );
}

// ---------------------------------------------------------------------------
// Rendering when open
// ---------------------------------------------------------------------------

describe('PracticeModeSheet · renders content when open', () => {
  it('renders a title visible to the user when open is true', () => {
    renderSheet(true);
    // The sheet should have a heading-level title identifying the purpose
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('renders a descriptive subtitle or instruction text when open is true', () => {
    renderSheet(true);
    // Some descriptive text should be present to guide the user
    expect(screen.getByText(/choose a practice mode|select a mode|pick a mode/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Both mode options are present
// ---------------------------------------------------------------------------

describe('PracticeModeSheet · practice mode options', () => {
  it('renders an "Ad Persuasion" mode option when open is true', () => {
    renderSheet(true);
    expect(screen.getByText(/ad persuasion/i)).toBeInTheDocument();
  });

  it('renders a "Role Play" mode option when open is true', () => {
    renderSheet(true);
    expect(screen.getByText(/role play/i)).toBeInTheDocument();
  });

  it('renders an "Ad Questioning" mode option when open is true', () => {
    renderSheet(true);
    expect(screen.getByText(/ad questioning/i)).toBeInTheDocument();
  });

  it('renders a description for "Ad Questioning" mentioning questions and TEF exam practice', () => {
    renderSheet(true);
    // The description should mention asking questions and TEF exam practice
    expect(screen.getByText(/ask.*question|question.*ask/i)).toBeInTheDocument();
  });

  it('renders exactly three selectable mode options', () => {
    renderSheet(true);
    // Each mode card should be reachable via a button role named after the mode
    const buttons = screen.getAllByRole('button', { name: /ad persuasion|role play|ad questioning/i });
    expect(buttons).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// onSelectMode callback
// ---------------------------------------------------------------------------

describe('PracticeModeSheet · onSelectMode callback', () => {
  it('calls onSelectMode with "ad-persuasion" when the Ad Persuasion option is clicked', () => {
    const onSelectMode = vi.fn();
    renderSheet(true, vi.fn(), onSelectMode);

    const adButton = screen.getByRole('button', { name: /ad persuasion/i });
    fireEvent.click(adButton);

    expect(onSelectMode).toHaveBeenCalledTimes(1);
    expect(onSelectMode).toHaveBeenCalledWith('ad-persuasion');
  });

  it('calls onSelectMode with "role-play" when the Role Play option is clicked', () => {
    const onSelectMode = vi.fn();
    renderSheet(true, vi.fn(), onSelectMode);

    const rolePlayButton = screen.getByRole('button', { name: /role play/i });
    fireEvent.click(rolePlayButton);

    expect(onSelectMode).toHaveBeenCalledTimes(1);
    expect(onSelectMode).toHaveBeenCalledWith('role-play');
  });

  it('does not call onSelectMode before any interaction', () => {
    const onSelectMode = vi.fn();
    renderSheet(true, vi.fn(), onSelectMode);

    expect(onSelectMode).not.toHaveBeenCalled();
  });

  it('calls onSelectMode with "ad-questioning" when the Ad Questioning option is clicked', () => {
    const onSelectMode = vi.fn();
    renderSheet(true, vi.fn(), onSelectMode);

    const adQuestioningButton = screen.getByRole('button', { name: /ad questioning/i });
    fireEvent.click(adQuestioningButton);

    expect(onSelectMode).toHaveBeenCalledTimes(1);
    expect(onSelectMode).toHaveBeenCalledWith('ad-questioning');
  });

  it('does not call onOpenChange when a mode option is clicked', () => {
    const onOpenChange = vi.fn();
    const onSelectMode = vi.fn();
    renderSheet(true, onOpenChange, onSelectMode);

    fireEvent.click(screen.getByRole('button', { name: /ad persuasion/i }));
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /role play/i }));
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /ad questioning/i }));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Closed state — content should not be present
// ---------------------------------------------------------------------------

describe('PracticeModeSheet · closed state', () => {
  it('does not render the "Ad Persuasion" option when open is false', () => {
    renderSheet(false);
    expect(screen.queryByText(/ad persuasion/i)).not.toBeInTheDocument();
  });

  it('does not render the "Role Play" option when open is false', () => {
    renderSheet(false);
    expect(screen.queryByText(/role play/i)).not.toBeInTheDocument();
  });

  it('does not render the "Ad Questioning" option when open is false', () => {
    renderSheet(false);
    expect(screen.queryByText(/ad questioning/i)).not.toBeInTheDocument();
  });
});
