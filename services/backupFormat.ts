import { z } from 'zod';
import type { TefSavedAd } from '../types';
import { base64ToBytes } from './audioUtils';
import {
  BACKUP_EXTENSION_BY_MIME,
  BACKUP_LIMITS,
  BACKUP_MIME_BY_EXTENSION,
  BACKUP_MIME_TYPES,
  type BackupImageMimeType,
} from './backupLimits';

export const PARLE_BACKUP_FORMAT = 'parle-backup' as const;
export const PARLE_BACKUP_VERSION = 1 as const;
export const MANIFEST_ENTRY_NAME = 'manifest.json';

export class BackupValidationError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'BackupValidationError';
    this.code = code;
  }
}

const CharacterSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string(),
  role: z.string(),
  voiceName: z.string(),
  description: z.string().optional(),
});

const ScenarioStepSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string(),
});

const ScenarioSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  aiSummary: z.string().optional(),
  createdAt: z.number(),
  isActive: z.boolean(),
  characters: z.array(CharacterSchema).optional(),
  isTefQuestioning: z.boolean().optional(),
  steps: z.array(ScenarioStepSchema).optional(),
});

const TefTopicSuggestionSchema = z.object({
  topic: z.string(),
  examples: z.array(z.object({
    french: z.string(),
    english: z.string(),
  })),
});

const TefTopicArchiveSchema = z.object({
  id: z.string().min(1),
  adId: z.string().min(1),
  exerciseType: z.enum(['persuasion', 'questioning']),
  createdAt: z.number(),
  topicSuggestions: z.array(TefTopicSuggestionSchema),
});

