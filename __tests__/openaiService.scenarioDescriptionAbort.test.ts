/**
 * processScenarioDescriptionOpenAI forwards AbortSignal to fetch('/api/scenario-plan')
 * and rethrows abort-like errors instead of returning the fallback JSON.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('processScenarioDescriptionOpenAI: AbortSignal threading', () => {
  it('passes the provided signal through to fetch', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        result: JSON.stringify({ summary: 'ok', characters: [], steps: ['a', 'b'] }),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    const controller = new AbortController();
    await processScenarioDescriptionOpenAI('a description', controller.signal);

    expect(fetch).toHaveBeenCalledWith(
      '/api/scenario-plan',
      expect.objectContaining({
        method: 'POST',
        signal: controller.signal,
      })
    );
  });

  it('works without a signal (backward compatible, signal is optional)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        result: JSON.stringify({ summary: 'ok', characters: [], steps: ['a', 'b'] }),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    const result = await processScenarioDescriptionOpenAI('a description');
    expect(JSON.parse(result).summary).toBe('ok');
  });

  it('re-throws an abort-like error instead of swallowing it into a fallback response', async () => {
    const abortError = new Error('signal is aborted without reason');
    abortError.name = 'AbortError';
    vi.mocked(fetch).mockRejectedValue(abortError);
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    const controller = new AbortController();
    await expect(processScenarioDescriptionOpenAI('a description', controller.signal)).rejects.toThrow();
  });

  it('still returns the fallback response for a genuine (non-abort) error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    const result = await processScenarioDescriptionOpenAI('a description');
    const parsed = JSON.parse(result);
    expect(parsed.steps).toEqual([]);
    expect(typeof parsed.summary).toBe('string');
  });
});
