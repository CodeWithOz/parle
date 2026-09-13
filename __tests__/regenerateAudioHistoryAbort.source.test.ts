/**
 * Source-text specs for CodeRabbit findings on regenerate restore +
 * abort-before-create in resetSessionWithUserAudioHistory.
 */

import { describe, it, expect } from 'vitest';

describe('regenerate restore / abort guards (source-text)', () => {
  it('App.tsx skips regenerate restore when the request is no longer current', async () => {
    const src = (await import('../App?raw')).default as string;
    expect(src).toMatch(/restoreRegenerateHistoryIfCurrent/);
    expect(src).toMatch(
      /if\s*\(\s*!isRegenerate\s*\|\|\s*!isRequestCurrent\s*\(\s*\)\s*\)\s*return/
    );
    expect(src).toMatch(
      /processingAbortedRef\.current\s*&&\s*currentRequestId\s*===\s*requestIdRef\.current|!processingAbortedRef\.current\s*&&\s*currentRequestId\s*===\s*requestIdRef\.current/
    );
  });

  it('App.tsx passes the pipeline abort signal into regenerate session restore', async () => {
    const src = (await import('../App?raw')).default as string;
    expect(src).toMatch(
      /resetSessionWithUserAudioHistory\s*\(\s*[\s\S]*?pipelineSignal/s
    );
  });

  it('resetSessionWithUserAudioHistory throws AbortError when aborted', async () => {
    const src = (await import('../services/geminiService?raw')).default as string;
    const fnStart = src.indexOf('export const resetSessionWithUserAudioHistory');
    expect(fnStart).toBeGreaterThan(-1);
    const fnSlice = src.slice(fnStart, fnStart + 800);
    expect(fnSlice).toMatch(/if\s*\(\s*signal\?\.aborted\s*\)/);
    expect(fnSlice).toMatch(/AbortError/);
  });
});
