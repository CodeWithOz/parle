import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleGenAI, Type } from '@google/genai';

vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(function GoogleGenAIMock() {}),
  };
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { generateScenarioStandardizationReview } from '../services/scenarioStandardizationReviewService';
import type { Message, ScenarioStandardizationReview } from '../types';

let mockGenerateContent = vi.fn();

const mockAi = {
  models: {
    get generateContent() {
      return mockGenerateContent;
    },
  },
  chats: { create: vi.fn() },
};

vi.mocked(GoogleGenAI).mockImplementation(function GoogleGenAIConstructorMock() {
  return mockAi as unknown as GoogleGenAI;
});

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

function setupSuccessfulAudioFetch() {
  const fakeBlob = new Blob([Buffer.from(FAKE_AUDIO_BASE64, 'base64')], { type: FAKE_MIME_TYPE });
  mockFetch.mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(fakeBlob),
  });
}

function makeUserMessage(text: string, audioUrl?: string): Message {
  return {
    role: 'user',
    text,
    timestamp: Date.now(),
    audioUrl,
  };
}

function makeModelMessage(text: string): Message {
  return {
    role: 'model',
    text,
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  localStorage.setItem('parle_api_key_gemini', 'test-key-scenario-review');
  mockGenerateContent = vi.fn().mockResolvedValue({
    text: JSON.stringify(SAMPLE_REVIEW),
  });
  setupSuccessfulAudioFetch();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  mockFetch.mockReset();
});

describe('generateScenarioStandardizationReview', () => {
  it('uses user audio as inlineData and agent text only as context', async () => {
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
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const request = mockGenerateContent.mock.calls[0][0];
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseSchema.properties.items.type).toBe(Type.ARRAY);

    const parts = request.contents[0].parts as Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
    expect(parts.some((part) => part.inlineData?.data === FAKE_AUDIO_BASE64)).toBe(true);
    expect(parts.some((part) => part.text?.includes('[Agent said: Bonjour, vous désirez ?]'))).toBe(true);
    expect(parts.some((part) => part.text?.includes('[User said (transcript fallback only): je cherche pour acheter un billet]'))).toBe(false);
  });

  it('falls back to transcript text when user audio cannot be fetched', async () => {
    mockFetch.mockRejectedValue(new Error('blob fetch failed'));

    await generateScenarioStandardizationReview({
      messages: [makeUserMessage('je cherche pour acheter un billet', 'blob:http://localhost/user-audio-1')],
    });

    const request = mockGenerateContent.mock.calls[0][0];
    const parts = request.contents[0].parts as Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
    expect(parts.some((part) => part.text?.includes('[User said (transcript fallback only): je cherche pour acheter un billet]'))).toBe(true);
  });

  it('returns an empty review without calling the model when there are no user messages', async () => {
    const result = await generateScenarioStandardizationReview({
      messages: [makeModelMessage('Bonjour')],
    });

    expect(result).toEqual({ items: [] });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
