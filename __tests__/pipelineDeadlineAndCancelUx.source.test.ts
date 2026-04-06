/**
 * Regression specs for the Gemini voice pipeline: cumulative deadline + user cancel,
 * wired in App.tsx (processAudioMessage + handleAbortProcessing).
 *
 * Uses raw App.tsx source (same pattern as tefQuestioningReviewFixes) — no full
 * App mount; asserts critical ordering and distinct ERROR copy for timeout vs orb cancel.
 */

import { describe, it, expect } from 'vitest';
import { PIPELINE_MAX_MS } from '../services/geminiService';

async function appSource(): Promise<string> {
  const src = await import('../App?raw');
  return src.default as string;
}

describe('pipeline deadline + cancel UX (App.tsx source-text)', () => {
  it('sets pipeline failure kind to timeout before aborting the deadline controller', async () => {
    const src = await appSource();
    expect(src).toMatch(
      /pipelineFailureKindRef\.current\s*=\s*['"]timeout['"][\s\S]{0,120}deadlineAbort\.abort\s*\(/
    );
  });

  it('combines user and deadline AbortSignals for the pipeline passed to sendVoiceMessage', async () => {
    const src = await appSource();
    expect(src).toContain('combineAbortSignals(userAbort.signal, deadlineAbort.signal)');
    expect(src).toMatch(/sendVoiceMessage\s*\([\s\S]*?pipelineSignal/s);
  });

  it('schedules the deadline with PIPELINE_MAX_MS from geminiService', async () => {
    const src = await appSource();
    expect(src).toMatch(new RegExp(`,\\s*PIPELINE_MAX_MS\\s*\\)\\s*;`));
  });

  it('clears the deadline timer in finally', async () => {
    const src = await appSource();
    expect(src).toMatch(/clearTimeout\s*\(\s*deadlineTimeoutId\s*\)/);
  });

  it('handleAbortProcessing no-ops when abortControllerRef is null (no in-flight controller)', async () => {
    const src = await appSource();
    expect(src).toMatch(
      /handleAbortProcessing[\s\S]*?if\s*\(\s*!abortControllerRef\.current\s*\)\s*\{[\s\S]*?return/
    );
  });

  it('sets user_cancel only when aborting the user controller', async () => {
    const src = await appSource();
    expect(src).toMatch(
      /handleAbortProcessing[\s\S]{0,400}pipelineFailureKindRef\.current\s*=\s*['"]user_cancel['"][\s\S]{0,200}abortControllerRef\.current[^}]*\.abort/s
    );
  });

  it('uses distinct catch branches for AbortError + user_cancel vs timeout', async () => {
    const src = await appSource();
    expect(src).toMatch(/kind\s*===\s*['"]user_cancel['"]/);
    expect(src).toMatch(/kind\s*===\s*['"]timeout['"]/);
    expect(src).toMatch(/You canceled the processing\./);
    expect(src).toMatch(/Connection timed out/);
  });

  it('uses isAbortLikeError in catch so transcribe/chat aborts match TTS (not only DOMException)', async () => {
    const src = await appSource();
    expect(src).toContain('isAbortLikeError(error)');
  });
});

describe('PIPELINE_MAX_MS contract', () => {
  it('exports a positive deadline (production is 90s; local overrides may differ)', () => {
    expect(PIPELINE_MAX_MS).toBeGreaterThan(0);
  });
});

describe('invalid multi-character response (S1 retry)', () => {
  it('sets canRetryChatAudio when rejecting invalid response shape', async () => {
    const src = await appSource();
    expect(src).toMatch(
      /Invalid response format from AI[\s\S]{0,160}setCanRetryChatAudio\s*\(\s*true\s*\)/s
    );
  });
});
