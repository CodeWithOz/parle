import { describe, expect, it } from 'vitest';
import { COOKIE_NAME } from '../worker/constants';
import { handleChat, handleTranscribe } from '../worker/routes/ai';
import { handleCreateSession } from '../worker/routes/session';

const SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const env = {
  API_KEY_COOKIE_SECRET: SECRET,
} as Env;

async function sessionCookie(): Promise<string> {
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

describe('Worker AI route auth', () => {
  it('returns 401 without a session cookie', async () => {
    const response = await handleTranscribe(
      new Request('http://localhost:8787/api/transcribe', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audioBase64: 'Zg==', mimeType: 'audio/webm' }),
      }),
      env
    );
    expect(response.status).toBe(401);
    const body = await response.json() as { error: string };
    expect(body.error).toBe('NO_API_KEY_SESSION');
  });

  it('rejects a mismatched Origin on POST /api/chat', async () => {
    const cookie = await sessionCookie();
    const response = await handleChat(
      new Request('https://parle.example/api/chat', {
        method: 'POST',
        headers: {
          Origin: 'https://evil.example',
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ audioBase64: 'Zg==', mimeType: 'audio/webm', history: [] }),
      }),
      env
    );
    expect(response.status).toBe(403);
  });

  it('requires audio on POST /api/chat', async () => {
    const cookie = await sessionCookie();
    const response = await handleChat(
      new Request('http://localhost:8787/api/chat', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ history: [{ role: 'user', text: 'bonjour' }] }),
      }),
      env
    );
    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toBe('VALIDATION_ERROR');
  });
});
