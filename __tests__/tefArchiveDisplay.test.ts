import { describe, it, expect } from 'vitest';
import {
  formatArchiveDateTime,
  formatLastUsedDate,
  groupArchivesByDate,
  ARCHIVE_GROUP_ORDER,
} from '../utils/tefArchiveDisplay';
import type { TefTopicArchive } from '../types';

const SAMPLE_TOPICS = [
  { topic: 'Pricing', examples: [{ french: 'Quel prix?', english: 'What price?' }] },
];

function makeArchive(overrides: Partial<TefTopicArchive> = {}): TefTopicArchive {
  return {
    id: 'arc-1',
    adId: 'ad-1',
    exerciseType: 'persuasion',
    createdAt: Date.now(),
    topicSuggestions: SAMPLE_TOPICS,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatArchiveDateTime
// ---------------------------------------------------------------------------

describe('formatArchiveDateTime', () => {
  it('returns a non-empty string for a recent timestamp', () => {
    expect(formatArchiveDateTime(Date.now()).length).toBeGreaterThan(0);
  });

  it('includes a colon (time portion)', () => {
    expect(formatArchiveDateTime(Date.now())).toMatch(/:/);
  });

  it('includes the day number for a known date (Jan 15)', () => {
    const ts = new Date(2025, 0, 15, 14, 30).getTime();
    const result = formatArchiveDateTime(ts);
    expect(result).toMatch(/15/);
  });

  it('includes month name for a known date (Jan 15)', () => {
    const ts = new Date(2025, 0, 15, 14, 30).getTime();
    const result = formatArchiveDateTime(ts);
    expect(result).toMatch(/Jan/i);
  });
});

// ---------------------------------------------------------------------------
// formatLastUsedDate
// ---------------------------------------------------------------------------

describe('formatLastUsedDate', () => {
  it('returns a non-empty string', () => {
    expect(formatLastUsedDate(Date.now()).length).toBeGreaterThan(0);
  });

  it('does NOT include time (no colon)', () => {
    expect(formatLastUsedDate(Date.now())).not.toMatch(/:/);
  });

  it('includes month name for a known date (Mar 7)', () => {
    const ts = new Date(2025, 2, 7).getTime();
    expect(formatLastUsedDate(ts)).toMatch(/Mar/i);
  });

  it('includes day number for a known date (Mar 7)', () => {
    const ts = new Date(2025, 2, 7).getTime();
    expect(formatLastUsedDate(ts)).toMatch(/7/);
  });
});

// ---------------------------------------------------------------------------
// groupArchivesByDate
// ---------------------------------------------------------------------------

describe('groupArchivesByDate', () => {
  it('places a recent archive (< 1 min ago) into Today', () => {
    const archive = makeArchive({ createdAt: Date.now() - 30_000 });
    const groups = groupArchivesByDate([archive]);
    expect(groups.Today).toHaveLength(1);
    expect(groups['Earlier this week']).toHaveLength(0);
    expect(groups.Older).toHaveLength(0);
  });

  it('places an archive from the start of today into Today', () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const archive = makeArchive({ createdAt: startOfToday.getTime() + 60_000 });
    const groups = groupArchivesByDate([archive]);
    expect(groups.Today).toHaveLength(1);
  });

  it('places an archive 2 days before today into "Earlier this week"', () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const twoDaysBeforeStartOfToday = startOfToday.getTime() - 2 * 24 * 60 * 60 * 1000;
    const archive = makeArchive({ createdAt: twoDaysBeforeStartOfToday });
    const groups = groupArchivesByDate([archive]);
    expect(groups['Earlier this week']).toHaveLength(1);
    expect(groups.Today).toHaveLength(0);
    expect(groups.Older).toHaveLength(0);
  });

  it('places an archive 14 days ago into Older', () => {
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const archive = makeArchive({ createdAt: twoWeeksAgo });
    const groups = groupArchivesByDate([archive]);
    expect(groups.Older).toHaveLength(1);
    expect(groups.Today).toHaveLength(0);
    expect(groups['Earlier this week']).toHaveLength(0);
  });

  it('handles empty list — all groups are empty arrays', () => {
    const groups = groupArchivesByDate([]);
    expect(groups.Today).toHaveLength(0);
    expect(groups['Earlier this week']).toHaveLength(0);
    expect(groups.Older).toHaveLength(0);
  });

  it('distributes archives across multiple groups correctly', () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayTs = startOfToday.getTime() + 60_000;
    const olderTs = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const archives = [
      makeArchive({ id: 'arc-today', createdAt: todayTs }),
      makeArchive({ id: 'arc-old', createdAt: olderTs }),
    ];
    const groups = groupArchivesByDate(archives);
    expect(groups.Today).toHaveLength(1);
    expect(groups.Older).toHaveLength(1);
    expect(groups['Earlier this week']).toHaveLength(0);
  });

  it('returns all three group keys regardless of content', () => {
    const groups = groupArchivesByDate([]);
    expect('Today' in groups).toBe(true);
    expect('Earlier this week' in groups).toBe(true);
    expect('Older' in groups).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ARCHIVE_GROUP_ORDER
// ---------------------------------------------------------------------------

describe('ARCHIVE_GROUP_ORDER', () => {
  it('has exactly 3 entries', () => {
    expect(ARCHIVE_GROUP_ORDER).toHaveLength(3);
  });

  it('starts with "Today"', () => {
    expect(ARCHIVE_GROUP_ORDER[0]).toBe('Today');
  });

  it('has "Earlier this week" as the second entry', () => {
    expect(ARCHIVE_GROUP_ORDER[1]).toBe('Earlier this week');
  });

  it('ends with "Older"', () => {
    expect(ARCHIVE_GROUP_ORDER[2]).toBe('Older');
  });
});
