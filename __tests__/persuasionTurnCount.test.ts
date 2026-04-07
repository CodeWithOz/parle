/**
 * TDD tests for the tefAdTurnCount state and phase-based context injection
 * in App.tsx (TEF Ad Persuasion mode).
 *
 * What's being tested:
 *   - tefAdTurnCount starts at 0
 *   - First user turn (isFirstMessage=true path) does NOT increment tefAdTurnCount
 *   - Second and subsequent turns DO increment tefAdTurnCount
 *   - Phase-based context text matches expected content per turn range:
 *       Turns 1–2 (early): mention "introduce" or "present"
 *       Turns 3–4 (mid):   mention "exemple" or "example"
 *       Turns 5+  (late):  mention "counter" or "nuance" or "Oui mais"
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

  it('App.tsx resets tefAdTurnCount to 0 inside handleDismissTefAdSummary', async () => {
    const src = await import('../App?raw');
    expect(src.default).toMatch(/handleDismissTefAdSummary[\s\S]{0,1200}setTefAdTurnCount\s*\(\s*0\s*\)/);
  });

  it('App.tsx increments tefAdTurnCount only in the else branch when tefAdIsFirstMessage is true', async () => {
    const src = await import('../App?raw');
    // Assert the if/else structure: if (tefAdIsFirstMessage) { setTefAdIsFirstMessage(false) }
    // else { setTefAdTurnCount(...) }
    expect(src.default).toMatch(
      /if\s*\(\s*tefAdIsFirstMessage\s*\)[\s\S]{0,200}setTefAdIsFirstMessage\s*\(\s*false\s*\)[\s\S]{0,200}else[\s\S]{0,200}setTefAdTurnCount/
    );
  });

  it('App.tsx increments tefAdTurnCount in the non-first-message branch', async () => {
    const src = await import('../App?raw');
    // Must have a setTefAdTurnCount increment call
    expect(src.default).toMatch(/setTefAdTurnCount\s*\(\s*(prev|c|count|n)\s*=>/);
  });

  it('App.tsx builds phase-based context for early phase (turns 1–2)', async () => {
    const src = await import('../App?raw');
    // Early phase should mention "introduce" and/or "present" the advertisement clearly
    expect(src.default).toMatch(/introduce.*advertisement|present.*advertisement|introduce.*clearly|Encourage.*introduce/i);
  });

  it('App.tsx builds phase-based context for mid phase (turns 3–4)', async () => {
    const src = await import('../App?raw');
    // Mid phase should ask for concrete examples
    expect(src.default).toMatch(/exemple concret|concrete.*example|give.*example/i);
  });

  it('App.tsx builds phase-based context for late phase (turns 5+)', async () => {
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
  it('early/mid boundary: uses turnNumber (tefAdTurnCount + 1) with threshold <= 2', async () => {
    // Phase is computed as turnNumber = tefAdTurnCount + 1.
    // Early covers turns 1–2 (turnNumber <= 2), mid covers 3–4, late 5+.
    const src = await import('../App?raw');
    // Code must use tefAdTurnCount + 1 and check <= 2 (or equivalent < 3)
    expect(src.default).toMatch(/tefAdTurnCount\s*\+\s*1/);
    expect(src.default).toMatch(/turnNumber\s*<=\s*2|turnNumber\s*<\s*3/);
  });

  it('late phase boundary: turn 5+ uses late phase text (turnNumber >= 5)', async () => {
    // Late phase starts when turnNumber > 4, i.e. mid uses turnNumber <= 4
    const src = await import('../App?raw');
    expect(src.default).toMatch(/turnNumber\s*<=\s*4|turnNumber\s*<\s*5/);
  });
});
