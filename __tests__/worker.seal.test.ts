import { describe, expect, it } from 'vitest';
import { seal, unseal, unsealWithRotation } from '../worker/seal';

const SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // 32-byte base64
const OTHER = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=';

describe('seal / unseal', () => {
  it('rejects a blank secret before hashing', async () => {
    await expect(seal({ v: 1 }, '   ')).rejects.toThrow(/API_KEY_COOKIE_SECRET is missing/);
    await expect(seal({ v: 1 }, '')).rejects.toThrow(/API_KEY_COOKIE_SECRET is missing/);
  });

  it('round-trips a payload', async () => {
    const payload = { v: 1 as const, keys: { gemini: 'AIza-test-key-123456' }, createdAt: 1 };
    const token = await seal(payload, SECRET);
    expect(token.startsWith('v1.')).toBe(true);
    expect(await unseal(token, SECRET)).toEqual(payload);
  });

  it('returns null for tampered ciphertext', async () => {
    const token = await seal({ hello: 'world' }, SECRET);
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -4) + 'aaaa';
    expect(await unseal(parts.join('.'), SECRET)).toBeNull();
  });

  it('returns null for the wrong secret', async () => {
    const token = await seal({ hello: 'world' }, SECRET);
    expect(await unseal(token, OTHER)).toBeNull();
  });

  it('rotates from previous to current secret', async () => {
    const payload = { v: 1, n: 42 };
    const oldToken = await seal(payload, OTHER);
    const rotated = await unsealWithRotation(oldToken, SECRET, OTHER);
    expect(rotated?.payload).toEqual(payload);
    expect(rotated?.resealed).toBeTruthy();
    expect(await unseal(rotated!.resealed!, SECRET)).toEqual(payload);
  });
});
