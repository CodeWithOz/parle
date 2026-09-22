import type { Scenario } from '../../types';
import {
  ChatHistoryTurnsSchema,
  ImageAnalysisSchema,
  TranscribeCleanupSchema,
  selectGeminiResponseSchema,
  selectZodChatSchema,
} from '../../shared/chatSchemas';
import {
  audioResponseFormat,
  geminiCreateInteraction,
  generateContentPartsToInput,
  isMissingInteractionError,
  jsonResponseFormat,
  type InteractionContent,
  type InteractionHistoryStep,
  type InteractionInput,
} from '../gemini';
import {
  FREE_CONVERSATION_SYSTEM_INSTRUCTION,
  TEF_AD_IMAGE_PROMPT,
  TEF_QUESTIONING_IMAGE_PROMPT,
  TRANSCRIBE_AND_CLEANUP_PROMPT,
  TRANSCRIBE_EXACT_PROMPT,
  generateScenarioSystemInstruction,
  ttsSystemPrompt,
} from '../../shared/prompts';
import { isAbortLikeError } from '../../utils/isAbortLikeError';
import { GEMINI_CHAT_MODEL, GEMINI_TTS_MODEL, UPSTREAM_TIMEOUT_MS } from '../constants';
import { isAllowedOrigin } from '../csrf';
import { errorJson, isJsonContentType, json } from '../http';
import { requireGeminiSession, requireOpenaiSession, slidingSessionCookie } from '../session';
import { classifyProviderError } from '../upstream';
import { planScenarioWithOpenAI } from '../openai';
import { buildScenarioReviewParts } from '../prompts/scenarioReview';
import { buildTefReviewParts, validateTefReview } from '../prompts/tefReview';

type ChatHistoryTurn = {
  role: 'user' | 'model';
  text?: string;
  frenchText?: string;
  audioBase64?: string;
  mimeType?: string;
};

const TRANSCRIBE_CLEANUP_SCHEMA = {
  type: 'object',
  properties: {
    rawTranscript: { type: 'string' },
    cleanedTranscript: { type: 'string' },
  },
  required: ['rawTranscript', 'cleanedTranscript'],
};

const SCENARIO_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          original: { type: 'string' },
          standard: { type: 'string' },
        },
        required: ['original', 'standard'],
      },
    },
  },
  required: ['items'],
};

function currentTurnContent(audioBase64: string, mimeType: string, contextText?: string): InteractionContent[] {
  const content: InteractionContent[] = [];
  if (contextText) content.push({ type: 'text', text: contextText });
  content.push({ type: 'audio', data: audioBase64, mime_type: mimeType });
  return content;
}

function historyToSteps(history: ChatHistoryTurn[]): InteractionHistoryStep[] {
  const steps: InteractionHistoryStep[] = [];
  for (const turn of history) {
    if (turn.role === 'user') {
      if (turn.audioBase64 && turn.mimeType) {
        steps.push({
          type: 'user_input',
          content: [{ type: 'audio', data: turn.audioBase64, mime_type: turn.mimeType }],
        });
      } else if (typeof turn.text === 'string') {
        steps.push({
          type: 'user_input',
          content: [{ type: 'text', text: turn.text }],
        });
      }
      continue;
    }
    steps.push({
      type: 'model_output',
      content: [{ type: 'text', text: turn.frenchText || turn.text || '' }],
    });
  }
  return steps;
}

function parseTurnsField(value: unknown, fieldName: string): ChatHistoryTurn[] | Response {
  if (value === undefined) return [];
  const parsed = ChatHistoryTurnsSchema.safeParse(value);
  if (!parsed.success) {
    return errorJson('VALIDATION_ERROR', 400, `Invalid ${fieldName}`);
  }
  return parsed.data;
}

function originDenied(): Response {
  return errorJson('FORBIDDEN', 403);
}

