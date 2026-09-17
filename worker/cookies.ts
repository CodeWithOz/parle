import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME, COOKIE_PATH } from './constants';

const SECURITY_ATTRIBUTES = `Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Strict`;

export function parseCookieHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(';');
  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function readNamedCookie(request: Request, name = COOKIE_NAME): string | undefined {
  return parseCookieHeader(request.headers.get('Cookie'), name);
}

export function serializeSessionCookie(value: string, maxAge = COOKIE_MAX_AGE_SECONDS): string {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; ${SECURITY_ATTRIBUTES}; Max-Age=${maxAge}`;
}

export function serializeDeletedSessionCookie(): string {
  return `${COOKIE_NAME}=; ${SECURITY_ATTRIBUTES}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
