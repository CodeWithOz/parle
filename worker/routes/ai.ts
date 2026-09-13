import { GoogleGenAI, Modality, Type } from '@google/genai';
import type { Scenario } from '../../types';
import { ImageAnalysisSchema, TranscribeCleanupSchema, selectGeminiResponseSchema, selectZodChatSchema } from '../../shared/chatSchemas';
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
    const ai = new GoogleGenAI({ apiKey: session.geminiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_CHAT_MODEL,
      contents: [{
        parts: [
          { text: cleanup ? TRANSCRIBE_AND_CLEANUP_PROMPT : TRANSCRIBE_EXACT_PROMPT },
          { inlineData: { data: audioBase64, mimeType } },
        ],
      }],
      config: {
        abortSignal: abortSignal(request),
        ...(cleanup
          ? {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  rawTranscript: { type: Type.STRING },
                  cleanedTranscript: { type: Type.STRING },
                },
                required: ['rawTranscript', 'cleanedTranscript'],
              },
            }
          : {}),
      },
    });
    const text = response.text || '';
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
  const history = Array.isArray(bodyOrErr.history) ? bodyOrErr.history as ChatHistoryTurn[] : [];
  const contextText = typeof bodyOrErr.contextText === 'string' && bodyOrErr.contextText.trim()
    ? bodyOrErr.contextText
    : undefined;

  const historyMessages: Array<{ role: string; parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> }> = [];
  for (const turn of history) {
    if (turn.role === 'user') {
      if (turn.audioBase64 && turn.mimeType) {
        historyMessages.push({
          role: 'user',
          parts: [{ inlineData: { data: turn.audioBase64, mimeType: turn.mimeType } }],
        });
      } else if (typeof turn.text === 'string') {
        historyMessages.push({ role: 'user', parts: [{ text: turn.text }] });
      }
    } else {
      const modelText = turn.frenchText || turn.text || '';
      historyMessages.push({ role: 'model', parts: [{ text: modelText }] });
    }
  }

  const systemInstruction = scenario
    ? generateScenarioSystemInstruction(scenario)
    : FREE_CONVERSATION_SYSTEM_INSTRUCTION;
  const responseSchema = selectGeminiResponseSchema(scenario);
  const zodSchema = selectZodChatSchema(scenario);

  try {
    const ai = new GoogleGenAI({ apiKey: session.geminiKey });
    const signal = abortSignal(request);
    const chat = ai.chats.create({
      model: GEMINI_CHAT_MODEL,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
        abortSignal: signal,
      },
      ...(historyMessages.length > 0 ? { history: historyMessages } : {}),
    });

    const messageParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
    if (contextText) messageParts.push({ text: contextText });
    messageParts.push({ inlineData: { data: audioBase64, mimeType } });

    const chatResponse = await chat.sendMessage({
      message: messageParts,
      config: {
        abortSignal: signal,
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    const raw = chatResponse.text;
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
    return json({ modelJson: validated.data }, 200, cookieHeaders(setCookie));
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
    const ai = new GoogleGenAI({ apiKey: session.geminiKey });
    const ttsResponse = await ai.models.generateContent({
      model: GEMINI_TTS_MODEL,
      contents: [{ parts: [{ text: ttsSystemPrompt(text) }] }],
      config: {
        abortSignal: abortSignal(request),
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName.toLowerCase() },
          },
        },
      },
    });
    const audioPart = ttsResponse.candidates?.[0]?.content?.parts?.find((part) => part.inlineData);
    if (!audioPart?.inlineData?.data) {
      return errorJson('UPSTREAM_ERROR', 502, 'No audio data received from TTS model');
    }
    const setCookie = await slidingSessionCookie(session.payload, env, session.setCookie);
    return json(
      { audioBase64: audioPart.inlineData.data, mimeType: audioPart.inlineData.mimeType || 'audio/pcm' },
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
    const ai = new GoogleGenAI({ apiKey: session.geminiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_CHAT_MODEL,
      contents: [{
        parts: [
          { text: mode === 'questioning' ? TEF_QUESTIONING_IMAGE_PROMPT : TEF_AD_IMAGE_PROMPT },
          { inlineData: { data: imageBase64, mimeType } },
        ],
      }],
      config: {
        abortSignal: abortSignal(request),
        responseMimeType: 'application/json',
      },
    });
    const text = response.text || '';
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
  const turns = Array.isArray(bodyOrErr.turns) ? bodyOrErr.turns : [];

  try {
    const { parts, responseSchema } = buildTefReviewParts({
      exerciseType,
      elapsedSeconds,
      adSummary,
      turns,
    });
    const ai = new GoogleGenAI({ apiKey: session.geminiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_CHAT_MODEL,
      contents: [{ parts }],
      config: {
        abortSignal: abortSignal(request),
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
    const text = response.text || '';
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

  const turns = Array.isArray(bodyOrErr.turns) ? bodyOrErr.turns : [];
  const hasUser = turns.some((turn) => typeof turn === 'object' && turn && (turn as { role?: string }).role === 'user');
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
    const ai = new GoogleGenAI({ apiKey: session.geminiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_CHAT_MODEL,
      contents: [{ parts }],
      config: {
        abortSignal: abortSignal(request),
        responseMimeType: 'application/json',
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
    const text = response.text || '';
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
