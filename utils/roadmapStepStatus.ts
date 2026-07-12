/**
 * Pure helpers for deriving scenario roadmap step statuses and for the
 * AI auto-advance "never regress" rule. See __tests__/roadmapStepStatus.test.ts
 * for the exact contract these implement.
 */

export type RoadmapStepStatus = 'done' | 'current' | 'upcoming';

/**
 * Clamp `value` into the inclusive range [0, max]. If `max` is negative
 * (i.e. there are no valid indices), returns 0.
 */
function clampIndex(value: number, maxIndex: number): number {
  if (maxIndex < 0) return 0;
  if (value < 0) return 0;
  if (value > maxIndex) return maxIndex;
  return value;
}

export function getRoadmapStepStatus(
  stepsLength: number,
  currentStepIndex: number | undefined
): RoadmapStepStatus[] {
  if (stepsLength <= 0) return [];

  const maxIndex = stepsLength - 1;
  const effectiveIndex = clampIndex(
    currentStepIndex === undefined ? 0 : currentStepIndex,
    maxIndex
  );

  return Array.from({ length: stepsLength }, (_, i) => {
    if (i < effectiveIndex) return 'done';
    if (i === effectiveIndex) return 'current';
    return 'upcoming';
  });
}

export function advanceRoadmapStep(
  prevIndex: number | undefined,
  aiReportedIndex: number | undefined,
  stepsLength: number
): number {
  const maxIndex = stepsLength - 1;

  if (aiReportedIndex === undefined) {
    return prevIndex === undefined ? 0 : prevIndex;
  }

  const clampedAiIndex = clampIndex(aiReportedIndex, maxIndex);

  if (prevIndex === undefined) {
    return clampedAiIndex;
  }

  return Math.max(prevIndex, clampedAiIndex);
}
