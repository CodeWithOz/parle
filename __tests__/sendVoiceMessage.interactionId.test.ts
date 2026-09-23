import { describe, it, expect, vi, afterEach } from 'vitest';
import { jsonResponse, mockParleBff } from './helpers/mockParleBff';
import type { Message } from '../types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('sendVoiceMessage · previousInteractionId chain', () => {
  it('omits history on the second turn and sends previousInteractionId', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    let chatCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/transcribe')) {
        return jsonResponse({ text: 'Bonjour.' });
      }
      if (url.includes('/api/chat')) {
        chatCount += 1;
        chatBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return jsonResponse({
          modelJson: { french: 'Bonjour!', english: 'Hello!', hint: 'Continue' },
          interactionId: `int_${chatCount}`,
        });
      }
      if (url.includes('/api/tts')) {
        return jsonResponse({ audioBase64: 'ZmFrZQ==', mimeType: 'audio/pcm' });
      }
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    }));

    const { sendVoiceMessage, initializeSession, resetSession } = await import('../services/geminiService');
    resetSession(null);
    await initializeSession();
    await sendVoiceMessage('Y3VycmVudA==', 'audio/webm');
    await sendVoiceMessage('c2Vjb25k', 'audio/webm');

    expect(chatBodies[0]?.previousInteractionId).toBeUndefined();
    expect(chatBodies[1]?.previousInteractionId).toBe('int_1');
    expect(chatBodies[1]?.history).toBeUndefined();
  });

  it('uses regenerateFromInteractionId rather than the latest id when regenerating', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    let chatCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/transcribe')) {
        return jsonResponse({ text: 'Bonjour.' });
      }
      if (url.includes('/api/chat')) {
        chatCount += 1;
        chatBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return jsonResponse({
          modelJson: { french: 'Bonjour!', english: 'Hello!', hint: 'Continue' },
          interactionId: `int_${chatCount}`,
        });
      }
      if (url.includes('/api/tts')) {
        return jsonResponse({ audioBase64: 'ZmFrZQ==', mimeType: 'audio/pcm' });
      }
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    }));

    const { sendVoiceMessage, initializeSession, resetSession } = await import('../services/geminiService');
    resetSession(null);
    await initializeSession();
    await sendVoiceMessage('Zmlyc3Q=', 'audio/webm');
    await sendVoiceMessage('c2Vjb25k', 'audio/webm');
    await sendVoiceMessage('c2Vjb25k', 'audio/webm', undefined, undefined, [], { regenerate: true });

    expect(chatBodies[2]?.previousInteractionId).toBe('int_1');
  });

  it('clears interaction cursors on resetSession', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    mockParleBff({ onChat: (body) => chatBodies.push(body) });
    const { sendVoiceMessage, initializeSession, resetSession } = await import('../services/geminiService');
    resetSession(null);
    await initializeSession();
    await sendVoiceMessage('Zmlyc3Q=', 'audio/webm');
    resetSession(null);
    await sendVoiceMessage('c2Vjb25k', 'audio/webm');
    expect(chatBodies[1]?.previousInteractionId).toBeUndefined();
  });

  it('retries with audio history when the previous interaction is gone', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    let chatCount = 0;
    const fakeBlob = new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/webm' });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('blob:')) {
        return { ok: true, blob: async () => fakeBlob } as Response;
      }
      if (url.includes('/api/transcribe')) {
        return jsonResponse({ text: 'Bonjour.' });
      }
      if (url.includes('/api/chat')) {
        chatCount += 1;
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        chatBodies.push(body);
        if (chatCount === 2) {
          return jsonResponse({ error: 'INTERACTION_NOT_FOUND', message: 'Previous interaction was not found' }, 404);
        }
        return jsonResponse({
          modelJson: { french: 'Bonjour!', english: 'Hello!', hint: 'Continue' },
          interactionId: `int_${chatCount}`,
        });
      }
      if (url.includes('/api/tts')) {
        return jsonResponse({ audioBase64: 'ZmFrZQ==', mimeType: 'audio/pcm' });
      }
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    }));

    const prior: Message[] = [
      { role: 'user', text: 'bonjour', timestamp: 1, audioUrl: 'blob:http://localhost/user-1' },
      { role: 'model', text: 'Bonjour!', frenchText: 'Bonjour!', timestamp: 2 },
    ];
    const { sendVoiceMessage, initializeSession, resetSession } = await import('../services/geminiService');
    resetSession(null);
    await initializeSession();
    await sendVoiceMessage('Zmlyc3Q=', 'audio/webm');
    await sendVoiceMessage('c2Vjb25k', 'audio/webm', undefined, undefined, prior);

    expect(chatBodies[1]?.previousInteractionId).toBe('int_1');
    expect(chatBodies[2]?.previousInteractionId).toBeUndefined();
    const history = chatBodies[2]?.history as Array<Record<string, unknown>>;
    expect(history[0]?.audioBase64).toBeTruthy();
  });

  it('does not advance interaction cursors when chat JSON validation fails', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
    let chatCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/transcribe')) {
        return jsonResponse({ text: 'Bonjour.' });
      }
      if (url.includes('/api/chat')) {
        chatCount += 1;
        chatBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        if (chatCount === 2) {
          return jsonResponse({
            modelJson: { not: 'a valid voice response' },
            interactionId: 'int_2',
          });
        }
        return jsonResponse({
          modelJson: { french: 'Bonjour!', english: 'Hello!', hint: 'Continue' },
          interactionId: `int_${chatCount}`,
        });
      }
      if (url.includes('/api/tts')) {
        return jsonResponse({ audioBase64: 'ZmFrZQ==', mimeType: 'audio/pcm' });
      }
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    }));

    const { sendVoiceMessage, initializeSession, resetSession } = await import('../services/geminiService');
    resetSession(null);
    await initializeSession();
    await sendVoiceMessage('Zmlyc3Q=', 'audio/webm');
    await expect(sendVoiceMessage('c2Vjb25k', 'audio/webm')).rejects.toThrow(/Failed to validate/);
    await sendVoiceMessage('dGhpcmQ=', 'audio/webm');

    expect(chatBodies[1]?.previousInteractionId).toBe('int_1');
    expect(chatBodies[2]?.previousInteractionId).toBe('int_1');
    expect(chatBodies[2]?.history).toBeUndefined();
  });
});

describe('sendVoiceMessage · regenerate option source', () => {
  it('App.tsx passes regenerate: isRegenerate into sendVoiceMessage', async () => {
    const src = (await import('../App?raw')).default as string;
    expect(src).toMatch(/sendVoiceMessage\s*\([\s\S]*?regenerate:\s*isRegenerate/s);
  });
});
