/**
 * TDD tests for "Show Repeated Concepts in Post-Exercise Review".
 *
 * Feature summary:
 *   1. TefQuestioningSchema gains a `conceptLabels` field so the AI can tag
 *      every response with the topic(s) it covers.
 *   2. `conceptLabels` and `isRepeat` are stored on user `Message` objects
 *      so the data survives until the post-exercise summary.
 *   3. A utility function (`groupRepeatedConcepts`) derives, from the full
 *      message list, a map of concept → repeated messages with surrounding
 *      context (model message before, user message, model message after).
 *   4. `TefQuestioningSummary` receives a `messages` prop so it can render
 *      the "Repeated Concepts" section.
 *
 * All tests FAIL before the implementation exists — that is expected and correct.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Group 1: Schema — TefQuestioningSchema includes conceptLabels
// ---------------------------------------------------------------------------

vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

import { GoogleGenAI } from '@google/genai';

function buildMockAiCapturingChatCreate() {
  const mockSendMessage = vi.fn().mockResolvedValue({ text: '{}' });
  const mockChatSession = { sendMessage: mockSendMessage };
  const createSpy = vi.fn().mockReturnValue(mockChatSession);
  const mockGenerateContent = vi.fn().mockResolvedValue({ text: 'transcribed text' });
  const mockAi = {
    models: { generateContent: mockGenerateContent },
    chats: { create: createSpy },
  };
  vi.mocked(GoogleGenAI).mockReturnValue(mockAi as unknown as GoogleGenAI);
  return { createSpy };
}

beforeEach(() => {
  localStorage.setItem('parle_api_key_gemini', 'test-key-schema');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('TefQuestioningSchema · includes conceptLabels when isTefQuestioning=true', () => {
  it('passes a schema containing "conceptLabels" to chats.create', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();

    const { initializeSession, setScenario } = await import('../services/geminiService');

    const questioningScenario = {
      id: 'qs-1',
      name: 'TEF Questioning',
      description: 'Customer service call',
      createdAt: Date.now(),
      isActive: true,
      isTefQuestioning: true,
      characters: [{ id: 'agent', name: 'Agent', role: 'agent', voiceName: 'puck' }],
    };

    setScenario(questioningScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;

    expect(schema).toBeDefined();
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).toMatch(/conceptLabels/i);
  });
});

describe('TefQuestioningSchema · standard scenario does NOT include conceptLabels', () => {
  it('does not include "conceptLabels" in the standard schema', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();

    const { initializeSession, setScenario } = await import('../services/geminiService');

    const regularScenario = {
      id: 'reg-1',
      name: 'Role Play',
      description: 'Regular role-play scenario',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'char1', name: 'Baker', role: 'baker', voiceName: 'aoede' }],
    };

    setScenario(regularScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;

    expect(schema).toBeDefined();
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).not.toMatch(/conceptLabels/i);
  });
});

// ---------------------------------------------------------------------------
// Group 2: Types — Message and VoiceResponse declare conceptLabels
// ---------------------------------------------------------------------------

describe('types.ts · Message interface', () => {
  it('declares conceptLabels as an optional string array on Message', async () => {
    const src = await import('../types?raw');
    // Must have conceptLabels?: string[] somewhere inside the Message interface block.
    // We check proximity: "Message" interface definition followed by conceptLabels within
    // a reasonable number of characters.
    expect(src.default).toMatch(/interface Message[\s\S]{0,500}conceptLabels\s*\?\s*:\s*string\s*\[\s*\]/);
  });
});

describe('types.ts · VoiceResponse interface', () => {
  it('declares conceptLabels as an optional string array on VoiceResponse', async () => {
    const src = await import('../types?raw');
    expect(src.default).toMatch(/interface VoiceResponse[\s\S]{0,500}conceptLabels\s*\?\s*:\s*string\s*\[\s*\]/);
  });
});

// ---------------------------------------------------------------------------
// Group 3: Data flow in App.tsx
// ---------------------------------------------------------------------------

describe('App.tsx · setMessages · user message carries conceptLabels', () => {
  it('spreads conceptLabels onto the user message in setMessages', async () => {
    const src = await import('../App?raw');
    // The user message object literal must include conceptLabels
    expect(src.default).toMatch(/role:\s*['"]user['"][\s\S]{0,300}conceptLabels/);
  });
});

describe('App.tsx · setMessages · user message carries isRepeat', () => {
  it('spreads isRepeat onto the user message in setMessages', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/role:\s*['"]user['"][\s\S]{0,300}isRepeat/);
  });
});

describe('App.tsx · setMessages · first message (greeting) does NOT get conceptLabels or isRepeat', () => {
  it('guards isRepeat / conceptLabels assignment with !tefQuestioningIsFirstMessage', async () => {
    const src = await import('../App?raw');
    // The relevant setMessages block must be conditional on the first-message flag.
    // The pattern: conceptLabels is only included when tefQuestioningIsFirstMessage is falsy.
    expect(src.default).toMatch(
      /tefQuestioningIsFirstMessage[\s\S]{0,600}conceptLabels|conceptLabels[\s\S]{0,600}tefQuestioningIsFirstMessage/
    );
  });
});

describe('App.tsx · TefQuestioningSummary receives messages prop', () => {
  it('passes a messages prop to TefQuestioningSummary in the JSX render', async () => {
    const src = await import('../App?raw');
    // The TefQuestioningSummary JSX element must include messages=
    expect(src.default).toMatch(/TefQuestioningSummary[\s\S]{0,400}messages\s*=/);
  });
});

// ---------------------------------------------------------------------------
// Group 4: System instruction includes conceptLabels
// ---------------------------------------------------------------------------

describe('generateTefQuestioningSystemInstruction · conceptLabels documentation', () => {
  it('mentions "conceptLabels" in the instruction output', async () => {
    const { generateTefQuestioningSystemInstruction } = await import('../services/scenarioService');
    const adSummary = 'A promotional flyer for a local internet provider offering 500 Mbps fibre plans.';
    const roleConfirmation = 'I will act as a brief and professional customer service agent.';

    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    expect(result).toContain('conceptLabels');
  });

  it('instructs that conceptLabels should be an array', async () => {
    const { generateTefQuestioningSystemInstruction } = await import('../services/scenarioService');
    const adSummary = 'A promotional flyer for a local internet provider.';
    const roleConfirmation = 'I will act as a customer service agent.';

    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    // Should describe conceptLabels as a list / array of strings
    const lower = result.toLowerCase();
    expect(lower).toMatch(/conceptlabels[\s\S]{0,200}array|conceptlabels[\s\S]{0,200}list|\[\s*"[\s\S]{0,100}"\s*\]/);
  });

  it('includes conceptLabels in the example JSON response', async () => {
    const { generateTefQuestioningSystemInstruction } = await import('../services/scenarioService');
    const adSummary = 'A promotional flyer for a local internet provider.';
    const roleConfirmation = 'I will act as a customer service agent.';

    const result = generateTefQuestioningSystemInstruction(adSummary, roleConfirmation);
    // The example JSON block inside the instruction should contain "conceptLabels"
    expect(result).toMatch(/"conceptLabels"/);
  });
});

// ---------------------------------------------------------------------------
// Group 5: groupRepeatedConcepts pure function
//
// This utility takes the full Message[] from the conversation and returns a
// Map<string, { messages: Array<{ before?: Message; user: Message; after?: Message }> }>
// containing ONLY concepts where at least one message has isRepeat: true.
//
// The function is expected to live in components/TefQuestioningSummary.tsx
// (or a dedicated utils file). We import it by name from that module.
// ---------------------------------------------------------------------------

import type { Message } from '../types';

// Dynamic import helper so TypeScript doesn't error before implementation exists.
async function importGroupFn(): Promise<
  (messages: Message[]) => Map<string, { messages: Array<{ before?: Message; user: Message; after?: Message }> }>
> {
  const mod = await import('../components/TefQuestioningSummary');
  // The function is exported as a named export from the component file.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (mod as any).groupRepeatedConcepts;
  if (typeof fn !== 'function') {
    throw new Error(
      'groupRepeatedConcepts is not exported from components/TefQuestioningSummary'
    );
  }
  return fn;
}

function makeMessage(overrides: Partial<Message> & { role: 'user' | 'model'; text: string }): Message {
  return {
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('groupRepeatedConcepts · empty and no-repeat inputs', () => {
  it('returns an empty Map when given an empty array', async () => {
    const groupRepeatedConcepts = await importGroupFn();
    const result = groupRepeatedConcepts([]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('returns an empty Map when no user messages have isRepeat=true', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const messages: Message[] = [
      makeMessage({ role: 'model', text: 'Bonjour, service client.' }),
      makeMessage({ role: 'user', text: 'Quel est le prix?', conceptLabels: ['pricing'], isRepeat: false }),
      makeMessage({ role: 'model', text: 'Le prix est 30€.' }),
      makeMessage({ role: 'user', text: 'Merci.', conceptLabels: ['thanks'] }),
      makeMessage({ role: 'model', text: 'De rien.' }),
    ];

    const result = groupRepeatedConcepts(messages);
    expect(result.size).toBe(0);
  });
});

describe('groupRepeatedConcepts · single repeated concept', () => {
  it('returns one entry when one user message has isRepeat=true', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const model1 = makeMessage({ role: 'model', text: 'Bonjour, service client.' });
    const user1 = makeMessage({ role: 'user', text: 'Quel est le prix?', conceptLabels: ['pricing'], isRepeat: false });
    const model2 = makeMessage({ role: 'model', text: 'Le prix est 30€.' });
    const user2 = makeMessage({ role: 'user', text: 'Quel est le tarif?', conceptLabels: ['pricing'], isRepeat: true });
    const model3 = makeMessage({ role: 'model', text: 'Comme je disais, 30€ par mois.' });

    const messages = [model1, user1, model2, user2, model3];

    const result = groupRepeatedConcepts(messages);
    expect(result.size).toBe(1);
    expect(result.has('pricing')).toBe(true);
  });

  it('includes the repeated user message in the concept group', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const model1 = makeMessage({ role: 'model', text: 'Bonjour.' });
    const user1 = makeMessage({ role: 'user', text: 'Quel est le prix?', conceptLabels: ['pricing'], isRepeat: false });
    const model2 = makeMessage({ role: 'model', text: 'Le prix est 30€.' });
    const user2 = makeMessage({ role: 'user', text: 'Le prix?', conceptLabels: ['pricing'], isRepeat: true });
    const model3 = makeMessage({ role: 'model', text: 'Toujours 30€.' });

    const messages = [model1, user1, model2, user2, model3];
    const result = groupRepeatedConcepts(messages);

    const group = result.get('pricing')!;
    expect(group).toBeDefined();
    expect(group.messages.some(entry => entry.user === user2)).toBe(true);
  });

  it('attaches the model message immediately before the repeated user message as "before"', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const model1 = makeMessage({ role: 'model', text: 'Bonjour.' });
    const user1 = makeMessage({ role: 'user', text: 'Quel est le prix?', conceptLabels: ['pricing'], isRepeat: false });
    const model2 = makeMessage({ role: 'model', text: 'Le prix est 30€.' });
    const user2 = makeMessage({ role: 'user', text: 'Le prix?', conceptLabels: ['pricing'], isRepeat: true });
    const model3 = makeMessage({ role: 'model', text: 'Toujours 30€.' });

    const messages = [model1, user1, model2, user2, model3];
    const result = groupRepeatedConcepts(messages);

    const entry = result.get('pricing')!.messages.find(e => e.user === user2)!;
    expect(entry.before).toBe(model2);
  });

  it('attaches the model message immediately after the repeated user message as "after"', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const model1 = makeMessage({ role: 'model', text: 'Bonjour.' });
    const user1 = makeMessage({ role: 'user', text: 'Quel est le prix?', conceptLabels: ['pricing'], isRepeat: false });
    const model2 = makeMessage({ role: 'model', text: 'Le prix est 30€.' });
    const user2 = makeMessage({ role: 'user', text: 'Le prix?', conceptLabels: ['pricing'], isRepeat: true });
    const model3 = makeMessage({ role: 'model', text: 'Toujours 30€.' });

    const messages = [model1, user1, model2, user2, model3];
    const result = groupRepeatedConcepts(messages);

    const entry = result.get('pricing')!.messages.find(e => e.user === user2)!;
    expect(entry.after).toBe(model3);
  });

  it('sets "before" to undefined when no model message precedes the user message', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    // User message is the very first message in the array (unusual but must be handled)
    const user1 = makeMessage({ role: 'user', text: 'Quel est le prix?', conceptLabels: ['pricing'], isRepeat: true });
    const model1 = makeMessage({ role: 'model', text: 'Le prix est 30€.' });

    const messages = [user1, model1];
    const result = groupRepeatedConcepts(messages);

    const entry = result.get('pricing')!.messages.find(e => e.user === user1)!;
    expect(entry.before).toBeUndefined();
  });

  it('sets "after" to undefined when no model message follows the user message', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const model1 = makeMessage({ role: 'model', text: 'Bonjour.' });
    const user1 = makeMessage({ role: 'user', text: 'Le prix?', conceptLabels: ['pricing'], isRepeat: true });
    // No model message after

    const messages = [model1, user1];
    const result = groupRepeatedConcepts(messages);

    const entry = result.get('pricing')!.messages.find(e => e.user === user1)!;
    expect(entry.after).toBeUndefined();
  });
});

describe('groupRepeatedConcepts · multi-label messages', () => {
  it('a message with two conceptLabels appears in both concept groups', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const model1 = makeMessage({ role: 'model', text: 'Bonjour.' });
    const user1 = makeMessage({
      role: 'user',
      text: 'Quelles sont vos heures et vos tarifs?',
      conceptLabels: ['hours', 'pricing'],
      isRepeat: true,
    });
    const model2 = makeMessage({ role: 'model', text: 'On est ouvert de 9h à 18h et le tarif est 30€.' });

    const messages = [model1, user1, model2];
    const result = groupRepeatedConcepts(messages);

    expect(result.has('hours')).toBe(true);
    expect(result.has('pricing')).toBe(true);

    const hoursEntry = result.get('hours')!.messages.find(e => e.user === user1);
    const pricingEntry = result.get('pricing')!.messages.find(e => e.user === user1);

    expect(hoursEntry).toBeDefined();
    expect(pricingEntry).toBeDefined();
  });

  it('the same message object is used in both concept groups (not a copy)', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const model1 = makeMessage({ role: 'model', text: 'Bonjour.' });
    const user1 = makeMessage({
      role: 'user',
      text: 'Les heures et prix?',
      conceptLabels: ['hours', 'pricing'],
      isRepeat: true,
    });
    const model2 = makeMessage({ role: 'model', text: 'Ouvert de 9h à 18h, 30€/mois.' });

    const messages = [model1, user1, model2];
    const result = groupRepeatedConcepts(messages);

    const hoursEntry = result.get('hours')!.messages.find(e => e.user === user1)!;
    const pricingEntry = result.get('pricing')!.messages.find(e => e.user === user1)!;

    // Same user message reference
    expect(hoursEntry.user).toBe(pricingEntry.user);
  });
});

describe('groupRepeatedConcepts · excludes non-repeated messages from output', () => {
  it('does not include a concept group when the only matching messages have isRepeat=false', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const model1 = makeMessage({ role: 'model', text: 'Bonjour.' });
    const user1 = makeMessage({ role: 'user', text: 'Quel est le prix?', conceptLabels: ['pricing'], isRepeat: false });
    const model2 = makeMessage({ role: 'model', text: '30€.' });
    const user2 = makeMessage({ role: 'user', text: 'Quelles sont les heures?', conceptLabels: ['hours'], isRepeat: true });
    const model3 = makeMessage({ role: 'model', text: 'De 9h à 18h.' });

    const messages = [model1, user1, model2, user2, model3];
    const result = groupRepeatedConcepts(messages);

    // 'pricing' had no repeats — should NOT appear
    expect(result.has('pricing')).toBe(false);
    // 'hours' was repeated — should appear
    expect(result.has('hours')).toBe(true);
  });
});

describe('groupRepeatedConcepts · context assembly with multiple repeats in one concept', () => {
  it('includes all repeated messages for a concept when it is repeated more than once', async () => {
    const groupRepeatedConcepts = await importGroupFn();

    const model1 = makeMessage({ role: 'model', text: 'Bonjour.' });
    const user1 = makeMessage({ role: 'user', text: 'Quel est le prix?', conceptLabels: ['pricing'], isRepeat: false });
    const model2 = makeMessage({ role: 'model', text: '30€.' });
    const user2 = makeMessage({ role: 'user', text: 'Le prix?', conceptLabels: ['pricing'], isRepeat: true });
    const model3 = makeMessage({ role: 'model', text: 'Toujours 30€.' });
    const user3 = makeMessage({ role: 'user', text: 'Combien ça coûte?', conceptLabels: ['pricing'], isRepeat: true });
    const model4 = makeMessage({ role: 'model', text: '30€ par mois, comme indiqué.' });

    const messages = [model1, user1, model2, user2, model3, user3, model4];
    const result = groupRepeatedConcepts(messages);

    const group = result.get('pricing')!;
    expect(group.messages.length).toBe(3);
    expect(group.messages.map(e => e.user)).toContain(user1);
    expect(group.messages.map(e => e.user)).toContain(user2);
    expect(group.messages.map(e => e.user)).toContain(user3);
  });
});
