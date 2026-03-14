/**
 * TDD tests for 5 bugs identified in code review of the TEF Questioning feature.
 *
 * B1 - Hint not set in questioning mode
 * B2 - showLightbox not reset in exit/dismiss handlers
 * B3 - Timer callback and handleExitTefQuestioning don't abort in-flight requests
 * B4 - Zod validation missing in confirmTefAdImageForQuestioning (silent defaults)
 * B5 - maxSeconds validation in useConversationTimer (0, NaN, negative)
 *
 * These tests are written BEFORE fixes exist — they are expected to FAIL until
 * each bug is corrected.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppState } from '../types';
import { useConversationTimer } from '../hooks/useConversationTimer';

// ---------------------------------------------------------------------------
// B4 mock setup — must be hoisted above imports of geminiService
// ---------------------------------------------------------------------------

vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

import { GoogleGenAI } from '@google/genai';
import { confirmTefAdImageForQuestioning } from '../services/geminiService';

// ---------------------------------------------------------------------------
// Shared helper: build a GoogleGenAI mock that returns a specific payload
// ---------------------------------------------------------------------------

function buildMockAi(textPayload: string) {
  const mockGenerateContent = vi.fn().mockResolvedValue({ text: textPayload });
  const mockAi = {
    models: { generateContent: mockGenerateContent },
    chats: { create: vi.fn() },
  };
  vi.mocked(GoogleGenAI).mockReturnValue(mockAi as unknown as GoogleGenAI);
  return { mockAi, mockGenerateContent };
}

// ---------------------------------------------------------------------------
// B1 — Hint not set in questioning mode
//
// App.tsx line 393 only sets currentHint when
//   scenarioMode === 'practice' || tefAdMode === 'practice'
// When tefQuestioningMode === 'practice' a hint returned by the AI is silently
// dropped.  The fix should extend that condition to include questioning mode.
// ---------------------------------------------------------------------------

describe('B1 · hint set in TEF questioning mode (App.tsx source-text)', () => {
  it('includes tefQuestioningMode in the condition that calls setCurrentHint', async () => {
    const src = await import('../App?raw');
    // After fix: the condition guarding setCurrentHint must cover tefQuestioningMode === 'practice'
    // Pattern: the OR clause or a separate check appears near the setCurrentHint call
    expect(src.default).toMatch(
      /tefQuestioningMode\s*===\s*['"]practice['"][\s\S]{0,200}setCurrentHint|setCurrentHint[\s\S]{0,200}tefQuestioningMode\s*===\s*['"]practice['"]/
    );
  });

  it('does NOT set hint when tefQuestioningIsFirstMessage is true (greeting turn)', async () => {
    const src = await import('../App?raw');
    // The hint update block must be guarded so that it only fires after the
    // first message (same first-message skip pattern used for question counting).
    // After fix: setCurrentHint inside the tefQuestioningMode branch should be
    // conditioned on !tefQuestioningIsFirstMessage or inside the else branch.
    expect(src.default).toMatch(
      /tefQuestioningIsFirstMessage[\s\S]{0,400}setCurrentHint|setCurrentHint[\s\S]{0,400}tefQuestioningIsFirstMessage/
    );
  });
});

// ---------------------------------------------------------------------------
// B2 — showLightbox not reset in exit / dismiss handlers
//
// handleExitTefQuestioning only calls setShowTefQuestioningSummary(true).
// handleDismissTefQuestioningSummary resets most state but never calls
// setShowLightbox(false).  A re-opened session would inherit the stale
// lightbox-open state.
// ---------------------------------------------------------------------------

describe('B2 · showLightbox reset in questioning exit/dismiss handlers (App.tsx source-text)', () => {
  it('handleExitTefQuestioning calls setShowLightbox(false)', async () => {
    const src = await import('../App?raw');
    // After fix: handleExitTefQuestioning must contain setShowLightbox(false)
    expect(src.default).toMatch(
      /handleExitTefQuestioning[\s\S]{0,300}setShowLightbox\s*\(\s*false\s*\)/
    );
  });

  it('handleDismissTefQuestioningSummary calls setShowLightbox(false)', async () => {
    const src = await import('../App?raw');
    // After fix: the dismiss handler must also reset the lightbox
    expect(src.default).toMatch(
      /handleDismissTefQuestioningSummary[\s\S]{0,500}setShowLightbox\s*\(\s*false\s*\)/
    );
  });
});

// ---------------------------------------------------------------------------
// B3 — Timer callback and handleExitTefQuestioning must abort in-flight requests
//
// The onTimeUp callback for the questioning timer only sets state flags.
// handleExitTefQuestioning only calls setShowTefQuestioningSummary(true).
// In contrast handleExitTefAd calls abortControllerRef.current?.abort().
// ---------------------------------------------------------------------------

describe('B3 · abort in-flight requests on exit and timer expiry (App.tsx source-text)', () => {
  it('handleExitTefQuestioning aborts the AbortController', async () => {
    const src = await import('../App?raw');
    // After fix: the function body must call abort() BEFORE the closing brace.
    // We match the opening brace of the function body and require abort() within
    // it, before the next standalone `};` that closes the function.
    // The pattern requires abortControllerRef.current and .abort() to appear
    // inside handleExitTefQuestioning's body, not in a later sibling function.
    expect(src.default).toMatch(
      /handleExitTefQuestioning\s*=\s*\(\s*\)\s*=>\s*\{[^}]*abortControllerRef\.current[^}]*abort\s*\(\s*\)/
    );
  });

  it('the questioning timer onTimeUp callback aborts the AbortController', async () => {
    const src = await import('../App?raw');
    // The timer is defined near line 85-90.  After fix the callback must call
    // abortControllerRef.current?.abort() in addition to setting state.
    // We look for abort() appearing in close proximity to setTefQuestioningTimedUp.
    expect(src.default).toMatch(
      /setTefQuestioningTimedUp[\s\S]{0,200}abortControllerRef\.current[\s\S]{0,50}abort\s*\(\s*\)|abortControllerRef\.current[\s\S]{0,50}abort\s*\(\s*\)[\s\S]{0,200}setTefQuestioningTimedUp/
    );
  });
});

// ---------------------------------------------------------------------------
// B4 — Zod validation in confirmTefAdImageForQuestioning
//
// Currently the function silently substitutes defaults when summary or
// roleSummary is missing / not a string:
//   summary: parsed.summary || 'Advertisement analyzed.'
// The fix should throw a validation error when required string fields are
// absent or have the wrong type.
// ---------------------------------------------------------------------------

describe('B4 · confirmTefAdImageForQuestioning throws on invalid summary field', () => {
  beforeEach(() => {
    localStorage.setItem('parle_api_key_gemini', 'test-key-b4');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('throws when the API returns a response with summary missing entirely', async () => {
    buildMockAi(JSON.stringify({ roleSummary: 'I am ready.' }));

    await expect(
      confirmTefAdImageForQuestioning('base64data', 'image/jpeg')
    ).rejects.toThrow();
  });

  it('throws when the API returns a response with a non-string summary (number)', async () => {
    buildMockAi(JSON.stringify({ summary: 42, roleSummary: 'I am ready.' }));

    await expect(
      confirmTefAdImageForQuestioning('base64data', 'image/jpeg')
    ).rejects.toThrow();
  });

  it('throws when the API returns a response with an empty-string summary', async () => {
    buildMockAi(JSON.stringify({ summary: '', roleSummary: 'I am ready.' }));

    await expect(
      confirmTefAdImageForQuestioning('base64data', 'image/jpeg')
    ).rejects.toThrow();
  });

  it('throws when the API returns a response with roleSummary missing entirely', async () => {
    buildMockAi(JSON.stringify({ summary: 'A car ad.' }));

    await expect(
      confirmTefAdImageForQuestioning('base64data', 'image/jpeg')
    ).rejects.toThrow();
  });

  it('returns normally when both summary and roleSummary are valid non-empty strings', async () => {
    buildMockAi(JSON.stringify({
      summary: 'A car advertisement.',
      roleSummary: 'I understand the ad.',
    }));

    const result = await confirmTefAdImageForQuestioning('base64data', 'image/jpeg');
    expect(result.summary).toBe('A car advertisement.');
    expect(result.roleSummary).toBe('I understand the ad.');
  });
});

// ---------------------------------------------------------------------------
// B5 — maxSeconds validation in useConversationTimer
//
// The hook uses `maxSeconds ?? DEFAULT_MAX_ELAPSED_SECONDS` without checking
// whether maxSeconds is a finite positive number.  0, NaN, and negative values
// should all fall back to the default 600 seconds.
// ---------------------------------------------------------------------------

describe('B5 · maxSeconds validation — invalid values fall back to 600s', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats maxSeconds=0 as the default 600s (does NOT fire onTimeUp at 0s)', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, 0)
    );

    // If 0 is accepted as a real limit, onTimeUp fires immediately at elapsed=0.
    // After the fix, it must NOT fire until 600s.
    act(() => {
      vi.advanceTimersByTime(1000); // 1 second
    });

    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('treats maxSeconds=0 as 600s — fires onTimeUp at 600s', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, 0)
    );

    act(() => {
      vi.advanceTimersByTime(600000);
    });

    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('treats maxSeconds=-1 as the default 600s (does NOT fire onTimeUp before 600s)', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, -1)
    );

    act(() => {
      vi.advanceTimersByTime(299000);
    });

    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('treats maxSeconds=-1 as 600s — fires onTimeUp at 600s', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, -1)
    );

    act(() => {
      vi.advanceTimersByTime(600000);
    });

    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('treats maxSeconds=NaN as the default 600s (does NOT fire before 600s)', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, NaN)
    );

    act(() => {
      vi.advanceTimersByTime(299000);
    });

    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('treats maxSeconds=NaN as 600s — fires onTimeUp at 600s', () => {
    const onTimeUp = vi.fn();
    renderHook(() =>
      useConversationTimer(AppState.IDLE, true, onTimeUp, NaN)
    );

    act(() => {
      vi.advanceTimersByTime(600000);
    });

    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });
});
