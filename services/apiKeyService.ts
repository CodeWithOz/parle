/**
 * API Key Management Service
 * Handles storage and retrieval of API keys from localStorage
 * with fallback to environment variables for backward compatibility.
 */

const STORAGE_KEY_PREFIX = 'parle_api_key_';

/**
 * Get an API key from localStorage for a specific provider.
 */
export const getApiKey = (provider: 'gemini' | 'openai'): string | null => {
  try {
    const key = localStorage.getItem(`${STORAGE_KEY_PREFIX}${provider}`);
    return key || null;
  } catch (error) {
    console.error(`Error reading ${provider} API key from localStorage:`, error);
    return null;
  }
};

/**
 * Set an API key in localStorage for a specific provider.
 */
export const setApiKey = (provider: 'gemini' | 'openai', key: string): void => {
  try {
    if (key.trim()) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${provider}`, key.trim());
    } else {
      // Remove key if empty string
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${provider}`);
    }
  } catch (error) {
    console.error(`Error saving ${provider} API key to localStorage:`, error);
    throw error;
  }
};

/**
 * Check if an API key exists in localStorage for a specific provider.
 */
export const hasApiKey = (provider: 'gemini' | 'openai'): boolean => {
  return getApiKey(provider) !== null;
};

/**
 * Get API key from localStorage, falling back to environment variable.
 * Checks localStorage first, then process.env for backward compatibility.
 */
export const getApiKeyOrEnv = (provider: 'gemini' | 'openai'): string | null => {
  // Check localStorage first
  const storedKey = getApiKey(provider);
  if (storedKey) {
    return storedKey;
  }

  // Fallback to environment variable
  const envKey = provider === 'gemini' 
    ? process.env.GEMINI_API_KEY 
    : process.env.OPENAI_API_KEY;
  
  return envKey || null;
};

/**
 * Check if at least one API key is available (from localStorage or env).
 */
export const hasAnyApiKey = (): boolean => {
  return getApiKeyOrEnv('gemini') !== null || getApiKeyOrEnv('openai') !== null;
};

/**
 * Check if a specific provider has an API key available (from localStorage or env).
 */
export const hasApiKeyOrEnv = (provider: 'gemini' | 'openai'): boolean => {
  return getApiKeyOrEnv(provider) !== null;
};
