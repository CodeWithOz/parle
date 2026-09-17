import { OPENAI_PLAN_MODEL, UPSTREAM_TIMEOUT_MS } from './constants';
import { classifyHttpStatus, UPSTREAM_GENERIC_MESSAGE } from './upstream';
import { ScenarioSummarySchema } from '../shared/chatSchemas';
import { generateScenarioSummaryPrompt } from '../shared/prompts';

function upstreamPlanError(): never {
  throw Object.assign(new Error('openai_plan_failed'), {
    code: 'UPSTREAM_ERROR',
    httpStatus: 502,
    message: UPSTREAM_GENERIC_MESSAGE,
  });
}

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
    upstreamPlanError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content as string);
  } catch {
    upstreamPlanError();
  }

  const validated = ScenarioSummarySchema.safeParse(parsed);
  if (!validated.success) {
    upstreamPlanError();
  }
  return JSON.stringify(validated.data);
}
