import { describe, expect, it } from 'vitest';
import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME } from '../worker/constants';
import { handleCreateSession, handleRevoke, handleSessionStatus } from '../worker/routes/session';
import { seal } from '../worker/seal';
import type { SessionPayload } from '../worker/session';

const SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const env = {
  API_KEY_COOKIE_SECRET: SECRET,
} as Env;

function cookieFrom(response: Response): string | null {
  return response.headers.get('Set-Cookie');
}

describe('session routes', () => {
  it('sets an HttpOnly cookie on POST /api/session', async () => {
    const request = new Request('http://localhost:8787/api/session', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ geminiApiKey: 'AIza-test-key-123456' }),
    });
    const response = await handleCreateSession(request, env);
    expect(response.status).toBe(200);
    const body = await response.json() as { hasGemini: boolean; hasOpenai: boolean };
    expect(body.hasGemini).toBe(true);
    expect(body.hasOpenai).toBe(false);
    const setCookie = cookieFrom(response);
    expect(setCookie).toContain(COOKIE_NAME);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).not.toContain('AIza-test-key-123456');
  });

  it('rejects a mismatched Origin with 403', async () => {
    const request = new Request('https://parle.example/api/session', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ geminiApiKey: 'AIza-test-key-123456' }),
    });
    const response = await handleCreateSession(request, env);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'FORBIDDEN' });
  });

  it('merges OpenAI without dropping an existing Gemini key', async () => {
    const payload: SessionPayload = {
      v: 1,
      keys: { gemini: 'AIza-existing-gemini-key' },
      createdAt: Math.floor(Date.now() / 1000),
    };
    const token = await seal(payload, SECRET);
    const request = new Request('http://localhost:8787/api/session', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
        Cookie: `${COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({ openaiApiKey: 'sk-test-openai-key-123456' }),
    });
    const response = await handleCreateSession(request, env);
    const body = await response.json() as { hasGemini: boolean; hasOpenai: boolean };
    expect(body.hasGemini).toBe(true);
    expect(body.hasOpenai).toBe(true);
  });

  it('returns hasGemini false when the cookie is missing', async () => {
    const request = new Request('http://localhost:8787/api/session/status');
    const response = await handleSessionStatus(request, env);
    expect(await response.json()).toMatchObject({ hasGemini: false, hasOpenai: false, hasApiKey: false });
    expect(cookieFrom(response)).toBeNull();
  });

  it('clears the cookie on POST /api/revoke without requiring JSON', async () => {
    const request = new Request('http://localhost:8787/api/revoke', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' },
    });
    const response = await handleRevoke(request, env);
    expect(response.status).toBe(200);
    expect(cookieFrom(response)).toContain('Max-Age=0');
    expect(await response.json()).toMatchObject({ success: true, hasApiKey: false });
  });

  it('treats a session older than COOKIE_MAX_AGE_SECONDS as invalid and clears the cookie', async () => {
    const payload: SessionPayload = {
      v: 1,
      keys: { gemini: 'AIza-existing-gemini-key' },
      createdAt: Math.floor(Date.now() / 1000) - COOKIE_MAX_AGE_SECONDS - 1,
    };
    const token = await seal(payload, SECRET);
    const request = new Request('http://localhost:8787/api/session/status', {
      headers: { Cookie: `${COOKIE_NAME}=${token}` },
    });
    const response = await handleSessionStatus(request, env);
    expect(await response.json()).toMatchObject({ hasGemini: false, hasOpenai: false, hasApiKey: false });
    expect(cookieFrom(response)).toContain('Max-Age=0');
  });

  it('treats a sealed payload with null keys as invalid and clears the cookie', async () => {
    const token = await seal({
      v: 1,
      keys: null,
      createdAt: Math.floor(Date.now() / 1000),
    }, SECRET);
    const request = new Request('http://localhost:8787/api/session/status', {
      headers: { Cookie: `${COOKIE_NAME}=${token}` },
    });
    const response = await handleSessionStatus(request, env);
    expect(await response.json()).toMatchObject({ hasGemini: false, hasOpenai: false, hasApiKey: false });
    expect(cookieFrom(response)).toContain('Max-Age=0');
  });

  it('treats a sealed payload with a non-string provider key as invalid', async () => {
    const token = await seal({
      v: 1,
      keys: { gemini: 123 },
      createdAt: Math.floor(Date.now() / 1000),
    }, SECRET);
    const request = new Request('http://localhost:8787/api/session/status', {
      headers: { Cookie: `${COOKIE_NAME}=${token}` },
    });
    const response = await handleSessionStatus(request, env);
    expect(await response.json()).toMatchObject({ hasApiKey: false });
    expect(cookieFrom(response)).toContain('Max-Age=0');
  });

  it('rejects a control-character key', async () => {
    const request = new Request('http://localhost:8787/api/session', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ geminiApiKey: 'AIza-bad\u0000-key-123456' }),
    });
    const response = await handleCreateSession(request, env);
    expect(response.status).toBe(400);
  });
});
