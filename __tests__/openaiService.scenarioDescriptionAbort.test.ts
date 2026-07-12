/**
 * TDD tests for a real race condition found in live usage: clicking "Start"
 * on a saved scenario without a roadmap kicks off an AI planning request; if
 * the user navigates back and clicks "Start" again (same or a different
 * scenario) before the first request resolves, BOTH requests run
 * concurrently, and whichever settles last wins — even if it's the
 * abandoned one. Observed: the first (stale) request could resolve after
 * the second (current) one and silently overwrite its data.
 *
 * Fix (this file): `processScenarioDescriptionOpenAI` accepts an optional
 * `AbortSignal` and passes it through to the LangChain call via
 * `RunnableConfig.signal`, so an aborted request's underlying call is
 * actually cancelled rather than left to run to completion. An abort-like
 * error (per the existing `isAbortLikeError` convention) is RE-THROWN
 * rather than swallowed into the generic fallback response, so callers can
 * tell an intentional cancel apart from a real failure.
 *
 * The App.tsx-side request-token guarding (which supersedes/discards stale
 * requests regardless of settle order) is covered separately by
 * `scenarioDescriptionAbort.source.test.ts`.
 *
 * Tests FAIL before the implementation exists.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let capturedInvokeArgs: unknown[] = [];
let mockInvoke = vi.fn();

vi.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: vi.fn().mockImplementation(function ChatOpenAIMock() {
      return {
        withStructuredOutput: vi.fn().mockImplementation(() => ({
          invoke: (...args: unknown[]) => {
            capturedInvokeArgs = args;
            return mockInvoke(...args);
          },
        })),
      };
    }),
  };
});

beforeEach(() => {
  localStorage.setItem('parle_api_key_openai', 'test-key-abort');
  capturedInvokeArgs = [];
  mockInvoke = vi.fn();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('processScenarioDescriptionOpenAI: AbortSignal threading', () => {
  it('passes the provided signal through to the LangChain invoke call config', async () => {
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    mockInvoke.mockResolvedValue({ summary: 'ok', characters: [], steps: ['a', 'b'] });

    const controller = new AbortController();
    await processScenarioDescriptionOpenAI('a description', controller.signal);

    expect(capturedInvokeArgs.length).toBeGreaterThanOrEqual(2);
    const config = capturedInvokeArgs[1] as { signal?: AbortSignal };
    expect(config?.signal).toBe(controller.signal);
  });

  it('works without a signal (backward compatible, signal is optional)', async () => {
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    mockInvoke.mockResolvedValue({ summary: 'ok', characters: [], steps: ['a', 'b'] });

    const result = await processScenarioDescriptionOpenAI('a description');
    expect(JSON.parse(result).summary).toBe('ok');
  });

  it('re-throws an abort-like error instead of swallowing it into a fallback response', async () => {
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    const abortError = new Error('signal is aborted without reason');
    abortError.name = 'AbortError';
    mockInvoke.mockRejectedValue(abortError);

    const controller = new AbortController();
    await expect(processScenarioDescriptionOpenAI('a description', controller.signal)).rejects.toThrow();
  });

  it('still returns the fallback response for a genuine (non-abort) error', async () => {
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    mockInvoke.mockRejectedValue(new Error('network error'));

    const result = await processScenarioDescriptionOpenAI('a description');
    const parsed = JSON.parse(result);
    expect(parsed.steps).toEqual([]);
    expect(typeof parsed.summary).toBe('string');
  });
});
