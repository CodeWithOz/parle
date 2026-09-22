import { describe, expect, it } from 'vitest';
import {
  generateContentPartsToInput,
  isMissingInteractionError,
} from '../worker/gemini';
import { selectGeminiResponseSchema } from '../shared/chatSchemas';

describe('isMissingInteractionError', () => {
  it('treats HTTP 404 as a missing interaction', () => {
    expect(isMissingInteractionError(Object.assign(new Error('nope'), { status: 404 }))).toBe(true);
  });

  it('matches previous_interaction wording', () => {
    expect(isMissingInteractionError(new Error('previous_interaction_id int_x was not found'))).toBe(true);
  });

  it('does not treat unrelated upstream errors as missing interactions', () => {
    expect(isMissingInteractionError(new Error('rate limit exceeded'))).toBe(false);
  });
});

describe('generateContentPartsToInput', () => {
  it('maps text and inlineData audio parts to Interactions content', () => {
    expect(generateContentPartsToInput([
      { text: 'hello' },
      { inlineData: { data: 'ZmFrZQ==', mimeType: 'audio/webm' } },
    ])).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'audio', data: 'ZmFrZQ==', mime_type: 'audio/webm' },
    ]);
  });
});

describe('selectGeminiResponseSchema · Interactions JSON Schema', () => {
  it('uses lowercase JSON Schema types instead of generateContent Type enums', () => {
    const schema = selectGeminiResponseSchema(null);
    expect(JSON.stringify(schema)).toMatch(/"type":"object"/);
    expect(JSON.stringify(schema)).not.toMatch(/"type":"OBJECT"/);
  });
});
