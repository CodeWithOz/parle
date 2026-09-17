import { describe, it, expect } from 'vitest';
import { selectGeminiResponseSchema } from '../shared/chatSchemas';

describe('Worker chat schema · scenario with non-empty steps uses a roadmap-aware schema', () => {
  it('includes a "currentStepIndex" property in the response schema', () => {
    const schema = selectGeminiResponseSchema({
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
    });
    expect(JSON.stringify(schema)).toMatch(/currentStepIndex/i);
  });
});

describe('Worker chat schema · scenario without steps does NOT use the roadmap-aware schema', () => {
  it('omits "currentStepIndex" when the scenario has no steps field at all', () => {
    const schema = selectGeminiResponseSchema({
      id: 'plain-1',
      name: 'Role Play',
      description: 'Regular role-play scenario, no roadmap',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'char1', name: 'Waiter', role: 'waiter', voiceName: 'aoede' }],
    });
    expect(JSON.stringify(schema)).not.toMatch(/currentStepIndex/i);
  });

  it('omits "currentStepIndex" when the scenario has an empty steps array', () => {
    const schema = selectGeminiResponseSchema({
      id: 'empty-steps-1',
      name: 'Role Play',
      description: 'Scenario created before roadmap steps were added, or with steps removed',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'char1', name: 'Waiter', role: 'waiter', voiceName: 'aoede' }],
      steps: [],
    });
    expect(JSON.stringify(schema)).not.toMatch(/currentStepIndex/i);
  });

  it('omits "currentStepIndex" for free conversation (no active scenario at all)', () => {
    const schema = selectGeminiResponseSchema(null);
    expect(JSON.stringify(schema)).not.toMatch(/currentStepIndex/i);
  });
});
