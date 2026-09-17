import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockParleBff, jsonResponse } from './helpers/mockParleBff';

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv';
const FAKE_MIME_TYPE = 'audio/webm';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('transcribeAndCleanupAudio · AbortSignal forwarding', () => {
  it('forwards AbortSignal into fetch without dropping cleanup JSON mode', async () => {
    const abortController = new AbortController();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(abortController.signal);
      const body = JSON.parse(String(init?.body ?? '{}')) as { cleanup?: boolean };
      expect(body.cleanup).toBe(true);
      return jsonResponse({ rawTranscript: 'RAW', cleanedTranscript: 'CLEANED' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { transcribeAndCleanupAudio } = await import('../services/geminiService');
    const result = await transcribeAndCleanupAudio(FAKE_AUDIO_BASE64, FAKE_MIME_TYPE, abortController.signal);
    expect(result).toEqual({ rawTranscript: 'RAW', cleanedTranscript: 'CLEANED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
