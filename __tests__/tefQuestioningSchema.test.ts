import { describe, it, expect } from 'vitest';
import { selectGeminiResponseSchema } from '../shared/chatSchemas';

describe('Worker chat schema · isTefQuestioning=true uses TEF_QUESTIONING_RESPONSE_SCHEMA', () => {
  it('includes an "isRepeat" property', () => {
    const schema = selectGeminiResponseSchema({
      id: 'qs-1',
      name: 'TEF Questioning',
      description: 'Customer service call',
      createdAt: Date.now(),
      isActive: true,
      isTefQuestioning: true,
      characters: [{ id: 'agent', name: 'Agent', role: 'agent', voiceName: 'puck' }],
    });
    expect(JSON.stringify(schema)).toMatch(/isRepeat/i);
  });
});

describe('Worker chat schema · standard scenario uses SINGLE_CHARACTER_RESPONSE_SCHEMA', () => {
  it('does NOT include "isRepeat"', () => {
    const schema = selectGeminiResponseSchema({
      id: 'reg-1',
      name: 'Role Play',
      description: 'Regular role-play scenario',
      createdAt: Date.now(),
      isActive: true,
      characters: [{ id: 'char1', name: 'Baker', role: 'baker', voiceName: 'aoede' }],
    });
    expect(JSON.stringify(schema)).not.toMatch(/isRepeat/i);
  });

  it('omits isRepeat when isTefQuestioning is explicitly false', () => {
    const schema = selectGeminiResponseSchema({
      id: 'non-qs-1',
      name: 'TEF Ad Persuasion',
      description: 'Ad persuasion practice',
      createdAt: Date.now(),
      isActive: true,
      isTefQuestioning: false,
      characters: [{ id: 'friend', name: 'Friend', role: 'friend', voiceName: 'aoede' }],
    });
    expect(JSON.stringify(schema)).not.toMatch(/isRepeat/i);
  });
});
