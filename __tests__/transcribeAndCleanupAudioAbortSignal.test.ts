/**
 * TDD tests for transcribeAndCleanupAudio(audioBase64, mimeType, abortSignal?)
 * in services/geminiService.ts.
 *
 * Contract:
 * - transcribeAndCleanupAudio accepts an optional AbortSignal
 * - the AbortSignal is forwarded into ai.models.generateContent config
 * - responseMimeType/responseSchema remain set alongside abortSignal
 *
 * Tests FAIL before the implementation is updated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mock for @google/genai
// ---------------------------------------------------------------------------
vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

import { GoogleGenAI } from '@google/genai';

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv'; // "fakeaudio" in base64
const FAKE_MIME_TYPE = 'audio/webm';

describe('transcribeAndCleanupAudio · AbortSignal forwarding', () => {
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem('parle_api_key_gemini', 'test-key-transcribe-abort');

    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({ rawTranscript: 'RAW', cleanedTranscript: 'CLEANED' }),
    });

    const mockAi = {
      models: {
        get generateContent() {
          return mockGenerateContent;
        },
      },
      chats: { create: vi.fn() },
    };

    vi.mocked(GoogleGenAI).mockReturnValue(mockAi as unknown as GoogleGenAI);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('forwards AbortSignal into generateContent config without dropping JSON response config', async () => {
    const abortController = new AbortController();

    const { transcribeAndCleanupAudio } = await import('../services/geminiService');

    const result = await transcribeAndCleanupAudio(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, abortController.signal);
    expect(result).toEqual({ rawTranscript: 'RAW', cleanedTranscript: 'CLEANED' });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const requestArg = mockGenerateContent.mock.calls[0][0] as any;

    expect(requestArg.config).toBeDefined();
    expect(requestArg.config.abortSignal).toBe(abortController.signal);

    // Must remain set together with abortSignal
    expect(requestArg.config.responseMimeType).toBe('application/json');
    expect(requestArg.config.responseSchema).toBeDefined();
    expect(requestArg.config.responseSchema.required).toEqual(
      expect.arrayContaining(['rawTranscript', 'cleanedTranscript'])
    );
  });
});

