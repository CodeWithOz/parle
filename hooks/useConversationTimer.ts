import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from '../types';

const MAX_ELAPSED_SECONDS = 600;

/**
 * Timer hook that counts elapsed seconds for TEF Ad conversation practice.
 * Increments once per second when isActive is true and appState is not PROCESSING or ERROR.
 * Stops and calls onTimeUp when elapsed reaches 600 seconds.
 * Resets elapsed to 0 when isActive transitions from false to true (rising edge).
 */
export const useConversationTimer = (
  appState: AppState,
  isActive: boolean,
  onTimeUp: () => void
): { elapsed: number; isTimedOut: boolean; reset: () => void } => {
  const [elapsed, setElapsed] = useState(0);
  const [isTimedOut, setIsTimedOut] = useState(false);

  // Keep stable references to avoid stale closures in the interval
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

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
      setElapsed(prev => Math.min(prev + 1, MAX_ELAPSED_SECONDS));
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isActive, isTimedOut, appState]);

  useEffect(() => {
    if (elapsed >= MAX_ELAPSED_SECONDS && !isTimedOut) {
      setIsTimedOut(true);
      onTimeUpRef.current();
    }
  }, [elapsed, isTimedOut]);

  const reset = useCallback(() => {
    setElapsed(0);
    setIsTimedOut(false);
  }, []);

  return { elapsed, isTimedOut, reset };
};
