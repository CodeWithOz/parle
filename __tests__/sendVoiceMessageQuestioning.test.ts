/**
 * TDD tests for isRepeat propagation through sendVoiceMessage.
 *
 * When activeScenario.isTefQuestioning = true:
 *   - Returned VoiceResponse.isRepeat reflects the isRepeat field in the AI response
 * When activeScenario.isTefQuestioning is falsy:
 *   - Standard single-character path is unchanged; no isRepeat on VoiceResponse
 *
 * Tests FAIL before the implementation is in place.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

import { GoogleGenAI } from '@google/genai';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv';
const FAKE_MIME_TYPE = 'audio/webm';
const FAKE_TRANSCRIPTION = 'Bonjour, je voudrais savoir le prix.';

// ---------------------------------------------------------------------------
// Mock builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock GoogleGenAI instance that returns the given model response JSON
 * for the chat sendMessage call.
 */
function buildMockAiWithResponse(modelResponseJson: object) {
  const mockSendMessage = vi.fn().mockResolvedValue({
    text: JSON.stringify(modelResponseJson),
  });

  const mockChatSession = { sendMessage: mockSendMessage };

  const mockGenerateContent = vi.fn()
    .mockResolvedValueOnce({ text: FAKE_TRANSCRIPTION }) // transcription
    .mockResolvedValue({                                  // TTS fallback
      candidates: [{
        content: {
          parts: [{ inlineData: { data: 'ZmFrZWF1ZGlv', mimeType: 'audio/wav' } }],
        },
      }],
    });

  const mockAi = {
    models: { generateContent: mockGenerateContent },
    chats: { create: vi.fn().mockReturnValue(mockChatSession) },
  };

  vi.mocked(GoogleGenAI).mockReturnValue(mockAi as unknown as GoogleGenAI);
  return { mockAi, mockSendMessage };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.setItem('parle_api_key_gemini', 'test-key-questioning');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// isTefQuestioning = true, isRepeat = true in response
// ---------------------------------------------------------------------------

describe('sendVoiceMessage · isTefQuestioning=true, isRepeat=true in response', () => {
  it('returns VoiceResponse with isRepeat = true', async () => {
    buildMockAiWithResponse({
      french: 'Bonjour, comme je vous ai dit, notre plan coûte 29 euros par mois.',
      english: 'Hello, as I told you, our plan costs 29 euros per month.',
      hint: 'Ask about the installation fee',
      isRepeat: true,
      conceptLabels: ['pricing'],
    });

    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');

    // Set up a TEF Questioning scenario
    const questioningScenario = {
      id: 'test-questioning',
      name: 'TEF Questioning',
      description: 'Customer service call practice',
      createdAt: Date.now(),
      isActive: true,
      isTefQuestioning: true,
      characters: [{ id: 'agent', name: 'Agent', role: 'agent', voiceName: 'puck' }],
    };

    setScenario(questioningScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    const response = await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE);

    expect(response.isRepeat).toBe(true);
    expect(response.conceptLabels).toEqual(['pricing']);
  });
});

// ---------------------------------------------------------------------------
// isTefQuestioning = true, isRepeat = false in response
// ---------------------------------------------------------------------------

describe('sendVoiceMessage · isTefQuestioning=true, isRepeat=false in response', () => {
  it('returns VoiceResponse with isRepeat = false or undefined (not true)', async () => {
    buildMockAiWithResponse({
      french: 'Bien sûr, nos contrats sont disponibles en 12 ou 24 mois.',
      english: 'Of course, our contracts are available in 12 or 24 months.',
      hint: 'Ask about the cancellation policy',
      isRepeat: false,
      conceptLabels: ['contract duration'],
    });

    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');

    const questioningScenario = {
      id: 'test-questioning-2',
      name: 'TEF Questioning',
      description: 'Customer service call practice',
      createdAt: Date.now(),
      isActive: true,
      isTefQuestioning: true,
      characters: [{ id: 'agent', name: 'Agent', role: 'agent', voiceName: 'puck' }],
    };

    setScenario(questioningScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    const response = await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE);

    // isRepeat should be false or absent — NOT true
    expect(response.isRepeat).not.toBe(true);
    expect(response.conceptLabels).toEqual(['contract duration']);
  });
});

// ---------------------------------------------------------------------------
// isTefQuestioning falsy — standard path, no isRepeat
// ---------------------------------------------------------------------------

describe('sendVoiceMessage · isTefQuestioning falsy, standard single-character path', () => {
  it('does not set isRepeat on VoiceResponse when scenario is a regular TEF Ad scenario', async () => {
    buildMockAiWithResponse({
      french: "Hmm, je ne sais pas... c'est assez cher, non?",
      english: "Hmm, I don't know... it's quite expensive, isn't it?",
      hint: 'Explain the value for money',
    });

    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');

    // Regular (non-questioning) TEF scenario — no isTefQuestioning flag
    const regularScenario = {
      id: 'test-ad-persuasion',
      name: 'TEF Ad Persuasion',
      description: 'Ad persuasion practice',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'friend', name: 'Friend', role: 'friend', voiceName: 'aoede' }],
    };

    setScenario(regularScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    const response = await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE);

    // isRepeat should not be set to true on standard single-character path
    expect(response.isRepeat).toBeUndefined();
  });

  it('does not set isRepeat when no scenario is active (free conversation mode)', async () => {
    buildMockAiWithResponse({
      french: 'Bonjour! Comment puis-je vous aider?',
      english: 'Hello! How can I help you?',
    });

    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');

    setScenario(null);
    await initializeSession();

    const response = await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE);

    expect(response.isRepeat).toBeUndefined();
  });
});
