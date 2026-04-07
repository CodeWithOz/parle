/**
 * TDD tests for the tefAdTurnCount state and phase-based context injection
 * in App.tsx (TEF Ad Persuasion mode).
 *
 * What's being tested:
 *   - tefAdTurnCount starts at 0
 *   - First user turn (isFirstMessage=true path) does NOT increment tefAdTurnCount
 *   - Second and subsequent turns DO increment tefAdTurnCount
 *   - Phase-based context text matches expected content per turn range:
 *       Turns 1–3 (early): mention "introduce" or "present"
 *       Turns 4–7 (mid):   mention "exemple" or "example"
 *       Turns 8+  (late):  mention "counter" or "nuance" or "Oui mais"
 *
 * Source-text specs verify the required implementation exists in App.tsx.
 *
 * Tests FAIL before the implementation is in place.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Source-text specs: App.tsx must declare tefAdTurnCount and phase logic
// ---------------------------------------------------------------------------

describe('persuasionTurnCount · App.tsx source-text specs', () => {
  it('App.tsx declares tefAdTurnCount state', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/tefAdTurnCount/);
  });

  it('App.tsx initialises tefAdTurnCount to 0', async () => {
    const src = await import('../App?raw');
    // useState(0) pattern for tefAdTurnCount
    expect(src.default).toMatch(/tefAdTurnCount[\s\S]{0,80}useState\s*\(\s*0\s*\)|useState\s*\(\s*0\s*\)[\s\S]{0,80}tefAdTurnCount/);
  });

  it('App.tsx resets tefAdTurnCount to 0 inside handleExitTefAd', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/handleExitTefAd[\s\S]{0,600}setTefAdTurnCount\s*\(\s*0\s*\)/);
  });

  it('App.tsx does NOT increment tefAdTurnCount when tefAdIsFirstMessage is true', async () => {
    const src = await import('../App?raw');
    // setTefAdIsFirstMessage(false) should appear before setTefAdTurnCount increment,
    // meaning the increment is in the else branch (non-first-message)
    const setFalseIdx = src.default.indexOf('setTefAdIsFirstMessage(false)');
    const incrementIdx = src.default.search(/setTefAdTurnCount\s*\(/);
    expect(setFalseIdx).toBeGreaterThan(-1);
    expect(incrementIdx).toBeGreaterThan(setFalseIdx);
  });

  it('App.tsx increments tefAdTurnCount in the non-first-message branch', async () => {
    const src = await import('../App?raw');
    // Must have a setTefAdTurnCount increment call
    expect(src.default).toMatch(/setTefAdTurnCount\s*\(\s*(prev|c|count|n)\s*=>/);
  });

  it('App.tsx builds phase-based context for early phase (turns 1–3)', async () => {
    const src = await import('../App?raw');
    // Early phase should mention "introduce" and/or "present" the advertisement clearly
    expect(src.default).toMatch(/introduce.*advertisement|present.*advertisement|introduce.*clearly|Encourage.*introduce/i);
  });

  it('App.tsx builds phase-based context for mid phase (turns 4–7)', async () => {
    const src = await import('../App?raw');
    // Mid phase should ask for concrete examples
    expect(src.default).toMatch(/exemple concret|concrete.*example|give.*example/i);
  });

  it('App.tsx builds phase-based context for late phase (turns 8+)', async () => {
    const src = await import('../App?raw');
    // Late phase should push back with counter-arguments or nuance
    expect(src.default).toMatch(/Oui mais|counter.?argument|nuance/i);
  });

  it('App.tsx uses tefAdTurnCount to select the phase', async () => {
    const src = await import('../App?raw');
    // The phase selection must reference tefAdTurnCount in a conditional
    expect(src.default).toMatch(/tefAdTurnCount[\s\S]{0,200}(early|mid|late|introduce|exemple|Oui mais)/);
  });

  it('App.tsx no longer references tefObjectionState in context injection block', async () => {
    const src = await import('../App?raw');
    // objectionContextText build block should be gone
    expect(src.default).not.toMatch(/objectionContextText/);
  });
});

// ---------------------------------------------------------------------------
// Phase content unit tests: the phase text helper logic
// ---------------------------------------------------------------------------

describe('persuasionTurnCount · phase context content by turn number', () => {
  /**
   * These tests derive the phase context string by reading App.tsx source and
   * extracting the phase strings. Since the helper is inline in App.tsx (not a
   * separate exported function), we verify the string constants are present in
   * the source.
   */

  it('phase context for turn 1 (early) contains "introduce" or "present"', async () => {
    const src = await import('../App?raw');
    // The early-phase string in App.tsx must contain one of these words
    expect(src.default).toMatch(/introduce|present the advertisement/i);
  });

  it('phase context for turn 4 (mid) contains "exemple" or "example"', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/exemple|example/i);
  });

  it('phase context for turn 8 (late) contains "counter" or "nuance" or "Oui mais"', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/counter|nuance|Oui mais/i);
  });

  it('early phase boundary: turn 3 still uses early phase text', async () => {
    // Boundary: turn index 3 (tefAdTurnCount=3, which is the 3rd non-first turn)
    // should still be in early phase (turns 1–3 means tefAdTurnCount 1,2,3)
    const src = await import('../App?raw');
    // The threshold between early and mid must be 3 (exclusive) or 4 (inclusive)
    // i.e. the code must check for tefAdTurnCount <= 3 or tefAdTurnCount < 4
    expect(src.default).toMatch(/tefAdTurnCount\s*<=\s*3|tefAdTurnCount\s*<\s*4/);
  });

  it('late phase boundary: turn 8 uses late phase text', async () => {
    // Turn 8 is tefAdTurnCount >= 8
    const src = await import('../App?raw');
    expect(src.default).toMatch(/tefAdTurnCount\s*>=\s*8|tefAdTurnCount\s*>\s*7/);
  });
});
