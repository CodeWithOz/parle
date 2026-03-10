import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppState } from '../types';
import { useConversationTimer } from '../hooks/useConversationTimer';

describe('useConversationTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not increment elapsed when isActive is false', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, false, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.elapsed).toBe(0);
    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('increments elapsed each second when isActive is true and appState is IDLE', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.elapsed).toBe(3);
  });

  it('increments elapsed each second when isActive is true and appState is RECORDING', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.RECORDING, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.elapsed).toBe(4);
  });

  it('increments elapsed each second when isActive is true and appState is PLAYING', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.PLAYING, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.elapsed).toBe(2);
  });

  it('does not increment elapsed when isActive is true and appState is PROCESSING', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.PROCESSING, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.elapsed).toBe(0);
    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('resumes incrementing after transitioning from PROCESSING back to IDLE', () => {
    const onTimeUp = vi.fn();

    const { result, rerender } = renderHook(
      ({ state }: { state: AppState }) =>
        useConversationTimer(state, true, onTimeUp),
      { initialProps: { state: AppState.IDLE } }
    );

    // Run for 3 seconds in IDLE — elapsed should reach 3
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.elapsed).toBe(3);

    // Switch to PROCESSING — timer should pause
    rerender({ state: AppState.PROCESSING });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsed).toBe(3);

    // Switch back to IDLE — timer should resume
    rerender({ state: AppState.IDLE });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsed).toBe(5);
  });

  it('calls onTimeUp callback and stops incrementing when elapsed reaches 600', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(600000); // 600 seconds
    });

    expect(result.current.elapsed).toBe(600);
    expect(result.current.isTimedOut).toBe(true);
    expect(onTimeUp).toHaveBeenCalledTimes(1);

    // Advance further — elapsed should not go beyond 600
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsed).toBe(600);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('clears the interval on unmount (no memory leak)', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const onTimeUp = vi.fn();

    const { unmount } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp)
    );

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('returns an object with elapsed and isTimedOut fields', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp)
    );

    expect(result.current).toHaveProperty('elapsed');
    expect(result.current).toHaveProperty('isTimedOut');
    expect(typeof result.current.elapsed).toBe('number');
    expect(typeof result.current.isTimedOut).toBe('boolean');
  });

  // --- New tests for planned bugfixes ---

  it('resets elapsed to 0 when isActive transitions from false to true (new session)', () => {
    const onTimeUp = vi.fn();

    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useConversationTimer(AppState.IDLE, active, onTimeUp),
      { initialProps: { active: true } }
    );

    // Advance 5 seconds while active
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsed).toBe(5);

    // Deactivate the timer
    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.elapsed).toBe(5);

    // Re-activate — rising edge should reset elapsed to 0
    rerender({ active: true });
    expect(result.current.elapsed).toBe(0);
  });

  it('does not increment elapsed when isActive is true and appState is ERROR', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.ERROR, true, onTimeUp)
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.elapsed).toBe(0);
    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('resumes incrementing after transitioning from ERROR back to IDLE', () => {
    const onTimeUp = vi.fn();

    const { result, rerender } = renderHook(
      ({ state }: { state: AppState }) =>
        useConversationTimer(state, true, onTimeUp),
      { initialProps: { state: AppState.IDLE } }
    );

    // Run for 3 seconds in IDLE — elapsed should reach 3
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.elapsed).toBe(3);

    // Switch to ERROR — timer should pause
    rerender({ state: AppState.ERROR });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsed).toBe(3);

    // Switch back to IDLE — timer should resume from where it paused
    rerender({ state: AppState.IDLE });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsed).toBe(5);
  });

  it('exposes a reset() function that resets elapsed and isTimedOut, and allows ticking again', () => {
    const onTimeUp = vi.fn();
    const { result } = renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp)
    );

    // Advance timer all the way to timeout
    act(() => {
      vi.advanceTimersByTime(600000);
    });
    expect(result.current.elapsed).toBe(600);
    expect(result.current.isTimedOut).toBe(true);

    // reset() should be exposed on the returned object
    expect(typeof result.current.reset).toBe('function');

    // Calling reset() should clear elapsed and isTimedOut
    act(() => {
      result.current.reset();
    });
    expect(result.current.elapsed).toBe(0);
    expect(result.current.isTimedOut).toBe(false);

    // Timer should be able to tick again after reset
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.elapsed).toBe(3);
  });
});
