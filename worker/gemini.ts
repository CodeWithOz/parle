import { GoogleGenAI, Modality, Type } from '@google/genai';
import { GEMINI_CHAT_MODEL, GEMINI_TTS_MODEL, UPSTREAM_TIMEOUT_MS } from './constants';
import { classifyProviderError } from './upstream';

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export async function geminiGenerateContent(
  apiKey: string,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  signal?: AbortSignal
) {
  const ai = createGeminiClient(apiKey);
  try {
    return await ai.models.generateContent({
      ...params,
      config: {
        ...(params.config ?? {}),
        abortSignal: signal,
      },
    });
  } catch (err) {
    throw Object.assign(new Error('gemini_generate_failed'), classifyProviderError(err), { cause: err });
  }
}

export { GEMINI_CHAT_MODEL, GEMINI_TTS_MODEL, UPSTREAM_TIMEOUT_MS, Modality, Type };
