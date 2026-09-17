import { BffError, bffFetch } from './bffClient';

const LEGACY_STORAGE_PREFIX = 'parle_api_key_';

export interface SessionStatus {
  hasGemini: boolean;
  hasOpenai: boolean;
  hasApiKey: boolean;
  createdAt?: number;
}

const emptyStatus = (): SessionStatus => ({
  hasGemini: false,
  hasOpenai: false,
  hasApiKey: false,
});

let cachedStatus: SessionStatus = emptyStatus();

function applyStatus(status: SessionStatus): SessionStatus {
  cachedStatus = {
    hasGemini: Boolean(status.hasGemini),
    hasOpenai: Boolean(status.hasOpenai),
    hasApiKey: Boolean(status.hasApiKey || status.hasGemini || status.hasOpenai),
    ...(typeof status.createdAt === 'number' ? { createdAt: status.createdAt } : {}),
  };
  return cachedStatus;
}

export function getCachedSessionStatus(): SessionStatus {
  return cachedStatus;
}

export function hydrateSessionStatus(status: Partial<SessionStatus>): SessionStatus {
  return applyStatus({
    ...emptyStatus(),
    ...status,
    hasApiKey: Boolean(status.hasApiKey ?? (status.hasGemini || status.hasOpenai)),
  });
}

export async function refreshSessionStatus(): Promise<SessionStatus> {
  try {
    const status = await bffFetch<SessionStatus>('/api/session/status');
    return applyStatus(status);
  } catch (err) {
    if (err instanceof BffError && err.code === 'UPSTREAM_AUTH_FAILED') {
      return cachedStatus;
    }
    return applyStatus(emptyStatus());
  }
}

export async function saveKeys(input: {
  geminiApiKey?: string;
  openaiApiKey?: string;
}): Promise<SessionStatus> {
  const status = await bffFetch<SessionStatus & { success?: boolean }>('/api/session', {
    method: 'POST',
    body: JSON.stringify({
      ...(input.geminiApiKey?.trim() ? { geminiApiKey: input.geminiApiKey.trim() } : {}),
      ...(input.openaiApiKey?.trim() ? { openaiApiKey: input.openaiApiKey.trim() } : {}),
    }),
  });
  return applyStatus(status);
}

export async function revokeKeys(provider?: 'gemini' | 'openai'): Promise<SessionStatus> {
  const status = await bffFetch<SessionStatus & { success?: boolean }>('/api/revoke', {
    method: 'POST',
    body: JSON.stringify(provider ? { provider } : {}),
  });
  return applyStatus(status);
}

export function clearLegacyLocalStorageKeys(): void {
  try {
    localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}gemini`);
    localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}openai`);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/** @deprecated Keys are never readable from JavaScript after the BFF migration. */
export const getApiKey = (_provider: 'gemini' | 'openai'): string | null => null;

/**
 * Test/legacy helper: updates the in-memory session flags only.
 * Does not store the raw key.
 */
export const setApiKey = (provider: 'gemini' | 'openai', key: string): void => {
  if (provider === 'gemini') {
    cachedStatus.hasGemini = Boolean(key.trim());
  } else {
    cachedStatus.hasOpenai = Boolean(key.trim());
  }
  cachedStatus.hasApiKey = cachedStatus.hasGemini || cachedStatus.hasOpenai;
};

export const hasApiKey = (provider: 'gemini' | 'openai'): boolean => {
  return provider === 'gemini' ? cachedStatus.hasGemini : cachedStatus.hasOpenai;
};

/** @deprecated Raw keys are never available to the client. Use hasApiKeyOrEnv. */
export const getApiKeyOrEnv = (_provider: 'gemini' | 'openai'): string | null => null;

export const hasAnyApiKey = (): boolean => cachedStatus.hasApiKey;

export const hasApiKeyOrEnv = (provider: 'gemini' | 'openai'): boolean => hasApiKey(provider);
