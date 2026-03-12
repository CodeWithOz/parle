/**
 * TDD tests for the TefObjectionState interface and advanceTefObjectionState pure function.
 *
 * These tests specify the state machine logic for deterministic objection tracking.
 * They FAIL before the implementation is added (advanceTefObjectionState does not exist yet).
 */

import { describe, it, expect } from 'vitest';

// The pure function to test — does not exist yet; import will resolve once implemented.
import { advanceTefObjectionState } from '../utils/tefObjectionState';
import type { TefObjectionState } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<TefObjectionState> = {}): TefObjectionState {
  return {
    directions: ['price', 'quality', 'necessity', 'alternatives', 'environmental'],
    currentDirection: 0,
    currentRound: 0,
    isConvinced: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Initial state values
// ---------------------------------------------------------------------------

describe('TefObjectionState · initial shape', () => {
  it('has exactly 5 directions', () => {
    const state = makeState();
    expect(state.directions).toHaveLength(5);
  });

  it('starts at direction 0', () => {
    const state = makeState();
    expect(state.currentDirection).toBe(0);
  });

  it('starts at round 0', () => {
    const state = makeState();
    expect(state.currentRound).toBe(0);
  });

  it('starts with isConvinced false', () => {
    const state = makeState();
    expect(state.isConvinced).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Round advancement within a direction
// ---------------------------------------------------------------------------

describe('advanceTefObjectionState · round advancement', () => {
  it('increments currentRound from 0 to 1 within the same direction', () => {
    const state = makeState({ currentDirection: 0, currentRound: 0 });
    const next = advanceTefObjectionState(state);
    expect(next.currentRound).toBe(1);
    expect(next.currentDirection).toBe(0);
  });

  it('increments currentRound from 1 to 2 within the same direction', () => {
    const state = makeState({ currentDirection: 0, currentRound: 1 });
    const next = advanceTefObjectionState(state);
    expect(next.currentRound).toBe(2);
    expect(next.currentDirection).toBe(0);
  });

  it('does not set isConvinced when advancing within a direction', () => {
    const state = makeState({ currentDirection: 0, currentRound: 0 });
    const next = advanceTefObjectionState(state);
    expect(next.isConvinced).toBe(false);
  });

  it('returns a new object rather than mutating the input', () => {
    const state = makeState({ currentDirection: 0, currentRound: 0 });
    const next = advanceTefObjectionState(state);
    expect(next).not.toBe(state);
    expect(state.currentRound).toBe(0); // original unchanged
  });
});

// ---------------------------------------------------------------------------
// Direction advancement when round wraps (round 2 → direction+1, round 0)
// ---------------------------------------------------------------------------

describe('advanceTefObjectionState · direction wrap', () => {
  it('resets round to 0 and increments direction when currentRound reaches 3', () => {
    const state = makeState({ currentDirection: 0, currentRound: 2 });
    const next = advanceTefObjectionState(state);
    expect(next.currentRound).toBe(0);
    expect(next.currentDirection).toBe(1);
  });

  it('wraps from direction 1 to direction 2 correctly', () => {
    const state = makeState({ currentDirection: 1, currentRound: 2 });
    const next = advanceTefObjectionState(state);
    expect(next.currentDirection).toBe(2);
    expect(next.currentRound).toBe(0);
  });

  it('wraps from direction 3 to direction 4 correctly', () => {
    const state = makeState({ currentDirection: 3, currentRound: 2 });
    const next = advanceTefObjectionState(state);
    expect(next.currentDirection).toBe(4);
    expect(next.currentRound).toBe(0);
  });

  it('does not set isConvinced when wrapping to a new direction (directions remain)', () => {
    const state = makeState({ currentDirection: 2, currentRound: 2 });
    const next = advanceTefObjectionState(state);
    expect(next.isConvinced).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isConvinced flag: all 5 directions × 3 rounds (15 total) complete
// ---------------------------------------------------------------------------

describe('advanceTefObjectionState · convinced flag', () => {
  it('sets isConvinced when completing the last round of the last direction (direction 4, round 2)', () => {
    const state = makeState({ currentDirection: 4, currentRound: 2 });
    const next = advanceTefObjectionState(state);
    expect(next.isConvinced).toBe(true);
  });

  it('does NOT set isConvinced at direction 4, round 1', () => {
    const state = makeState({ currentDirection: 4, currentRound: 1 });
    const next = advanceTefObjectionState(state);
    expect(next.isConvinced).toBe(false);
  });

  it('does NOT set isConvinced at direction 3, round 2 (still one direction remaining)', () => {
    const state = makeState({ currentDirection: 3, currentRound: 2 });
    const next = advanceTefObjectionState(state);
    expect(next.isConvinced).toBe(false);
  });

  it('preserves directions array when convinced', () => {
    const dirs = ['price', 'quality', 'necessity', 'alternatives', 'environmental'];
    const state = makeState({ directions: dirs, currentDirection: 4, currentRound: 2 });
    const next = advanceTefObjectionState(state);
    expect(next.directions).toEqual(dirs);
  });
});

// ---------------------------------------------------------------------------
// State does not advance beyond convinced
// ---------------------------------------------------------------------------

describe('advanceTefObjectionState · no advance beyond convinced', () => {
  it('returns the same isConvinced:true state without incrementing round or direction', () => {
    const state = makeState({ currentDirection: 4, currentRound: 2, isConvinced: true });
    const next = advanceTefObjectionState(state);
    expect(next.isConvinced).toBe(true);
    // Round and direction should stay at their terminal values (not overflow)
    expect(next.currentDirection).toBe(4);
    expect(next.currentRound).toBe(2);
  });

  it('can be called multiple times on a convinced state without changing the result', () => {
    let state = makeState({ currentDirection: 4, currentRound: 2, isConvinced: true });
    state = advanceTefObjectionState(state);
    state = advanceTefObjectionState(state);
    expect(state.isConvinced).toBe(true);
    expect(state.currentDirection).toBe(4);
    expect(state.currentRound).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Full walkthrough: simulate all 15 advances
// ---------------------------------------------------------------------------

describe('advanceTefObjectionState · full 15-step walkthrough', () => {
  it('reaches isConvinced after exactly 15 advances starting from initial state', () => {
    let state = makeState();

    for (let i = 0; i < 15; i++) {
      expect(state.isConvinced).toBe(false);
      state = advanceTefObjectionState(state);
    }

    expect(state.isConvinced).toBe(true);
  });

  it('tracks direction and round correctly through all 15 advances', () => {
    let state = makeState();

    const expected: Array<{ dir: number; round: number }> = [];
    for (let d = 0; d < 5; d++) {
      for (let r = 0; r < 3; r++) {
        expected.push({ dir: d, round: r });
      }
    }

    // Before any advance: dir=0, round=0 (the initial state IS the first slot)
    expect(state.currentDirection).toBe(expected[0].dir);
    expect(state.currentRound).toBe(expected[0].round);

    // After each advance, verify the NEXT slot's expected position
    for (let i = 1; i < 15; i++) {
      state = advanceTefObjectionState(state);
      expect(state.currentDirection).toBe(expected[i].dir);
      expect(state.currentRound).toBe(expected[i].round);
    }
  });
});
