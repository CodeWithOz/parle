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

  it('asks gpt-5-nano for minimal reasoning and a 2-8 step schema', async () => {
    const fetchMock = vi.fn(async () => openaiResponse({
      summary: 'A trip to the bakery.',
      characters: [{ name: 'Baker', role: 'baker' }],
      steps: ['Greet the baker', 'Order a baguette'],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await planScenarioWithOpenAI('sk-test-openai-key-123456', 'bakery');

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.model).toBe('gpt-5-nano');
    expect(body.reasoning_effort).toBe('minimal');
    expect(body.response_format.json_schema.schema.properties.steps).toMatchObject({
      minItems: 2,
      maxItems: 8,
    });
    expect(body.response_format.json_schema.schema.properties.characters).toMatchObject({
      minItems: 1,
      maxItems: 5,
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
