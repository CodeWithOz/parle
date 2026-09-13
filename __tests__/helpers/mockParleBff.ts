import { vi } from 'vitest';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function mockParleBff(options?: {
  transcription?: string;
  modelJson?: unknown;
  onChat?: (body: Record<string, unknown>) => void;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/transcribe')) {
      return jsonResponse({ text: options?.transcription ?? 'Bonjour.' });
    }
    if (url.includes('/api/chat')) {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      options?.onChat?.(body);
      return jsonResponse({
        modelJson: options?.modelJson ?? {
          french: 'Bonjour!',
          english: 'Hello!',
          hint: 'Continue',
        },
      });
    }
    if (url.includes('/api/tts')) {
      return jsonResponse({ audioBase64: 'ZmFrZQ==', mimeType: 'audio/pcm' });
    }
    return jsonResponse({ error: 'NOT_FOUND' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