function abortSignal(request: Request): AbortSignal {
  const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  return request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  if (!isAllowedOrigin(request)) return originDenied();
  if (!isJsonContentType(request)) {
    return errorJson('VALIDATION_ERROR', 400, 'Content-Type must be application/json');
  }
  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null) {
      return errorJson('VALIDATION_ERROR', 400, 'Invalid JSON body');
    }
    return body as Record<string, unknown>;
  } catch {
    return errorJson('VALIDATION_ERROR', 400, 'Invalid JSON body');
  }
}

function cookieHeaders(setCookie?: string): HeadersInit | undefined {
  if (!setCookie) return undefined;
  const headers = new Headers();
  headers.append('Set-Cookie', setCookie);
  return headers;
}

function sessionError(
  reason: 'missing' | 'invalid' | 'missing_provider',
  setCookie?: string
): Response {
  if (reason === 'missing') {
    return errorJson('NO_API_KEY_SESSION', 401, undefined, cookieHeaders(setCookie));
  }
  if (reason === 'invalid') {
    return errorJson('INVALID_API_KEY_SESSION', 401, undefined, cookieHeaders(setCookie));
  }
  return errorJson('MISSING_PROVIDER_KEY', 401, 'This action needs a configured API key.', cookieHeaders(setCookie));
}

function mapCaught(err: unknown): Response {
  if (isAbortLikeError(err)) {
    return errorJson('UPSTREAM_ERROR', 504, 'The AI request was aborted.');
  }
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const mapped = err as { code: string; httpStatus?: number; message?: string };
    if (mapped.code === 'UPSTREAM_AUTH_FAILED' || mapped.code === 'UPSTREAM_ERROR') {
      return errorJson(
        mapped.code,
        mapped.httpStatus ?? (mapped.code === 'UPSTREAM_AUTH_FAILED' ? 401 : 502),
        mapped.message
      );
    }
  }
  try {
    const mapped = classifyProviderError(err);
    return errorJson(mapped.code, mapped.httpStatus, mapped.message);
  } catch (abortErr) {
    if (isAbortLikeError(abortErr)) {
      return errorJson('UPSTREAM_ERROR', 504, 'The AI request was aborted.');
    }
    return errorJson('INTERNAL_ERROR', 500);
  }
}

export async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('METHOD_NOT_ALLOWED', 405);
  const bodyOrErr = await readJsonBody(request);
  if (bodyOrErr instanceof Response) return bodyOrErr;
  const session = await requireGeminiSession(request, env);
  if (!session.ok) return sessionError(session.reason, session.setCookie);

  const audioBase64 = bodyOrErr.audioBase64;
  const mimeType = bodyOrErr.mimeType;
  const cleanup = bodyOrErr.cleanup === true;
  if (typeof audioBase64 !== 'string' || typeof mimeType !== 'string') {
    return errorJson('VALIDATION_ERROR', 400, 'audioBase64 and mimeType are required');
  }

  try {
    const interaction = await geminiCreateInteraction(
      session.geminiKey,
      {
        model: GEMINI_CHAT_MODEL,
        input: [
          { type: 'text', text: cleanup ? TRANSCRIBE_AND_CLEANUP_PROMPT : TRANSCRIBE_EXACT_PROMPT },
          { type: 'audio', data: audioBase64, mime_type: mimeType },
        ],
        store: false,
        ...(cleanup ? { responseFormat: jsonResponseFormat(TRANSCRIBE_CLEANUP_SCHEMA) } : {}),
      },
      abortSignal(request)
    );
    const text = interaction.outputText || '';
    if (!text.trim()) {
      return errorJson('UPSTREAM_ERROR', 502, 'Transcription returned empty text');
    }
    const setCookie = await slidingSessionCookie(session.payload, env, session.setCookie);
    if (cleanup) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return errorJson('UPSTREAM_ERROR', 502, 'Failed to parse transcription JSON');
      }
      const validated = TranscribeCleanupSchema.safeParse(parsed);
      if (!validated.success) {
        return errorJson('VALIDATION_ERROR', 502, 'Transcription JSON failed validation');
      }
      return json(validated.data, 200, cookieHeaders(setCookie));
    }
    return json({ text }, 200, cookieHeaders(setCookie));
  } catch (err) {
    return mapCaught(err);
  }
}

