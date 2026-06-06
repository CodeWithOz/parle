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
import { Type } from '@google/genai';

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

import type { Message, TefReview } from '../types';


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
  topicSuggestions: [
    {
      topic: 'Conditions de paiement',
      examples: [
        {
          french: 'Peut-on payer en plusieurs fois ?',
          english: 'Can we pay in installments?',
        },
        {
          french: 'Y a-t-il des frais pour le paiement en ligne ?',
          english: 'Are there fees for paying online?',
        },
      ],
    },
    {
      topic: 'Garanties incluses',
      examples: [
        {
          french: 'Quelle garantie est incluse avec ce service ?',
          english: 'What warranty is included with this service?',
        },
        {
          french: 'La garantie couvre-t-elle les pannes majeures ?',
          english: 'Does the warranty cover major breakdowns?',
        },
      ],
    },
    {
      topic: 'Frais supplementaires',
      examples: [
        {
          french: 'Y a-t-il des couts caches a prevoir ?',
          english: 'Are there hidden costs to expect?',
        },
        {
          french: 'Le prix final inclut-il tous les frais ?',
          english: 'Does the final price include all fees?',
        },
      ],
    },
    {
      topic: 'Comparaison avec la concurrence',
      examples: [
        {
          french: 'En quoi cette offre est-elle meilleure que les autres ?',
          english: 'How is this offer better than the others?',
        },
        {
          french: 'Quels avantages concrets avez-vous par rapport aux concurrents ?',
          english: 'What concrete advantages do you have over competitors?',
        },
      ],
    },
    {
      topic: 'Flexibilite des horaires',
      examples: [
        {
          french: 'Les horaires sont-ils flexibles en semaine ?',
          english: 'Are schedules flexible during the week?',
        },
        {
          french: 'Peut-on modifier l horaire apres reservation ?',
          english: 'Can we change the schedule after booking?',
        },
      ],
    },
  ],
  // criteriaEvaluation is included so this fixture is valid for persuasion-type calls
  criteriaEvaluation: [
    { criterion: 'Clear & interesting presentation', met: true, evidence: 'User introduced the ad clearly.' },
    { criterion: 'Argumentation vocabulary', met: true, evidence: 'Good use of linking words.' },
    { criterion: '3+ distinct arguments', met: true, evidence: 'Three distinct points raised.' },
    { criterion: 'Arguments developed with examples', met: false, evidence: 'Some bare assertions.' },
    { criterion: 'Handled counter-arguments / nuance', met: true, evidence: 'Acknowledged objections.' },
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
    expect(result).toHaveProperty('topicSuggestions');
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

    expect(result.vocabularySuggestions).toHaveLength(5);
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
      })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Persuasion-specific: adSummary context (objectionState removed)
// ---------------------------------------------------------------------------

describe('generateTefReview · persuasion adSummary context', () => {
  it('includes adSummary in the prompt when provided', async () => {
    const adSummary = 'A luxury car advertisement targeting young professionals.';
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    expect(promptText).toContain(adSummary);
  });
});

// ---------------------------------------------------------------------------
// Persuasion-specific: 5-criteria evaluation in prompt
// ---------------------------------------------------------------------------

describe('generateTefReview · persuasion criteria in prompt', () => {
  it('includes "clear" and "interesting" or "presentation" criterion in prompt', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg).toLowerCase();
    expect(promptText).toMatch(/clear.*interest|interest.*clear|presentation/);
  });

  it('includes argumentation vocabulary criterion in prompt', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg).toLowerCase();
    expect(promptText).toMatch(/argumentation.*vocab|vocab.*argumentation/);
  });

  it('includes 3+ distinct arguments criterion in prompt', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg).toLowerCase();
    // Should mention 3 arguments or "three different" arguments
    expect(promptText).toMatch(/3.*argument|three.*argument|argument.*3|argument.*three/);
  });

  it('includes examples / developed arguments criterion in prompt', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg).toLowerCase();
    // Should mention examples or "developed"
    expect(promptText).toMatch(/example|exemple|developed/);
  });

  it('includes nuance / counter-argument criterion in prompt', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg).toLowerCase();
    // Should mention nuance or counter-argument
    expect(promptText).toMatch(/nuanc|counter.?argument/);
  });

  it('persuasion prompt does NOT reference objectionState, isConvinced, or currentDirection', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    expect(promptText).not.toMatch(/objectionState|isConvinced|currentDirection/);
  });

  it('persuasion topic suggestions instruct user-perspective persuasive statements (not friend questions)', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg).toLowerCase();
    expect(promptText).toMatch(/user could say|persuasive statements|persuader/);
    expect(promptText).toMatch(/do not write questions the friend would ask|not questions the friend would ask/);
  });

  it('questioning topic suggestions instruct user questions to the agent', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg).toLowerCase();
    expect(promptText).toMatch(/questions the user could ask/);
  });
});

