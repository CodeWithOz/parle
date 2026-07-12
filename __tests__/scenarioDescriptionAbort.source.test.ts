/**
 * Source-text checks (App.tsx is not unit-testable in isolation) confirming
 * the fix for a race condition found in live usage: starting a scenario
 * roadmap-generation request (fresh creation OR regenerating for an existing
 * saved scenario) while a previous one is still in flight must abort the
 * previous request AND invalidate its request token, so a stale response can
 * never overwrite what the newer request produces — regardless of which one
 * settles first over the network.
 *
 * Mirrors the existing per-turn abort/request-token convention documented in
 * AGENTS.md ("Abort / Cancellation Strategy for Audio Requests") and used
 * elsewhere in App.tsx (e.g. scenario description voice-transcription abort,
 * scenario review abort guards).
 */

import { describe, it, expect } from 'vitest';

async function appSource(): Promise<string> {
  const src = await import('../App?raw');
  return src.default as string;
}

describe('scenario planning (roadmap generation) abort + stale-request guards (App.tsx source-text)', () => {
  it('creates a dedicated AbortController and request token for scenario-planning requests', async () => {
    const src = await appSource();
    expect(src).toContain('const scenarioPlanningAbortControllerRef = useRef<AbortController | null>(null);');
    expect(src).toContain('const scenarioPlanningRequestIdRef = useRef(0);');
  });

  it('aborts and invalidates any previous request before starting a new one', async () => {
    const src = await appSource();
    expect(src).toMatch(/processScenarioDescriptionAndPopulate[\s\S]*?cancelScenarioPlanningRequest\(\)/);
  });

  it('passes the new AbortController\'s signal into the OpenAI call', async () => {
    const src = await appSource();
    expect(src).toMatch(/processScenarioDescriptionOpenAI\(description,\s*abortController\.signal\)/);
  });

  it('guards state updates on both the success and error paths behind the request token', async () => {
    const src = await appSource();
    expect(src).toMatch(/requestId !== scenarioPlanningRequestIdRef\.current/);
  });

  it('cancels any in-flight scenario-planning request when the setup modal closes', async () => {
    const src = await appSource();
    expect(src).toMatch(/handleCloseScenarioSetup[\s\S]*?cancelScenarioPlanningRequest\(\)/);
  });
});
