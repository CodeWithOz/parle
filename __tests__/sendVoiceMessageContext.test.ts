import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockParleBff } from './helpers/mockParleBff';

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv';
const FAKE_MIME_TYPE = 'audio/webm';

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('sendVoiceMessage · contextText parameter — existence', () => {
  it('sendVoiceMessage accepts a 4th contextText parameter without throwing a type error', async () => {
    const { sendVoiceMessage } = await import('../services/geminiService');
    expect(typeof sendVoiceMessage).toBe('function');
    expect(sendVoiceMessage.length).toBeGreaterThanOrEqual(2);
  });
});

describe('sendVoiceMessage · contextText provided', () => {
  it('includes contextText in the POST /api/chat body', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    mockParleBff({
      transcription: 'Bonjour mon ami.',
      onChat: (body) => chatBodies.push(body),
    });
    const { sendVoiceMessage, initializeSession } = await import('../services/geminiService');
    await initializeSession();
    const contextText = '[Turn context: Direction 1/5 · Round 1/3. Raise objection about price.]';
    await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, undefined, contextText);
    expect(chatBodies[0]?.contextText).toBe(contextText);
    expect(chatBodies[0]?.audioBase64).toBe(FAKE_AUDIO_BASE64);
  });

  it('sends the current user audio alongside the contextText', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    mockParleBff({ onChat: (body) => chatBodies.push(body) });
    const { sendVoiceMessage, initializeSession } = await import('../services/geminiService');
    await initializeSession();
    await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, undefined, '[Turn context: Direction 2/5 · Round 3/3.]');
    expect(chatBodies[0]?.audioBase64).toBe(FAKE_AUDIO_BASE64);
    expect(chatBodies[0]?.mimeType).toBe(FAKE_MIME_TYPE);
  });
});

describe('sendVoiceMessage · contextText omitted', () => {
  it('does NOT add contextText when it is undefined', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    mockParleBff({ onChat: (body) => chatBodies.push(body) });
    const { sendVoiceMessage, initializeSession } = await import('../services/geminiService');
    await initializeSession();
    await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, undefined, undefined);
    expect(chatBodies[0]?.contextText).toBeUndefined();
  });

  it('does NOT add contextText when it is an empty string', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    mockParleBff({ onChat: (body) => chatBodies.push(body) });
    const { sendVoiceMessage, initializeSession } = await import('../services/geminiService');
    await initializeSession();
    await sendVoiceMessage(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, undefined, '');
    expect(chatBodies[0]?.contextText).toBeUndefined();
  });
});

describe('sendVoiceMessage · source-text spec for contextText parameter', () => {
  it('geminiService source declares a 4th parameter (contextText) on sendVoiceMessage', async () => {
    const src = await import('../services/geminiService?raw');
    expect((src as { default: string }).default).toMatch(/sendVoiceMessage\s*=\s*async\s*\([^)]*contextText/);
  });

  it('geminiService source uses contextText when building the chat message parts', async () => {
    const src = await import('../services/geminiService?raw');
    expect((src as { default: string }).default).toMatch(/contextText/);
  });
});
