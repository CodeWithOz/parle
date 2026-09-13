import { describe, it, expect } from 'vitest';
import { selectGeminiResponseSchema } from '../shared/chatSchemas';

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

describe('Worker chat schema · multi-character scenario with roadmap steps', () => {
  it('includes "currentStepIndex" in the multi-character response schema', () => {
    const schemaStr = JSON.stringify(selectGeminiResponseSchema(multiCharacterRoadmapScenario));
    expect(schemaStr).toMatch(/characterResponses/i);
    expect(schemaStr).toMatch(/currentStepIndex/i);
  });

  it('omits "currentStepIndex" for a multi-character scenario without roadmap steps (no regression)', () => {
    const schemaStr = JSON.stringify(selectGeminiResponseSchema({
      ...multiCharacterRoadmapScenario,
      id: 'bakery-multichar-2',
      steps: [],
    }));
    expect(schemaStr).toMatch(/characterResponses/i);
    expect(schemaStr).not.toMatch(/currentStepIndex/i);
  });
});