export async function handleChat(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('METHOD_NOT_ALLOWED', 405);
  const bodyOrErr = await readJsonBody(request);
  if (bodyOrErr instanceof Response) return bodyOrErr;
  const session = await requireGeminiSession(request, env);
  if (!session.ok) return sessionError(session.reason, session.setCookie);

  const audioBase64 = bodyOrErr.audioBase64;
  const mimeType = bodyOrErr.mimeType;
  if (typeof audioBase64 !== 'string' || typeof mimeType !== 'string') {
    return errorJson('VALIDATION_ERROR', 400, 'audioBase64 and mimeType are required');
  }
  const scenario = (bodyOrErr.scenario ?? null) as Scenario | null;
  const historyOrErr = parseTurnsField(bodyOrErr.history, 'history');
  if (historyOrErr instanceof Response) return historyOrErr;
  const history = historyOrErr;
  const contextText = typeof bodyOrErr.contextText === 'string' && bodyOrErr.contextText.trim()
    ? bodyOrErr.contextText
    : undefined;
  const previousInteractionId = typeof bodyOrErr.previousInteractionId === 'string' && bodyOrErr.previousInteractionId.trim()
    ? bodyOrErr.previousInteractionId.trim()
    : undefined;

  const systemInstruction = scenario
    ? generateScenarioSystemInstruction(scenario)
    : FREE_CONVERSATION_SYSTEM_INSTRUCTION;
  const responseSchema = selectGeminiResponseSchema(scenario);
  const zodSchema = selectZodChatSchema(scenario);

  const currentContent = currentTurnContent(audioBase64, mimeType, contextText);

  const runChat = (input: InteractionInput, previousId?: string) => geminiCreateInteraction(
    session.geminiKey,
    {
      model: GEMINI_CHAT_MODEL,
      input,
      systemInstruction,
      responseFormat: jsonResponseFormat(responseSchema),
      store: true,
      previousInteractionId: previousId,
    },
    abortSignal(request)
  );

  try {
    let interaction;
    try {
      if (previousInteractionId) {
        interaction = await runChat(currentContent, previousInteractionId);
      } else {
        const historySteps = historyToSteps(history);
        const input: InteractionInput = historySteps.length > 0
          ? [...historySteps, { type: 'user_input', content: currentContent }]
          : currentContent;
        interaction = await runChat(input);
      }
    } catch (err) {
      if (previousInteractionId && isMissingInteractionError(err)) {
        if (history.length > 0) {
          interaction = await runChat(
            [...historyToSteps(history), { type: 'user_input', content: currentContent }]
          );
        } else {
          return errorJson('INTERACTION_NOT_FOUND', 404, 'Previous interaction was not found');
        }
      } else {
        throw err;
      }
    }

    const raw = interaction.outputText;
    if (!raw) {
      return errorJson('UPSTREAM_ERROR', 502, 'No text response received from chat model.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return errorJson('VALIDATION_ERROR', 502, 'Model response was not valid JSON');
    }
    const validated = zodSchema.safeParse(parsed);
    if (!validated.success) {
      return errorJson('VALIDATION_ERROR', 502, `Model response failed schema validation: ${validated.error.message}`);
    }
    const setCookie = await slidingSessionCookie(session.payload, env, session.setCookie);
    return json({ modelJson: validated.data, interactionId: interaction.id }, 200, cookieHeaders(setCookie));
  } catch (err) {
    return mapCaught(err);
  }
}

export async function handleTts(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('METHOD_NOT_ALLOWED', 405);
  const bodyOrErr = await readJsonBody(request);
  if (bodyOrErr instanceof Response) return bodyOrErr;
  const session = await requireGeminiSession(request, env);
  if (!session.ok) return sessionError(session.reason, session.setCookie);

  const text = bodyOrErr.text;
  const voiceName = bodyOrErr.voiceName;
  if (typeof text !== 'string' || !text.trim() || typeof voiceName !== 'string') {
    return errorJson('VALIDATION_ERROR', 400, 'text and voiceName are required');
  }

  try {
    const interaction = await geminiCreateInteraction(
      session.geminiKey,
      {
        model: GEMINI_TTS_MODEL,
        input: [{ type: 'text', text: ttsSystemPrompt(text) }],
        store: false,
        responseFormat: audioResponseFormat,
        speechVoice: voiceName.toLowerCase(),
      },
      abortSignal(request)
    );
    if (!interaction.outputAudioBase64) {
      return errorJson('UPSTREAM_ERROR', 502, 'No audio data received from TTS model');
    }
    const setCookie = await slidingSessionCookie(session.payload, env, session.setCookie);
    return json(
      { audioBase64: interaction.outputAudioBase64, mimeType: interaction.outputAudioMimeType || 'audio/pcm' },
      200,
      cookieHeaders(setCookie)
    );
  } catch (err) {
    return mapCaught(err);
  }
}

export async function handleTefAdConfirm(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('METHOD_NOT_ALLOWED', 405);
  const bodyOrErr = await readJsonBody(request);
  if (bodyOrErr instanceof Response) return bodyOrErr;
  const session = await requireGeminiSession(request, env);
  if (!session.ok) return sessionError(session.reason, session.setCookie);

  const imageBase64 = bodyOrErr.imageBase64;
  const mimeType = bodyOrErr.mimeType;
  const mode = bodyOrErr.mode === 'questioning' ? 'questioning' : 'persuasion';
  const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (typeof imageBase64 !== 'string' || typeof mimeType !== 'string') {
    return errorJson('VALIDATION_ERROR', 400, 'imageBase64 and mimeType are required');
  }
  if (!SUPPORTED.includes(mimeType)) {
    return errorJson('VALIDATION_ERROR', 400, `Unsupported image type "${mimeType}"`);
  }

  try {
    const interaction = await geminiCreateInteraction(
      session.geminiKey,
      {
        model: GEMINI_CHAT_MODEL,
        input: [
          { type: 'text', text: mode === 'questioning' ? TEF_QUESTIONING_IMAGE_PROMPT : TEF_AD_IMAGE_PROMPT },
          { type: 'image', data: imageBase64, mime_type: mimeType },
        ],
        store: false,
        responseFormat: jsonResponseFormat(),
      },
      abortSignal(request)
    );
    const text = interaction.outputText || '';
    if (!text.trim()) {
      return errorJson('UPSTREAM_ERROR', 502, 'No response received from image analysis');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return errorJson('VALIDATION_ERROR', 502, 'Image analysis response was not valid JSON');
    }
    const validated = ImageAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      return errorJson('VALIDATION_ERROR', 502, 'Image analysis response failed validation');
    }
    const setCookie = await slidingSessionCookie(session.payload, env, session.setCookie);
    return json(validated.data, 200, cookieHeaders(setCookie));
  } catch (err) {
    return mapCaught(err);
  }
}

