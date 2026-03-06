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
    let appState = AppState.IDLE;

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
});
