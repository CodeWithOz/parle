import { isAbortLikeError } from '../utils/isAbortLikeError';
import type { BffErrorCode } from './http';

export const UPSTREAM_AUTH_MESSAGE =
  'The configured API key was rejected by the provider. Please update your key.';

export const UPSTREAM_GENERIC_MESSAGE = 'The AI provider could not complete this request.';

export function classifyProviderError(err: unknown): {
  code: BffErrorCode;
  httpStatus: number;
  message: string;
} {
  if (isAbortLikeError(err)) {
    throw err;
  }

  const status =
    typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);

  const authLike =
    status === 401 ||
    status === 403 ||
    /unauthenticated|permission_denied|api_key_invalid|api key not valid|invalid api key|api_key_invalid|key has been blocked|expired api key/i.test(
      text
    );

  if (authLike) {
    return { code: 'UPSTREAM_AUTH_FAILED', httpStatus: 401, message: UPSTREAM_AUTH_MESSAGE };
  }

  return { code: 'UPSTREAM_ERROR', httpStatus: 502, message: UPSTREAM_GENERIC_MESSAGE };
}

export function classifyHttpStatus(status: number, bodyText: string): {
  code: BffErrorCode;
  httpStatus: number;
  message: string;
} {
  const authLike =
    status === 401 ||
    status === 403 ||
    /unauthenticated|permission_denied|api_key_invalid|api key not valid|invalid api key|key has been blocked/i.test(
      bodyText
    );
  if (authLike) {
    return { code: 'UPSTREAM_AUTH_FAILED', httpStatus: 401, message: UPSTREAM_AUTH_MESSAGE };
  }
  return { code: 'UPSTREAM_ERROR', httpStatus: 502, message: UPSTREAM_GENERIC_MESSAGE };
}
