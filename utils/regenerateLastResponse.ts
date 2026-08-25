import type { Message, VoiceResponse } from '../types';

/**
 * Locates the last completed user→model turn in chronological messages.
 * Returns null when there is no trailing model response to regenerate.
 */
export function findLastAssistantTurn(messages: Message[]): {
  lastUserIndex: number;
  modelStartIndex: number;
  modelEndIndex: number;
} | null {
  if (messages.length < 2) return null;

  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex === -1) return null;
  if (lastUserIndex === messages.length - 1) return null;

  const modelStartIndex = lastUserIndex + 1;
  for (let i = modelStartIndex; i < messages.length; i++) {
    if (messages[i].role !== 'model') return null;
  }

  return {
    lastUserIndex,
    modelStartIndex,
    modelEndIndex: messages.length - 1,
  };
}

/**
 * True when `timestamp` belongs to the last assistant turn (any character bubble).
 */
export function isTimestampInLastAssistantTurn(
  messages: Message[],
  timestamp: number
): boolean {
  const turn = findLastAssistantTurn(messages);
  if (!turn) return false;
  for (let i = turn.modelStartIndex; i <= turn.modelEndIndex; i++) {
    if (messages[i].timestamp === timestamp) return true;
  }
  return false;
}

/**
 * TEF Ad phase turn number for regenerate: after a successful turn the counter
 * already includes that turn, so use it directly. Greeting regenerate uses 0
 * (no phase context). Normal (non-regenerate) turns use count + 1.
 */
export function persuasionPhaseTurnNumber(
  tefAdTurnCount: number,
  isRegenerate: boolean
): number {
  return isRegenerate ? tefAdTurnCount : tefAdTurnCount + 1;
}

export function buildPersuasionPhaseContext(turnNumber: number): string | undefined {
  if (turnNumber <= 0) return undefined;
  if (turnNumber <= 2) {
    return '[Per-turn context: Encourage the user to introduce and present the advertisement clearly and in an interesting way.]';
  }
  if (turnNumber <= 4) {
    return '[Per-turn context: The user should be developing concrete arguments with examples. If they give a bare assertion without a concrete example, ask "Tu peux me donner un exemple concret?"]';
  }
  return '[Per-turn context: Push back with a counter-argument or nuance ("Oui mais...", "Tu ne penses pas que..."). The user should demonstrate they can handle objections and nuance their position.]';
}

/**
 * Adjusts TEF questioning repeat count when regenerating replaces isRepeat on the user turn.
 */
export function nextRepeatCountAfterRegenerate(
  previousCount: number,
  previousIsRepeat: boolean | undefined,
  nextIsRepeat: boolean | undefined
): number {
  let count = previousCount;
  if (previousIsRepeat === true) count -= 1;
  if (nextIsRepeat === true) count += 1;
  return Math.max(0, count);
}

function revokeMessageAudio(message: Message): void {
  if (!message.audioUrl) return;
  if (typeof message.audioUrl === 'string') {
    if (message.audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(message.audioUrl);
    }
    return;
  }
  for (const url of message.audioUrl) {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Replaces the last assistant turn's model bubbles with a new VoiceResponse,
 * keeping the user bubble (and its recording URL) in place.
 * Returns the next message list and the timestamp to auto-play.
 */
export function replaceLastAssistantTurnMessages(
  messages: Message[],
  response: VoiceResponse,
  options?: {
    tefQuestioningUpdate?: {
      isPractice: boolean;
      skipFirstMessageMeta: boolean;
    };
    baseTimestamp?: number;
  }
): { messages: Message[]; autoPlayMessageId: number | null } {
  const turn = findLastAssistantTurn(messages);
  if (!turn) return { messages, autoPlayMessageId: null };

  const userMessage = messages[turn.lastUserIndex];
  const timestamp = options?.baseTimestamp ?? Date.now();

  let modelMessages: Message[];

  if (Array.isArray(response.audioUrl)) {
    const audioUrls = response.audioUrl;
    const characters = response.characters;
    const modelTexts = response.modelText;
    if (
      !characters ||
      !Array.isArray(modelTexts) ||
      audioUrls.length !== characters.length ||
      audioUrls.length !== modelTexts.length
    ) {
      return { messages, autoPlayMessageId: null };
    }

    modelMessages = characters.map((char, idx) => ({
      role: 'model' as const,
      text: modelTexts[idx],
      timestamp: timestamp + idx + 1,
      audioUrl: audioUrls[idx],
      characterId: char.characterId,
      characterName: char.characterName,
      voiceName: char.voiceName,
      hint: idx === characters.length - 1 ? response.hint : undefined,
      audioGenerationFailed: char.audioGenerationFailed || false,
      frenchText: char.frenchText,
    }));
  } else {
    const { audioUrl, modelText, hint, voiceName, audioGenerationFailed, characters } = response;
    modelMessages = [
      {
        role: 'model',
        text: modelText as string,
        timestamp: timestamp + 1,
        audioUrl: audioUrl as string,
        hint,
        voiceName,
        audioGenerationFailed: audioGenerationFailed || false,
        frenchText: characters?.[0]?.frenchText,
        characterId: characters?.[0]?.characterId || undefined,
        characterName: characters?.[0]?.characterName || undefined,
      },
    ];
  }

  const oldModelMessages = messages.slice(turn.modelStartIndex, turn.modelEndIndex + 1);
  for (const msg of oldModelMessages) {
    revokeMessageAudio(msg);
  }

  const tefMeta =
    options?.tefQuestioningUpdate?.isPractice &&
    !options.tefQuestioningUpdate.skipFirstMessageMeta
      ? {
          isRepeat: response.isRepeat,
          conceptLabels: response.conceptLabels,
        }
      : {};

  const updatedUser: Message = {
    ...userMessage,
    text: response.userText,
    ...tefMeta,
  };

  // Clear stale TEF fields when regenerating the greeting turn
  if (
    options?.tefQuestioningUpdate?.isPractice &&
    options.tefQuestioningUpdate.skipFirstMessageMeta
  ) {
    delete updatedUser.isRepeat;
    delete updatedUser.conceptLabels;
  }

  return {
    messages: [...messages.slice(0, turn.lastUserIndex), updatedUser, ...modelMessages],
    autoPlayMessageId: timestamp + 1,
  };
}
