/**
 * TDD tests for a real bug found in live usage: the roadmap auto-advance
 * schema field (`currentStepIndex`) was only ever wired into the
 * single-character schema branch. Multi-character scenarios (e.g. a bakery
 * visit with a Baker + Cashier — the exact example scenario used throughout
 * this feature's own design mockups) take the `characters.length > 1` branch
 * in `createChatSession()`/`sendVoiceMessage()`, which is checked BEFORE the
 * roadmap-steps check, so `currentStepIndex` was silently dropped for any
 * scenario with more than one character — the roadmap sidebar would render
 * but never advance past step 1.
 *
 * Mirrors `roadmapSchemaSelection.test.ts`'s structure/mocking approach, but
 * exercises the multi-character path (`characters.length > 1`) specifically.
 *
 * Contract this file pins down for the fix (services/geminiService.ts):
 *   - When `activeScenario.characters.length > 1` AND `activeScenario.steps`
 *     is a non-empty array, the multi-character response schema must ALSO
 *     include a "currentStepIndex" property (in addition to the existing
 *     `characterResponses`/`hint` fields).
 *   - When `activeScenario.characters.length > 1` and `steps` is empty/absent,
 *     the multi-character schema must NOT contain "currentStepIndex" (existing
 *     behavior, must not regress).
 *
 * Tests FAIL before the fix (schema omits "currentStepIndex" for the
 * multi-character + roadmap-steps combination).
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
  localStorage.setItem('parle_api_key_gemini', 'test-key-roadmap-multichar-schema');
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

const multiCharacterRoadmapScenario = {
  id: 'bakery-multichar-1',
  name: 'Bakery Visit',
  description: 'Visit a bakery, order from the baker, pay the cashier',
  createdAt: Date.now(),
  isActive: true,
  characters: [
    { id: 'baker', name: 'Baker', role: 'baker', voiceName: 'aoede' },
    { id: 'cashier', name: 'Cashier', role: 'cashier', voiceName: 'kore' },
  ],
  steps: [
    { id: 'step-1', text: 'Enter & greet the baker' },
    { id: 'step-2', text: 'Ask for a baguette' },
    { id: 'step-3', text: 'Pay the cashier' },
  ],
};

describe('createChatSession · multi-character scenario with roadmap steps', () => {
  it('includes "currentStepIndex" in the multi-character response schema', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();
    const { initializeSession, setScenario } = await import('../services/geminiService');

    setScenario(multiCharacterRoadmapScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;
    const schemaStr = JSON.stringify(schema);

    // The multi-character shape must still be present (not replaced).
    expect(schemaStr).toMatch(/characterResponses/i);
    // And now also carry the roadmap field.
    expect(schemaStr).toMatch(/currentStepIndex/i);
  });

  it('omits "currentStepIndex" for a multi-character scenario without roadmap steps (no regression)', async () => {
    const { createSpy } = buildMockAiCapturingChatCreate();
    const { initializeSession, setScenario } = await import('../services/geminiService');

    const noRoadmapScenario = { ...multiCharacterRoadmapScenario, id: 'bakery-multichar-2', steps: [] };
    setScenario(noRoadmapScenario as Parameters<typeof setScenario>[0]);
    await initializeSession();

    expect(createSpy).toHaveBeenCalled();
    const callArg = createSpy.mock.calls[createSpy.mock.calls.length - 1][0];
    const schema = callArg?.config?.responseSchema;
    const schemaStr = JSON.stringify(schema);

    expect(schemaStr).toMatch(/characterResponses/i);
    expect(schemaStr).not.toMatch(/currentStepIndex/i);
  });
});
