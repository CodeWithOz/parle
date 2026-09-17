import { isAbortLikeError } from '../utils/isAbortLikeError';

export type BffErrorCode =
  | 'NO_API_KEY_SESSION'
  | 'INVALID_API_KEY_SESSION'
  | 'UPSTREAM_AUTH_FAILED'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'VALIDATION_ERROR'
  | 'MISSING_PROVIDER_KEY';

export class BffError extends Error {
  readonly code: BffErrorCode;
  readonly httpStatus: number;

  constructor(code: BffErrorCode, httpStatus: number, message?: string) {
    super(message || code);
    this.name = 'BffError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set([
  'NO_API_KEY_SESSION',
  'INVALID_API_KEY_SESSION',
  'UPSTREAM_AUTH_FAILED',
  'UPSTREAM_ERROR',
  'INTERNAL_ERROR',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'VALIDATION_ERROR',
  'MISSING_PROVIDER_KEY',
]);

function isBffErrorCode(value: string): value is BffErrorCode {
  return ERROR_CODES.has(value);
}

export async function bffFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers,
    });
  } catch (err) {
    if (isAbortLikeError(err)) throw err;
    throw new BffError('UPSTREAM_ERROR', 502, 'Network error');
  }

  let parsed: unknown = null;
  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const body = parsed as { error?: string; message?: string } | null;
    const code = body?.error && isBffErrorCode(body.error) ? body.error : 'UPSTREAM_ERROR';
    throw new BffError(code, response.status, body?.message);
  }

  return parsed as T;
}
