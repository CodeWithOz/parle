import { pcmToWav, base64ToBytes } from './audioUtils';
import { VoiceResponse, Scenario, Message } from '../types';
import { addToHistory, getConversationHistory } from './conversationHistory';
import {
  FreeConversationSchema,
  ImageAnalysisSchema,
  RoadmapSingleCharacterSchema,
  TefQuestioningSchema,
  SingleCharacterSchema,
  createMultiCharacterSchema,
} from '../shared/chatSchemas';
import { fetchAudioAsInlineData } from '../utils/fetchAudioAsInlineData';
import { isAbortLikeError } from '../utils/isAbortLikeError';
import { bffFetch } from './bffClient';

const DEFAULT_PCM_SAMPLE_RATE = 24000;
const DEFAULT_PCM_CHANNELS = 1;

/** Wall-clock maximum (ms) for transcribe + chat + TTS in `sendVoiceMessage`. */
export const PIPELINE_MAX_MS = 90_000;

let activeScenario: Scenario | null = null;
let pendingScenario: Scenario | null = null;
let pendingHistory: Array<{ role: string; content: string }> | null = null;
let storedPriorMessages: Message[] = [];
let syncedMessageCount = 0;

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function unsupportedImageError(mimeType: string): Error {
  const typeLabels = SUPPORTED_IMAGE_TYPES.map((t) => t.replace('image/', '').toUpperCase()).join(', ');
  return new Error(`Unsupported image type "${mimeType}". Please use ${typeLabels}.`);
}

function collapseMessagesForChatHistory(messages: Message[]): Message[] {
  const collapsed: Message[] = [];
  for (const message of messages) {
    const last = collapsed[collapsed.length - 1];
    if (message.role === 'model' && last?.role === 'model') {
      collapsed[collapsed.length - 1] = {
        ...last,
        text: `${last.text} ${message.text}`.trim(),
        frenchText: [last.frenchText, message.frenchText].filter(Boolean).join(' ').trim() || last.frenchText,
      };
      continue;
    }
    collapsed.push(message);
  }
  return collapsed;
}

type ChatHistoryTurn = {
  role: 'user' | 'model';
  text?: string;
  frenchText?: string;
  audioBase64?: string;
  mimeType?: string;
};

async function historyTurnsFromMessages(messages: Message[], signal?: AbortSignal): Promise<ChatHistoryTurn[]> {
  const collapsed = collapseMessagesForChatHistory(messages);
  const history: ChatHistoryTurn[] = [];

  for (const message of collapsed) {
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }
    if (message.role === 'user') {
      const audioUrl = typeof message.audioUrl === 'string' ? message.audioUrl : undefined;
      if (audioUrl) {
        const audioData = await fetchAudioAsInlineData(audioUrl, signal);
        if (signal?.aborted) {
          throw new DOMException('Request aborted', 'AbortError');
        }
        if (audioData) {
          history.push({
            role: 'user',
            audioBase64: audioData.base64,
            mimeType: audioData.mimeType,
          });
          continue;
        }
      }
      history.push({ role: 'user', text: message.text });
      continue;
    }
    history.push({
      role: 'model',
      frenchText: message.frenchText,
      text: message.text,
    });
  }
  return history;
}

function textHistoryFallback(): ChatHistoryTurn[] {
  if (!pendingHistory?.length) return [];
  return pendingHistory.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    text: msg.content,
  }));
}

export const resetSession = (scenario?: Scenario | null, history?: Array<{ role: string; content: string }>) => {
  activeScenario = scenario || null;
  pendingScenario = scenario || null;
  storedPriorMessages = [];

  if (history) {
    pendingHistory = history;
  } else {
    syncedMessageCount = 0;
    pendingHistory = null;
  }
};

export const setScenario = (scenario: Scenario | null) => {
  resetSession(scenario);
};

export const resetSessionWithUserAudioHistory = async (
  scenario: Scenario | null,
  messages: Message[],
  signal?: AbortSignal
): Promise<void> => {
  if (signal?.aborted) {
    throw new DOMException('Request aborted', 'AbortError');
  }
  activeScenario = scenario || null;
  pendingScenario = scenario || null;
  pendingHistory = null;
  storedPriorMessages = messages;
  syncedMessageCount = getConversationHistory().length;
};

