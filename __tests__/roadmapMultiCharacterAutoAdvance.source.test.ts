/**
 * Source-text checks (App.tsx is not unit-testable in isolation) confirming
 * the scenario roadmap auto-advance logic (`advanceRoadmapStep` +
 * `setCurrentRoadmapStepIndex`) runs for BOTH response branches — the
 * multi-character branch (`Array.isArray(response.audioUrl)`) and the
 * single-character branch — not just the single-character one.
 *
 * Regression guard for the bug found in live usage: the roadmap sidebar was
 * "stuck on step 1" for multi-character scenarios (e.g. a bakery visit with
 * a Baker + Cashier) because the auto-advance wiring only existed in the
 * single-character branch. See `roadmapMultiCharacterSchema.test.ts` for the
 * corresponding schema-level fix.
 */

import { describe, it, expect } from 'vitest';

async function appSource(): Promise<string> {
  const src = await import('../App?raw');
  return src.default as string;
}

describe('roadmap auto-advance runs for both multi-character and single-character responses', () => {
  it('calls advanceRoadmapStep + setCurrentRoadmapStepIndex at least twice (once per branch)', async () => {
    const src = await appSource();
    const matches = src.match(/setCurrentRoadmapStepIndex\(\(prev\)\s*=>\s*\n?\s*advanceRoadmapStep\(prev, response\.currentStepIndex, stepsLength\)\s*\n?\s*\);/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
