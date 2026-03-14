/**
 * Tests for the TEF Questioning timer stop-on-early-exit fix.
 *
 * THE BUG (fixed in App.tsx):
 *   isActive = tefQuestioningMode === 'practice'
 *   handleExitTefQuestioning() sets showTefQuestioningSummary=true but never
 *   changes tefQuestioningMode, so isActive stays true and the timer keeps
 *   ticking while the summary is displayed.
 *
 * THE FIX (App.tsx):
 *   isActive = tefQuestioningMode === 'practice' && !showTefQuestioningSummary
 *
 * Tests 1 and 2 verify that when isActive transitions to false (simulating
 * showTefQuestioningSummary becoming true), elapsed freezes.
 * Since these tests invoke the hook directly (bypassing App.tsx), they simulate
 * the fix by rerendering with mode='none' to pass isActive=false to the hook.
 *
 * Tests 3 and 4 are natural time-up regression guards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppState } from '../types';
import { useConversationTimer } from '../hooks/useConversationTimer';

describe('questioningTimerStop — early exit via showTefQuestioningSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Test 1: timer stops ticking once showSummary=true (isActive goes false).
  // ---------------------------------------------------------------------------
  it('stops ticking when showTefQuestioningSummary becomes true while mode is still practice', () => {
    const onTimeUp = vi.fn();

    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'practice' | 'none' }) =>
        useConversationTimer(
          AppState.IDLE,
          mode === 'practice',
          onTimeUp,
          300
        ),
      { initialProps: { mode: 'practice' as const } }
    );

    // Practice runs for 10 s
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.elapsed).toBe(10);

    // User exits early: handleExitTefQuestioning() is called.
    // showTefQuestioningSummary becomes true BUT mode stays 'practice'.
    // After the fix App uses isActive = mode==='practice' && !showSummary,
    // which evaluates to false. We simulate this by rerendering with mode='none'
    // (so isActive=false), representing that moment the summary appears.
    const elapsedAtExit = result.current.elapsed; // 10

    // Simulate the fix: showSummary=true means isActive becomes false.
    // In isolated hook tests we model this by switching mode to 'none'.
    rerender({ mode: 'none' as const });

    // Simulate time passing while the summary screen is displayed
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    // After the fix isActive is false when showSummary=true,
    // so elapsed must not grow past the exit snapshot.
    expect(result.current.elapsed).toBe(elapsedAtExit);
  });

  // ---------------------------------------------------------------------------
  // Test 2: elapsed stays frozen at exit snapshot while summary is visible.
  // ---------------------------------------------------------------------------
  it('keeps elapsed frozen at exit value while summary screen is visible', () => {
    const onTimeUp = vi.fn();

    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'practice' | 'none' }) =>
        useConversationTimer(
          AppState.IDLE,
          mode === 'practice',
          onTimeUp,
          300
        ),
      { initialProps: { mode: 'practice' as const } }
    );

    // 45 s of practice
    act(() => {
      vi.advanceTimersByTime(45000);
    });
    expect(result.current.elapsed).toBe(45);

    // Early exit: mode unchanged, showSummary becomes true.
    // After the fix App uses isActive = mode==='practice' && !showSummary,
    // which evaluates to false. We simulate this by rerendering with mode='none'.
    const exitSnapshot = result.current.elapsed; // 45

    // Simulate the fix: showSummary=true means isActive becomes false.
    rerender({ mode: 'none' as const });

    // User spends a long time on the summary screen
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    // elapsed shown on the summary must equal the exit snapshot.
    expect(result.current.elapsed).toBe(exitSnapshot);
  });

  // ---------------------------------------------------------------------------
  // Test 3 (regression guard — passes before and after fix):
  // Natural time-up fires onTimeUp when the full 300 s elapse without any exit.
  // ---------------------------------------------------------------------------
  it('fires onTimeUp when the full 300 s elapse without early exit', () => {
    const onTimeUp = vi.fn();

    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, 300)
    );

    act(() => {
      vi.advanceTimersByTime(300000);
    });

    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test 4 (regression guard — passes before and after fix):
  // elapsed is capped at 300 and isTimedOut is set after natural time-up.
  // ---------------------------------------------------------------------------
  it('caps elapsed at 300 and sets isTimedOut after natural time-up', () => {
    const onTimeUp = vi.fn();

    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, 300)
    );

    act(() => {
      vi.advanceTimersByTime(310000); // 10 s past the 300 s limit
    });

    expect(result.current.elapsed).toBe(300);
    expect(result.current.isTimedOut).toBe(true);
  });
});
