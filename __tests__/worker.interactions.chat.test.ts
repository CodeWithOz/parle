import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COOKIE_NAME } from '../worker/constants';

const geminiCreateInteraction = vi.fn();

vi.mock('../worker/gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../worker/gemini')>();
  return {
    ...actual,
    geminiCreateInteraction: (...args: unknown[]) => geminiCreateInteraction(...args),
  };
});

const SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const env = {
  API_KEY_COOKIE_SECRET: SECRET,
} as Env;

async function sessionCookie(): Promise<string> {
  const { handleCreateSession } = await import('../worker/routes/session');
  const response = await handleCreateSession(
    new Request('http://localhost:8787/api/session', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ geminiApiKey: 'AIza-test-key-123456' }),
    }),
    env
  );
  const setCookie = response.headers.get('Set-Cookie') ?? '';
  const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) throw new Error('missing session cookie');
  return `${COOKIE_NAME}=${match[1]}`;
}

function jsonRequest(cookie: string, body: unknown): Request {
  return new Request('http://localhost:8787/api/chat', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

describe('Worker chat · Interactions API', () => {
  beforeEach(() => {
    geminiCreateInteraction.mockReset();
    geminiCreateInteraction.mockResolvedValue({
      id: 'int_abc',
      outputText: JSON.stringify({ french: 'Salut', english: 'Hi' }),
    });
  });

  it('chains with previousInteractionId and does not rebuild history steps', async () => {
    const { handleChat } = await import('../worker/routes/ai');
    const cookie = await sessionCookie();
    const response = await handleChat(
      jsonRequest(cookie, {
        audioBase64: 'Y3VycmVudA==',
        mimeType: 'audio/webm',
        previousInteractionId: 'int_prev',
        history: [{ role: 'user', audioBase64: 'b2xk', mimeType: 'audio/webm' }],
      }),
      env
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { interactionId: string };
    expect(body.interactionId).toBe('int_abc');
    expect(geminiCreateInteraction).toHaveBeenCalledTimes(1);
    const params = geminiCreateInteraction.mock.calls[0][1] as {
      previousInteractionId?: string;
      store?: boolean;
      input: unknown;
    };
    expect(params.previousInteractionId).toBe('int_prev');
    expect(params.store).toBe(true);
    expect(params.input).toEqual([
      { type: 'audio', data: 'Y3VycmVudA==', mime_type: 'audio/webm' },
    ]);
  });

  it('rebuilds history steps when no previousInteractionId is sent', async () => {
    const { handleChat } = await import('../worker/routes/ai');
    const cookie = await sessionCookie();
    const response = await handleChat(
      jsonRequest(cookie, {
        audioBase64: 'Y3VycmVudA==',
        mimeType: 'audio/webm',
        history: [
          { role: 'user', audioBase64: 'b2xk', mimeType: 'audio/webm' },
          { role: 'model', frenchText: 'Bonjour' },
        ],
      }),
      env
    );
    expect(response.status).toBe(200);
    const params = geminiCreateInteraction.mock.calls[0][1] as {
      previousInteractionId?: string;
      input: unknown[];
    };
    expect(params.previousInteractionId).toBeUndefined();
    expect(params.input[0]).toEqual({
      type: 'user_input',
      content: [{ type: 'audio', data: 'b2xk', mime_type: 'audio/webm' }],
    });
    expect(params.input[1]).toEqual({
      type: 'model_output',
      content: [{ type: 'text', text: 'Bonjour' }],
    });
  });

  it('returns INTERACTION_NOT_FOUND when the previous id is rejected and history is empty', async () => {
    geminiCreateInteraction.mockRejectedValueOnce(Object.assign(new Error('unknown interaction'), { status: 404 }));
    const { handleChat } = await import('../worker/routes/ai');
    const cookie = await sessionCookie();
    const response = await handleChat(
      jsonRequest(cookie, {
        audioBase64: 'Y3VycmVudA==',
        mimeType: 'audio/webm',
        previousInteractionId: 'int_stale',
        history: [],
      }),
      env
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'INTERACTION_NOT_FOUND' });
  });

  it('retries without previousInteractionId when Gemini rejects the id and history is present', async () => {
    geminiCreateInteraction
      .mockRejectedValueOnce(Object.assign(new Error('Previous interaction not found'), { status: 404 }))
      .mockResolvedValueOnce({
        id: 'int_rebuilt',
        outputText: JSON.stringify({ french: 'Rebonjour', english: 'Hello again' }),
      });
    const { handleChat } = await import('../worker/routes/ai');
    const cookie = await sessionCookie();
    const response = await handleChat(
      jsonRequest(cookie, {
        audioBase64: 'Y3VycmVudA==',
        mimeType: 'audio/webm',
        previousInteractionId: 'int_stale',
        history: [
          { role: 'user', audioBase64: 'b2xk', mimeType: 'audio/webm' },
          { role: 'model', frenchText: 'Bonjour' },
        ],
      }),
      env
    );
    expect(response.status).toBe(200);
    expect(geminiCreateInteraction).toHaveBeenCalledTimes(2);
    const retryParams = geminiCreateInteraction.mock.calls[1][1] as { previousInteractionId?: string };
    expect(retryParams.previousInteractionId).toBeUndefined();
    const body = await response.json() as { interactionId: string };
    expect(body.interactionId).toBe('int_rebuilt');
  });
});
