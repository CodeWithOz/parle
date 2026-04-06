import { describe, it, expect } from 'vitest';
import { isAbortLikeError } from '../utils/isAbortLikeError';

describe('isAbortLikeError', () => {
  it('returns true for DOMException AbortError', () => {
    expect(isAbortLikeError(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('returns true for Error with name AbortError (SDK / fetch often use this)', () => {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    expect(isAbortLikeError(err)).toBe(true);
  });

  it('returns true for nested cause AbortError', () => {
    const inner = new Error('inner');
    inner.name = 'AbortError';
    const outer = new Error('wrapper');
    (outer as Error & { cause?: unknown }).cause = inner;
    expect(isAbortLikeError(outer)).toBe(true);
  });

  it('returns false for generic Error', () => {
    expect(isAbortLikeError(new Error('network'))).toBe(false);
  });

  it('returns true for @google/genai wrapped Error (name still Error, message describes abort)', () => {
    const err = new Error(
      'exception AbortError: signal is aborted without reason sending request'
    );
    expect(err.name).toBe('Error');
    expect(isAbortLikeError(err)).toBe(true);
  });

  it('returns true for APIUserAbortError-style name', () => {
    const err = new Error('Request was aborted.');
    err.name = 'APIUserAbortError';
    expect(isAbortLikeError(err)).toBe(true);
  });
});
