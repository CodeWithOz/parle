/**
 * TDD tests for the objection progress display in PersuasionTimer.
 *
 * New prop: objectionProgress?: {
 *   currentDirection: number;
 *   totalDirections: number;
 *   currentRound: number;
 *   totalRounds: number;
 *   isConvinced: boolean;
 * }
 *
 * When provided:
 *   - Renders "Objection X/5 · Round Y/3" text (1-based, human-readable)
 *   - Renders "Convinced!" when isConvinced is true
 * When omitted: renders normally without progress text (backwards compatible)
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

interface ObjectionProgress {
  currentDirection: number;
  totalDirections: number;
  currentRound: number;
  totalRounds: number;
  isConvinced: boolean;
}

function renderTimer(
  elapsed: number,
  isPaused: boolean,
  objectionProgress?: ObjectionProgress
) {
  return render(
    React.createElement(PersuasionTimer, {
      elapsed,
      isPaused,
      ...(objectionProgress !== undefined ? { objectionProgress } : {}),
    })
  );
}

// ---------------------------------------------------------------------------
// Backwards compatibility: no objectionProgress prop
// ---------------------------------------------------------------------------

describe('PersuasionTimer · backwards compatibility (no objectionProgress)', () => {
  it('renders without throwing when objectionProgress is omitted', () => {
    expect(() => renderTimer(60, false)).not.toThrow();
  });

  it('does NOT render any "Objection" text when objectionProgress is omitted', () => {
    renderTimer(60, false);
    expect(screen.queryByText(/objection/i)).not.toBeInTheDocument();
  });

  it('does NOT render "Convinced!" when objectionProgress is omitted', () => {
    renderTimer(60, false);
    expect(screen.queryByText(/convinced/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// With objectionProgress: display "Objection X/5 · Round Y/3"
// ---------------------------------------------------------------------------

describe('PersuasionTimer · objection progress display', () => {
  it('renders "Objection 1/5" when currentDirection is 0 (0-based → 1-based)', () => {
    renderTimer(60, false, {
      currentDirection: 0,
      totalDirections: 5,
      currentRound: 0,
      totalRounds: 3,
      isConvinced: false,
    });
    expect(screen.getByText(/objection 1\/5/i)).toBeInTheDocument();
  });

  it('renders "Round 1/3" when currentRound is 0 (0-based → 1-based)', () => {
    renderTimer(60, false, {
      currentDirection: 0,
      totalDirections: 5,
      currentRound: 0,
      totalRounds: 3,
      isConvinced: false,
    });
    expect(screen.getByText(/round 1\/3/i)).toBeInTheDocument();
  });

  it('renders "Objection 2/5 · Round 1/3" for direction=1, round=0', () => {
    renderTimer(120, false, {
      currentDirection: 1,
      totalDirections: 5,
      currentRound: 0,
      totalRounds: 3,
      isConvinced: false,
    });
    // The full combined string
    expect(screen.getByText(/objection 2\/5\s*[·•]\s*round 1\/3/i)).toBeInTheDocument();
  });

  it('renders "Objection 3/5 · Round 2/3" for direction=2, round=1', () => {
    renderTimer(200, false, {
      currentDirection: 2,
      totalDirections: 5,
      currentRound: 1,
      totalRounds: 3,
      isConvinced: false,
    });
    expect(screen.getByText(/objection 3\/5\s*[·•]\s*round 2\/3/i)).toBeInTheDocument();
  });

  it('renders "Objection 5/5 · Round 3/3" for direction=4, round=2 (last state before convinced)', () => {
    renderTimer(550, false, {
      currentDirection: 4,
      totalDirections: 5,
      currentRound: 2,
      totalRounds: 3,
      isConvinced: false,
    });
    expect(screen.getByText(/objection 5\/5\s*[·•]\s*round 3\/3/i)).toBeInTheDocument();
  });

  it('does NOT render "Convinced!" when isConvinced is false', () => {
    renderTimer(60, false, {
      currentDirection: 1,
      totalDirections: 5,
      currentRound: 0,
      totalRounds: 3,
      isConvinced: false,
    });
    expect(screen.queryByText(/convinced/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// With objectionProgress: isConvinced === true
// ---------------------------------------------------------------------------

describe('PersuasionTimer · convinced state', () => {
  it('renders "Convinced!" when isConvinced is true', () => {
    renderTimer(540, false, {
      currentDirection: 4,
      totalDirections: 5,
      currentRound: 2,
      totalRounds: 3,
      isConvinced: true,
    });
    expect(screen.getByText(/convinced!/i)).toBeInTheDocument();
  });

  it('does NOT render "Objection X/5 · Round Y/3" text when isConvinced is true', () => {
    renderTimer(540, false, {
      currentDirection: 4,
      totalDirections: 5,
      currentRound: 2,
      totalRounds: 3,
      isConvinced: true,
    });
    expect(screen.queryByText(/objection \d+\/5/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Timer still shows time when progress is also shown
// ---------------------------------------------------------------------------

describe('PersuasionTimer · timer coexists with progress', () => {
  it('still renders the time when objectionProgress is provided', () => {
    renderTimer(60, false, {
      currentDirection: 0,
      totalDirections: 5,
      currentRound: 0,
      totalRounds: 3,
      isConvinced: false,
    });
    // elapsed=60 → remaining=540 → "09:00"
    expect(screen.getByText('09:00')).toBeInTheDocument();
  });

  it('still renders "00:00" when time is up and objectionProgress is provided', () => {
    renderTimer(600, false, {
      currentDirection: 4,
      totalDirections: 5,
      currentRound: 2,
      totalRounds: 3,
      isConvinced: true,
    });
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });
});