export const initializeSession = async () => {
  if (pendingScenario) {
    activeScenario = pendingScenario;
  }
};

export const confirmTefAdImage = async (
  imageBase64: string,
  mimeType: string
): Promise<{ summary: string; roleSummary: string }> => {
  if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw unsupportedImageError(mimeType);
  }
  const result = await bffFetch<{ summary: string; roleSummary: string }>('/api/tef-ad-confirm', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, mimeType, mode: 'persuasion' }),
  });
  const validation = ImageAnalysisSchema.safeParse(result);
  if (!validation.success) {
    throw new Error(`Image analysis response validation failed: ${validation.error.message}`);
  }
  return validation.data;
};

export const confirmTefAdImageForQuestioning = async (
  imageBase64: string,
  mimeType: string
): Promise<{ summary: string; roleSummary: string }> => {
  if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw unsupportedImageError(mimeType);
  }
  const result = await bffFetch<{ summary: string; roleSummary: string }>('/api/tef-ad-confirm', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, mimeType, mode: 'questioning' }),
  });
  const validation = ImageAnalysisSchema.safeParse(result);
  if (!validation.success) {
    throw new Error(`Image analysis response validation failed: ${validation.error.message}`);
  }
  return validation.data;
};

export const transcribeAudio = async (
  audioBase64: string,
  mimeType: string,
  signal?: AbortSignal
): Promise<string> => {
  const result = await bffFetch<{ text: string }>('/api/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audioBase64, mimeType, cleanup: false }),
    signal,
  });
  if (!result.text?.trim()) {
    throw new Error('Transcription returned empty text');
  }
  return result.text;
};

export const transcribeAndCleanupAudio = async (
  audioBase64: string,
  mimeType: string,
  signal?: AbortSignal
): Promise<{ rawTranscript: string; cleanedTranscript: string }> => {
  const result = await bffFetch<{ rawTranscript: string; cleanedTranscript: string }>('/api/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audioBase64, mimeType, cleanup: true }),
    signal,
  });
  return {
    rawTranscript: result.rawTranscript || '',
    cleanedTranscript: result.cleanedTranscript || '',
  };
};

export const generateCharacterSpeech = async (
  text: string,
  voiceName: string,
  signal?: AbortSignal
): Promise<string> => {
  const result = await bffFetch<{ audioBase64: string; mimeType?: string }>('/api/tts', {
    method: 'POST',
    body: JSON.stringify({ text, voiceName }),
    signal,
  });
  if (!result.audioBase64) {
    throw new Error(`No audio data received from TTS model for character with voice ${voiceName}.`);
  }
  const audioBytes = base64ToBytes(result.audioBase64);
  const audioBlob = pcmToWav(audioBytes, DEFAULT_PCM_SAMPLE_RATE, DEFAULT_PCM_CHANNELS);
  return URL.createObjectURL(audioBlob);
};

