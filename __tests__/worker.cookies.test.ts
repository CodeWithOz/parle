import { describe, expect, it } from 'vitest';
import { COOKIE_NAME } from '../worker/constants';
import { parseCookieHeader, serializeDeletedSessionCookie, serializeSessionCookie } from '../worker/cookies';

describe('session cookies', () => {
  it('serializes __Host- attributes without Domain', () => {
    const header = serializeSessionCookie('sealed-value');
    expect(header.startsWith(`${COOKIE_NAME}=sealed-value;`)).toBe(true);
    expect(header).toContain('Path=/');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Max-Age=34560000');
    expect(header).not.toMatch(/Domain=/i);
  });

  it('clears the cookie with Max-Age=0 and matching attributes', () => {
    const header = serializeDeletedSessionCookie();
    expect(header).toContain(`${COOKIE_NAME}=;`);
    expect(header).toContain('Path=/');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Max-Age=0');
    expect(header).not.toMatch(/Domain=/i);
  });

  it('parses the named cookie from a Cookie header', () => {
    expect(parseCookieHeader(`${COOKIE_NAME}=abc; other=1`, COOKIE_NAME)).toBe('abc');
    expect(parseCookieHeader('other=1', COOKIE_NAME)).toBeUndefined();
  });

  it('treats a malformed percent-encoded cookie as missing instead of throwing', () => {
    expect(parseCookieHeader(`${COOKIE_NAME}=%`, COOKIE_NAME)).toBeUndefined();
    expect(parseCookieHeader(`${COOKIE_NAME}=%E0%A4%A`, COOKIE_NAME)).toBeUndefined();
  });
});
