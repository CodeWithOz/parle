import { describe, it, expect, vi } from 'vitest';
import { combineAbortSignals } from '../utils/combineAbortSignals';

describe('combineAbortSignals', () => {
  it('aborts the composite signal when the first source aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineAbortSignals(a.signal, b.signal);

    const onAbort = vi.fn();
    combined.addEventListener('abort', onAbort);

    a.abort();

    expect(combined.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalled();
  });

  it('aborts the composite signal when the second source aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineAbortSignals(a.signal, b.signal);

    b.abort();

    expect(combined.aborted).toBe(true);
  });

  it('is already aborted if the first source was aborted before combine', () => {
    const a = new AbortController();
    a.abort();
    const b = new AbortController();
    const combined = combineAbortSignals(a.signal, b.signal);

    expect(combined.aborted).toBe(true);
  });

  it('is already aborted if the second source was aborted before combine', () => {
    const a = new AbortController();
    const b = new AbortController();
    b.abort();
    const combined = combineAbortSignals(a.signal, b.signal);

    expect(combined.aborted).toBe(true);
  });

  it('with no signals, returns a non-aborted composite (inert until external abort)', () => {
    const combined = combineAbortSignals();
    expect(combined.aborted).toBe(false);
  });

  it('with no signals, subsequent abort of a new controller does not affect the inert composite', () => {
    const combined = combineAbortSignals();
    const c = new AbortController();
    // composite is unrelated to c — documents that empty-input composite is not wired to c
    c.abort();
    expect(combined.aborted).toBe(false);
  });
});
