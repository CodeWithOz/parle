import { GoogleGenAI, Type } from '@google/genai';
import { getApiKeyOrEnv } from './apiKeyService';
import type { Message, TefReview } from '../types';

// ---------------------------------------------------------------------------
// Synthesized TEF evaluation guidance
// Distilled from the official test guides — only what matters for review.
// ---------------------------------------------------------------------------

const SECTION_A_GUIDANCE = `TEF Canada Oral Expression — Section A: Prise d'information (5 minutes)

WHAT THE TEST EXPECTS:
Ask approximately 10 questions about a classified ad over the phone to a customer service representative. Evaluators assess linguistic skills only — grammar, vocabulary variety, pronunciation, and fluency. The relevance of questions is not graded.

EVALUATION CRITERIA:
- Question formation: correct subject-verb inversion (Habite-t-il ? Va-t-elle ?) or "est-ce que" structure
- Range of interrogative adverbs: quoi/que, qui, quand, où, comment
- Fluency and spontaneity: ability to react to answers and sustain a natural conversation
- Vocabulary breadth: varied and accurate rather than repetitive simple phrases

WHAT EXAMINERS LOOK FOR (tips from the test creators):
- Avoid questions learnt by heart — examiners notice and penalise recitation
- React to the agent's answers to demonstrate comprehension and conversational flexibility
- Aim for a flowing conversation, not 10 isolated questions fired in sequence
- The priority is fluent speech with varied vocabulary`;

const SECTION_B_GUIDANCE = `TEF Canada Oral Expression — Section B: Argumentation (10 minutes)

WHAT THE TEST EXPECTS:
Present a classified ad to a skeptical friend and argue to convince them to participate. Evaluators assess how clearly you present, how persuasively you argue, how well you structure reasoning, and how fluently you adapt to the conversation.

EVALUATION CRITERIA:
- Argumentation vocabulary: verbs of advice (je te conseille de, je te recommande de, je te propose de) and linking words (parce que, car, donc, c'est pourquoi, en effet, d'ailleurs, de plus)
- Use of document context: extract and rephrase information from the ad — do NOT recite it verbatim
- Persuasive structure: arguments that address the friend's situation and objections directly
- Fluency and naturalness in conversation
- Variety and accuracy of vocabulary and sentence structures

WHAT EXAMINERS LOOK FOR (tips from the test creators):
- This is NOT a reading test — rephrase the ad's content, never recite it word for word
- Tailor arguments to the friend's specific context (their interests, situation)
- Justify claims with linking words and reasons, not bare assertions
- Demonstrate understanding of the instructions by adapting to your conversation partner`;

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
  elapsedSeconds: number;
  signal?: AbortSignal;
}): Promise<TefReview | null> {
  const { exerciseType, messages, adSummary, elapsedSeconds, signal } = params;

  ensureAiInitialized();

  // Build prompt parts
  type Part =
    | { text: string }
    | { inlineData: { data: string; mimeType: string } };

  const parts: Part[] = [];

  // Preamble
  const exerciseLabel =
    exerciseType === 'questioning'
      ? 'TEF Section A – Prise d\'information (questioning a customer service agent about an advertisement)'
      : 'TEF Section B – Argumentation (persuading a skeptical friend about an advertisement)';

  const sectionGuidance = exerciseType === 'questioning' ? SECTION_A_GUIDANCE : SECTION_B_GUIDANCE;

  let preamble = `You are an expert French language evaluator specialising in TEF Canada oral expression assessments.

EXERCISE TYPE: ${exerciseLabel}
ELAPSED TIME: ${elapsedSeconds} seconds
TARGET LEVEL: C1

${sectionGuidance}
`;

  if (adSummary) {
    preamble += `\nADVERTISEMENT CONTEXT:\n${adSummary}\n`;
  }

  if (exerciseType === 'persuasion') {
    preamble += `
PERSUASION CRITERIA TO EVALUATE (assess each explicitly in the criteriaEvaluation field):
1. Clear & interesting presentation — Did the user present the advertisement clearly and in an engaging way?
2. Argumentation vocabulary — Did the user use advice verbs (je vous conseille, il faudrait que) and linking words (en revanche, de plus, car, donc, c'est pourquoi)?
3. 3+ distinct arguments — Did the user raise more than three distinct arguments?
4. Arguments developed with examples — Did the user support each argument with a concrete example?
5. Nuanced / counter-arguments — Did the user nuance their position or address counter-arguments?
`;
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
            // Audio available — send only the audio; no transcript to avoid misleading the model
            parts.push({
              inlineData: { data: audioData.base64, mimeType: audioData.mimeType },
            });
          } else {
            // Audio fetch failed — fall back to transcript only
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
1. CEFR level (A1, A2, B1, B2, C1, or C2) with a 1–2 sentence justification
2. What the user did well (concrete positive observations)
3. Grammatical/lexical mistakes with corrections and explanations
4. Vocabulary improvements: suggest at least 5 more precise or higher-register alternatives

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
              description: 'CEFR level (one of "A1", "A2", "B1", "B2", "C1", "C2")',
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
              description: 'Vocabulary improvements — provide at least 5 suggestions',
            },
            ...(exerciseType === 'persuasion' ? {
              criteriaEvaluation: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    criterion: { type: Type.STRING, description: 'Name of the criterion' },
                    met: { type: Type.BOOLEAN, description: 'Whether the criterion was met' },
                    evidence: { type: Type.STRING, description: 'Evidence from the conversation supporting the assessment' },
                  },
                  required: ['criterion', 'met', 'evidence'],
                },
                description: 'Assessment of each of the 5 TEF persuasion criteria',
              },
            } : {}),
          },
          required: [
            'cefrLevel',
            'cefrJustification',
            'wentWell',
            'mistakes',
            'vocabularySuggestions',
            ...(exerciseType === 'persuasion' ? ['criteriaEvaluation'] : []),
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
  ] as const;

  for (const field of required) {
    if (!(field in obj)) {
      throw new Error(`Review response missing required field: "${field}"`);
    }
  }

  if (exerciseType === 'persuasion' && !Array.isArray(obj['criteriaEvaluation'])) {
    throw new Error('Review response missing required field: "criteriaEvaluation"');
  }

  if (!Array.isArray(obj['vocabularySuggestions'])) {
    throw new Error(
      `Review response field "vocabularySuggestions" has invalid type: expected array, got ${typeof obj['vocabularySuggestions']}`
    );
  }

  return obj as unknown as TefReview;
}
