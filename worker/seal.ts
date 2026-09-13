const encoder = new TextEncoder();
const decoder = new TextDecoder();

function rejectEmptySecret(secret: string): void {
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('API_KEY_COOKIE_SECRET is missing');
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveRawKey(secret: string): Promise<Uint8Array> {
  rejectEmptySecret(secret);
  try {
    const decoded = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // fall through to SHA-256
  }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret)));
}

export async function importAesKey(secret: string): Promise<CryptoKey> {
  const raw = await deriveRawKey(secret);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function seal(payload: unknown, secret: string): Promise<string> {
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(ciphertext)}`;
}

export async function unseal<T>(token: string, secret: string): Promise<T | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
    return null;
  }
  try {
    const key = await importAesKey(secret);
    const iv = fromBase64Url(parts[1]);
    const ciphertext = fromBase64Url(parts[2]);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}

export async function unsealWithRotation<T>(
  token: string,
  currentSecret: string,
  previousSecret?: string
): Promise<{ payload: T; resealed?: string } | null> {
  const current = await unseal<T>(token, currentSecret);
  if (current) {
    return { payload: current };
  }
  if (previousSecret && previousSecret.trim().length > 0) {
    const previous = await unseal<T>(token, previousSecret);
    if (previous) {
      const resealed = await seal(previous, currentSecret);
      return { payload: previous, resealed };
    }
  }
  return null;
}
