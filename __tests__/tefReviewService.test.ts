/**
 * TDD tests for generateTefReview() in services/tefReviewService.ts.
 *
 * The function does not exist yet — all tests are expected to FAIL until
 * the implementation is written.
 *
 * Covers:
 *  - Happy path: valid response with all required TefReview fields
 *  - Prompt construction: questioning vs persuasion exercise types
 *  - Audio fetching: success, failure (falls back to transcript)
 *  - Empty message array (no user speech)
 *  - Persuasion-specific: objection state context included in prompt
 *  - Guide content included in the prompt
 *  - Missing / malformed response fields → throws
 *  - Parse errors → throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be hoisted before the subject-under-test import
// ---------------------------------------------------------------------------

vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

import { GoogleGenAI } from '@google/genai';

// Mock fetch globally so audio blob URL fetches are controlled in tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// The function under test — does not exist yet
import { generateTefReview } from '../services/tefReviewService';

import type { Message, TefObjectionState, TefReview } from '../types';

// ---------------------------------------------------------------------------
// Shared mock Gemini client
// ---------------------------------------------------------------------------

let mockGenerateContent = vi.fn();

const mockAi = {
  models: {
    get generateContent() {
      return mockGenerateContent;
    },
  },
  chats: { create: vi.fn() },
};

vi.mocked(GoogleGenAI).mockReturnValue(mockAi as unknown as GoogleGenAI);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_REVIEW: TefReview = {
  cefrLevel: 'B2',
  cefrJustification: 'The speaker demonstrated solid grammar with occasional errors.',
  wentWell: ['Good use of connectors', 'Clear pronunciation'],
  mistakes: [
    {
      original: 'je suis allé hier',
      correction: 'je suis allé hier soir',
      explanation: 'Missing time qualifier makes the sentence ambiguous.',
    },
  ],
  vocabularySuggestions: [
    { used: 'bon', better: 'excellent', reason: '"Excellent" is more precise and registers C1 vocabulary.' },
    { used: 'beaucoup', better: 'considérablement', reason: 'More formal and academic register.' },
    { used: 'grand', better: 'considérable', reason: 'Stronger academic adjective.' },
    { used: 'faire', better: 'effectuer', reason: 'Formal verb preferred in professional contexts.' },
    { used: 'voir', better: 'constater', reason: 'More precise observation verb in formal French.' },
  ],
};

function makeUserMessage(text: string, audioUrl?: string): Message {
  return {
    role: 'user',
    text,
    timestamp: Date.now(),
    audioUrl,
  };
}

function makeModelMessage(text: string): Message {
  return { role: 'model', text, timestamp: Date.now() };
}

const SAMPLE_MESSAGES_QUESTIONING: Message[] = [
  makeModelMessage('Bonjour, je suis prêt.'),
  makeUserMessage('Quel est le prix de cette voiture ?', 'blob:http://localhost/fake-audio-1'),
  makeModelMessage('La voiture coûte trente mille euros.'),
  makeUserMessage('Pourquoi est-elle si chère ?', 'blob:http://localhost/fake-audio-2'),
];

const SAMPLE_MESSAGES_PERSUASION: Message[] = [
  makeModelMessage('Je ne suis pas convaincu.'),
  makeUserMessage('Ce produit est fiable et abordable.', 'blob:http://localhost/fake-audio-3'),
  makeModelMessage("D'accord, vous marquez un point."),
  makeUserMessage('De plus, il est écologique.', 'blob:http://localhost/fake-audio-4'),
];

const SAMPLE_OBJECTION_STATE: TefObjectionState = {
  directions: ['Price', 'Quality', 'Availability', 'Sustainability', 'Brand trust'],
  currentDirection: 4,
  currentRound: 2,
  isConvinced: true,
};

const FAKE_AUDIO_BASE64 = 'ZmFrZWF1ZGlv'; // base64 for "fakeaudio"
const FAKE_MIME_TYPE = 'audio/webm';

// Helper: make fetch return a successful audio blob
function setupSuccessfulAudioFetch() {
  const fakeBlob = new Blob([Buffer.from(FAKE_AUDIO_BASE64, 'base64')], { type: FAKE_MIME_TYPE });
  mockFetch.mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(fakeBlob),
  });
}

// Helper: make fetch reject (simulate network failure)
function setupFailingAudioFetch() {
  mockFetch.mockRejectedValue(new Error('Failed to fetch blob'));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.setItem('parle_api_key_gemini', 'test-key-review');
  mockGenerateContent = vi.fn().mockResolvedValue({
    text: JSON.stringify(SAMPLE_REVIEW),
  });
  setupSuccessfulAudioFetch();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Function existence
// ---------------------------------------------------------------------------

describe('generateTefReview · existence', () => {
  it('is exported from tefReviewService', async () => {
    const mod = await import('../services/tefReviewService');
    expect(typeof (mod as Record<string, unknown>).generateTefReview).toBe('function');
  });

  it('returns a Promise', () => {
    const result = generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });
    expect(result).toBeInstanceOf(Promise);
  });
});

// ---------------------------------------------------------------------------
// Happy path: valid response parsing
// ---------------------------------------------------------------------------

describe('generateTefReview · happy path', () => {
  it('returns a TefReview object with all required top-level fields (no tipsForC1)', async () => {
    const result = await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    expect(result).toHaveProperty('cefrLevel');
    expect(result).toHaveProperty('cefrJustification');
    expect(result).toHaveProperty('wentWell');
    expect(result).toHaveProperty('mistakes');
    expect(result).toHaveProperty('vocabularySuggestions');
    // tipsForC1 has been removed from the schema — it must NOT appear on the result
    expect(result).not.toHaveProperty('tipsForC1');
  });

  it('preserves cefrLevel and cefrJustification from the model response', async () => {
    const result = await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    expect(result.cefrLevel).toBe('B2');
    expect(result.cefrJustification).toBe(
      'The speaker demonstrated solid grammar with occasional errors.'
    );
  });

  it('preserves wentWell array from the model response', async () => {
    const result = await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    expect(result.wentWell).toEqual(['Good use of connectors', 'Clear pronunciation']);
  });

  it('preserves mistakes array with original, correction, and explanation', async () => {
    const result = await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    expect(result.mistakes).toHaveLength(1);
    expect(result.mistakes[0]).toMatchObject({
      original: 'je suis allé hier',
      correction: 'je suis allé hier soir',
      explanation: expect.any(String),
    });
  });

  it('preserves vocabularySuggestions array with used, better, and reason', async () => {
    const result = await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    expect(result.vocabularySuggestions.length).toBeGreaterThanOrEqual(5);
    expect(result.vocabularySuggestions[0]).toMatchObject({
      used: 'bon',
      better: 'excellent',
      reason: expect.any(String),
    });
  });

  it('calls ai.models.generateContent exactly once', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Prompt construction: exercise types
// ---------------------------------------------------------------------------

describe('generateTefReview · prompt construction', () => {
  it('includes user audio as inlineData (not transcript text) when audio fetch succeeds — questioning', async () => {
    // beforeEach sets up successful audio fetch
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    // inlineData should be present for user audio
    expect(promptText).toContain('inlineData');
    // transcript text should NOT be included when audio is available
    expect(promptText).not.toContain('Quel est le prix de cette voiture');
  });

  it('includes user audio as inlineData (not transcript text) when audio fetch succeeds — persuasion', async () => {
    // beforeEach sets up successful audio fetch
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad summary.',
      objectionState: SAMPLE_OBJECTION_STATE,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    // inlineData should be present for user audio
    expect(promptText).toContain('inlineData');
    // transcript text should NOT be included when audio is available
    expect(promptText).not.toContain('Ce produit est fiable et abordable');
  });

  it('includes "questioning" context cue in the prompt for questioning type', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    // The prompt should mention questioning or questions to give context to the model
    expect(promptText.toLowerCase()).toMatch(/question/);
  });

  it('includes "persuasion" context cue in the prompt for persuasion type', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad summary.',
      objectionState: SAMPLE_OBJECTION_STATE,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    expect(promptText.toLowerCase()).toMatch(/persuad|convinc|advertis/);
  });

  it('requests application/json response mime type', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(JSON.stringify(callArg)).toContain('application/json');
  });

  it('includes elapsedSeconds in the prompt', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 247,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    expect(promptText).toContain('247');
  });
});

// ---------------------------------------------------------------------------
// Prompt construction: guide content
// ---------------------------------------------------------------------------

describe('generateTefReview · guide content in prompt', () => {
  // The ?raw imports resolve to empty strings via __mocks__/rawMock.ts in the
  // test environment.  We can only verify that the prompt construction logic
  // attempted to include guide content (i.e. the call happens without crashing
  // and a generateContent call is made).  Specific content inclusion is verified
  // in integration / manual tests where real files are loaded.

  it('does not crash for questioning type (guide raw imports resolve to empty string)', async () => {
    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).resolves.toBeDefined();
  });

  it('does not crash for persuasion type (guide raw imports resolve to empty string)', async () => {
    await expect(
      generateTefReview({
        exerciseType: 'persuasion',
        messages: SAMPLE_MESSAGES_PERSUASION,
        elapsedSeconds: 90,
        adSummary: 'A car ad.',
        objectionState: SAMPLE_OBJECTION_STATE,
      })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Persuasion-specific: objection state context
// ---------------------------------------------------------------------------

describe('generateTefReview · persuasion objectionState context', () => {
  it('includes adSummary in the prompt when provided', async () => {
    const adSummary = 'A luxury car advertisement targeting young professionals.';
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary,
      objectionState: SAMPLE_OBJECTION_STATE,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    expect(promptText).toContain(adSummary);
  });

  it('includes isConvinced status from objectionState in the prompt', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
      objectionState: { ...SAMPLE_OBJECTION_STATE, isConvinced: true },
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    // "convinced" or the boolean true should appear in context
    expect(promptText).toMatch(/convinced|isConvinced/i);
  });

  it('includes direction count from objectionState in the prompt', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
      objectionState: SAMPLE_OBJECTION_STATE,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    // currentDirection = 4 → 5 directions addressed (or the number 4 / 5 appears)
    expect(promptText).toMatch(/[45]/);
  });
});

// ---------------------------------------------------------------------------
// Audio fetching: successful fetch
// ---------------------------------------------------------------------------

describe('generateTefReview · audio fetching (success)', () => {
  it('calls fetch for each user message audio URL', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    // Two user messages each have an audioUrl
    const userMessagesWithAudio = SAMPLE_MESSAGES_QUESTIONING.filter(
      (m) => m.role === 'user' && m.audioUrl
    );
    expect(mockFetch).toHaveBeenCalledTimes(userMessagesWithAudio.length);
  });

  it('passes the correct blob URLs to fetch', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    const fetchedUrls = mockFetch.mock.calls.map((c) => c[0]);
    expect(fetchedUrls).toContain('blob:http://localhost/fake-audio-1');
    expect(fetchedUrls).toContain('blob:http://localhost/fake-audio-2');
  });
});

// ---------------------------------------------------------------------------
// Audio fetching: failure → falls back to transcript
// ---------------------------------------------------------------------------

describe('generateTefReview · audio fetching (failure falls back to transcript)', () => {
  it('does not throw when audio fetch fails — falls back to transcript text', async () => {
    setupFailingAudioFetch();

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).resolves.toBeDefined();
  });

  it('still includes transcript text in prompt when audio fetch fails', async () => {
    setupFailingAudioFetch();

    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    // Transcript text from user messages must still appear
    expect(promptText).toContain('Quel est le prix de cette voiture');
  });

  it('still calls generateContent once even when all audio fetches fail', async () => {
    setupFailingAudioFetch();

    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Empty message array
// ---------------------------------------------------------------------------

describe('generateTefReview · empty messages', () => {
  it('does not throw when messages array is empty', async () => {
    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: [],
        elapsedSeconds: 0,
      })
    ).resolves.toBeDefined();
  });

  it('does not call fetch when there are no messages', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: [],
      elapsedSeconds: 0,
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls generateContent even with no user speech', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: [],
      elapsedSeconds: 0,
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('handles messages with only model turns (no user messages)', async () => {
    const modelOnlyMessages: Message[] = [
      makeModelMessage('Bonjour.'),
      makeModelMessage('Au revoir.'),
    ];

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: modelOnlyMessages,
        elapsedSeconds: 30,
      })
    ).resolves.toBeDefined();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error handling: malformed / missing response fields
// ---------------------------------------------------------------------------

describe('generateTefReview · error handling (malformed response)', () => {
  it('throws when model returns empty text', async () => {
    mockGenerateContent = vi.fn().mockResolvedValue({ text: '' });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow();
  });

  it('throws when model returns non-JSON text', async () => {
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: 'Sorry, I cannot help with that.',
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow();
  });

  it('throws when response is missing cefrLevel', async () => {
    const { cefrLevel: _omitted, ...withoutCefrLevel } = SAMPLE_REVIEW;
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(withoutCefrLevel),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow();
  });

  it('throws when response is missing cefrJustification', async () => {
    const { cefrJustification: _omitted, ...withoutJustification } = SAMPLE_REVIEW;
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(withoutJustification),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow();
  });

  it('throws when response is missing wentWell', async () => {
    const { wentWell: _omitted, ...withoutWentWell } = SAMPLE_REVIEW;
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(withoutWentWell),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow();
  });

  it('throws when response is missing mistakes', async () => {
    const { mistakes: _omitted, ...withoutMistakes } = SAMPLE_REVIEW;
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(withoutMistakes),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow();
  });

  it('throws when response is missing vocabularySuggestions', async () => {
    const { vocabularySuggestions: _omitted, ...withoutVocab } = SAMPLE_REVIEW;
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(withoutVocab),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow();
  });

  it('does NOT throw when tipsForC1 is absent from the response (field is no longer required)', async () => {
    // tipsForC1 is not part of the schema anymore — omitting it must be valid
    const withoutTips = { ...SAMPLE_REVIEW } as Record<string, unknown>;
    delete withoutTips['tipsForC1'];
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(withoutTips),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).resolves.toBeDefined();
  });

  it('throws when vocabularySuggestions has fewer than 5 entries', async () => {
    const tooFewVocab = {
      ...SAMPLE_REVIEW,
      vocabularySuggestions: SAMPLE_REVIEW.vocabularySuggestions.slice(0, 3),
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(tooFewVocab),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow();
  });

  it('throws when generateContent call itself rejects', async () => {
    mockGenerateContent = vi.fn().mockRejectedValue(new Error('API quota exceeded'));

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow('API quota exceeded');
  });
});
