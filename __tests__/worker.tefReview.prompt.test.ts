import { describe, expect, it } from 'vitest';
import { buildTefReviewParts, validateTefReview } from '../worker/prompts/tefReview';

describe('buildTefReviewParts', () => {
  it('scopes evaluation to the user and keeps agent turns as context', () => {
    const { parts } = buildTefReviewParts({
      exerciseType: 'questioning',
      elapsedSeconds: 42,
      adSummary: 'A gym membership ad',
      turns: [
        { role: 'model', frenchText: 'Bonjour, comment puis-je vous aider?' },
        { role: 'user', audioBase64: 'ZmFrZQ==', mimeType: 'audio/webm', text: 'Quel est le prix?' },
      ],
    });
    const text = parts.map((part) => 'text' in part ? part.text : '').join('\n');
    expect(text).toMatch(/Evaluate only the user's French/i);
    expect(text).toMatch(/context only, not for grading/i);
    expect(text).toMatch(/do not grade the agent's French/i);
    expect(text).toContain('[Agent said: Bonjour, comment puis-je vous aider?]');
    expect(text).toContain('ELAPSED TIME: 42 seconds');
    expect(text).toContain('A gym membership ad');
    expect(parts.some((part) => 'inlineData' in part && part.inlineData.data === 'ZmFrZQ==')).toBe(true);
  });

  it('includes persuasion criteria and user-perspective topic suggestions', () => {
    const { parts, responseSchema } = buildTefReviewParts({
      exerciseType: 'persuasion',
      elapsedSeconds: 120,
      turns: [],
    });
    const text = parts.map((part) => 'text' in part ? part.text : '').join('\n');
    expect(text).toMatch(/Clear & interesting presentation/i);
    expect(text).toMatch(/argumentation vocabulary/i);
    expect(text).not.toMatch(/objectionState|isConvinced|currentDirection/);
    expect(text).toMatch(/persuasive statements from the user's perspective/i);
    expect(JSON.stringify(responseSchema)).toMatch(/criteriaEvaluation/);
  });
});

describe('validateTefReview', () => {
  const validSuggestions = Array.from({ length: 5 }, (_, i) => ({
    topic: `Topic ${i + 1}`,
    examples: [
      { french: 'Exemple A', english: 'Example A' },
      { french: 'Exemple B', english: 'Example B' },
    ],
  }));

  it('accepts a complete questioning review', () => {
    const review = validateTefReview({
      cefrLevel: 'B2',
      cefrJustification: 'Solid grammar.',
      wentWell: ['Pronunciation'],
      topicSuggestions: validSuggestions,
    }, 'questioning');
    expect(review.cefrLevel).toBe('B2');
  });

  it('requires criteriaEvaluation for persuasion', () => {
    expect(() => validateTefReview({
      cefrLevel: 'B2',
      cefrJustification: 'Solid grammar.',
      wentWell: ['Pronunciation'],
      topicSuggestions: validSuggestions,
    }, 'persuasion')).toThrow(/criteriaEvaluation/);
  });

  it('requires at least 5 topic suggestions with 2 bilingual examples', () => {
    expect(() => validateTefReview({
      cefrLevel: 'B2',
      cefrJustification: 'Solid grammar.',
      wentWell: ['Pronunciation'],
      topicSuggestions: validSuggestions.slice(0, 2),
    }, 'questioning')).toThrow(/topicSuggestions/);
  });
});
