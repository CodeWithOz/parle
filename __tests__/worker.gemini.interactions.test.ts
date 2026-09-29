import { describe, expect, it } from 'vitest';
import {
  audioResponseFormat,
  generateContentPartsToInput,
  isMissingInteractionError,
  jsonResponseFormat,
  parseJsonFromModelText,
  toInteractionsCreateParams,
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

describe('parseJsonFromModelText', () => {
  it('parses plain JSON', () => {
    expect(parseJsonFromModelText('{"french":"Bonjour"}')).toEqual({ french: 'Bonjour' });
  });

  it('unwraps markdown-fenced JSON', () => {
    const raw = '```json\n{\n  "french": "Bonjour !",\n  "english": "Hello!"\n}\n```';
    expect(parseJsonFromModelText(raw)).toEqual({ french: 'Bonjour !', english: 'Hello!' });
  });
});

describe('toInteractionsCreateParams', () => {
  it('sends JSON structured output as a response_format array', () => {
    const schema = { type: 'object', properties: { french: { type: 'string' } } };
    const body = toInteractionsCreateParams({
      model: 'gemini-2.5-flash-lite',
      input: [{ type: 'text', text: 'hi' }],
      responseFormat: jsonResponseFormat(schema),
    });
    expect(body.response_format).toEqual([
      { type: 'text', mime_type: 'application/json', schema },
    ]);
  });

  it('leaves TTS audio response_format as a single object', () => {
    const body = toInteractionsCreateParams({
      model: 'gemini-2.5-flash-preview-tts',
      input: [{ type: 'text', text: 'Bonjour' }],
      responseFormat: audioResponseFormat,
      speechVoice: 'kore',
    });
    expect(body.response_format).toEqual({ type: 'audio' });
  });
});
