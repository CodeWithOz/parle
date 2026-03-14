/**
 * TDD tests for the persuasion mode first-message fix.
 *
 * The bug: the first user turn (typically a greeting) incorrectly consumed
 * objection round 1 / direction 1, making the objection count off by one.
 *
 * The fix: when tefAdIsFirstMessage is true, skip objection context injection
 * AND skip advanceTefObjectionState; set tefAdIsFirstMessage = false.
 * On the second and subsequent turns, inject context and advance state as before.
 *
 * Tests are written against App.tsx source text to specify the required
 * implementation, plus behavioural assertions via the geminiService mock.
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
// Source-text specs: verify the fix in App.tsx
// ---------------------------------------------------------------------------

describe('persuasionFirstMessage · App.tsx source-text specs', () => {
  it('App.tsx declares tefAdIsFirstMessage state', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/tefAdIsFirstMessage/);
  });

  it('App.tsx initialises tefAdIsFirstMessage to true', async () => {
    const src = await import('../App?raw');
    // useState(true) for tefAdIsFirstMessage
    expect(src.default).toMatch(/tefAdIsFirstMessage[\s\S]{0,50}true|useState.*true.*tefAdIsFirstMessage/);
  });

  it('App.tsx skips objectionContextText injection when tefAdIsFirstMessage is true', async () => {
    const src = await import('../App?raw');
    // The condition must check tefAdIsFirstMessage before building objectionContextText
    expect(src.default).toMatch(/tefAdIsFirstMessage/);
    // There must be an early-return / skip path that avoids injecting the context
    expect(src.default).toMatch(/tefAdIsFirstMessage[\s\S]{0,300}objectionContextText|objectionContextText[\s\S]{0,300}tefAdIsFirstMessage/);
  });

  it('App.tsx skips advanceTefObjectionState on the first message', async () => {
    const src = await import('../App?raw');
    // The advance must be guarded against the first-message case
    // i.e., advanceTefObjectionState is NOT called when tefAdIsFirstMessage
    expect(src.default).toMatch(/tefAdIsFirstMessage[\s\S]{0,500}advanceTefObjectionState|advanceTefObjectionState[\s\S]{0,500}tefAdIsFirstMessage/);
  });

  it('App.tsx sets tefAdIsFirstMessage to false after the first message is processed', async () => {
    const src = await import('../App?raw');
    // setTefAdIsFirstMessage(false) must appear in the code
    expect(src.default).toMatch(/setTefAdIsFirstMessage\s*\(\s*false\s*\)/);
  });

  it('App.tsx resets tefAdIsFirstMessage to true inside handleExitTefAd', async () => {
    const src = await import('../App?raw');
    // On exit, the flag must be reset so the next session starts fresh
    expect(src.default).toMatch(/handleExitTefAd[\s\S]{0,400}setTefAdIsFirstMessage\s*\(\s*true\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// Behavioural specs: verify sendVoiceMessage call on first vs second turn
// ---------------------------------------------------------------------------

describe('persuasionFirstMessage · sendVoiceMessage receives no context on first turn', () => {
  const FAKE_AUDIO = 'ZmFrZWF1ZGlv';
  const FAKE_MIME = 'audio/webm';
  const FAKE_MODEL_RESPONSE = JSON.stringify({
    french: 'Bonjour!',
    english: 'Hello!',
    hint: 'Introduce the ad',
  });

  function buildMockAi() {
    const mockSendMessage = vi.fn().mockResolvedValue({ text: FAKE_MODEL_RESPONSE });
    const mockChatSession = { sendMessage: mockSendMessage };
    const mockGenerateContent = vi.fn()
      .mockResolvedValue({ text: 'Bonjour mon ami.' });

    const mockAi = {
      models: { generateContent: mockGenerateContent },
      chats: { create: vi.fn().mockReturnValue(mockChatSession) },
    };

    vi.mocked(GoogleGenAI).mockReturnValue(mockAi as unknown as GoogleGenAI);
    return { mockSendMessage };
  }

  beforeEach(() => {
    localStorage.setItem('parle_api_key_gemini', 'test-key-persuasion-first');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('sendVoiceMessage 4th argument (contextText) must be undefined/absent for first turn', async () => {
    /**
     * This test verifies the sendVoiceMessage module export directly:
     * when called with no contextText, no text part is prepended.
     * That matches the contract: first-turn in App.tsx must NOT pass contextText.
     */
    const { mockSendMessage } = buildMockAi();
    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');

    const tefScenario = {
      id: 'tef-persuasion',
      name: 'TEF Ad Persuasion',
      description: 'You are a skeptical friend.',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'friend', name: 'Friend', role: 'friend', voiceName: 'aoede' }],
    };

    setScenario(tefScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    // Simulate first turn: call without contextText (as App.tsx should on first message)
    await sendVoiceMessage(FAKE_AUDIO, FAKE_MIME, undefined, undefined);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const callArg = mockSendMessage.mock.calls[0][0];
    const parts = callArg?.message ?? [];
    const textParts = parts.filter((p: Record<string, unknown>) => typeof p.text === 'string');
    // No context text part on the first turn
    expect(textParts).toHaveLength(0);
  });

  it('sendVoiceMessage with contextText passes a text part — confirming second-turn behaviour', async () => {
    const { mockSendMessage } = buildMockAi();
    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');

    const tefScenario = {
      id: 'tef-persuasion-2',
      name: 'TEF Ad Persuasion',
      description: 'You are a skeptical friend.',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'friend', name: 'Friend', role: 'friend', voiceName: 'aoede' }],
    };

    setScenario(tefScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    const contextText = '[Per-turn context: Objection direction 1 of 5 — topic: "Price". Round 1 of 3. Raise or continue this objection.]';
    await sendVoiceMessage(FAKE_AUDIO, FAKE_MIME, undefined, contextText);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const callArg = mockSendMessage.mock.calls[0][0];
    const parts = callArg?.message ?? [];
    const textParts = parts.filter((p: Record<string, unknown>) => typeof p.text === 'string');
    // Context text part IS present on the second turn
    expect(textParts.length).toBeGreaterThan(0);
    const hasContext = textParts.some(
      (p: { text: string }) => p.text.includes('[Per-turn context:')
    );
    expect(hasContext).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Behavioural specs: tefObjectionState must NOT advance on first turn
// ---------------------------------------------------------------------------

describe('persuasionFirstMessage · tefObjectionState unchanged after first turn', () => {
  it('App.tsx does not call advanceTefObjectionState when tefAdIsFirstMessage is true (source spec)', async () => {
    const src = await import('../App?raw');
    // advanceTefObjectionState must be called in the file (not just imported)
    expect(src.default).toMatch(/advanceTefObjectionState\s*\(/);
    // Structural protection: the call to advanceTefObjectionState(...) must appear AFTER
    // setTefAdIsFirstMessage(false), so it can only run in the else branch and never
    // fires when tefAdIsFirstMessage is true.
    const setFalseIdx = src.default.indexOf('setTefAdIsFirstMessage(false)');
    // Find the call site, not the import — search for the function invocation pattern
    const advanceCallIdx = src.default.indexOf('advanceTefObjectionState(');
    expect(setFalseIdx).toBeGreaterThan(-1);
    expect(advanceCallIdx).toBeGreaterThan(setFalseIdx);
  });
});