export async function handleTefReview(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('METHOD_NOT_ALLOWED', 405);
  const bodyOrErr = await readJsonBody(request);
  if (bodyOrErr instanceof Response) return bodyOrErr;
  const session = await requireGeminiSession(request, env);
  if (!session.ok) return sessionError(session.reason, session.setCookie);

  const exerciseType = bodyOrErr.exerciseType === 'questioning' ? 'questioning' : bodyOrErr.exerciseType === 'persuasion' ? 'persuasion' : null;
  if (!exerciseType) {
    return errorJson('VALIDATION_ERROR', 400, 'exerciseType must be questioning or persuasion');
  }
  const elapsedSeconds = typeof bodyOrErr.elapsedSeconds === 'number' ? bodyOrErr.elapsedSeconds : 0;
  const adSummary = typeof bodyOrErr.adSummary === 'string' ? bodyOrErr.adSummary : undefined;
  const turnsOrErr = parseTurnsField(bodyOrErr.turns, 'turns');
  if (turnsOrErr instanceof Response) return turnsOrErr;
  const turns = turnsOrErr;

  try {
    const { parts, responseSchema } = buildTefReviewParts({
      exerciseType,
      elapsedSeconds,
      adSummary,
      turns,
    });
    const interaction = await geminiCreateInteraction(
      session.geminiKey,
      {
        model: GEMINI_CHAT_MODEL,
        input: generateContentPartsToInput(parts),
        store: false,
        responseFormat: jsonResponseFormat(responseSchema),
      },
      abortSignal(request)
    );
    const text = interaction.outputText || '';
    if (!text.trim()) {
      return errorJson('UPSTREAM_ERROR', 502, 'No response received from review generation');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return errorJson('VALIDATION_ERROR', 502, 'Review response was not valid JSON');
    }
    const review = validateTefReview(parsed, exerciseType);
    const setCookie = await slidingSessionCookie(session.payload, env, session.setCookie);
    return json(review, 200, cookieHeaders(setCookie));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Review response')) {
      return errorJson('VALIDATION_ERROR', 502, err.message);
    }
    return mapCaught(err);
  }
}

