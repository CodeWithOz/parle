import { serializeDeletedSessionCookie } from '../cookies';
import { isAllowedOrigin } from '../csrf';
import { errorJson, isJsonContentType, json } from '../http';
import {
  mergeSessionKeys,
  publicSessionStatus,
  readSession,
  sealSession,
  type SessionPayload,
} from '../session';

function originDenied(): Response {
  return errorJson('FORBIDDEN', 403);
}

export async function handleCreateSession(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorJson('METHOD_NOT_ALLOWED', 405);
  }
  if (!isAllowedOrigin(request)) {
    return originDenied();
  }
  if (!isJsonContentType(request)) {
    return errorJson('VALIDATION_ERROR', 400, 'Content-Type must be application/json');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('VALIDATION_ERROR', 400, 'Invalid JSON body');
  }
  if (typeof body !== 'object' || body === null) {
    return errorJson('VALIDATION_ERROR', 400, 'Invalid JSON body');
  }

  const existing = await readSession(request, env);
  const existingKeys = existing.status === 'ok' ? existing.payload.keys : undefined;
  const createdAt =
    existing.status === 'ok' ? existing.payload.createdAt : Math.floor(Date.now() / 1000);

  const merged = mergeSessionKeys(existingKeys, body as Record<string, unknown>);
  if (merged.error) {
    return errorJson('VALIDATION_ERROR', 400, merged.error);
  }

  if (!merged.keys.gemini && !merged.keys.openai) {
    const headers = new Headers();
    headers.append('Set-Cookie', serializeDeletedSessionCookie());
    return json({ success: true, ...publicSessionStatus(null) }, 200, headers);
  }

  const payload: SessionPayload = { v: 1, keys: merged.keys, createdAt };
  const headers = new Headers();
  headers.append('Set-Cookie', await sealSession(payload, env));
  return json({ success: true, ...publicSessionStatus(payload) }, 200, headers);
}

export async function handleSessionStatus(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return errorJson('METHOD_NOT_ALLOWED', 405);
  }

  const result = await readSession(request, env);
  if (result.status === 'missing') {
    return json(publicSessionStatus(null));
  }
  if (result.status === 'invalid') {
    const headers = new Headers();
    headers.append('Set-Cookie', serializeDeletedSessionCookie());
    return json(publicSessionStatus(null), 200, headers);
  }

  const headers = new Headers();
  if (result.resealed) {
    headers.append('Set-Cookie', await sealSession(result.payload, env));
  }
  return json(publicSessionStatus(result.payload), 200, headers);
}

export async function handleRevoke(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorJson('METHOD_NOT_ALLOWED', 405);
  }
  if (!isAllowedOrigin(request)) {
    return originDenied();
  }

  let body: Record<string, unknown> = {};
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType && isJsonContentType(request)) {
    try {
      const parsed = await request.json();
      if (typeof parsed === 'object' && parsed !== null) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      return errorJson('VALIDATION_ERROR', 400, 'Invalid JSON body');
    }
  }

  const provider = body.provider;
  if (provider === 'gemini' || provider === 'openai') {
    const existing = await readSession(request, env);
    const existingKeys = existing.status === 'ok' ? existing.payload.keys : undefined;
    const merged = mergeSessionKeys(existingKeys, {
      removeGemini: provider === 'gemini',
      removeOpenai: provider === 'openai',
    });
    if (!merged.keys.gemini && !merged.keys.openai) {
      const headers = new Headers();
      headers.append('Set-Cookie', serializeDeletedSessionCookie());
      return json({ success: true, ...publicSessionStatus(null) }, 200, headers);
    }
    const payload: SessionPayload = {
      v: 1,
      keys: merged.keys,
      createdAt: existing.status === 'ok' ? existing.payload.createdAt : Math.floor(Date.now() / 1000),
    };
    const headers = new Headers();
    headers.append('Set-Cookie', await sealSession(payload, env));
    return json({ success: true, ...publicSessionStatus(payload) }, 200, headers);
  }

  const headers = new Headers();
  headers.append('Set-Cookie', serializeDeletedSessionCookie());
  return json({ success: true, ...publicSessionStatus(null) }, 200, headers);
}
