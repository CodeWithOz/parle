/** Explicit, tested resource limits for `.parle` backup packages. */
export const BACKUP_LIMITS = {
  maxCompressedBytes: 40 * 1024 * 1024,
  maxUncompressedBytes: 50 * 1024 * 1024,
  maxZipEntries: 128,
  maxImages: 40,
  maxImageBytes: 8 * 1024 * 1024,
  maxManifestBytes: 1 * 1024 * 1024,
  maxSavedAds: 40,
  maxTopicArchives: 50,
  maxScenarios: 100,
} as const;

export const BACKUP_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type BackupImageMimeType = (typeof BACKUP_MIME_TYPES)[number];

export const BACKUP_EXTENSION_BY_MIME: Record<BackupImageMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

export const BACKUP_MIME_BY_EXTENSION: Record<string, BackupImageMimeType> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
