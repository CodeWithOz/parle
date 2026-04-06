/**
 * True when `error` represents an aborted request (user cancel or signal deadline).
 * The Gemini SDK and fetch stacks may throw plain `Error` with `name === 'AbortError'`,
 * not only `DOMException`, so `instanceof DOMException` is insufficient.
 *
 * `@google/genai` also throws `APIUserAbortError` (name `APIUserAbortError`), and some
 * paths wrap failures as `Error` with `name` still defaulting to `"Error"` while the
 * message contains `signal is aborted` / `AbortError`.
 */
export function isAbortLikeError(error: unknown): boolean {
  if (error == null) {
    return false;
  }
  if (typeof error === 'object' && 'name' in error) {
    const n = (error as { name: string }).name;
    if (n === 'AbortError' || n === 'APIUserAbortError') {
      return true;
    }
  }
  if (error instanceof Error) {
    const msg = error.message;
    if (/signal is aborted/i.test(msg)) {
      return true;
    }
    if (/Request was aborted/i.test(msg)) {
      return true;
    }
    if (/AbortError/i.test(msg) && /signal is aborted|aborted without reason|sending request/i.test(msg)) {
      return true;
    }
  }
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    const c = (error as { cause?: unknown }).cause;
    if (c !== undefined && c !== error) {
      return isAbortLikeError(c);
    }
  }
  return false;
}
