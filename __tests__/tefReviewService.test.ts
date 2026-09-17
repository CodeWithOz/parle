import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateTefReview } from '../services/tefReviewService';
import type { Message, TefReview } from '../types';
import { jsonResponse } from './helpers/mockParleBff';

const SAMPLE_REVIEW: TefReview = {
  cefrLevel: 'B2',
  cefrJustification: 'The speaker demonstrated solid grammar with occasional errors.',
  wentWell: ['Good use of connectors', 'Clear pronunciation'],
  topicSuggestions: Array.from({ length: 5 }, (_, i) => ({
    topic: `Topic ${i + 1}`,
    examples: [
      { french: 'Exemple A', english: 'Example A' },
      { french: 'Exemple B', english: 'Example B' },
    ],
  })),
};

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv';
const FAKE_MIME_TYPE = 'audio/webm';

function userMessage(text: string, audioUrl?: string): Message {
  return { role: 'user', text, timestamp: Date.now(), audioUrl };
}

function modelMessage(text: string): Message {
  return { role: 'model', text, timestamp: Date.now(), frenchText: text };
}

let lastReviewBody: Record<string, unknown> | null = null;

beforeEach(() => {
  lastReviewBody = null;
  const fakeBlob = new Blob([Buffer.from(FAKE_AUDIO_BASE64, 'base64')], { type: FAKE_MIME_TYPE });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('blob:')) {
      return { ok: true, blob: async () => fakeBlob } as Response;
    }
    if (url.includes('/api/tef-review')) {
      lastReviewBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return jsonResponse(SAMPLE_REVIEW);
    }
    return jsonResponse({ error: 'NOT_FOUND' }, 404);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generateTefReview · BFF client', () => {
  it('is exported from tefReviewService', async () => {
    expect(typeof generateTefReview).toBe('function');
  });

  it('returns the Worker review payload', async () => {
    const review = await generateTefReview({
      exerciseType: 'questioning',
      messages: [userMessage('Bonjour', 'blob:http://localhost/a')],
      elapsedSeconds: 30,
    });
    expect(review).toEqual(SAMPLE_REVIEW);
    expect(lastReviewBody?.exerciseType).toBe('questioning');
    const turns = lastReviewBody?.turns as Array<Record<string, unknown>>;
    expect(turns.some((turn) => turn.audioBase64 === FAKE_AUDIO_BASE64)).toBe(true);
  });

  it('still posts when messages are empty', async () => {
    const review = await generateTefReview({
      exerciseType: 'persuasion',
      messages: [],
      elapsedSeconds: 0,
    });
    expect(review).toEqual(SAMPLE_REVIEW);
    expect(lastReviewBody?.turns).toEqual([]);
  });

  it('returns null on abort', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const review = await generateTefReview({
      exerciseType: 'questioning',
      messages: [userMessage('Bonjour')],
      elapsedSeconds: 10,
      signal: AbortSignal.abort(),
    });
    expect(review).toBeNull();
  });

  it('includes agent turns as text-only context', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: [
        modelMessage('Bonjour, comment puis-je vous aider?'),
        userMessage('Quel est le prix?', 'blob:http://localhost/a'),
      ],
      elapsedSeconds: 20,
    });
    const turns = lastReviewBody?.turns as Array<Record<string, unknown>>;
    expect(turns[0]).toMatchObject({ role: 'model', frenchText: 'Bonjour, comment puis-je vous aider?' });
    expect(turns[0]?.audioBase64).toBeUndefined();
  });
});
