/**
 * Composite AbortSignal that aborts when any input signal aborts.
 * Uses `AbortSignal.any` when available; otherwise a minimal listener-based fallback.
 *
 * With **zero** signals, delegates to `AbortSignal.any([])` when present (non-aborted, inert),
 * or returns a non-aborted controller signal in the fallback path.
 */
export function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const anyFn = (
    AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }
  ).any;
  if (typeof anyFn === 'function') {
    return anyFn(signals);
  }

  const controller = new AbortController();
  const forward = () => {
    controller.abort();
  };

  for (const s of signals) {
    if (s.aborted) {
      forward();
      return controller.signal;
    }
    s.addEventListener('abort', forward, { once: true });
  }

  return controller.signal;
}
