import { COOKIE_MAX_AGE_SECONDS, MAX_API_KEY_LENGTH, MIN_API_KEY_LENGTH } from './constants';
import { readNamedCookie, serializeDeletedSessionCookie, serializeSessionCookie } from './cookies';
import { seal, unsealWithRotation } from './seal';

export interface SessionKeys {
  gemini?: string;
  openai?: string;
}

export interface SessionPayload {
  v: 1;
  keys: SessionKeys;
  createdAt: number;
}

export type SessionReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'ok'; payload: SessionPayload; resealed?: string };

export function isPlausibleApiKey(key: string): boolean {
  if (key.length < MIN_API_KEY_LENGTH || key.length > MAX_API_KEY_LENGTH) {
    return false;
  }
  if (/[\u0000-\u001f\u007f]/.test(key)) {
    return false;
  }
  return true;
}

export function publicSessionStatus(payload: SessionPayload | null): {
  hasGemini: boolean;
  hasOpenai: boolean;
  hasApiKey: boolean;
  createdAt?: number;
} {
  const hasGemini = Boolean(payload?.keys.gemini);
  const hasOpenai = Boolean(payload?.keys.openai);
  return {
    hasGemini,
    hasOpenai,
    hasApiKey: hasGemini || hasOpenai,
    ...(payload ? { createdAt: payload.createdAt } : {}),
  };
}

export async function readSession(request: Request, env: Env): Promise<SessionReadResult> {
  const token = readNamedCookie(request);
  if (!token) {
    return { status: 'missing' };
  }
  const result = await unsealWithRotation<SessionPayload>(
    token,
    env.API_KEY_COOKIE_SECRET,
    env.API_KEY_COOKIE_SECRET_PREVIOUS
  );
  if (!result || result.payload.v !== 1 || typeof result.payload.keys !== 'object') {
    return { status: 'invalid' };
  }
  const createdAt = result.payload.createdAt;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) {
    return { status: 'invalid' };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - createdAt > COOKIE_MAX_AGE_SECONDS) {
    return { status: 'invalid' };
  }
  return { status: 'ok', payload: result.payload, resealed: result.resealed };
}

export async function requireSession(request: Request, env: Env): Promise<
  | { ok: true; payload: SessionPayload; setCookie?: string }
  | { ok: false; reason: 'missing' | 'invalid'; setCookie?: string }
> {
  const result = await readSession(request, env);
  if (result.status === 'missing') {
    return { ok: false, reason: 'missing' };
  }
  if (result.status === 'invalid') {
    return { ok: false, reason: 'invalid', setCookie: serializeDeletedSessionCookie() };
  }
  return {
    ok: true,
    payload: result.payload,
    setCookie: result.resealed ? serializeSessionCookie(result.resealed) : undefined,
  };
}

export async function requireGeminiSession(request: Request, env: Env): Promise<
  | { ok: true; payload: SessionPayload; geminiKey: string; setCookie?: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'missing_provider'; setCookie?: string }
> {
  const session = await requireSession(request, env);
  if (!session.ok) return session;
  const geminiKey = session.payload.keys.gemini;
  if (!geminiKey) {
    return { ok: false, reason: 'missing_provider', setCookie: session.setCookie };
  }
  return { ok: true, payload: session.payload, geminiKey, setCookie: session.setCookie };
}

export async function requireOpenaiSession(request: Request, env: Env): Promise<
  | { ok: true; payload: SessionPayload; openaiKey: string; setCookie?: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'missing_provider'; setCookie?: string }
> {
  const session = await requireSession(request, env);
  if (!session.ok) return session;
  const openaiKey = session.payload.keys.openai;
  if (!openaiKey) {
    return { ok: false, reason: 'missing_provider', setCookie: session.setCookie };
  }
  return { ok: true, payload: session.payload, openaiKey, setCookie: session.setCookie };
}

export async function sealSession(payload: SessionPayload, env: Env): Promise<string> {
  return serializeSessionCookie(await seal(payload, env.API_KEY_COOKIE_SECRET));
}

export async function slidingSessionCookie(
  payload: SessionPayload,
  env: Env,
  existingSetCookie?: string
): Promise<string> {
  if (existingSetCookie) return existingSetCookie;
  return sealSession(payload, env);
}

export function mergeSessionKeys(
  existing: SessionKeys | undefined,
  incoming: { geminiApiKey?: unknown; openaiApiKey?: unknown; removeGemini?: unknown; removeOpenai?: unknown }
): { keys: SessionKeys; error?: string } {
  const keys: SessionKeys = { ...(existing ?? {}) };

  if (incoming.removeGemini === true) {
    delete keys.gemini;
  } else if (typeof incoming.geminiApiKey === 'string' && incoming.geminiApiKey.trim()) {
    const trimmed = incoming.geminiApiKey.trim();
    if (!isPlausibleApiKey(trimmed)) {
      return { keys, error: 'Invalid Gemini API key' };
    }
    keys.gemini = trimmed;
  }

  if (incoming.removeOpenai === true) {
    delete keys.openai;
  } else if (typeof incoming.openaiApiKey === 'string' && incoming.openaiApiKey.trim()) {
    const trimmed = incoming.openaiApiKey.trim();
    if (!isPlausibleApiKey(trimmed)) {
      return { keys, error: 'Invalid OpenAI API key' };
    }
    keys.openai = trimmed;
  }

  return { keys };
}
