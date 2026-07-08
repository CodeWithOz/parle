/**
 * TDD tests for AI-generated scenario roadmap steps.
 *
 * Replaces the sentence-split heuristic (`seedRoadmapStepsFromSummary`) as the
 * PRIMARY source of roadmap-editor steps: the existing OpenAI scenario-planning
 * call (`processScenarioDescriptionOpenAI`, which already returns `summary` and
 * `characters` via LangChain structured output) is extended to also return a
 * `steps` array in the same call — no extra request, same latency/cost as today.
 * The heuristic remains as a defensive fallback only (non-JSON legacy response,
 * or the model omitting/returning an unusably short `steps` array).
 *
 * Contract this file pins down for the implementation (services/openaiService.ts):
 *   - The Zod schema passed to `model.withStructuredOutput(...)` must accept a
 *     `steps` field: an array of at least 2 short strings (roadmap step text).
 *     A payload missing `steps` (or with fewer than 2) must fail schema validation,
 *     the same way a payload missing `summary` or `characters` already does.
 *   - `processScenarioDescriptionOpenAI(description)` must return a JSON string
 *     whose parsed `steps` field is exactly the array the structured-output call
 *     resolved with.
 *   - On error (the try/catch fallback path), the returned JSON must include
 *     `steps: []` alongside the existing fallback `summary`/`characters`, so
 *     callers can rely on `steps` always being present (possibly empty) and
 *     never `undefined`.
 *
 * Tests FAIL before the implementation is in place.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let capturedSchema: any = null;
let mockInvoke = vi.fn();

vi.mock('@langchain/openai', () => {
  return {
    // Must be a real function (not an arrow function) so `new ChatOpenAI(...)`
    // in the implementation under test can construct it.
    ChatOpenAI: vi.fn().mockImplementation(function ChatOpenAIMock() {
      return {
        withStructuredOutput: vi.fn().mockImplementation((schema: any) => {
          capturedSchema = schema;
          return { invoke: mockInvoke };
        }),
      };
    }),
  };
});

beforeEach(() => {
  localStorage.setItem('parle_api_key_openai', 'test-key-roadmap-steps');
  capturedSchema = null;
  mockInvoke = vi.fn();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('AI-generated scenario roadmap steps (services/openaiService.ts)', () => {
  it('requires a `steps` array of at least 2 entries in the structured-output schema', async () => {
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    mockInvoke.mockResolvedValue({
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
      steps: ['Greet the baker', 'Order a baguette', 'Pay and leave'],
    });

    await processScenarioDescriptionOpenAI('I went to a bakery');

    expect(capturedSchema).toBeTruthy();
    // Missing `steps` entirely must fail validation.
    const withoutSteps = capturedSchema.safeParse({
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
    });
    expect(withoutSteps.success).toBe(false);

    // Fewer than 2 steps must fail validation.
    const tooFewSteps = capturedSchema.safeParse({
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
      steps: ['Only one step'],
    });
    expect(tooFewSteps.success).toBe(false);

    // 2+ steps must pass validation.
    const validSteps = capturedSchema.safeParse({
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
      steps: ['Greet the baker', 'Order a baguette'],
    });
    expect(validSteps.success).toBe(true);
  });

  it('returns the AI-generated steps in the parsed JSON result', async () => {
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    const aiSteps = ['Greet the baker', 'Ask for a baguette', 'Order two croissants', 'Pay the total'];
    mockInvoke.mockResolvedValue({
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
      steps: aiSteps,
    });

    const result = await processScenarioDescriptionOpenAI('I went to a bakery and bought bread');
    const parsed = JSON.parse(result);

    expect(parsed.steps).toEqual(aiSteps);
  });

  it('falls back to an empty steps array (not undefined) when the OpenAI call fails', async () => {
    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    mockInvoke.mockRejectedValue(new Error('network error'));

    const result = await processScenarioDescriptionOpenAI('a scenario description');
    const parsed = JSON.parse(result);

    expect(parsed.steps).toEqual([]);
    // Existing fallback fields must still be present.
    expect(typeof parsed.summary).toBe('string');
    expect(parsed.characters).toEqual([]);
  });
});
