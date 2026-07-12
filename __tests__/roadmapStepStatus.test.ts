/**
 * TDD tests for scenario roadmap step status derivation and auto-advance logic.
 *
 * New module under test: `utils/roadmapStepStatus.ts` (does not exist yet).
 *
 * Contract this test file pins down for the builder:
 *
 *   export type RoadmapStepStatus = 'done' | 'current' | 'upcoming';
 *
 *   export function getRoadmapStepStatus(
 *     stepsLength: number,
 *     currentStepIndex: number | undefined
 *   ): RoadmapStepStatus[];
 *
 *     - Pure function. Returns one status per step, in order.
 *     - Steps before currentStepIndex => 'done'
 *     - The step at currentStepIndex => 'current'
 *     - Steps after currentStepIndex => 'upcoming'
 *     - `currentStepIndex === undefined` defaults to index 0 (no steps done,
 *       first step is current) — this is the "no AI signal yet" state.
 *     - Out-of-range values are clamped into [0, stepsLength - 1] rather than
 *       throwing or producing out-of-bounds statuses.
 *     - `stepsLength <= 0` returns an empty array.
 *
 *   export function advanceRoadmapStep(
 *     prevIndex: number | undefined,
 *     aiReportedIndex: number | undefined,
 *     stepsLength: number
 *   ): number;
 *
 *     - Pure function implementing the "auto-advance must not regress" rule:
 *       the effective current index is the MAX of the previous index and the
 *       (clamped) AI-reported index — it never moves backward.
 *     - `aiReportedIndex === undefined` => returns `prevIndex` (or 0 if prevIndex
 *       is also undefined) — no signal means no change.
 *     - `prevIndex === undefined` with a defined `aiReportedIndex` => returns the
 *       clamped `aiReportedIndex` (first signal from the AI just sets the index).
 *     - Both undefined => returns 0.
 *     - The AI-reported index is clamped into [0, stepsLength - 1] before the
 *       max() comparison so a hallucinated/out-of-range index cannot corrupt state.
 *
 * Tests FAIL before the implementation exists (module not found).
 */

import { describe, it, expect } from 'vitest';
import { getRoadmapStepStatus, advanceRoadmapStep } from '../utils/roadmapStepStatus';

// ---------------------------------------------------------------------------
// getRoadmapStepStatus
// ---------------------------------------------------------------------------

describe('getRoadmapStepStatus', () => {
  it('marks index 0 as current and all others upcoming when currentStepIndex is 0', () => {
    expect(getRoadmapStepStatus(5, 0)).toEqual([
      'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming',
    ]);
  });

  it('marks the last index as current and everything before it as done', () => {
    expect(getRoadmapStepStatus(5, 4)).toEqual([
      'done', 'done', 'done', 'done', 'current',
    ]);
  });

  it('marks a middle index correctly: earlier steps done, later steps upcoming', () => {
    expect(getRoadmapStepStatus(5, 2)).toEqual([
      'done', 'done', 'current', 'upcoming', 'upcoming',
    ]);
  });

  it('defaults to "no steps done, first step current" when currentStepIndex is undefined', () => {
    expect(getRoadmapStepStatus(3, undefined)).toEqual([
      'current', 'upcoming', 'upcoming',
    ]);
  });

  it('clamps a negative currentStepIndex to 0 instead of throwing or going out of range', () => {
    expect(getRoadmapStepStatus(4, -1)).toEqual([
      'current', 'upcoming', 'upcoming', 'upcoming',
    ]);
    expect(getRoadmapStepStatus(4, -100)).toEqual([
      'current', 'upcoming', 'upcoming', 'upcoming',
    ]);
  });

  it('clamps a currentStepIndex beyond the last step to the last step (all done except last = current)', () => {
    expect(getRoadmapStepStatus(4, 10)).toEqual([
      'done', 'done', 'done', 'current',
    ]);
  });

  it('returns an empty array when there are no steps', () => {
    expect(getRoadmapStepStatus(0, undefined)).toEqual([]);
    expect(getRoadmapStepStatus(0, 3)).toEqual([]);
  });

  it('handles a single-step roadmap as current regardless of index sign/magnitude', () => {
    expect(getRoadmapStepStatus(1, 0)).toEqual(['current']);
    expect(getRoadmapStepStatus(1, undefined)).toEqual(['current']);
    expect(getRoadmapStepStatus(1, 99)).toEqual(['current']);
  });
});

// ---------------------------------------------------------------------------
// advanceRoadmapStep — auto-advance must not regress
// ---------------------------------------------------------------------------

describe('advanceRoadmapStep', () => {
  it('sets the index directly from the AI-reported index on first signal (prevIndex undefined)', () => {
    expect(advanceRoadmapStep(undefined, 2, 5)).toBe(2);
  });

  it('returns 0 when both prevIndex and aiReportedIndex are undefined', () => {
    expect(advanceRoadmapStep(undefined, undefined, 5)).toBe(0);
  });

  it('returns prevIndex unchanged when aiReportedIndex is undefined (no new signal)', () => {
    expect(advanceRoadmapStep(3, undefined, 5)).toBe(3);
  });

  it('advances forward when the AI reports a later step', () => {
    expect(advanceRoadmapStep(1, 3, 5)).toBe(3);
  });

  it('does NOT regress when the AI reports an earlier step than the current one', () => {
    expect(advanceRoadmapStep(3, 1, 5)).toBe(3);
  });

  it('stays the same when the AI reports the same step again', () => {
    expect(advanceRoadmapStep(2, 2, 5)).toBe(2);
  });

  it('clamps an AI-reported index above the last valid step before comparing', () => {
    // stepsLength=5 => valid indices 0..4; AI reports 99 => clamps to 4
    expect(advanceRoadmapStep(2, 99, 5)).toBe(4);
  });

  it('clamps a negative AI-reported index to 0 before comparing, and does not regress', () => {
    // Clamped AI index (0) is less than prevIndex (2), so it must not regress.
    expect(advanceRoadmapStep(2, -5, 5)).toBe(2);
  });

  it('clamps a negative AI-reported index to 0 and accepts it when there is no prior index', () => {
    expect(advanceRoadmapStep(undefined, -5, 5)).toBe(0);
  });

  it('never returns an index outside [0, stepsLength - 1]', () => {
    expect(advanceRoadmapStep(0, 1000, 3)).toBe(2);
    expect(advanceRoadmapStep(2, -1000, 3)).toBeGreaterThanOrEqual(0);
  });

  describe('stepsLength === 0 (no roadmap steps)', () => {
    it('returns 0 (not NaN or -1) when both prevIndex and aiReportedIndex are undefined', () => {
      expect(advanceRoadmapStep(undefined, undefined, 0)).toBe(0);
    });

    it('returns 0 (not NaN or -1) for a positive AI-reported index with no prior index', () => {
      expect(advanceRoadmapStep(undefined, 3, 0)).toBe(0);
    });

    it('returns 0 (not NaN or -1) for a negative AI-reported index with no prior index', () => {
      expect(advanceRoadmapStep(undefined, -5, 0)).toBe(0);
    });

    it('returns a finite, non-negative number when aiReportedIndex is undefined and prevIndex is set', () => {
      const result = advanceRoadmapStep(2, undefined, 0);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).not.toBe(-1);
    });
  });
});
