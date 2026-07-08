import { GoogleGenAI, Type } from '@google/genai';
import { getApiKeyOrEnv } from './apiKeyService';
import { isAbortLikeError } from '../utils/isAbortLikeError';
import type { Message, ScenarioStandardizationReview } from '../types';

let ai: GoogleGenAI | null = null;

function ensureAiInitialized(): void {
  if (!ai) {
    const apiKey = getApiKeyOrEnv('gemini');
    if (!apiKey) {
      throw new Error('Missing Gemini API Key');
    }
    ai = new GoogleGenAI({ apiKey });
  }
}

async function fetchAudioAsInlineData(
  url: string,
  signal?: AbortSignal
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(url, signal ? { signal } : undefined);
    if (signal?.aborted) return null;
    const blob = await response.blob();
    const mimeType = blob.type || 'audio/wav';

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateScenarioStandardizationReview(params: {
  messages: Message[];
  scenarioName?: string;
  scenarioDescription?: string;
  signal?: AbortSignal;
}): Promise<ScenarioStandardizationReview | null> {
  const { messages, scenarioName, scenarioDescription, signal } = params;

  ensureAiInitialized();

  type Part =
    | { text: string }
    | { inlineData: { data: string; mimeType: string } };

  const parts: Part[] = [];
  const userMessages = messages.filter((message) => message.role === 'user');

  if (userMessages.length === 0) {
    return { items: [] };
  }

  let preamble = `You are reviewing a French role-play conversation.

TASK:
Identify only the user's spoken French turns where the idea was understandable but there is a more standard, established, or idiomatic way to express the same idea in French.

STRICT SCOPE:
- Evaluate only the user's recorded audio turns.
- Use the user's audio as the canonical source for what they said.
- The user's transcript text is only a fallback when audio cannot be fetched.
- Agent turns are context only. Do not evaluate the agent. Do not rewrite the agent.
- Do not give grammar lessons, explanations, CEFR levels, recommendations, or corrections outside the requested rewrites.
- Do not rewrite every sentence. Include only the turns that genuinely sound non-standard or less idiomatic.
- For each selected item, keep the meaning the same and rewrite it in natural, standard French.
- If every user turn already sounds standard enough, return an empty items array.
`;

  if (scenarioName) {
    preamble += `\nSCENARIO NAME: ${scenarioName}`;
  }
  if (scenarioDescription) {
    preamble += `\nSCENARIO CONTEXT: ${scenarioDescription}`;
  }

  preamble += `\n\nCONVERSATION:\n`;
  parts.push({ text: preamble });

  for (const message of messages) {
    if (message.role === 'user') {
      const audioUrl = typeof message.audioUrl === 'string' ? message.audioUrl : undefined;

      if (audioUrl) {
        const audioData = await fetchAudioAsInlineData(audioUrl, signal);
        if (audioData) {
          parts.push({
            inlineData: { data: audioData.base64, mimeType: audioData.mimeType },
          });
          continue;
        }
      }

      parts.push({ text: `[User said (transcript fallback only): ${message.text}]` });
      continue;
    }

    const agentText = message.frenchText || message.text;
    parts.push({ text: `[Agent said: ${agentText}]` });
  }

  parts.push({
    text: `
Return ONLY valid JSON matching the required schema:
{
  "items": [
    {
      "original": "what the user said",
      "standard": "a more standard French way to express the same idea"
    }
  ]
}
`,
  });

  if (signal?.aborted) return null;

  let response: { text?: string };
  try {
    response = await ai!.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [{ parts }],
      config: {
        responseMimeType: 'application/json',
        ...(signal ? { abortSignal: signal } : {}),
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  standard: { type: Type.STRING },
                },
                required: ['original', 'standard'],
              },
            },
          },
          required: ['items'],
        },
      },
    });
  } catch (err) {
    if (isAbortLikeError(err)) return null;
    throw err;
  }

  const text = response.text || '';
  if (!text.trim()) {
    throw new Error('No response received from role-play review generation');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse role-play review response: ${msg}. Raw: ${text}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Role-play review response is not an object');
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.items)) {
    throw new Error('Role-play review response missing required field: "items"');
  }

  for (let i = 0; i < obj.items.length; i++) {
    const item = obj.items[i];
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Role-play review response field "items[${i}]" must be an object`);
    }
    const itemObj = item as Record<string, unknown>;
    if (typeof itemObj.original !== 'string' || itemObj.original.trim() === '') {
      throw new Error(`Role-play review response field "items[${i}].original" must be a non-empty string`);
    }
    if (typeof itemObj.standard !== 'string' || itemObj.standard.trim() === '') {
      throw new Error(`Role-play review response field "items[${i}].standard" must be a non-empty string`);
    }
  }

  return obj as ScenarioStandardizationReview;
}
