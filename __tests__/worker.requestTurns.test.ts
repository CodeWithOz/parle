import { describe, expect, it } from 'vitest';
import { COOKIE_NAME } from '../worker/constants';
import { handleChat, handleScenarioReview, handleTefReview } from '../worker/routes/ai';
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

function jsonRequest(path: string, cookie: string, body: unknown): Request {
  return new Request(`http://localhost:8787${path}`, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

describe('Worker request-boundary turn validation', () => {
  it('rejects null history entries on POST /api/chat with VALIDATION_ERROR', async () => {
    const cookie = await sessionCookie();
    const response = await handleChat(
      jsonRequest('/api/chat', cookie, {
        audioBase64: 'Zg==',
        mimeType: 'audio/webm',
        history: [null],
      }),
      env
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('rejects invalid history roles on POST /api/chat', async () => {
    const cookie = await sessionCookie();
    const response = await handleChat(
      jsonRequest('/api/chat', cookie, {
        audioBase64: 'Zg==',
        mimeType: 'audio/webm',
        history: [{ role: 'admin', text: 'bonjour' }],
      }),
      env
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('rejects TEF review turns with a non-string field', async () => {
    const cookie = await sessionCookie();
    const response = await handleTefReview(
      jsonRequest('/api/tef-review', cookie, {
        exerciseType: 'questioning',
        turns: [{ role: 'user', text: 12 }],
      }),
      env
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('rejects scenario review turns that are not objects', async () => {
    const cookie = await sessionCookie();
    const response = await handleScenarioReview(
      jsonRequest('/api/scenario-review', cookie, {
        turns: ['bonjour'],
      }),
      env
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });
});
