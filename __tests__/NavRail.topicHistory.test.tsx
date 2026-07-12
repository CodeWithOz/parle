/**
 * TDD test for adding a "Past topic suggestions" entry to the nav rail
 * (desktop sidebar / tablet icon rail), below a divider under the four
 * existing mode items — mirrors the divider + entry already present in
 * `PracticeModeSheet.tsx`'s bottom sheet, and opens the same
 * `TefTopicHistorySheet` modal as that button does.
 *
 * This is NOT a mode switch: it must not affect `activeMode`/`disabledModes`
 * and must use a separate callback prop (`onOpenTopicHistory`), not
 * `onSelect` (which is reserved for the four `NavMode` items).
 *
 * Tests FAIL before the entry/prop/divider exist.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavRail } from '../components/NavRail';

describe('NavRail: Past topic suggestions entry', () => {
  it('does not render the entry when onOpenTopicHistory is not provided', () => {
    render(<NavRail activeMode="free-talk" onSelect={vi.fn()} />);
    expect(screen.queryByText(/past topic/i)).not.toBeInTheDocument();
  });

  it('renders a "Past topics" entry below a divider when onOpenTopicHistory is provided', () => {
    render(<NavRail activeMode="free-talk" onSelect={vi.fn()} onOpenTopicHistory={vi.fn()} />);
    expect(screen.getByText(/past topic/i)).toBeInTheDocument();
  });

  it('calls onOpenTopicHistory (not onSelect) when clicked', () => {
    const onSelect = vi.fn();
    const onOpenTopicHistory = vi.fn();
    render(<NavRail activeMode="free-talk" onSelect={onSelect} onOpenTopicHistory={onOpenTopicHistory} />);

    screen.getByText(/past topic/i).closest('button')!.click();

    expect(onOpenTopicHistory).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('still renders all four mode items alongside the new entry', () => {
    render(<NavRail activeMode="role-play" onSelect={vi.fn()} onOpenTopicHistory={vi.fn()} />);
    expect(screen.getByText('Free Talk')).toBeInTheDocument();
    expect(screen.getByText('Role Play')).toBeInTheDocument();
    expect(screen.getByText('TEF Ad')).toBeInTheDocument();
    expect(screen.getByText('TEF Questions')).toBeInTheDocument();
  });
});
