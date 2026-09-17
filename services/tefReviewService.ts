import { isAbortLikeError } from '../utils/isAbortLikeError';
import { fetchAudioAsInlineData } from '../utils/fetchAudioAsInlineData';
import type { Message, TefReview } from '../types';
import { bffFetch } from './bffClient';

type ReviewTurn = {
  role: 'user' | 'model';
  text?: string;
  frenchText?: string;
  audioBase64?: string;
  mimeType?: string;
};

async function turnsFromMessages(messages: Message[], signal?: AbortSignal): Promise<ReviewTurn[]> {
  const turns: ReviewTurn[] = [];
  for (const message of messages) {
    if (signal?.aborted) return turns;
    if (message.role === 'user') {
      const audioUrl = typeof message.audioUrl === 'string' ? message.audioUrl : undefined;
      if (audioUrl) {
        const audioData = await fetchAudioAsInlineData(audioUrl, signal);
        if (audioData) {
          turns.push({
            role: 'user',
            text: message.text,
            audioBase64: audioData.base64,
            mimeType: audioData.mimeType,
          });
          continue;
        }
      }
      turns.push({ role: 'user', text: message.text });
    } else {
      turns.push({
        role: 'model',
        text: message.text,
        frenchText: message.frenchText,
      });
    }
  }
  return turns;
}

export async function generateTefReview(params: {
  exerciseType: 'questioning' | 'persuasion';
  messages: Message[];
  adSummary?: string;
  elapsedSeconds: number;
  signal?: AbortSignal;
}): Promise<TefReview | null> {
  const { exerciseType, messages, adSummary, elapsedSeconds, signal } = params;
  if (signal?.aborted) return null;

  try {
    const turns = await turnsFromMessages(messages, signal);
    if (signal?.aborted) return null;
    return await bffFetch<TefReview>('/api/tef-review', {
      method: 'POST',
      body: JSON.stringify({
        exerciseType,
        elapsedSeconds,
        adSummary,
        turns,
      }),
      signal,
    });
  } catch (err) {
    if (isAbortLikeError(err)) return null;
    throw err;
  }
}