export const sendVoiceMessage = async (
  audioBase64: string,
  mimeType: string,
  signal?: AbortSignal,
  contextText?: string,
  priorMessages?: Message[]
): Promise<VoiceResponse> => {
  if (pendingScenario && !activeScenario) {
    activeScenario = pendingScenario;
  }
  if (signal?.aborted) {
    throw new DOMException('Request aborted', 'AbortError');
  }

  try {
    const transcribeResult = await bffFetch<{ text: string }>('/api/transcribe', {
      method: 'POST',
      body: JSON.stringify({ audioBase64, mimeType, cleanup: false }),
      signal,
    });
    const userText = transcribeResult.text || '';
    if (!userText.trim()) {
      throw new Error('Transcription failed or returned empty text. Please try speaking again.');
    }

    const sharedHistory = getConversationHistory();
    if (sharedHistory.length > syncedMessageCount && !priorMessages?.length && !storedPriorMessages.length) {
      pendingHistory = sharedHistory;
    }

    const messagesForHistory = priorMessages ?? storedPriorMessages;
    const history = messagesForHistory.length
      ? await historyTurnsFromMessages(messagesForHistory, signal)
      : textHistoryFallback();

    const chatResult = await bffFetch<{ modelJson: unknown }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        audioBase64,
        mimeType,
        scenario: activeScenario,
        history,
        ...(contextText ? { contextText } : {}),
      }),
      signal,
    });

    const modelJson = chatResult.modelJson;
    if (!modelJson || typeof modelJson !== 'object') {
      throw new Error('No text response received from chat model.');
    }

    if (activeScenario && activeScenario.characters && activeScenario.characters.length > 1) {
      const MultiCharacterSchema = createMultiCharacterSchema(activeScenario);
      const validationResult = MultiCharacterSchema.safeParse(modelJson);
      if (!validationResult.success) {
        throw new Error(`Failed to validate multi-character response: ${validationResult.error.message}.`);
      }
      const validated = validationResult.data;
      const hasRoadmapSteps = !!activeScenario.steps && activeScenario.steps.length > 0;
      const currentStepIndex = hasRoadmapSteps && 'currentStepIndex' in validated
        ? (validated as { currentStepIndex?: number }).currentStepIndex
        : undefined;

      const characterResponses = validated.characterResponses.map((resp) => {
        const label = resp.characterName.trim();
        const match = label.match(/^character\s+(\d+)$/i);
        if (!match) {
          throw new Error(`Unexpected character label "${label}" — expected format "Character N".`);
        }
        const index = parseInt(match[1], 10) - 1;
        if (index < 0 || index >= activeScenario.characters!.length) {
          throw new Error(`Character index ${index + 1} out of range (scenario has ${activeScenario.characters!.length} characters).`);
        }
        const character = activeScenario.characters![index];
        return {
          characterId: character.id,
          characterName: character.name,
          french: resp.french.trim(),
          english: resp.english.trim(),
        };
      });

      const mergedCharacterResponses = characterResponses.reduce<Array<{
        characterId: string;
        characterName: string;
        french: string;
        english: string;
      }>>((acc, current) => {
        if (acc.length === 0) return [current];
        const lastResponse = acc[acc.length - 1];
        if (lastResponse.characterId === current.characterId) {
          lastResponse.french = `${lastResponse.french} ${current.french}`;
          lastResponse.english = `${lastResponse.english} ${current.english}`;
          return acc;
        }
        return [...acc, current];
      }, []);

      const hint = validated.hint
        || validated.characterResponses[validated.characterResponses.length - 1]?.hint
        || 'Continue the conversation';

      if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }

      const audioPromises = mergedCharacterResponses.map(async (charResp) => {
        const character = activeScenario!.characters!.find((c) => c.id === charResp.characterId);
        if (!character) {
          throw new Error(`Character not found: ${charResp.characterName} (ID: ${charResp.characterId})`);
        }
        const audioUrl = await generateCharacterSpeech(charResp.french, character.voiceName, signal);
        return { ...charResp, audioUrl, voiceName: character.voiceName };
      });

      const results = await Promise.allSettled(audioPromises);
      if (signal?.aborted) {
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.audioUrl) {
            URL.revokeObjectURL(result.value.audioUrl);
          }
        }
        throw new DOMException('Request aborted', 'AbortError');
      }

      const characterAudios = results.map((result, idx) => {
        if (result.status === 'rejected') {
          console.error(`TTS failed for character ${mergedCharacterResponses[idx].characterName}:`, result.reason);
          const character = activeScenario!.characters!.find((c) => c.id === mergedCharacterResponses[idx].characterId);
          return {
            ...mergedCharacterResponses[idx],
            audioUrl: '',
            audioGenerationFailed: true,
            voiceName: character?.voiceName || '',
          };
        }
        return { ...result.value, audioGenerationFailed: false };
      });

      const combinedModelText = mergedCharacterResponses.map((cr) => `${cr.french} ${cr.english}`).join(' ');
      if (signal?.aborted) {
        characterAudios.forEach((ca) => {
          if (ca.audioUrl) URL.revokeObjectURL(ca.audioUrl);
        });
        throw new DOMException('Request aborted', 'AbortError');
      }

      addToHistory('user', userText);
      addToHistory('assistant', combinedModelText);
      syncedMessageCount += 2;

      return {
        audioUrl: characterAudios.map((ca) => ca.audioUrl),
        modelText: characterAudios.map((ca) => `${ca.french} ${ca.english}`),
        userText,
        hint,
        characters: characterAudios.map((ca) => ({
          characterId: ca.characterId,
          characterName: ca.characterName,
          voiceName: ca.voiceName,
          audioGenerationFailed: ca.audioGenerationFailed,
          frenchText: ca.french,
        })),
        ...(currentStepIndex !== undefined ? { currentStepIndex } : {}),
      };
    }

    if (activeScenario) {
      const hasRoadmapSteps = !!activeScenario.steps && activeScenario.steps.length > 0;
      const schemaToUse = activeScenario.isTefQuestioning
        ? TefQuestioningSchema
        : hasRoadmapSteps
          ? RoadmapSingleCharacterSchema
          : SingleCharacterSchema;
      const validationResult = schemaToUse.safeParse(modelJson);
      if (!validationResult.success) {
        throw new Error(`Failed to validate single-character response: ${validationResult.error.message}.`);
      }
      const validated = validationResult.data;
      const isRepeat = activeScenario.isTefQuestioning && 'isRepeat' in validated
        ? (validated as { isRepeat?: boolean }).isRepeat
        : undefined;
      const conceptLabels = activeScenario.isTefQuestioning && 'conceptLabels' in validated
        ? (validated as { conceptLabels?: string[] }).conceptLabels
        : undefined;
      const currentStepIndex = hasRoadmapSteps && 'currentStepIndex' in validated
        ? (validated as { currentStepIndex?: number }).currentStepIndex
        : undefined;

      if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }

      const modelText = `${validated.french} ${validated.english}`;
      const voiceName = activeScenario?.characters?.[0]?.voiceName || 'aoede';
      addToHistory('user', userText);
      addToHistory('assistant', modelText);
      syncedMessageCount += 2;

      let audioUrl = '';
      try {
        audioUrl = await generateCharacterSpeech(validated.french, voiceName, signal);
      } catch (ttsError) {
        if (isAbortLikeError(ttsError)) throw ttsError;
        console.error('TTS generation failed for single-character response:', ttsError);
      }

      if (signal?.aborted) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        throw new DOMException('Request aborted', 'AbortError');
      }

      return {
        audioUrl,
        userText,
        modelText,
        hint: validated.hint,
        voiceName,
        audioGenerationFailed: !audioUrl,
        ...(isRepeat !== undefined ? { isRepeat } : {}),
        ...(conceptLabels !== undefined ? { conceptLabels } : {}),
        ...(currentStepIndex !== undefined ? { currentStepIndex } : {}),
        characters: [{
          characterId: activeScenario?.characters?.[0]?.id || '',
          characterName: activeScenario?.characters?.[0]?.name || '',
          voiceName,
          audioGenerationFailed: !audioUrl,
          frenchText: validated.french,
        }],
      };
    }

    const validationResult = FreeConversationSchema.safeParse(modelJson);
    if (!validationResult.success) {
      throw new Error(`Failed to validate free conversation response: ${validationResult.error.message}.`);
    }
    const validated = validationResult.data;
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    const modelText = `${validated.french} ${validated.english}`;
    const voiceName = 'aoede';
    addToHistory('user', userText);
    addToHistory('assistant', modelText);
    syncedMessageCount += 2;

    let audioUrl = '';
    try {
      audioUrl = await generateCharacterSpeech(validated.french, voiceName, signal);
    } catch (ttsError) {
      if (isAbortLikeError(ttsError)) throw ttsError;
      console.error('TTS generation failed for free-conversation response:', ttsError);
    }

    if (signal?.aborted) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      throw new DOMException('Request aborted', 'AbortError');
    }

    return {
      audioUrl,
      userText,
      modelText,
      hint: undefined,
      voiceName,
      audioGenerationFailed: !audioUrl,
      characters: [{
        characterId: '',
        characterName: '',
        voiceName,
        audioGenerationFailed: !audioUrl,
        frenchText: validated.french,
      }],
    };
  } catch (error) {
    console.error('Error communicating with Gemini:', error);
    throw error;
  }
};
