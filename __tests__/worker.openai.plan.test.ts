import { describe, expect, it, vi, afterEach } from 'vitest';
import { planScenarioWithOpenAI } from '../worker/openai';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function openaiResponse(content: unknown, status = 200): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('planScenarioWithOpenAI', () => {
  it('throws UPSTREAM_ERROR 502 when the model JSON fails ScenarioSummarySchema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => openaiResponse({
      summary: 'A bakery visit',
      characters: [],
      steps: [],
    })));

    await expect(planScenarioWithOpenAI('sk-test-openai-key-123456', 'bakery')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      httpStatus: 502,
    });
  });

  it('throws UPSTREAM_ERROR 502 when the model content is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => openaiResponse('not-json')));

    await expect(planScenarioWithOpenAI('sk-test-openai-key-123456', 'bakery')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      httpStatus: 502,
    });
  });

  it('returns validated JSON when the schema matches', async () => {
    const payload = {
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
      steps: ['Greet the baker', 'Order a baguette'],
    };
    vi.stubGlobal('fetch', vi.fn(async () => openaiResponse(payload)));

    const result = await planScenarioWithOpenAI('sk-test-openai-key-123456', 'bakery');
    expect(JSON.parse(result)).toEqual(payload);
  });
});
