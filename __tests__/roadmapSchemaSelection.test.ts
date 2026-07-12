/**
 * TDD tests for conditional response-schema selection when a scenario carries
 * roadmap steps (the new scenario-roadmap feature).
 *
 * Mirrors the existing `isTefQuestioning` schema-selection convention documented
 * in AGENTS.md ("TEF Ad Questioning Mode: Schema Selection") and tested in
 * `__tests__/tefQuestioningSchema.test.ts`. Just like `isRepeat`/`conceptLabels`
 * are only present in the questioning schema, the new roadmap step-index field
 * must ONLY appear in the response schema when the active scenario has a
 * non-empty `steps` array — it must be completely absent otherwise. This must be
 * a separate conditional schema branch, not folded into a single always-present
 * optional field, so that the field is never present/required for scenarios that
 * don't have a roadmap.
 *
 * Contract this test file pins down for the builder (services/geminiService.ts):
 *   - `createChatSession()` (invoked via `initializeSession()` / `setScenario()`)
 *     must pick a response schema that includes a "currentStepIndex" property
 *     when `activeScenario.steps` is a non-empty array.
 *   - The field must be named exactly "currentStepIndex" (0-based index into
 *     `scenario.steps` of the step the AI infers is currently being addressed).
 *   - When `activeScenario.steps` is undefined OR an empty array, the schema
 *     must NOT contain "currentStepIndex" at all.
 *   - This test only exercises the single-character, non-TEF-Questioning path
 *     (one character, `isTefQuestioning` unset) — multi-character and TEF
 *     Questioning interaction with roadmap steps is intentionally left to the
 *     builder's discretion and is not pinned down here (see summary notes).
 *
 * Tests FAIL before the implementation is in place (schema will not yet contain
 * "currentStepIndex" for a scenario with steps).
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

beforeEach(() => {
  localStorage.setItem('parle_api_key_gemini', 'test-key-roadmap-schema');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

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

describe('createChatSession · scenario with non-empty steps uses a roadmap-aware schema', () => {
  it('includes a "currentStepIndex" property in the response schema', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();

    const { initializeSession, setScenario } = await import('../services/geminiService');

    const roadmapScenario = {
      id: 'roadmap-1',
      name: 'Bakery Visit',
      description: 'Visit a bakery and buy bread',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'baker', name: 'Baker', role: 'baker', voiceName: 'aoede' }],
      steps: [
        { id: 'step-1', text: 'Enter & greet the baker' },
        { id: 'step-2', text: 'Ask for a baguette' },
        { id: 'step-3', text: 'Pay the total' },
      ],
    };

    setScenario(roadmapScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;

    expect(schema).toBeDefined();
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).toMatch(/currentStepIndex/i);
  });
});

describe('createChatSession · scenario without steps does NOT use the roadmap-aware schema', () => {
  it('omits "currentStepIndex" when the scenario has no steps field at all', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();

    const { initializeSession, setScenario } = await import('../services/geminiService');

    const plainScenario = {
      id: 'plain-1',
      name: 'Role Play',
      description: 'Regular role-play scenario, no roadmap',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'char1', name: 'Waiter', role: 'waiter', voiceName: 'aoede' }],
      // steps intentionally omitted
    };

    setScenario(plainScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;

    expect(schema).toBeDefined();
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).not.toMatch(/currentStepIndex/i);
  });

  it('omits "currentStepIndex" when the scenario has an empty steps array', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();

    const { initializeSession, setScenario } = await import('../services/geminiService');

    const emptyStepsScenario = {
      id: 'empty-steps-1',
      name: 'Role Play',
      description: 'Scenario created before roadmap steps were added, or with steps removed',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'char1', name: 'Waiter', role: 'waiter', voiceName: 'aoede' }],
      steps: [],
    };

    setScenario(emptyStepsScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;

    expect(schema).toBeDefined();
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).not.toMatch(/currentStepIndex/i);
  });

  it('omits "currentStepIndex" for free conversation (no active scenario at all)', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();

    const { initializeSession, setScenario } = await import('../services/geminiService');

    setScenario(null);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;

    expect(schema).toBeDefined();
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).not.toMatch(/currentStepIndex/i);
  });
});
