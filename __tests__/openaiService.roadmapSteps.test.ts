/**
 * Scenario planning now goes through POST /api/scenario-plan.
 * The Worker validates with ScenarioSummarySchema (2–8 steps).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScenarioSummarySchema } from '../shared/chatSchemas';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('AI-generated scenario roadmap steps (services/openaiService.ts)', () => {
  it('requires a `steps` array of at least 2 entries in the shared schema', () => {
    const withoutSteps = ScenarioSummarySchema.safeParse({
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
    });
    expect(withoutSteps.success).toBe(false);

    const tooFewSteps = ScenarioSummarySchema.safeParse({
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
      steps: ['Only one step'],
    });
    expect(tooFewSteps.success).toBe(false);

    const validSteps = ScenarioSummarySchema.safeParse({
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
      steps: ['Greet the baker', 'Order a baguette'],
    });
    expect(validSteps.success).toBe(true);
  });

  it('returns the AI-generated steps in the parsed JSON result', async () => {
    const aiSteps = ['Greet the baker', 'Ask for a baguette', 'Order two croissants', 'Pay the total'];
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        result: JSON.stringify({
          summary: 'A trip to the bakery.',
          characters: [{ name: 'Baker', role: 'baker' }],
          steps: aiSteps,
        }),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    const result = await processScenarioDescriptionOpenAI('I went to a bakery and bought bread');
    const parsed = JSON.parse(result);
    expect(parsed.steps).toEqual(aiSteps);
  });

  it('propagates a 502 UPSTREAM_ERROR instead of returning empty characters and steps', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'UPSTREAM_ERROR' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { processScenarioDescriptionOpenAI } = await import('../services/openaiService');
    await expect(processScenarioDescriptionOpenAI('a scenario description')).rejects.toMatchObject({
      name: 'BffError',
      code: 'UPSTREAM_ERROR',
      httpStatus: 502,
    });
  });
});
