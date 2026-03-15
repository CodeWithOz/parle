/**
 * TDD tests for the optional maxSeconds parameter on useConversationTimer.
 *
 * New signature: useConversationTimer(appState, isActive, onTimeUp, maxSeconds?)
 *
 * When maxSeconds is provided:
 *   - onTimeUp fires at maxSeconds elapsed
 *   - isTimedOut becomes true at maxSeconds
 * When maxSeconds is omitted:
 *   - Backward compatible — fires at 600s
 *   - Does NOT fire at 300s
 *
 * Tests FAIL before the implementation is in place.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppState } from '../types';
import { useConversationTimer } from '../hooks/useConversationTimer';

// ---------------------------------------------------------------------------
// maxSeconds = 300: fires at 300s
// ---------------------------------------------------------------------------

describe('useConversationTimer · maxSeconds=300', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onTimeUp at exactly 300s when maxSeconds=300 is passed', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, 300)
    );

    act(() => {
      vi.advanceTimersByTime(300000); // 300 seconds
    });

    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('sets isTimedOut to true at 300s when maxSeconds=300', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, 300)
    );

    act(() => {
      vi.advanceTimersByTime(300000);
    });

    expect(result.current.isTimedOut).toBe(true);
    expect(result.current.elapsed).toBe(300);
  });

  it('does NOT call onTimeUp before 300s when maxSeconds=300', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, 300)
    );

    act(() => {
      vi.advanceTimersByTime(299000); // 299 seconds — one short
    });

    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('stops incrementing elapsed beyond 300 when maxSeconds=300', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, 300)
    );

    act(() => {
      vi.advanceTimersByTime(305000); // 5s past limit
    });

    expect(result.current.elapsed).toBe(300);
  });

  it('does not call onTimeUp multiple times after elapsed reaches 300', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, 300)
    );

    act(() => {
      vi.advanceTimersByTime(300000);
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// maxSeconds omitted: backward compatibility (fires at 600s, not at 300s)
// ---------------------------------------------------------------------------

describe('useConversationTimer · maxSeconds omitted (backward compatibility)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT call onTimeUp at 300s when maxSeconds is omitted', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(300000); // exactly 300s
    });

    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('does NOT set isTimedOut at 300s when maxSeconds is omitted', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(300000);
    });

    expect(result.current.isTimedOut).toBe(false);
  });

  it('calls onTimeUp at 600s when maxSeconds is omitted', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(600000); // 600 seconds
    });

    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('sets isTimedOut to true at 600s when maxSeconds is omitted', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(600000);
    });

    expect(result.current.isTimedOut).toBe(true);
    expect(result.current.elapsed).toBe(600);
  });
});
