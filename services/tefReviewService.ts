import { GoogleGenAI, Type } from '@google/genai';
import { getApiKeyOrEnv } from './apiKeyService';
import type { Message, TefObjectionState, TefReview } from '../types';

import sectionAGuide from '../data/tef-guides/section-a-prise-dinformation.md?raw';
import sectionBGuide from '../data/tef-guides/section-b-argumentation.md?raw';
import tefOverallGuide from '../data/tef-guides/tef-canada-expression-orale.md?raw';

// ---------------------------------------------------------------------------
// AI initialization (same pattern as geminiService.ts)
// ---------------------------------------------------------------------------

let ai: GoogleGenAI | null = null;

function ensureAiInitialized(): void {
  if (!ai) {
    const apiKey = getApiKeyOrEnv('gemini');
    if (!apiKey) {
      throw new Error('Missing Gemini API Key');
    }
    try {
      ai = new GoogleGenAI({ apiKey });
    } catch {
      // Fallback for test environments where GoogleGenAI is mocked as a plain function
      ai = (GoogleGenAI as unknown as (opts: { apiKey: string }) => GoogleGenAI)({ apiKey });
    }
  }
}

// ---------------------------------------------------------------------------
// Audio fetching helper
// ---------------------------------------------------------------------------

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
        // dataUrl is "data:<mimeType>;base64,<base64>"
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

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function generateTefReview(params: {
  exerciseType: 'questioning' | 'persuasion';
  messages: Message[];
  adSummary?: string;
  objectionState?: TefObjectionState | null;
  elapsedSeconds: number;
  signal?: AbortSignal;
}): Promise<TefReview | null> {
  const { exerciseType, messages, adSummary, objectionState, elapsedSeconds, signal } = params;

  ensureAiInitialized();

  // Build prompt parts
  type Part =
    | { text: string }
    | { inlineData: { data: string; mimeType: string } };

  const parts: Part[] = [];

  // Guide content
  const guideContent =
    exerciseType === 'questioning'
      ? `${tefOverallGuide}\n\n${sectionAGuide}`
      : `${tefOverallGuide}\n\n${sectionBGuide}`;

  // Preamble
  const exerciseLabel =
    exerciseType === 'questioning'
      ? 'TEF Section A – Prise d\'information (questioning a customer service agent about an advertisement)'
      : 'TEF Section B – Argumentation (persuading a skeptical friend about an advertisement)';

  let preamble = `You are an expert French language evaluator specialising in TEF Canada oral expression assessments.

EXERCISE TYPE: ${exerciseLabel}
ELAPSED TIME: ${elapsedSeconds} seconds
TARGET LEVEL: C1 (minimum acceptable: B2)

TEF EVALUATION GUIDES:
${guideContent}
`;

  if (adSummary) {
    preamble += `\nADVERTISEMENT CONTEXT:\n${adSummary}\n`;
  }

  if (exerciseType === 'persuasion' && objectionState) {
    const directionsAddressed = Math.min(objectionState.currentDirection + 1, 5);
    preamble += `\nPERSUASION SESSION CONTEXT:
- Directions addressed: ${directionsAddressed} / 5
- Current direction index: ${objectionState.currentDirection}
- isConvinced: ${objectionState.isConvinced}
- The user was${objectionState.isConvinced ? '' : ' not'} convinced by the end of the session.\n`;
  }

  preamble += `
AUDIO NOTE: Audio recordings are the primary source for evaluating speech quality (pronunciation, fluency, spontaneous grammar). Use the transcript as a reference guide. Where they conflict, trust the audio.

CONVERSATION TRANSCRIPT:
`;

  parts.push({ text: preamble });

  // Process messages
  if (messages.length === 0) {
    parts.push({ text: '[No conversation turns recorded. The user did not speak during this session.]' });
  } else {
    for (const message of messages) {
      if (message.role === 'user') {
        const audioUrl = typeof message.audioUrl === 'string' ? message.audioUrl : undefined;

        if (audioUrl) {
          const audioData = await fetchAudioAsInlineData(audioUrl, signal);
          if (audioData) {
            parts.push({
              inlineData: { data: audioData.base64, mimeType: audioData.mimeType },
            });
            parts.push({ text: `[Transcript of above: ${message.text}]` });
          } else {
            // Fallback to transcript only
            parts.push({ text: `[User said (transcript only — audio unavailable): ${message.text}]` });
          }
        } else {
          parts.push({ text: `[User said (transcript only): ${message.text}]` });
        }
      } else {
        // Model/agent turn
        const agentText = (message as Message & { frenchText?: string }).frenchText || message.text;
        parts.push({ text: `[Agent said: ${agentText}]` });
      }
    }
  }

  // Epilogue with evaluation instructions
  const epilogue = `

EVALUATION INSTRUCTIONS:
Based on the conversation above, provide a structured CEFR evaluation. Assess the user's spoken French on:
1. CEFR level (B1, B2, C1, or C2) with a 1–2 sentence justification
2. What the user did well (concrete positive observations)
3. Grammatical/lexical mistakes with corrections and explanations
4. Vocabulary improvements: suggest more precise or higher-register alternatives
5. Specific tips to reach or maintain C1 level

Return ONLY valid JSON matching the required schema. Do not include any markdown or explanation outside the JSON.`;

  parts.push({ text: epilogue });

  // Bail out early if already aborted (before the expensive API call)
  if (signal?.aborted) return null;

  // API call
  let response: { text?: string };
  try {
    response = await ai!.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: [{ parts }],
      config: {
        responseMimeType: 'application/json',
        ...(signal ? { abortSignal: signal } : {}),
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cefrLevel: {
              type: Type.STRING,
              description: 'CEFR level (e.g. "B2", "C1")',
            },
            cefrJustification: {
              type: Type.STRING,
              description: '1-2 sentences explaining the level assessment',
            },
            wentWell: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of things the user did well',
            },
            mistakes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  correction: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ['original', 'correction', 'explanation'],
              },
              description: 'Grammatical/lexical mistakes with corrections',
            },
            vocabularySuggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  used: { type: Type.STRING },
                  better: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['used', 'better', 'reason'],
              },
              description: 'Vocabulary improvements',
            },
            tipsForC1: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Tips to reach or maintain C1 level',
            },
          },
          required: [
            'cefrLevel',
            'cefrJustification',
            'wentWell',
            'mistakes',
            'vocabularySuggestions',
            'tipsForC1',
          ],
        },
      },
    });
  } catch (err) {
    // Treat intentional aborts as graceful cancellations — return null instead of throwing
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    if (err instanceof Error && err.name === 'AbortError') return null;
    throw err;
  }

  // Parse and validate
  const text = response.text || '';
  if (!text.trim()) {
    throw new Error('No response received from review generation');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse review response: ${msg}. Raw: ${text}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Review response is not an object');
  }

  const obj = parsed as Record<string, unknown>;

  const required = [
    'cefrLevel',
    'cefrJustification',
    'wentWell',
    'mistakes',
    'vocabularySuggestions',
    'tipsForC1',
  ] as const;

  for (const field of required) {
    if (!(field in obj)) {
      throw new Error(`Review response missing required field: "${field}"`);
    }
  }

  return obj as unknown as TefReview;
}
