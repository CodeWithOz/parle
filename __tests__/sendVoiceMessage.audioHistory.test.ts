import { describe, it, expect, vi, afterEach } from 'vitest';
import { jsonResponse } from './helpers/mockParleBff';
import type { Message } from '../types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('sendVoiceMessage · audio-first history', () => {
  it('posts prior user recordings as audioBase64 instead of transcripts', async () => {
    const chatBodies: Array<Record<string, unknown>> = [];
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
        chatBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return jsonResponse({
          modelJson: { french: 'Bonjour!', english: 'Hello!', hint: 'Continue' },
        });
      }
      if (url.includes('/api/tts')) {
        return jsonResponse({ audioBase64: 'ZmFrZQ==', mimeType: 'audio/pcm' });
      }
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
    }));

    const { sendVoiceMessage, initializeSession } = await import('../services/geminiService');
    await initializeSession();
    const prior: Message[] = [
      { role: 'user', text: 'bonjour transcript', timestamp: 1, audioUrl: 'blob:http://localhost/user-1' },
      { role: 'model', text: 'Bonjour!', frenchText: 'Bonjour!', timestamp: 2 },
    ];
    await sendVoiceMessage('Y3VycmVudA==', 'audio/webm', undefined, undefined, prior);
    const history = chatBodies[0]?.history as Array<Record<string, unknown>>;
    expect(history[0]?.role).toBe('user');
    expect(history[0]?.audioBase64).toBeTruthy();
    expect(history[0]?.text).toBeUndefined();
    expect(history[1]).toMatchObject({ role: 'model', frenchText: 'Bonjour!' });
  });
});
