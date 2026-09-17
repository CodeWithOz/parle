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

export function json(
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit
): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorJson(
  error: BffErrorCode,
  status: number,
  message?: string,
  extraHeaders?: HeadersInit
): Response {
  return json(message ? { error, message } : { error }, status, extraHeaders);
}

export function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get('Content-Type') ?? '';
  return contentType.toLowerCase().includes('application/json');
}
