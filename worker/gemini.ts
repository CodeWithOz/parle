import { GoogleGenAI } from '@google/genai';
import { GEMINI_CHAT_MODEL, GEMINI_TTS_MODEL, UPSTREAM_TIMEOUT_MS } from './constants';

export type InteractionContent =
  | { type: 'text'; text: string }
  | { type: 'audio'; data: string; mime_type: string }
  | { type: 'image'; data: string; mime_type: string };

export type InteractionHistoryStep =
  | { type: 'user_input'; content: InteractionContent[] }
  | { type: 'model_output'; content: InteractionContent[] };

export type InteractionInput = InteractionContent[] | InteractionHistoryStep[];

export type JsonResponseFormat = {
  type: 'text';
  mime_type: 'application/json';
  schema?: Record<string, unknown>;
};

export type AudioResponseFormat = {
  type: 'audio';
};

export type GeminiInteractionParams = {
  model: string;
  input: InteractionInput;
  systemInstruction?: string;
  responseFormat?: JsonResponseFormat | AudioResponseFormat;
  speechVoice?: string;
  store?: boolean;
  previousInteractionId?: string;
};

export type GeminiInteractionResult = {
  id: string;
  outputText: string;
  outputAudioBase64?: string;
  outputAudioMimeType?: string;
};

type GenerateContentPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

export function jsonResponseFormat(schema?: object): JsonResponseFormat {
  return schema
    ? { type: 'text', mime_type: 'application/json', schema: schema as Record<string, unknown> }
    : { type: 'text', mime_type: 'application/json' };
}

export const audioResponseFormat: AudioResponseFormat = { type: 'audio' };

/** Interactions structured JSON is an array; a single object is not enforced by 2.5-flash-lite. */
export function toInteractionsCreateParams(params: GeminiInteractionParams) {
  return {
    model: params.model,
    input: params.input,
    system_instruction: params.systemInstruction,
    response_format: params.responseFormat?.type === 'text' ? [params.responseFormat] : params.responseFormat,
    generation_config: params.speechVoice
      ? { speech_config: [{ voice: params.speechVoice }] }
      : undefined,
    store: params.store ?? false,
    previous_interaction_id: params.previousInteractionId,
  };
}

export function generateContentPartsToInput(parts: GenerateContentPart[]): InteractionContent[] {
  return parts.map((part) => {
    if ('text' in part) {
      return { type: 'text', text: part.text };
    }
    return { type: 'audio', data: part.inlineData.data, mime_type: part.inlineData.mimeType };
  });
}

export function parseJsonFromModelText(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export function isMissingInteractionError(err: unknown): boolean {
  const status =
    typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (status === 404) return true;
  return /previous[_ ]interaction|interaction (id )?(not found|expired|unknown|invalid)|unknown interaction/i.test(text);
}

function extractOutputText(interaction: {
  output_text?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (typeof interaction.output_text === 'string' && interaction.output_text.trim()) {
    return interaction.output_text;
  }
  const steps = interaction.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue;
    const texts = step.content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string);
    if (texts.length > 0) return texts.join('');
  }
  return '';
}

function extractOutputAudio(interaction: {
  output_audio?: { data?: string; mime_type?: string };
  steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string; mime_type?: string }> }>;
}): { data?: string; mimeType?: string } {
  if (interaction.output_audio?.data) {
    return { data: interaction.output_audio.data, mimeType: interaction.output_audio.mime_type };
  }
  const steps = interaction.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue;
    const audio = step.content.find((block) => block.type === 'audio' && typeof block.data === 'string');
    if (audio?.data) {
      return { data: audio.data, mimeType: audio.mime_type };
    }
  }
  return {};
}

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export async function geminiCreateInteraction(
  apiKey: string,
  params: GeminiInteractionParams,
  signal?: AbortSignal
): Promise<GeminiInteractionResult> {
  const ai = createGeminiClient(apiKey);
  const interaction = await ai.interactions.create(
    toInteractionsCreateParams(params),
    signal ? { signal } : undefined
  );

  const audio = extractOutputAudio(interaction);
  return {
    id: interaction.id,
    outputText: extractOutputText(interaction),
    outputAudioBase64: audio.data,
    outputAudioMimeType: audio.mimeType,
  };
}

export { GEMINI_CHAT_MODEL, GEMINI_TTS_MODEL, UPSTREAM_TIMEOUT_MS };
