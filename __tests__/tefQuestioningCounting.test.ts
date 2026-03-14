/**
 * TDD tests for TEF Questioning mode question counting logic in App.tsx.
 *
 * Counting rules (from the plan):
 *   - The first user turn (greeting) does NOT increment tefQuestioningQuestionCount.
 *     Instead it just sets tefQuestioningIsFirstMessage = false.
 *   - Every subsequent turn increments tefQuestioningQuestionCount by 1.
 *   - When the AI response includes isRepeat: true, tefQuestioningRepeatCount
 *     is also incremented by 1.
 *
 * These tests exercise the App.tsx source text to specify the required
 * implementation (since mounting the full App with all interactions is
 * prohibitively complex in unit tests).
 *
 * Tests FAIL before the implementation is in place.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Source-text specs: state declarations
// ---------------------------------------------------------------------------

describe('tefQuestioningCounting · App.tsx state declarations', () => {
  it('declares tefQuestioningQuestionCount state (number)', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/tefQuestioningQuestionCount/);
  });

  it('initialises tefQuestioningQuestionCount to 0', async () => {
    const src = await import('../App?raw');
    // useState(0) for tefQuestioningQuestionCount
    expect(src.default).toMatch(/useState\s*\(\s*0\s*\)[\s\S]{0,200}tefQuestioningQuestionCount|tefQuestioningQuestionCount[\s\S]{0,200}useState\s*\(\s*0\s*\)/);
  });

  it('declares tefQuestioningRepeatCount state (number)', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/tefQuestioningRepeatCount/);
  });

  it('initialises tefQuestioningRepeatCount to 0', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/useState\s*\(\s*0\s*\)[\s\S]{0,200}tefQuestioningRepeatCount|tefQuestioningRepeatCount[\s\S]{0,200}useState\s*\(\s*0\s*\)/);
  });

  it('declares tefQuestioningIsFirstMessage state (boolean)', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/tefQuestioningIsFirstMessage/);
  });

  it('initialises tefQuestioningIsFirstMessage to true', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/tefQuestioningIsFirstMessage[\s\S]{0,100}true|useState.*true[\s\S]{0,200}tefQuestioningIsFirstMessage/);
  });
});

// ---------------------------------------------------------------------------
// Source-text specs: first-turn skip (greeting)
// ---------------------------------------------------------------------------

describe('tefQuestioningCounting · first-turn skip in processAudioMessage', () => {
  it('sets tefQuestioningIsFirstMessage to false after first turn', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/setTefQuestioningIsFirstMessage\s*\(\s*false\s*\)/);
  });

  it('does NOT increment tefQuestioningQuestionCount when tefQuestioningIsFirstMessage is true', async () => {
    const src = await import('../App?raw');
    // The count increment must be guarded by !tefQuestioningIsFirstMessage
    // (the count only increments when it is NOT the first message)
    expect(src.default).toMatch(
      /!tefQuestioningIsFirstMessage[\s\S]{0,300}setTefQuestioningQuestionCount|setTefQuestioningQuestionCount[\s\S]{0,300}!tefQuestioningIsFirstMessage/
    );
  });
});

// ---------------------------------------------------------------------------
// Source-text specs: subsequent turns
// ---------------------------------------------------------------------------

describe('tefQuestioningCounting · count increments on subsequent turns', () => {
  it('increments tefQuestioningQuestionCount by 1 using a functional updater', async () => {
    const src = await import('../App?raw');
    // Must use setTefQuestioningQuestionCount(c => c + 1) pattern (functional update)
    expect(src.default).toMatch(
      /setTefQuestioningQuestionCount\s*\(\s*(?:c|count|prev)\s*=>\s*(?:c|count|prev)\s*\+\s*1\s*\)/
    );
  });
});

// ---------------------------------------------------------------------------
// Source-text specs: isRepeat handling
// ---------------------------------------------------------------------------

describe('tefQuestioningCounting · repeat question detection', () => {
  it('increments tefQuestioningRepeatCount when response.isRepeat is true', async () => {
    const src = await import('../App?raw');
    // Must check response.isRepeat === true and increment repeat count
    expect(src.default).toMatch(/isRepeat[\s\S]{0,200}setTefQuestioningRepeatCount|setTefQuestioningRepeatCount[\s\S]{0,200}isRepeat/);
  });

  it('increments tefQuestioningRepeatCount using a functional updater', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(
      /setTefQuestioningRepeatCount\s*\(\s*(?:r|count|prev)\s*=>\s*(?:r|count|prev)\s*\+\s*1\s*\)/
    );
  });

  it('only increments repeatCount when isRepeat is truthy', async () => {
    const src = await import('../App?raw');
    // The repeat count increment must be conditional on isRepeat
    expect(src.default).toMatch(/response\.isRepeat[\s\S]{0,100}setTefQuestioningRepeatCount/);
  });
});

// ---------------------------------------------------------------------------
// Source-text specs: reset on new session
// ---------------------------------------------------------------------------

describe('tefQuestioningCounting · counts reset on new questioning session', () => {
  it('resets tefQuestioningQuestionCount to 0 when starting a new questioning session', async () => {
    const src = await import('../App?raw');
    // The start handler must reset the question count
    expect(src.default).toMatch(
      /handleStartTefQuestioning[\s\S]{0,600}setTefQuestioningQuestionCount\s*\(\s*0\s*\)/
    );
  });

  it('resets tefQuestioningRepeatCount to 0 when starting a new questioning session', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(
      /handleStartTefQuestioning[\s\S]{0,600}setTefQuestioningRepeatCount\s*\(\s*0\s*\)/
    );
  });

  it('resets tefQuestioningIsFirstMessage to true when starting a new questioning session', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(
      /handleStartTefQuestioning[\s\S]{0,600}setTefQuestioningIsFirstMessage\s*\(\s*true\s*\)/
    );
  });
});

// ---------------------------------------------------------------------------
// Source-text specs: TefQuestioningMode type and tefQuestioningMode state
// ---------------------------------------------------------------------------

describe('tefQuestioningCounting · TefQuestioningMode type and mode state', () => {
  it('types.ts declares TefQuestioningMode type', async () => {
    const src = await import('../types?raw');
    expect(src.default).toMatch(/TefQuestioningMode/);
  });

  it('TefQuestioningMode includes "none", "setup", and "practice" variants', async () => {
    const src = await import('../types?raw');
    expect(src.default).toMatch(/TefQuestioningMode[\s\S]{0,100}none[\s\S]{0,100}setup[\s\S]{0,100}practice/);
  });

  it('App.tsx declares tefQuestioningMode state', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/tefQuestioningMode/);
  });

  it('isTefQuestioning is declared in the Scenario interface in types.ts', async () => {
    const src = await import('../types?raw');
    expect(src.default).toMatch(/isTefQuestioning\s*\?\s*:\s*boolean/);
  });

  it('isRepeat is declared in the VoiceResponse interface in types.ts', async () => {
    const src = await import('../types?raw');
    expect(src.default).toMatch(/isRepeat\s*\?\s*:\s*boolean/);
  });
});
