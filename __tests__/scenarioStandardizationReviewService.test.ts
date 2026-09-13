import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateScenarioStandardizationReview } from '../services/scenarioStandardizationReviewService';
import type { Message, ScenarioStandardizationReview } from '../types';
import { jsonResponse } from './helpers/mockParleBff';

const SAMPLE_REVIEW: ScenarioStandardizationReview = {
  items: [
    {
      original: 'je cherche pour acheter un billet',
      standard: 'je voudrais acheter un billet',
    },
  ],
};

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv';
const FAKE_MIME_TYPE = 'audio/webm';

function makeUserMessage(text: string, audioUrl?: string): Message {
  return { role: 'user', text, timestamp: Date.now(), audioUrl };
}

function makeModelMessage(text: string): Message {
  return { role: 'model', text, timestamp: Date.now() };
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
    if (url.includes('/api/scenario-review')) {
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

describe('generateScenarioStandardizationReview', () => {
  it('sends user audio as inlineData turns and agent text only as context', async () => {
    const messages: Message[] = [
      makeModelMessage('Bonjour, vous désirez ?'),
      makeUserMessage('je cherche pour acheter un billet', 'blob:http://localhost/user-audio-1'),
      makeModelMessage('Pour quelle destination ?'),
    ];

    const result = await generateScenarioStandardizationReview({
      messages,
      scenarioName: 'Train station',
      scenarioDescription: 'The user is buying a train ticket.',
    });

    expect(result).toEqual(SAMPLE_REVIEW);
    const turns = lastReviewBody?.turns as Array<Record<string, unknown>>;
    expect(turns.some((turn) => turn.audioBase64 === FAKE_AUDIO_BASE64)).toBe(true);
    expect(turns.some((turn) => turn.role === 'model' && String(turn.text).includes('Bonjour, vous désirez ?'))).toBe(true);
  });

  it('falls back to transcript text when user audio cannot be fetched', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('blob:')) {
        throw new Error('blob fetch failed');
      }
      if (url.includes('/api/scenario-review')) {
        lastReviewBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return jsonResponse(SAMPLE_REVIEW);
      }
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    });

    await generateScenarioStandardizationReview({
      messages: [makeUserMessage('je cherche pour acheter un billet', 'blob:http://localhost/user-audio-1')],
    });

    const turns = lastReviewBody?.turns as Array<Record<string, unknown>>;
    expect(turns[0]?.text).toContain('je cherche pour acheter un billet');
    expect(turns[0]?.audioBase64).toBeUndefined();
  });

  it('returns an empty review without calling the BFF when there are no user messages', async () => {
    const result = await generateScenarioStandardizationReview({
      messages: [makeModelMessage('Bonjour')],
    });
    expect(result).toEqual({ items: [] });
    expect(lastReviewBody).toBeNull();
  });
});