const SavedAdExportSchema = z.object({
  id: z.string().min(1),
  exerciseType: z.enum(['persuasion', 'questioning']),
  imagePath: z.string(),
  mimeType: z.enum(BACKUP_MIME_TYPES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  confirmation: z.object({
    summary: z.string(),
    roleSummary: z.string(),
  }),
  createdAt: z.number(),
  lastUsedAt: z.number(),
});

export const ParleBackupV1Schema = z.object({
  format: z.literal(PARLE_BACKUP_FORMAT),
  version: z.literal(PARLE_BACKUP_VERSION),
  exportedAt: z.string().min(1),
  appVersion: z.string().optional(),
  savedAds: z.array(SavedAdExportSchema).max(BACKUP_LIMITS.maxSavedAds),
  topicArchives: z.array(TefTopicArchiveSchema).max(BACKUP_LIMITS.maxTopicArchives),
  scenarios: z.array(ScenarioSchema).max(BACKUP_LIMITS.maxScenarios),
});

export type ParleBackupV1 = z.infer<typeof ParleBackupV1Schema>;
export type ParleBackupSavedAd = ParleBackupV1['savedAds'][number];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function recordsEquivalent(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export function normalizeZipPath(path: string): string {
  const replaced = path.replace(/\\/g, '/');
  if (replaced.includes('\0')) {
    throw new BackupValidationError('ZIP entry path contains a NUL byte', 'invalid-path');
  }
  if (/^[a-zA-Z]:/.test(replaced) || replaced.startsWith('/') || replaced.startsWith('//')) {
    throw new BackupValidationError(`Absolute ZIP path is not allowed: ${path}`, 'invalid-path');
  }
  const parts = replaced.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new BackupValidationError(`ZIP path is not a normalized relative path: ${path}`, 'invalid-path');
  }
  return parts.join('/');
}

export function isManifestPath(path: string): boolean {
  return normalizeZipPath(path) === MANIFEST_ENTRY_NAME;
}

export function isImagePath(path: string): boolean {
  const normalized = normalizeZipPath(path);
  return /^images\/[A-Za-z0-9._-]+\.(png|jpeg|webp)$/.test(normalized);
}

export function extensionForMime(mimeType: string): string {
  const mapped = BACKUP_EXTENSION_BY_MIME[mimeType as BackupImageMimeType];
  if (!mapped) {
    throw new BackupValidationError(`Unsupported image MIME type: ${mimeType}`, 'mime-mismatch');
  }
  return mapped;
}

export function mimeForExtension(extension: string): BackupImageMimeType {
  const mapped = BACKUP_MIME_BY_EXTENSION[extension.toLowerCase()];
  if (!mapped) {
    throw new BackupValidationError(`Unsupported image extension: ${extension}`, 'mime-mismatch');
  }
  return mapped;
}

export function detectImageMime(bytes: Uint8Array): BackupImageMimeType | null {
  if (bytes.length >= PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return 'image/png';
  }
  if (bytes.length >= JPEG_SIGNATURE.length
    && JPEG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function assertImageMatchesDeclaration(
  bytes: Uint8Array,
  declaredMime: string,
  imagePath: string
): void {
  if (bytes.byteLength > BACKUP_LIMITS.maxImageBytes) {
    throw new BackupValidationError(
      `Image ${imagePath} exceeds the ${BACKUP_LIMITS.maxImageBytes} byte limit`,
      'image-too-large'
    );
  }
  const detected = detectImageMime(bytes);
  if (!detected) {
    throw new BackupValidationError(
      `Image ${imagePath} does not match a supported PNG, JPEG, or WebP signature`,
      'signature-mismatch'
    );
  }
  if (detected !== declaredMime) {
    throw new BackupValidationError(
      `Image ${imagePath} signature is ${detected} but the manifest declared ${declaredMime}`,
      'signature-mismatch'
    );
  }
  const extension = imagePath.split('.').pop() ?? '';
  if (mimeForExtension(extension) !== declaredMime) {
    throw new BackupValidationError(
      `Image ${imagePath} extension does not match declared MIME type ${declaredMime}`,
      'mime-mismatch'
    );
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function parseDataUrlImage(dataUrl: string): { mimeType: BackupImageMimeType; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i);
  if (!match) {
    throw new BackupValidationError('Saved advertisement image is not a base64 data URL', 'invalid-manifest');
  }
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  if (!BACKUP_MIME_TYPES.includes(mimeType as BackupImageMimeType)) {
    throw new BackupValidationError(`Unsupported saved-ad MIME type: ${mimeType}`, 'mime-mismatch');
  }
  const bytes = base64ToBytes(match[2].replace(/\s+/g, ''));
  return { mimeType: mimeType as BackupImageMimeType, bytes };
}

export function bytesToDataUrl(mimeType: string, bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function imagePathForAd(adId: string, mimeType: string): string {
  const safeId = /^[A-Za-z0-9._-]+$/.test(adId)
    ? adId
    : Array.from(adId).map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return `images/${safeId}.${extensionForMime(mimeType)}`;
}

export function parseManifestJson(raw: string): ParleBackupV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupValidationError('manifest.json is not valid JSON', 'invalid-manifest');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new BackupValidationError('manifest.json must be an object', 'invalid-manifest');
  }
  const record = parsed as { format?: unknown; version?: unknown };
  if (record.format !== PARLE_BACKUP_FORMAT) {
    throw new BackupValidationError(
      `Unsupported backup format: ${String(record.format)}`,
      'unsupported-format'
    );
  }
  if (record.version !== PARLE_BACKUP_VERSION) {
    throw new BackupValidationError(
      `Unsupported backup version: ${String(record.version)}`,
      'unsupported-version'
    );
  }
  const result = ParleBackupV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new BackupValidationError(
      `manifest.json failed schema validation: ${result.error.issues[0]?.message ?? 'invalid'}`,
      'invalid-manifest'
    );
  }
  return result.data;
}

export function validateManifestRelationships(manifest: ParleBackupV1): void {
  assertUniqueIds(manifest.savedAds.map((ad) => ad.id), 'saved advertisement');
  assertUniqueIds(manifest.topicArchives.map((archive) => archive.id), 'topic archive');
  assertUniqueIds(manifest.scenarios.map((scenario) => scenario.id), 'saved scenario');

  const adsById = new Map(manifest.savedAds.map((ad) => [ad.id, ad]));
  const declaredPaths = new Set<string>();
  for (const ad of manifest.savedAds) {
    const normalized = normalizeZipPath(ad.imagePath);
    if (!isImagePath(normalized)) {
      throw new BackupValidationError(
        `Saved ad ${ad.id} has an invalid image path: ${ad.imagePath}`,
        'invalid-path'
      );
    }
    if (declaredPaths.has(normalized)) {
      throw new BackupValidationError(
        `Duplicate declared image path: ${normalized}`,
        'duplicate-asset'
      );
    }
    declaredPaths.add(normalized);
    if (mimeForExtension(normalized.split('.').pop() ?? '') !== ad.mimeType) {
      throw new BackupValidationError(
        `Saved ad ${ad.id} image path does not match MIME type ${ad.mimeType}`,
        'mime-mismatch'
      );
    }
  }

  for (const archive of manifest.topicArchives) {
    const ad = adsById.get(archive.adId);
    if (!ad) {
      throw new BackupValidationError(
        `Topic archive ${archive.id} references missing saved ad ${archive.adId}`,
        'orphaned-archive'
      );
    }
    if (ad.exerciseType !== archive.exerciseType) {
      throw new BackupValidationError(
        `Topic archive ${archive.id} exercise type does not match saved ad ${archive.adId}`,
        'exercise-type-mismatch'
      );
    }
  }
}

function assertUniqueIds(ids: string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) {
      throw new BackupValidationError(`A ${label} is missing an id`, 'empty-id');
    }
    if (seen.has(id)) {
      throw new BackupValidationError(`Duplicate ${label} id: ${id}`, 'duplicate-id');
    }
    seen.add(id);
  }
}

export function toSavedAdRecord(
  exported: ParleBackupSavedAd,
  imageBytes: Uint8Array
): TefSavedAd {
  return {
    id: exported.id,
    exerciseType: exported.exerciseType,
    imageDataUrl: bytesToDataUrl(exported.mimeType, imageBytes),
    mimeType: exported.mimeType,
    confirmation: exported.confirmation,
    createdAt: exported.createdAt,
    lastUsedAt: exported.lastUsedAt,
  };
}

export function backupFilename(exportedAt = new Date()): string {
  const year = exportedAt.getUTCFullYear();
  const month = String(exportedAt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(exportedAt.getUTCDate()).padStart(2, '0');
  return `parle-backup-${year}-${month}-${day}.parle`;
}
