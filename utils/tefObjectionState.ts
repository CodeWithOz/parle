import { TefObjectionState } from '../types';

const TOTAL_ROUNDS_PER_DIRECTION = 3;

/**
 * Creates the initial TefObjectionState from an array of direction strings.
 */
export function createInitialTefObjectionState(directions: string[]): TefObjectionState {
  return {
    directions,
    currentDirection: 0,
    currentRound: 0,
    isConvinced: false,
  };
}

/**
 * Pure state machine: advances the objection state by one round.
 * - Increments currentRound
 * - If currentRound reaches TOTAL_ROUNDS_PER_DIRECTION, resets to 0 and increments currentDirection
 * - If currentDirection reaches state.directions.length, sets isConvinced = true
 * - If already convinced, returns unchanged
 */
export function advanceTefObjectionState(state: TefObjectionState): TefObjectionState {
  if (state.isConvinced) {
    return { ...state };
  }

  const nextRound = state.currentRound + 1;

  if (nextRound >= TOTAL_ROUNDS_PER_DIRECTION) {
    // Round wraps: move to next direction
    const nextDirection = state.currentDirection + 1;

    if (nextDirection >= state.directions.length) {
      // All directions exhausted
      return {
        ...state,
        currentRound: state.currentRound, // keep at terminal value
        currentDirection: state.currentDirection, // keep at terminal value
        isConvinced: true,
      };
    }

    return {
      ...state,
      currentRound: 0,
      currentDirection: nextDirection,
      isConvinced: false,
    };
  }

  return {
    ...state,
    currentRound: nextRound,
    isConvinced: false,
  };
}
