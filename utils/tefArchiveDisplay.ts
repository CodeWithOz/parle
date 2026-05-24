import type { TefTopicArchive } from '../types';

export function formatArchiveDateTime(createdAt: number): string {
  const d = new Date(createdAt);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatLastUsedDate(lastUsedAt: number): string {
  const d = new Date(lastUsedAt);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type ArchiveDateGroup = 'Today' | 'Earlier this week' | 'Older';

export function groupArchivesByDate(archives: TefTopicArchive[]): Record<ArchiveDateGroup, TefTopicArchive[]> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const groups: Record<ArchiveDateGroup, TefTopicArchive[]> = {
    Today: [],
    'Earlier this week': [],
    Older: [],
  };

  for (const archive of archives) {
    if (archive.createdAt >= startOfToday) {
      groups.Today.push(archive);
    } else if (archive.createdAt >= startOfWeek) {
      groups['Earlier this week'].push(archive);
    } else {
      groups.Older.push(archive);
    }
  }

  return groups;
}

export const ARCHIVE_GROUP_ORDER: ArchiveDateGroup[] = ['Today', 'Earlier this week', 'Older'];
