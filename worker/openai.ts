import { OPENAI_PLAN_MODEL, UPSTREAM_TIMEOUT_MS } from './constants';
import { classifyHttpStatus } from './upstream';
import { ScenarioSummarySchema } from '../shared/chatSchemas';
import { generateScenarioSummaryPrompt } from '../shared/prompts';

export async function planScenarioWithOpenAI(
  apiKey: string,
  description: string,
  signal?: AbortSignal
): Promise<string> {
  const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: combined,
    body: JSON.stringify({
      model: OPENAI_PLAN_MODEL,
      messages: [{ role: 'user', content: generateScenarioSummaryPrompt(description) }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'scenario_summary',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              characters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    role: { type: 'string' },
                  },
                  required: ['name', 'role'],
                  additionalProperties: false,
                },
              },
              steps: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['summary', 'characters', 'steps'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    const mapped = classifyHttpStatus(response.status, bodyText);
    throw Object.assign(new Error('openai_plan_failed'), mapped);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw Object.assign(new Error('openai_empty'), {
      code: 'UPSTREAM_ERROR',
      httpStatus: 502,
      message: 'The AI provider could not complete this request.',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return JSON.stringify({ summary: content, characters: [], steps: [] });
  }

  const validated = ScenarioSummarySchema.safeParse(parsed);
  if (!validated.success) {
    return JSON.stringify({
      summary: 'I understand the scenario. Ready to begin when you are!',
      characters: [],
      steps: [],
    });
  }
  return JSON.stringify(validated.data);
}
