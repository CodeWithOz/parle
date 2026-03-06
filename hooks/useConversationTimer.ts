import { useEffect, useRef, useState } from 'react';
import { AppState } from '../types';

const MAX_ELAPSED_SECONDS = 600;

/**
 * Timer hook that counts elapsed seconds for TEF Ad conversation practice.
 * Increments once per second when isActive is true and appState is not PROCESSING.
 * Stops and calls onTimeUp when elapsed reaches 600 seconds.
 */
export const useConversationTimer = (
  appState: AppState,
  isActive: boolean,
  onTimeUp: () => void
): { elapsed: number; isTimedOut: boolean } => {
  const [elapsed, setElapsed] = useState(0);
  const [isTimedOut, setIsTimedOut] = useState(false);

  // Keep stable references to avoid stale closures in the interval
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  const isTimedOutRef = useRef(isTimedOut);
  isTimedOutRef.current = isTimedOut;

  useEffect(() => {
    // Don't tick if not active, already timed out, or processing
    if (!isActive || isTimedOut || appState === AppState.PROCESSING) {
      return;
    }

    const intervalId = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= MAX_ELAPSED_SECONDS) {
          setIsTimedOut(true);
          onTimeUpRef.current();
          return MAX_ELAPSED_SECONDS;
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isActive, isTimedOut, appState]);

  return { elapsed, isTimedOut };
};
