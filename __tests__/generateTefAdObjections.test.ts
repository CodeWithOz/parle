/**
 * TDD tests for generateTefAdObjections(adSummary) in services/geminiService.ts.
 *
 * This is a one-shot Gemini call that returns { directions: string[] } with exactly 5 items.
 * Tests FAIL before the function is implemented.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mock for @google/genai
// ---------------------------------------------------------------------------

// We mock the entire @google/genai module so no real API calls are made.
vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

import { GoogleGenAI } from '@google/genai';

// The function under test — does not exist yet; import will resolve once implemented.
import { generateTefAdObjections } from '../services/geminiService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_AD_SUMMARY =
  'A luxury car advertisement featuring a red sports car with the tagline "Drive the Future."';

const FIVE_DIRECTIONS = [
  'Price and value for money',
  'Environmental impact of luxury cars',
  'Practicality versus lifestyle statement',
  'Brand credibility and quality claims',
  'Availability of alternatives',
];

// Shared mock function that persists across tests because the module-level `ai`
// singleton is created only once per test file. All tests configure this same
// spy rather than trying to swap out the whole GoogleGenAI instance.
let mockGenerateContent = vi.fn();

const mockAi = {
  models: {
    get generateContent() {
      return mockGenerateContent;
    },
  },
  chats: {
    create: vi.fn(),
  },
};

// Wire GoogleGenAI constructor to always return the shared mockAi.
vi.mocked(GoogleGenAI).mockReturnValue(mockAi as unknown as GoogleGenAI);

// ---------------------------------------------------------------------------
// Setup: provide a fake API key and reset the shared spy before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.setItem('parle_api_key_gemini', 'test-key-for-objection-tests');
  mockGenerateContent = vi.fn().mockResolvedValue({
    text: JSON.stringify({ directions: FIVE_DIRECTIONS }),
  });
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Function existence
// ---------------------------------------------------------------------------

describe('generateTefAdObjections · existence', () => {
  it('is exported from geminiService', async () => {
    const mod = await import('../services/geminiService');
    expect(typeof (mod as Record<string, unknown>).generateTefAdObjections).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Happy path: valid 5-direction response
// ---------------------------------------------------------------------------

describe('generateTefAdObjections · happy path', () => {
  it('returns an object with a directions array', async () => {
    const result = await generateTefAdObjections(SAMPLE_AD_SUMMARY);
    expect(result).toHaveProperty('directions');
    expect(Array.isArray(result.directions)).toBe(true);
  });

  it('returns exactly 5 directions', async () => {
    const result = await generateTefAdObjections(SAMPLE_AD_SUMMARY);
    expect(result.directions).toHaveLength(5);
  });

  it('directions are all non-empty strings', async () => {
    const result = await generateTefAdObjections(SAMPLE_AD_SUMMARY);
    for (const dir of result.directions) {
      expect(typeof dir).toBe('string');
      expect(dir.trim().length).toBeGreaterThan(0);
    }
  });

  it('preserves the direction strings returned by the model', async () => {
    const result = await generateTefAdObjections(SAMPLE_AD_SUMMARY);
    expect(result.directions).toEqual(FIVE_DIRECTIONS);
  });

  it('calls ai.models.generateContent exactly once', async () => {
    await generateTefAdObjections(SAMPLE_AD_SUMMARY);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('includes the adSummary in the generateContent call', async () => {
    await generateTefAdObjections(SAMPLE_AD_SUMMARY);
    const callArg = mockGenerateContent.mock.calls[0][0];
    // Check the raw prompt text directly (JSON.stringify escapes quotes, breaking .includes)
    const promptText = callArg.contents[0].parts[0].text;
    expect(promptText).toContain(SAMPLE_AD_SUMMARY);
  });

  it('requests application/json response mime type', async () => {
    await generateTefAdObjections(SAMPLE_AD_SUMMARY);
    const callArg = mockGenerateContent.mock.calls[0][0];
    const stringified = JSON.stringify(callArg);
    expect(stringified).toContain('application/json');
  });
});

// ---------------------------------------------------------------------------
// Error handling: invalid / empty responses
// ---------------------------------------------------------------------------

describe('generateTefAdObjections · error handling', () => {
  it('throws when the model returns empty text', async () => {
    mockGenerateContent = vi.fn().mockResolvedValue({ text: '' });

    await expect(generateTefAdObjections(SAMPLE_AD_SUMMARY)).rejects.toThrow();
  });

  it('throws when the model returns non-JSON text', async () => {
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: 'This is not JSON at all.',
    });

    await expect(generateTefAdObjections(SAMPLE_AD_SUMMARY)).rejects.toThrow();
  });

  it('throws when the response is missing the directions field', async () => {
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({ something_else: [] }),
    });
    await expect(generateTefAdObjections(SAMPLE_AD_SUMMARY)).rejects.toThrow();
  });

  it('throws when directions has fewer than 5 items', async () => {
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({ directions: ['only one direction'] }),
    });
    await expect(generateTefAdObjections(SAMPLE_AD_SUMMARY)).rejects.toThrow();
  });

  it('throws when directions has more than 5 items', async () => {
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({ directions: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    });
    await expect(generateTefAdObjections(SAMPLE_AD_SUMMARY)).rejects.toThrow();
  });

  it('throws when directions contains non-string items', async () => {
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({ directions: [1, 2, 3, 4, 5] }),
    });
    await expect(generateTefAdObjections(SAMPLE_AD_SUMMARY)).rejects.toThrow();
  });

  it('throws when the generateContent call itself rejects', async () => {
    mockGenerateContent = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(generateTefAdObjections(SAMPLE_AD_SUMMARY)).rejects.toThrow('Network error');
  });
});

// ---------------------------------------------------------------------------
// Function signature
// ---------------------------------------------------------------------------

describe('generateTefAdObjections · function signature', () => {
  it('accepts a string argument', async () => {
    // Should not throw on valid string argument
    await expect(generateTefAdObjections(SAMPLE_AD_SUMMARY)).resolves.toBeDefined();
  });

  it('returns a Promise', () => {
    const result = generateTefAdObjections(SAMPLE_AD_SUMMARY);
    expect(result).toBeInstanceOf(Promise);
  });
});
