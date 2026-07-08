import { describe, it, expect } from 'vitest';

async function appSource(): Promise<string> {
  const src = await import('../App?raw');
  return src.default as string;
}

describe('scenario review abort + stale guards (App.tsx source-text)', () => {
  it('creates a dedicated AbortController and request token for scenario review generation', async () => {
    const src = await appSource();
    expect(src).toContain('const scenarioReviewAbortControllerRef = useRef<AbortController | null>(null);');
    expect(src).toContain('const scenarioReviewRequestIdRef = useRef(0);');
  });

  it('passes abort signals into both scenario review generation paths', async () => {
    const src = await appSource();
    expect(src).toMatch(/startScenarioReview[\s\S]*signal:\s*abortController\.signal/s);
    expect(src).toMatch(/regenerateScenarioReview[\s\S]*signal:\s*abortController\.signal/s);
  });

  it('guards scenario review state updates behind the current request token', async () => {
    const src = await appSource();
    expect(src).toMatch(/currentRequestId\s*!==\s*scenarioReviewRequestIdRef\.current/);
  });

  it('aborts any pending scenario review when dismissing or restarting the summary', async () => {
    const src = await appSource();
    expect(src).toMatch(/handleDismissScenarioSummary[\s\S]*scenarioReviewAbortControllerRef\.current\?\.abort\(\)/s);
    expect(src).toMatch(/handleRestartScenarioFromSummary[\s\S]*scenarioReviewAbortControllerRef\.current\?\.abort\(\)/s);
  });
});
