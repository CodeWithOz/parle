import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from '../types';

const DEFAULT_MAX_ELAPSED_SECONDS = 600;

/**
 * Timer hook that counts elapsed seconds for TEF Ad conversation practice.
 * Increments once per second when isActive is true and appState is not PROCESSING or ERROR.
 * Stops and calls onTimeUp when elapsed reaches maxSeconds (default 600).
 * Resets elapsed to 0 when isActive transitions from false to true (rising edge).
 *
 * @param appState - current app state
 * @param isActive - whether the timer should be running
 * @param onTimeUp - callback fired when time limit is reached
 * @param maxSeconds - optional time limit in seconds (default 600)
 */
export const useConversationTimer = (
  appState: AppState,
  isActive: boolean,
  onTimeUp: () => void,
  maxSeconds?: number
): { elapsed: number; isTimedOut: boolean; reset: () => void } => {
  const limit = maxSeconds ?? DEFAULT_MAX_ELAPSED_SECONDS;

  const [elapsed, setElapsed] = useState(0);
  const [isTimedOut, setIsTimedOut] = useState(false);

  // Keep stable references to avoid stale closures in the interval
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  // Keep stable reference to limit so the effect doesn't re-run unnecessarily
  const limitRef = useRef(limit);
  limitRef.current = limit;

  // Track previous isActive value to detect rising edge
  const prevIsActiveRef = useRef(isActive);

  useEffect(() => {
    const wasActive = prevIsActiveRef.current;
    prevIsActiveRef.current = isActive;

    // Rising edge: isActive just became true — reset elapsed for new session
    if (!wasActive && isActive) {
      setElapsed(0);
      setIsTimedOut(false);
    }
  }, [isActive]);

  useEffect(() => {
    // Don't tick if not active, already timed out, processing, or in error state
    if (!isActive || isTimedOut || appState === AppState.PROCESSING || appState === AppState.ERROR) {
      return;
    }

    const intervalId = setInterval(() => {
      setElapsed(prev => Math.min(prev + 1, limitRef.current));
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isActive, isTimedOut, appState]);

  useEffect(() => {
    if (elapsed >= limit && !isTimedOut) {
      setIsTimedOut(true);
      onTimeUpRef.current();
    }
  }, [elapsed, isTimedOut, limit]);

  const reset = useCallback(() => {
    setElapsed(0);
    setIsTimedOut(false);
  }, []);

  return { elapsed, isTimedOut, reset };
};
