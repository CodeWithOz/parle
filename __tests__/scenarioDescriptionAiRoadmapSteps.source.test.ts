/**
 * Source-text checks (App.tsx is not unit-testable in isolation) confirming
 * `handleSubmitScenarioDescription` prefers the AI-generated `steps` from
 * `processScenarioDescriptionOpenAI`'s structured-output result and only
 * falls back to `seedRoadmapStepsFromSummary` (the sentence-split heuristic)
 * when the AI didn't return usable steps. Mirrors the existing
 * `*.source.test.ts` convention used elsewhere for App.tsx-embedded logic
 * (see `scenarioReviewAbortGuards.source.test.ts`).
 */

import { describe, it, expect } from 'vitest';

async function appSource(): Promise<string> {
  const src = await import('../App?raw');
  return src.default as string;
}

describe('AI-generated roadmap steps take priority over the heuristic seed (App.tsx source-text)', () => {
  it('derives aiSteps from parsed.steps before falling back to the heuristic', async () => {
    const src = await appSource();
    expect(src).toMatch(/Array\.isArray\(parsed\.steps\)/);
  });

  it('only uses seedRoadmapStepsFromSummary when the AI steps array is empty', async () => {
    const src = await appSource();
    expect(src).toMatch(/aiSteps\.length > 0 \? aiSteps : seedRoadmapStepsFromSummary\(parsed\.summary\)/);
  });
});