export async function handleScenarioReview(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('METHOD_NOT_ALLOWED', 405);
  const bodyOrErr = await readJsonBody(request);
  if (bodyOrErr instanceof Response) return bodyOrErr;
  const session = await requireGeminiSession(request, env);
  if (!session.ok) return sessionError(session.reason, session.setCookie);

  const turnsOrErr = parseTurnsField(bodyOrErr.turns, 'turns');
  if (turnsOrErr instanceof Response) return turnsOrErr;
  const turns = turnsOrErr;
  const hasUser = turns.some((turn) => turn.role === 'user');
  if (!hasUser) {
    const setCookie = await slidingSessionCookie(session.payload, env, session.setCookie);
    return json({ items: [] }, 200, cookieHeaders(setCookie));
  }

  try {
    const parts = buildScenarioReviewParts({
      turns,
      scenarioName: typeof bodyOrErr.scenarioName === 'string' ? bodyOrErr.scenarioName : undefined,
      scenarioDescription: typeof bodyOrErr.scenarioDescription === 'string' ? bodyOrErr.scenarioDescription : undefined,
    });
    const interaction = await geminiCreateInteraction(
      session.geminiKey,
      {
        model: GEMINI_CHAT_MODEL,
        input: generateContentPartsToInput(parts),
        store: false,
        responseFormat: jsonResponseFormat(SCENARIO_REVIEW_SCHEMA),
      },
      abortSignal(request)
    );
    const text = interaction.outputText || '';
    if (!text.trim()) {
      return errorJson('UPSTREAM_ERROR', 502, 'No response received from role-play review generation');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return errorJson('VALIDATION_ERROR', 502, 'Role-play review response was not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { items?: unknown }).items)) {
      return errorJson('VALIDATION_ERROR', 502, 'Role-play review response missing required field: "items"');
    }
    const setCookie = await slidingSessionCookie(session.payload, env, session.setCookie);
    return json(parsed, 200, cookieHeaders(setCookie));
  } catch (err) {
    return mapCaught(err);
  }
}

export async function handleScenarioPlan(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('METHOD_NOT_ALLOWED', 405);
  const bodyOrErr = await readJsonBody(request);
  if (bodyOrErr instanceof Response) return bodyOrErr;
  const session = await requireOpenaiSession(request, env);
  if (!session.ok) return sessionError(session.reason, session.setCookie);
  const description = bodyOrErr.description;
  if (typeof description !== 'string' || !description.trim()) {
    return errorJson('VALIDATION_ERROR', 400, 'description is required');
  }
  try {
    const result = await planScenarioWithOpenAI(session.openaiKey, description, abortSignal(request));
    const setCookie = await slidingSessionCookie(session.payload, env, session.setCookie);
    return json({ result }, 200, cookieHeaders(setCookie));
  } catch (err) {
    return mapCaught(err);
  }
}