// ---------------------------------------------------------------------------
// Persuasion-specific: criteriaEvaluation in response schema
// ---------------------------------------------------------------------------

describe('generateTefReview · criteriaEvaluation in response schema', () => {
  it('includes criteriaEvaluation in the response schema for persuasion type', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const callJson = JSON.stringify(callArg);
    expect(callJson).toContain('criteriaEvaluation');
  });

  it('returns a result that includes criteriaEvaluation array for persuasion type', async () => {
    const reviewWithCriteria = {
      ...SAMPLE_REVIEW,
      criteriaEvaluation: [
        { criterion: 'Clear & interesting presentation', met: true, evidence: 'User clearly introduced the ad.' },
        { criterion: 'Argumentation vocabulary', met: false, evidence: 'Limited use of linking words.' },
        { criterion: '3+ distinct arguments', met: true, evidence: 'Three distinct points raised.' },
        { criterion: 'Arguments developed with examples', met: false, evidence: 'Bare assertions without examples.' },
        { criterion: 'Handled counter-arguments / nuance', met: true, evidence: 'Acknowledged objections.' },
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(reviewWithCriteria),
    });

    const result = await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    expect(result).toHaveProperty('criteriaEvaluation');
    expect(Array.isArray((result as unknown as Record<string, unknown>)?.criteriaEvaluation)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// topicSuggestions field: schema presence and response preservation
// ---------------------------------------------------------------------------

describe('generateTefReview · topicSuggestions schema and response', () => {
  it.each([
    {
      label: 'questioning type',
      args: {
        exerciseType: 'questioning' as const,
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      },
    },
    {
      label: 'persuasion type',
      args: {
        exerciseType: 'persuasion' as const,
        messages: SAMPLE_MESSAGES_PERSUASION,
        elapsedSeconds: 90,
        adSummary: 'A car ad.',
      },
    },
  ])('encodes the full nested topicSuggestions shape in the response schema for $label', async ({ args }) => {
    mockGenerateContent.mockClear();
    await generateTefReview(args);

    const callArg = mockGenerateContent.mock.calls[0][0];
    const ts = callArg.config.responseSchema.properties.topicSuggestions;

    // Top-level array
    expect(ts.type).toBe(Type.ARRAY);

    // Each item is an object
    expect(ts.items.type).toBe(Type.OBJECT);

    // Item properties include topic and examples
    expect(ts.items.properties).toHaveProperty('topic');
    expect(ts.items.properties).toHaveProperty('examples');

    // Item required fields include topic and examples
    expect(ts.items.required).toContain('topic');
    expect(ts.items.required).toContain('examples');

    // examples is an array
    expect(ts.items.properties.examples.type).toBe(Type.ARRAY);

    // Each example has french and english properties
    expect(ts.items.properties.examples.items.properties).toHaveProperty('french');
    expect(ts.items.properties.examples.items.properties).toHaveProperty('english');

    // Example required fields include french and english
    expect(ts.items.properties.examples.items.required).toContain('french');
    expect(ts.items.properties.examples.items.required).toContain('english');
  });

  it('preserves topicSuggestions array values from the model response', async () => {
    const result = await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    expect(result).not.toBeNull();
    expect(result!.topicSuggestions).toEqual(SAMPLE_REVIEW.topicSuggestions);
    expect(result!.topicSuggestions).toHaveLength(5);
    expect(result!.topicSuggestions[0].examples).toHaveLength(2);
    expect(result!.topicSuggestions[0].examples[0]).toHaveProperty('french');
    expect(result!.topicSuggestions[0].examples[0]).toHaveProperty('english');
  });

});

// ---------------------------------------------------------------------------
// objectionState is no longer a parameter
// ---------------------------------------------------------------------------

describe('generateTefReview · objectionState parameter removed', () => {
  it('does not include objectionState in the function signature (TypeScript type check via call)', async () => {
    // The function should accept calls without objectionState for persuasion type
    // and work correctly — if objectionState was required, this call would fail at type-check time
    await expect(
      generateTefReview({
        exerciseType: 'persuasion',
        messages: SAMPLE_MESSAGES_PERSUASION,
        elapsedSeconds: 90,
        adSummary: 'A car ad.',
        // objectionState intentionally omitted
      })
    ).resolves.toBeDefined();
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

  it('throws when response is missing topicSuggestions', async () => {
    const { topicSuggestions: _omitted, ...withoutTopics } = SAMPLE_REVIEW;
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(withoutTopics),
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

    const result = await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });
    expect(result).not.toBeNull();
    expect(result!.cefrLevel).toBe(SAMPLE_REVIEW.cefrLevel);
  });

  it('succeeds when vocabularySuggestions has fewer than 5 entries', async () => {
    const fewVocab = {
      ...SAMPLE_REVIEW,
      vocabularySuggestions: SAMPLE_REVIEW.vocabularySuggestions.slice(0, 3),
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(fewVocab),
    });

    const result = await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });
    expect(result).not.toBeNull();
    expect(result!.vocabularySuggestions).toHaveLength(3);
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

  it('returns null when the SDK throws a real abort error (not an Error with name AbortError)', async () => {
    // The @google/genai SDK (v1.37.0) throws Error { name: 'Error', message: 'exception AbortError: ...' }
    // when a request is aborted — its .name is 'Error', NOT 'AbortError', so the current
    // catch block checks miss it and the error re-throws.
    const sdkAbortError = new Error(
      'exception AbortError: The operation was aborted. sending request'
    );
    // Confirm the shape: name is the default 'Error', not 'AbortError'
    expect(sdkAbortError.name).toBe('Error');
    mockGenerateContent.mockRejectedValueOnce(sdkAbortError);

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).resolves.toBeNull();
  });

  it('returns null when the SDK throws an APIUserAbortError-style error (name set to APIUserAbortError)', async () => {
    // Another abort shape the current checks miss: Error { name: 'APIUserAbortError', message: 'Request was aborted.' }
    const apiUserAbortError = new Error('Request was aborted.');
    apiUserAbortError.name = 'APIUserAbortError';
    mockGenerateContent.mockRejectedValueOnce(apiUserAbortError);

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// topicSuggestions runtime shape validation
// ---------------------------------------------------------------------------

describe('generateTefReview · topicSuggestions runtime validation', () => {
  it('throws when topicSuggestions is not an array (e.g. a string)', async () => {
    const malformed = { ...SAMPLE_REVIEW, topicSuggestions: 'not an array' };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when topicSuggestions array has fewer than 5 items', async () => {
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: SAMPLE_REVIEW.topicSuggestions.slice(0, 3),
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when a topicSuggestions item is a bare string instead of an object', async () => {
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: [
        'bare string',
        ...SAMPLE_REVIEW.topicSuggestions.slice(1),
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when a topicSuggestions item is missing the topic field', async () => {
    const { topic: _omitted, ...itemWithoutTopic } = SAMPLE_REVIEW.topicSuggestions[0];
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: [
        itemWithoutTopic,
        ...SAMPLE_REVIEW.topicSuggestions.slice(1),
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when a topicSuggestions item has an empty string for topic', async () => {
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: [
        { ...SAMPLE_REVIEW.topicSuggestions[0], topic: '' },
        ...SAMPLE_REVIEW.topicSuggestions.slice(1),
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when a topicSuggestions item has examples that is not an array', async () => {
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: [
        { ...SAMPLE_REVIEW.topicSuggestions[0], examples: 'not an array' },
        ...SAMPLE_REVIEW.topicSuggestions.slice(1),
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when a topicSuggestions item has fewer than 2 examples', async () => {
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: [
        {
          ...SAMPLE_REVIEW.topicSuggestions[0],
          examples: SAMPLE_REVIEW.topicSuggestions[0].examples.slice(0, 1),
        },
        ...SAMPLE_REVIEW.topicSuggestions.slice(1),
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when an example is missing the french field', async () => {
    const { french: _omitted, ...exampleWithoutFrench } =
      SAMPLE_REVIEW.topicSuggestions[0].examples[0];
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: [
        {
          ...SAMPLE_REVIEW.topicSuggestions[0],
          examples: [
            exampleWithoutFrench,
            SAMPLE_REVIEW.topicSuggestions[0].examples[1],
          ],
        },
        ...SAMPLE_REVIEW.topicSuggestions.slice(1),
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when an example has an empty string for french', async () => {
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: [
        {
          ...SAMPLE_REVIEW.topicSuggestions[0],
          examples: [
            { ...SAMPLE_REVIEW.topicSuggestions[0].examples[0], french: '' },
            SAMPLE_REVIEW.topicSuggestions[0].examples[1],
          ],
        },
        ...SAMPLE_REVIEW.topicSuggestions.slice(1),
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when an example is missing the english field', async () => {
    const { english: _omitted, ...exampleWithoutEnglish } =
      SAMPLE_REVIEW.topicSuggestions[0].examples[0];
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: [
        {
          ...SAMPLE_REVIEW.topicSuggestions[0],
          examples: [
            exampleWithoutEnglish,
            SAMPLE_REVIEW.topicSuggestions[0].examples[1],
          ],
        },
        ...SAMPLE_REVIEW.topicSuggestions.slice(1),
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when an example has an empty string for english', async () => {
    const malformed = {
      ...SAMPLE_REVIEW,
      topicSuggestions: [
        {
          ...SAMPLE_REVIEW.topicSuggestions[0],
          examples: [
            { ...SAMPLE_REVIEW.topicSuggestions[0].examples[0], english: '' },
            SAMPLE_REVIEW.topicSuggestions[0].examples[1],
          ],
        },
        ...SAMPLE_REVIEW.topicSuggestions.slice(1),
      ],
    };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'questioning',
        messages: SAMPLE_MESSAGES_QUESTIONING,
        elapsedSeconds: 120,
      })
    ).rejects.toThrow(/topicSuggestions/);
  });

  it('throws when topicSuggestions is not an array (persuasion type)', async () => {
    const malformed = { ...SAMPLE_REVIEW, topicSuggestions: 'not an array' };
    mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(malformed),
    });

    await expect(
      generateTefReview({
        exerciseType: 'persuasion',
        messages: SAMPLE_MESSAGES_PERSUASION,
        elapsedSeconds: 90,
        adSummary: 'A car ad.',
      })
    ).rejects.toThrow(/topicSuggestions/);
  });
});

// ---------------------------------------------------------------------------
// User-only evaluation scope: prompt must not grade the agent
// ---------------------------------------------------------------------------

describe('generateTefReview · user-only evaluation scope', () => {
  it('prompt explicitly instructs to evaluate ONLY the user\'s French, not the agent', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    // The prompt must explicitly restrict grading to the user — phrasing like
    // "evaluate only the user", "assess only the user's French", "do not assess the agent",
    // "only the user's", etc.
    expect(promptText.toLowerCase()).toMatch(
      /evaluate only the user|assess only the user|only the user.{0,20}french|do not.*assess.*agent|do not.*evaluate.*agent|evaluate.*the user.*only/
    );
  });

  it('prompt explicitly states agent turns are provided for context only, not for grading', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg).toLowerCase();
    // The prompt must contain a specific statement that agent turns are "context only"
    // (e.g. "context only", "for context only", "agent turns are context", etc.).
    // Checked as a substring to avoid false-positive regex matches on distant words.
    const hasContextOnly =
      promptText.includes('context only') ||
      promptText.includes('agent turns are context') ||
      promptText.includes('agent.*for context') ||
      promptText.includes('context, not for grading') ||
      promptText.includes('context, not for evaluat');
    expect(hasContextOnly).toBe(true);
  });

  it('prompt explicitly says do not grade or criticize the agent\'s French or performance', async () => {
    await generateTefReview({
      exerciseType: 'persuasion',
      messages: SAMPLE_MESSAGES_PERSUASION,
      elapsedSeconds: 90,
      adSummary: 'A car ad.',
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg).toLowerCase();
    // Must explicitly forbid grading/criticising the agent — checked with bounded
    // patterns to avoid matching "agent" and "not/do not" from unrelated sentences.
    const hasForbiddenGrading =
      promptText.includes("do not grade the agent") ||
      promptText.includes("do not assess the agent") ||
      promptText.includes("do not evaluate the agent") ||
      promptText.includes("do not criticise the agent") ||
      promptText.includes("do not criticize the agent") ||
      promptText.includes("not grade the agent") ||
      promptText.includes("not assess the agent") ||
      promptText.includes("agent's french is not");
    expect(hasForbiddenGrading).toBe(true);
  });

  it('agent transcript lines are still present in the prompt for conversational context', async () => {
    await generateTefReview({
      exerciseType: 'questioning',
      messages: SAMPLE_MESSAGES_QUESTIONING,
      elapsedSeconds: 120,
    });

    const callArg = mockGenerateContent.mock.calls[0][0];
    const promptText = JSON.stringify(callArg);
    // Agent turns must still appear in the prompt so the model has conversational context
    expect(promptText).toContain('[Agent said:');
  });
});
