/**
 * TDD tests for schema selection in createChatSession.
 *
 * When activeScenario.isTefQuestioning = true:
 *   - The chat session is created with a schema that includes an "isRepeat" field
 * When scenario does not have isTefQuestioning:
 *   - The standard schema is used (no "isRepeat" field)
 *
 * Tests FAIL before the implementation is in place.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

import { GoogleGenAI } from '@google/genai';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.setItem('parle_api_key_gemini', 'test-key-schema');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Helper to capture the chats.create call arguments
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// isTefQuestioning = true: schema must include isRepeat
// ---------------------------------------------------------------------------

describe('createChatSession · isTefQuestioning=true uses TEF_QUESTIONING_RESPONSE_SCHEMA', () => {
  it('creates the chat session with a schema that includes an "isRepeat" property', async () => {
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

    // The most recent chats.create call should have passed a schema
    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;

    // The schema must exist and must contain "isRepeat" somewhere in its properties
    expect(schema).toBeDefined();

    // Walk the schema object to find an "isRepeat" property
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).toMatch(/isRepeat/i);
  });
});

// ---------------------------------------------------------------------------
// Standard (non-questioning) scenario: schema must NOT include isRepeat
// ---------------------------------------------------------------------------

describe('createChatSession · standard scenario uses SINGLE_CHARACTER_RESPONSE_SCHEMA', () => {
  it('creates the chat session with a schema that does NOT include "isRepeat"', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();

    const { initializeSession, setScenario } = await import('../services/geminiService');

    const regularScenario = {
      id: 'reg-1',
      name: 'Role Play',
      description: 'Regular role-play scenario',
      createdAt: Date.now(),
      isActive: true,
      // isTefQuestioning intentionally omitted
      characters: [{ id: 'char1', name: 'Baker', role: 'baker', voiceName: 'aoede' }],
    };

    setScenario(regularScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;

    expect(schema).toBeDefined();
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).not.toMatch(/isRepeat/i);
  });

  it('uses the standard schema (no isRepeat) when isTefQuestioning is explicitly false', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();

    const { initializeSession, setScenario } = await import('../services/geminiService');

    const nonQuestioningScenario = {
      id: 'non-qs-1',
      name: 'TEF Ad Persuasion',
      description: 'Ad persuasion practice',
      createdAt: Date.now(),
      isActive: true,
      isTefQuestioning: false,
      characters: [{ id: 'friend', name: 'Friend', role: 'friend', voiceName: 'aoede' }],
    };

    setScenario(nonQuestioningScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;

    expect(schema).toBeDefined();
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).not.toMatch(/isRepeat/i);
  });
});
