import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppState } from '../types';
import { useConversationTimer } from '../hooks/useConversationTimer';

describe('persuasion timer stop-on-summary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('freezes elapsed when timer is deactivated on summary display', () => {
    const onTimeUp = vi.fn();
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useConversationTimer(AppState.IDLE, active, onTimeUp, 600),
      { initialProps: { active: true } }
    );

    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(result.current.elapsed).toBe(20);

    const snapshot = result.current.elapsed;
    rerender({ active: false });

    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(result.current.elapsed).toBe(snapshot);
  });

  it('guards App timer activation with !showTefAdSummary', async () => {
    const appSource = await import('../App?raw');
    expect(appSource.default).toContain("tefAdMode === 'practice' && !showTefAdSummary");
  });
});
