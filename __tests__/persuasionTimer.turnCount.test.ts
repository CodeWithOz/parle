/**
 * TDD tests for the turnCount prop on PersuasionTimer.
 *
 * New prop: turnCount?: number
 *   - When omitted: renders normally with no "Turn" text
 *   - When provided: renders "Turn N" (e.g. "Turn 3")
 *   - turnCount=0 renders "Turn 0" (not hidden — zero is a valid display value)
 *
 * The ObjectionProgress interface and objectionProgress prop are removed.
 * These tests also verify that the old objectionProgress prop is gone.
 *
 * Tests FAIL before the implementation is in place.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { PersuasionTimer } from '../components/PersuasionTimer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTimer(elapsed: number, isPaused: boolean, turnCount?: number) {
  return render(
    React.createElement(PersuasionTimer, {
      elapsed,
      isPaused,
      ...(turnCount !== undefined ? { turnCount } : {}),
    })
  );
}

// ---------------------------------------------------------------------------
// No turnCount prop (backwards compatibility)
// ---------------------------------------------------------------------------

describe('PersuasionTimer · turnCount absent', () => {
  it('renders without throwing when turnCount is omitted', () => {
    expect(() => renderTimer(60, false)).not.toThrow();
  });

  it('does NOT render any "Turn" text when turnCount is omitted', () => {
    renderTimer(60, false);
    expect(screen.queryByText(/turn/i)).not.toBeInTheDocument();
  });

  it('still renders the elapsed time correctly when turnCount is omitted', () => {
    // elapsed=60 → remaining=540 → "09:00"
    renderTimer(60, false);
    expect(screen.getByText('09:00')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// With turnCount prop: renders "Turn N"
// ---------------------------------------------------------------------------

describe('PersuasionTimer · turnCount provided', () => {
  it('renders "Turn 3" when turnCount=3', () => {
    renderTimer(60, false, 3);
    expect(screen.getByText(/turn 3/i)).toBeInTheDocument();
  });

  it('renders "Turn 1" when turnCount=1', () => {
    renderTimer(30, false, 1);
    expect(screen.getByText(/turn 1/i)).toBeInTheDocument();
  });

  it('renders "Turn 0" when turnCount=0 (not hidden)', () => {
    renderTimer(0, false, 0);
    expect(screen.getByText(/turn 0/i)).toBeInTheDocument();
  });

  it('renders "Turn 8" when turnCount=8', () => {
    renderTimer(240, false, 8);
    expect(screen.getByText(/turn 8/i)).toBeInTheDocument();
  });

  it('still renders the timer time alongside the turn count', () => {
    // elapsed=120 → remaining=480 → "08:00"
    renderTimer(120, false, 3);
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText(/turn 3/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ObjectionProgress prop is removed
// ---------------------------------------------------------------------------

describe('PersuasionTimer · objectionProgress prop is gone', () => {
  it('PersuasionTimer TypeScript interface no longer exports ObjectionProgress', async () => {
    const src = await import('../components/PersuasionTimer?raw');
    // The ObjectionProgress interface definition should not exist in the file
    expect(src.default).not.toMatch(/interface ObjectionProgress/);
  });

  it('PersuasionTimer component no longer references objectionProgress prop', async () => {
    const src = await import('../components/PersuasionTimer?raw');
    expect(src.default).not.toMatch(/objectionProgress/);
  });

  it('PersuasionTimer no longer renders "Objection X/5" text', () => {
    // With turnCount but no objectionProgress, "Objection" should never appear
    renderTimer(60, false, 3);
    expect(screen.queryByText(/objection \d+\/5/i)).not.toBeInTheDocument();
  });

  it('PersuasionTimer no longer renders "Convinced!" text', () => {
    renderTimer(60, false, 3);
    expect(screen.queryByText(/convinced!/i)).not.toBeInTheDocument();
  });
});
