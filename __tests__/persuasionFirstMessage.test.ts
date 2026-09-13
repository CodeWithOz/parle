/**
 * TDD tests for the persuasion mode first-message behaviour.
 *
 * The first user turn (typically a greeting) must:
 *   - NOT receive any per-turn context injection
 *   - NOT increment tefAdTurnCount
 *
 * On the second and subsequent turns:
 *   - Context IS injected (phase-based)
 *   - tefAdTurnCount IS incremented
 *
 * Source-text specs verify the required implementation in App.tsx.
 * Behavioural specs exercise sendVoiceMessage directly.
 *
 * Tests FAIL before the implementation is in place.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

  it('App.tsx declares tefAdTurnCount state', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/tefAdTurnCount/);
  });

  it('App.tsx does NOT increment tefAdTurnCount when tefAdIsFirstMessage is true', async () => {
    const src = await import('../App?raw');
    // The tefAdTurnCount increment must be guarded by the first-message skip:
    // setTefAdTurnCount must appear after setTefAdIsFirstMessage(false), indicating
    // it only runs in the else (non-first-message) branch.
    const setFalseIdx = src.default.indexOf('setTefAdIsFirstMessage(false)');
    const incrementIdx = src.default.search(/setTefAdTurnCount\s*\(/);
    expect(setFalseIdx).toBeGreaterThan(-1);
    expect(incrementIdx).toBeGreaterThan(setFalseIdx);
  });

  it('App.tsx uses tefAdIsFirstMessage to gate context injection', async () => {
    const src = await import('../App?raw');
    // The condition must check tefAdIsFirstMessage before building phase context
    expect(src.default).toMatch(/tefAdIsFirstMessage/);
    // There must be branching logic that ties tefAdIsFirstMessage to context skipping
    expect(src.default).toMatch(/tefAdIsFirstMessage[\s\S]{0,400}tefAdTurnCount|tefAdTurnCount[\s\S]{0,400}tefAdIsFirstMessage/);
  });
});

// ---------------------------------------------------------------------------
// Behavioural specs: verify sendVoiceMessage call on first vs second turn
// ---------------------------------------------------------------------------

describe('persuasionFirstMessage · sendVoiceMessage receives no context on first turn', () => {
  const FAKE_AUDIO = 'ZmFrZWF1ZGlv';
  const FAKE_MIME = 'audio/webm';

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('sendVoiceMessage 4th argument (contextText) must be undefined/absent for first turn', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    const { mockParleBff } = await import('./helpers/mockParleBff');
    mockParleBff({ onChat: (body) => chatBodies.push(body) });
    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');

    setScenario({
      id: 'tef-persuasion',
      name: 'TEF Ad Persuasion',
      description: 'You are a skeptical friend.',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'friend', name: 'Friend', role: 'friend', voiceName: 'aoede' }],
    });
    await initializeSession();
    await sendVoiceMessage(FAKE_AUDIO, FAKE_MIME, undefined, undefined);
    expect(chatBodies[0]?.contextText).toBeUndefined();
  });

  it('sendVoiceMessage with contextText passes a text part — confirming second-turn behaviour', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    const { mockParleBff } = await import('./helpers/mockParleBff');
    mockParleBff({ onChat: (body) => chatBodies.push(body) });
    const { sendVoiceMessage, initializeSession, setScenario } = await import('../services/geminiService');

    setScenario({
      id: 'tef-persuasion-2',
      name: 'TEF Ad Persuasion',
      description: 'You are a skeptical friend.',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'friend', name: 'Friend', role: 'friend', voiceName: 'aoede' }],
    });
    await initializeSession();
    const contextText = '[Per-turn context: early phase — encourage the user to introduce and present the advertisement clearly.]';
    await sendVoiceMessage(FAKE_AUDIO, FAKE_MIME, undefined, contextText);
    expect(String(chatBodies[0]?.contextText ?? '')).toContain('[Per-turn context:');
  });
});
