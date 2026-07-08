/**
 * TDD tests for the mic orb's per-state color palette (French-flag redesign).
 *
 * The user's explicit, emphasized request (see chats/chat1.md, turn 4): the mic
 * orb must read as DOMINANTLY RED — muted red-pink while idle, vivid solid red
 * while recording — distinct from the neutral/blue colors used for processing
 * and playback. `components/Orb.tsx` currently picks colors via an inline
 * per-render `getOrbStyle()` switch (IDLE is dark slate, not red at all), which
 * is not independently testable.
 *
 * Contract this test file pins down for the builder:
 *
 *   `components/Orb.tsx` gains a new NAMED EXPORT:
 *
 *     export const ORB_STATE_COLORS: {
 *       IDLE: string;
 *       RECORDING: string;
 *       PROCESSING: string;
 *       PLAYING: string;
 *     };
 *
 *   Each value is a CSS hex color string (e.g. "#f43f5e") used as the orb's
 *   `backgroundColor` for that state. `getOrbStyle()` should read from this
 *   constant rather than hardcoding colors inline, so the palette has a single
 *   source of truth that both the component and this test exercise.
 *
 *   Required hues (see chat1.md: "the mic button itself... should always be
 *   red... different shades depending on whether recording is active"):
 *     - IDLE: a muted red/pink hue (lower saturation and/or higher lightness
 *       than RECORDING, but still recognizably in the red family)
 *     - RECORDING: a vivid, highly-saturated red — the strongest red of all
 *       four states
 *     - PROCESSING and PLAYING: distinct from both IDLE and RECORDING (not in
 *       the red hue family), so the red is reserved for the mic's idle/active
 *       affordance and doesn't bleed into unrelated states
 *
 * Tests FAIL before the implementation exists (ORB_STATE_COLORS is not
 * exported yet, and the current IDLE color is dark slate, not red).
 */

import { describe, it, expect } from 'vitest';
import { ORB_STATE_COLORS } from '../components/Orb';

// ---------------------------------------------------------------------------
// Minimal self-contained hex -> HSL helper (no new prod dependency needed)
// ---------------------------------------------------------------------------

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized;

  const r = parseInt(full.substring(0, 2), 16) / 255;
  const g = parseInt(full.substring(2, 4), 16) / 255;
  const b = parseInt(full.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    default:
      h = ((r - g) / d + 4) * 60;
      break;
  }

  return { h, s: s * 100, l: l * 100 };
}

// Red hue is centered on 0/360 degrees on the HSL wheel.
function isRedFamily(hex: string): boolean {
  const { h, s } = hexToHsl(hex);
  const hueDistanceFromRed = Math.min(h, 360 - h);
  return hueDistanceFromRed <= 25 && s >= 15;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ORB_STATE_COLORS · exists with all four AppState keys', () => {
  it('is defined and exports a hex color string for each state', () => {
    expect(ORB_STATE_COLORS).toBeDefined();
    expect(typeof ORB_STATE_COLORS.IDLE).toBe('string');
    expect(typeof ORB_STATE_COLORS.RECORDING).toBe('string');
    expect(typeof ORB_STATE_COLORS.PROCESSING).toBe('string');
    expect(typeof ORB_STATE_COLORS.PLAYING).toBe('string');

    for (const value of Object.values(ORB_STATE_COLORS)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });
});

describe('ORB_STATE_COLORS · IDLE is a muted red/pink (dominantly red at rest)', () => {
  it('IDLE hue is in the red family', () => {
    expect(isRedFamily(ORB_STATE_COLORS.IDLE)).toBe(true);
  });

  it('IDLE is NOT the old dark-slate neutral color', () => {
    const idle = ORB_STATE_COLORS.IDLE.toLowerCase();
    expect(idle).not.toBe('#1e293b'); // previous slate-800 idle color
  });
});

describe('ORB_STATE_COLORS · RECORDING is a vivid, strongly-saturated red', () => {
  it('RECORDING hue is in the red family', () => {
    expect(isRedFamily(ORB_STATE_COLORS.RECORDING)).toBe(true);
  });

  it('RECORDING is more saturated than IDLE (vivid solid red vs muted red-pink)', () => {
    const idleHsl = hexToHsl(ORB_STATE_COLORS.IDLE);
    const recordingHsl = hexToHsl(ORB_STATE_COLORS.RECORDING);
    expect(recordingHsl.s).toBeGreaterThan(idleHsl.s);
  });

  it('RECORDING is distinct from IDLE', () => {
    expect(ORB_STATE_COLORS.RECORDING.toLowerCase()).not.toBe(ORB_STATE_COLORS.IDLE.toLowerCase());
  });
});

describe('ORB_STATE_COLORS · PROCESSING and PLAYING stay out of the red family', () => {
  it('PROCESSING is not a red hue', () => {
    expect(isRedFamily(ORB_STATE_COLORS.PROCESSING)).toBe(false);
  });

  it('PLAYING is not a red hue', () => {
    expect(isRedFamily(ORB_STATE_COLORS.PLAYING)).toBe(false);
  });

  it('all four state colors are distinct from one another', () => {
    const values = Object.values(ORB_STATE_COLORS).map((v) => v.toLowerCase());
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
