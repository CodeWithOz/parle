import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../worker/csrf';

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe('isAllowedOrigin', () => {
  it('allows matching origin in production', () => {
    const req = request('https://parle.example/api/session', {
      Origin: 'https://parle.example',
    });
    expect(isAllowedOrigin(req)).toBe(true);
  });

  it('rejects a mismatched production origin', () => {
    const req = request('https://parle.example/api/session', {
      Origin: 'https://evil.example',
    });
    expect(isAllowedOrigin(req)).toBe(false);
  });

  it('allows localhost Origin against a different Worker port', () => {
    const req = request('http://localhost:8787/api/session', {
      Origin: 'http://localhost:3000',
    });
    expect(isAllowedOrigin(req)).toBe(true);
  });

  it('allows 127.0.0.1 Origin against localhost Worker', () => {
    const req = request('http://localhost:8787/api/chat', {
      Origin: 'http://127.0.0.1:3000',
    });
    expect(isAllowedOrigin(req)).toBe(true);
  });

  it('does not treat localhost Origin as valid on a public host', () => {
    const req = request('https://parle.example/api/session', {
      Origin: 'http://localhost:3000',
    });
    expect(isAllowedOrigin(req)).toBe(false);
  });

  it('falls back to Referer origin when Origin is absent', () => {
    const req = request('https://parle.example/api/session', {
      Referer: 'https://parle.example/settings',
    });
    expect(isAllowedOrigin(req)).toBe(true);
  });

  it('allows a request with neither Origin nor Referer', () => {
    const req = request('https://parle.example/api/revoke');
    expect(isAllowedOrigin(req)).toBe(true);
  });
});
