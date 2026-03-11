/**
 * TDD tests for the optional contextText parameter added to sendVoiceMessage.
 *
 * New signature: sendVoiceMessage(audioBase64, mimeType, signal?, contextText?)
 *
 * When contextText is provided it must be sent as an additional text part alongside
 * the audio in the chat session message. When omitted, no extra part is added.
 *
 * Tests FAIL before the implementation is in place.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @google/genai at module level
// ---------------------------------------------------------------------------

vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

import { GoogleGenAI } from '@google/genai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv'; // "fakeaudio" in base64
const FAKE_MIME_TYPE = 'audio/webm';

// A minimal valid JSON response for a single-character TEF Ad scenario
const FAKE_MODEL_RESPONSE = JSON.stringify({
  french: 'Bonjour! Ça va?',
  english: 'Hello! How are you?',
  hint: 'Introduce the ad',
});

const FAKE_TRANSCRIPTION = 'Bonjour mon ami.';

/**
 * Build a mock GoogleGenAI instance that:
 * - models.generateContent: handles transcription (returns FAKE_TRANSCRIPTION) and TTS
 * - chats.create: returns a mock chat session whose sendMessage returns FAKE_MODEL_RESPONSE
 *
 * Returns the mockSendMessage spy so callers can assert against it.
 */
function buildMockAi() {
  const mockSendMessage = vi.fn().mockResolvedValue({ text: FAKE_MODEL_RESPONSE });

  const mockChatSession = {
    sendMessage: mockSendMessage,
  };

  const mockGenerateContent = vi.fn()
    .mockResolvedValueOnce({ text: FAKE_TRANSCRIPTION }) // first call = transcription
    .mockResolvedValue({                                  // subsequent calls = TTS (fallback)
      candidates: [{
        content: {
          parts: [{ inlineData: { data: 'ZmFrZWF1ZGlv', mimeType: 'audio/wav' } }]
        }
      }]
    });

  const mockAi = {
    models: {
      generateContent: mockGenerateContent,
    },
    chats: {
      create: vi.fn().mockReturnValue(mockChatSession),
    },
  };

  vi.mocked(GoogleGenAI).mockReturnValue(mockAi as unknown as GoogleGenAI);

  return { mockAi, mockSendMessage, mockGenerateContent };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.setItem('parle_api_key_gemini', 'test-key-send-voice-context');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  // Reset module state between tests so each test gets a fresh session
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Existence check
// ---------------------------------------------------------------------------

describe('sendVoiceMessage · contextText parameter — existence', () => {
  it('sendVoiceMessage accepts a 4th contextText parameter without throwing a type error', async () => {
    // If the implementation still only accepts 3 parameters this test will
    // catch runtime issues (TypeScript won't be enforced at vitest runtime
    // but the call should not blow up with "too many arguments").
    const { sendVoiceMessage } = await import('../services/geminiService');
    // We just verify the function is callable — a detailed behavioural check
    // follows in the next describe blocks.
    expect(typeof sendVoiceMessage).toBe('function');
    expect(sendVoiceMessage.length).toBeGreaterThanOrEqual(2); // at minimum audioBase64 + mimeType
  });
});

// ---------------------------------------------------------------------------
// contextText provided — must be injected as a text part in the chat message
// ---------------------------------------------------------------------------

describe('sendVoiceMessage · contextText provided', () => {
  it('includes a text part with the contextText in the sendMessage call', async () => {
    const { mockSendMessage } = buildMockAi();
    const { sendVoiceMessage, initializeSession } = await import('../services/geminiService');

    await initializeSession();

    const contextText = '[Turn context: Direction 1/5 · Round 1/3. Raise objection about price.]';

    await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, undefined, contextText);

    expect(mockSendMessage.mock.calls.length).toBeGreaterThan(0);
    const callArg = mockSendMessage.mock.calls[0][0];
    const parts = callArg?.message ?? [];
    const textParts = parts.filter((p: Record<string, unknown>) => typeof p.text === 'string');
    const hasContextText = textParts.some(
      (p: { text: string }) => p.text.includes(contextText) || p.text === contextText
    );
    expect(hasContextText).toBe(true);
  });

  it('sends the audio inlineData part alongside the contextText part', async () => {
    const { mockSendMessage } = buildMockAi();
    const { sendVoiceMessage, initializeSession } = await import('../services/geminiService');
    await initializeSession();

    const contextText = '[Turn context: Direction 2/5 · Round 3/3.]';

    await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, undefined, contextText);

    expect(mockSendMessage.mock.calls.length).toBeGreaterThan(0);
    const callArg = mockSendMessage.mock.calls[0][0];
    const parts = callArg?.message ?? [];
    const hasInlineData = parts.some(
      (p: Record<string, unknown>) => p.inlineData !== undefined
    );
    expect(hasInlineData).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// contextText omitted — no extra text part
// ---------------------------------------------------------------------------

describe('sendVoiceMessage · contextText omitted', () => {
  it('does NOT add a text part when contextText is undefined', async () => {
    const { mockSendMessage } = buildMockAi();
    const { sendVoiceMessage, initializeSession } = await import('../services/geminiService');
    await initializeSession();

    // Call without the 4th argument
    await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, undefined, undefined);

    expect(mockSendMessage.mock.calls.length).toBeGreaterThan(0);
    const callArg = mockSendMessage.mock.calls[0][0];
    const parts = callArg?.message ?? [];
    const textParts = parts.filter((p: Record<string, unknown>) => typeof p.text === 'string');
    // No text part should be present when contextText is omitted
    expect(textParts).toHaveLength(0);
  });

  it('does NOT add a text part when contextText is an empty string', async () => {
    const { mockSendMessage } = buildMockAi();
    const { sendVoiceMessage, initializeSession } = await import('../services/geminiService');
    await initializeSession();

    await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, undefined, '');

    expect(mockSendMessage.mock.calls.length).toBeGreaterThan(0);
    const callArg = mockSendMessage.mock.calls[0][0];
    const parts = callArg?.message ?? [];
    const textParts = parts.filter(
      (p: Record<string, unknown>) => typeof p.text === 'string' && (p.text as string).length > 0
    );
    expect(textParts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Source-text spec: verify contextText is wired in the implementation
// ---------------------------------------------------------------------------

describe('sendVoiceMessage · source-text spec for contextText parameter', () => {
  it('geminiService source declares a 4th parameter (contextText) on sendVoiceMessage', async () => {
    const src = await import('../services/geminiService?raw');
    // The function signature must mention contextText as the 4th param
    expect((src as { default: string }).default).toMatch(/sendVoiceMessage\s*=\s*async\s*\([^)]*contextText/);
  });

  it('geminiService source uses contextText when building the chat message parts', async () => {
    const src = await import('../services/geminiService?raw');
    // The source should reference contextText when constructing the message
    expect((src as { default: string }).default).toMatch(/contextText/);
  });
});
