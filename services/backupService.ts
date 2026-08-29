import type { Scenario, TefSavedAd, TefTopicArchive } from '../types';
import {
  assertImageMatchesDeclaration,
  backupFilename,
  BackupValidationError,
  imagePathForAd,
  isImagePath,
  MANIFEST_ENTRY_NAME,
  parseDataUrlImage,
  parseManifestJson,
  recordsEquivalent,
  sha256Hex,
  toSavedAdRecord,
  validateManifestRelationships,
  type ParleBackupV1,
} from './backupFormat';
import { BACKUP_LIMITS } from './backupLimits';
import { createParleZip, encodeUtf8, extractParleZip } from './backupZip';
import {
  commitDurableBackupImport,
  listAllSavedAds,
  listSavedScenarios,
  listTopicArchives,
  type DurableBackupImportResult,
} from './tefArchiveService';

export const DURABLE_DATA_CHANGED_EVENT = 'parle-durable-data-changed';
export const PARLE_BACKUP_APP_VERSION = '0.0.0';

export type BackupImportMode = 'merge' | 'replace';

export interface BackupExportDiagnostics {
  orphanedArchiveIds: string[];
  savedAdCount: number;
  topicArchiveCount: number;
  scenarioCount: number;
}

export interface BackupExportResult {
  filename: string;
  bytes: Uint8Array;
  diagnostics: BackupExportDiagnostics;
}

export interface BackupConflict {
  collection: 'savedAds' | 'topicArchives' | 'scenarios';
  incomingId: string;
  assignedId: string;
}

export interface BackupImportPreview {
  mode: BackupImportMode;
  additions: { ads: number; archives: number; scenarios: number };
  skips: { ads: number; archives: number; scenarios: number };
  conflicts: BackupConflict[];
  warnings: string[];
}

export interface BackupInspectResult {
  preview: BackupImportPreview;
  replacePreview: BackupImportPreview;
  packageBytes: Uint8Array;
  plannedMerge: PlannedImport;
  plannedReplace: PlannedImport;
}

interface PlannedImport {
  adsToPut: TefSavedAd[];
  archivesToPut: TefTopicArchive[];
  scenariosToPut: Scenario[];
}

export interface BackupImportApplyResult extends DurableBackupImportResult {
  preview: BackupImportPreview;
}

function notifyDurableDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DURABLE_DATA_CHANGED_EVENT));
  }
}

function allocateId(prefix: string, used: Set<string>): string {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const id = `${prefix}_${Date.now()}_${suffix}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new BackupValidationError('Unable to allocate a unique imported id', 'duplicate-id');
}

function planCollection<T extends { id: string }>(
  collection: BackupConflict['collection'],
  incoming: T[],
  localById: Map<string, T>,
  usedIds: Set<string>,
  idPrefix: string
): { toPut: T[]; skips: number; conflicts: BackupConflict[] } {
  const toPut: T[] = [];
  const conflicts: BackupConflict[] = [];
  let skips = 0;
  for (const record of incoming) {
    const existing = localById.get(record.id);
    if (!existing) {
      toPut.push(record);
      usedIds.add(record.id);
      continue;
    }
    if (recordsEquivalent(existing, record)) {
      skips += 1;
      continue;
    }
    const assignedId = allocateId(idPrefix, usedIds);
    conflicts.push({ collection, incomingId: record.id, assignedId });
    toPut.push({ ...record, id: assignedId });
  }
  return { toPut, skips, conflicts };
}

function conflictIdentity(conflict: BackupConflict): string {
  return `${conflict.collection}:${conflict.incomingId}`;
}

function mergePreviewsMatch(expected: BackupImportPreview, actual: BackupImportPreview): boolean {
  if (expected.mode !== actual.mode) return false;
  if (expected.additions.ads !== actual.additions.ads
    || expected.additions.archives !== actual.additions.archives
    || expected.additions.scenarios !== actual.additions.scenarios) {
    return false;
  }
  if (expected.skips.ads !== actual.skips.ads
    || expected.skips.archives !== actual.skips.archives
    || expected.skips.scenarios !== actual.skips.scenarios) {
    return false;
  }
  if (expected.conflicts.length !== actual.conflicts.length) return false;
  const expectedKeys = expected.conflicts.map(conflictIdentity).sort();
  const actualKeys = actual.conflicts.map(conflictIdentity).sort();
  return expectedKeys.every((key, index) => key === actualKeys[index]);
}

function buildMergePlan(
  incomingAds: TefSavedAd[],
  incomingArchives: TefTopicArchive[],
  incomingScenarios: Scenario[],
  localAds: TefSavedAd[],
  localArchives: TefTopicArchive[],
  localScenarios: Scenario[]
): { planned: PlannedImport; preview: BackupImportPreview } {
  const usedIds = new Set<string>([
    ...localAds.map((record) => record.id),
    ...localArchives.map((record) => record.id),
    ...localScenarios.map((record) => record.id),
    ...incomingAds.map((record) => record.id),
    ...incomingArchives.map((record) => record.id),
    ...incomingScenarios.map((record) => record.id),
  ]);
  const ads = planCollection(
    'savedAds',
    incomingAds,
    new Map(localAds.map((record) => [record.id, record])),
    usedIds,
    'tef_ad'
  );
  const adIdRewrites = new Map<string, string>();
  for (const conflict of ads.conflicts) {
    adIdRewrites.set(conflict.incomingId, conflict.assignedId);
  }

  const rewrittenArchives = incomingArchives.map((archive) => {
    const nextAdId = adIdRewrites.get(archive.adId) ?? archive.adId;
    return nextAdId === archive.adId ? archive : { ...archive, adId: nextAdId };
  });
  const archives = planCollection(
    'topicArchives',
    rewrittenArchives,
    new Map(localArchives.map((record) => [record.id, record])),
    usedIds,
    'scenario'
  );
  const scenarios = planCollection(
    'scenarios',
    incomingScenarios,
    new Map(localScenarios.map((record) => [record.id, record])),
    usedIds,
    'scenario'
  );

  return {
    planned: {
      adsToPut: ads.toPut,
      archivesToPut: archives.toPut,
      scenariosToPut: scenarios.toPut,
    },
    preview: {
      mode: 'merge',
      additions: {
        ads: ads.toPut.length,
        archives: archives.toPut.length,
        scenarios: scenarios.toPut.length,
      },
      skips: {
        ads: ads.skips,
        archives: archives.skips,
        scenarios: scenarios.skips,
      },
      conflicts: [...ads.conflicts, ...archives.conflicts, ...scenarios.conflicts],
      warnings: [],
    },
  };
}

async function readLocalDurableData(): Promise<{
  ads: TefSavedAd[];
  archives: TefTopicArchive[];
  scenarios: Scenario[];
}> {
  const [ads, archives, scenarios] = await Promise.all([
    listAllSavedAds(),
    listTopicArchives(),
    listSavedScenarios(),
  ]);
  return { ads, archives, scenarios };
}

async function decodePackage(bytes: Uint8Array): Promise<{
  manifest: ParleBackupV1;
  ads: TefSavedAd[];
  archives: TefTopicArchive[];
  scenarios: Scenario[];
}> {
  const extracted = await extractParleZip(bytes);
  const manifest = parseManifestJson(extracted.manifestText);
  validateManifestRelationships(manifest);

  const fileNames = new Set(Object.keys(extracted.files));
  const declaredPaths = new Set(manifest.savedAds.map((ad) => ad.imagePath));
  for (const path of fileNames) {
    if (path === MANIFEST_ENTRY_NAME) continue;
    if (!isImagePath(path) || !declaredPaths.has(path)) {
      throw new BackupValidationError(`Undeclared ZIP asset: ${path}`, 'undeclared-asset');
    }
  }

  const ads: TefSavedAd[] = [];
  for (const exported of manifest.savedAds) {
    const imageBytes = extracted.files[exported.imagePath];
    if (!imageBytes) {
      throw new BackupValidationError(
        `Declared image is missing: ${exported.imagePath}`,
        'missing-asset'
      );
    }
    assertImageMatchesDeclaration(imageBytes, exported.mimeType, exported.imagePath);
    const digest = await sha256Hex(imageBytes);
    if (digest !== exported.sha256) {
      throw new BackupValidationError(
        `Image ${exported.imagePath} failed SHA-256 integrity validation`,
        'signature-mismatch'
      );
    }
    ads.push(toSavedAdRecord(exported, imageBytes));
  }

  return {
    manifest,
    ads,
    archives: manifest.topicArchives,
    scenarios: manifest.scenarios as Scenario[],
  };
}

export async function exportParleBackup(): Promise<BackupExportResult> {
  const { ads, archives, scenarios } = await readLocalDurableData();
  const savedAdIds = new Set(ads.map((ad) => ad.id));
  const orphanedArchiveIds = archives
    .filter((archive) => !savedAdIds.has(archive.adId))
    .map((archive) => archive.id);
  const linkedArchives = archives.filter((archive) => savedAdIds.has(archive.adId));

  const zipFiles: Record<string, { bytes: Uint8Array; store: boolean }> = {};
  const exportedAds: ParleBackupV1['savedAds'] = [];

  for (const ad of ads) {
    const parsed = parseDataUrlImage(ad.imageDataUrl);
    const mimeType = parsed.mimeType;
    assertImageMatchesDeclaration(parsed.bytes, mimeType, imagePathForAd(ad.id, mimeType));
    const imagePath = imagePathForAd(ad.id, mimeType);
    zipFiles[imagePath] = { bytes: parsed.bytes, store: true };
    exportedAds.push({
      id: ad.id,
      exerciseType: ad.exerciseType,
      imagePath,
      mimeType,
      sha256: await sha256Hex(parsed.bytes),
      confirmation: ad.confirmation,
      createdAt: ad.createdAt,
      lastUsedAt: ad.lastUsedAt,
    });
  }

  const manifest: ParleBackupV1 = {
    format: 'parle-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: PARLE_BACKUP_APP_VERSION,
    savedAds: exportedAds,
    topicArchives: linkedArchives,
    scenarios: scenarios as ParleBackupV1['scenarios'],
  };
  validateManifestRelationships(manifest);
  zipFiles[MANIFEST_ENTRY_NAME] = {
    bytes: encodeUtf8(`${JSON.stringify(manifest, null, 2)}\n`),
    store: false,
  };

  const uncompressedBytes = Object.values(zipFiles).reduce(
    (total, file) => total + file.bytes.byteLength,
    0
  );
  if (uncompressedBytes > BACKUP_LIMITS.maxUncompressedBytes) {
    throw new BackupValidationError(
      `Uncompressed package size exceeds ${BACKUP_LIMITS.maxUncompressedBytes} bytes`,
      'uncompressed-too-large'
    );
  }

  const bytes = await createParleZip(zipFiles);
  if (bytes.byteLength > BACKUP_LIMITS.maxCompressedBytes) {
    throw new BackupValidationError(
      `Compressed package exceeds ${BACKUP_LIMITS.maxCompressedBytes} bytes`,
      'package-too-large'
    );
  }

  return {
    filename: backupFilename(),
    bytes,
    diagnostics: {
      orphanedArchiveIds,
      savedAdCount: exportedAds.length,
      topicArchiveCount: linkedArchives.length,
      scenarioCount: scenarios.length,
    },
  };
}

export async function inspectParleBackup(bytes: Uint8Array): Promise<BackupInspectResult> {
  if (bytes.byteLength > BACKUP_LIMITS.maxCompressedBytes) {
    throw new BackupValidationError(
      `Compressed package exceeds ${BACKUP_LIMITS.maxCompressedBytes} bytes`,
      'package-too-large'
    );
  }
  const decoded = await decodePackage(bytes);
  const local = await readLocalDurableData();
  const merge = buildMergePlan(
    decoded.ads,
    decoded.archives,
    decoded.scenarios,
    local.ads,
    local.archives,
    local.scenarios
  );
  const replacePreview: BackupImportPreview = {
    mode: 'replace',
    additions: {
      ads: decoded.ads.length,
      archives: decoded.archives.length,
      scenarios: decoded.scenarios.length,
    },
    skips: { ads: 0, archives: 0, scenarios: 0 },
    conflicts: [],
    warnings: [
      'Replace local data will delete existing saved ads, topic archives, and role-play scenarios.',
    ],
  };
  return {
    preview: merge.preview,
    replacePreview,
    packageBytes: bytes,
    plannedMerge: merge.planned,
    plannedReplace: {
      adsToPut: decoded.ads,
      archivesToPut: decoded.archives,
      scenariosToPut: decoded.scenarios,
    },
  };
}

export async function applyParleBackupImport(
  inspected: BackupInspectResult,
  options: { mode: BackupImportMode; confirmReplace?: boolean }
): Promise<BackupImportApplyResult> {
  if (options.mode === 'replace' && options.confirmReplace !== true) {
    throw new BackupValidationError(
      'Replace local data requires explicit confirmation',
      'replace-not-confirmed'
    );
  }
  const incoming = inspected.plannedReplace;
  const preview = options.mode === 'replace' ? inspected.replacePreview : inspected.preview;
  const planned = options.mode === 'replace' ? inspected.plannedReplace : inspected.plannedMerge;
  const result = await commitDurableBackupImport({
    mode: options.mode,
    adsToPut: planned.adsToPut,
    archivesToPut: planned.archivesToPut,
    scenariosToPut: planned.scenariosToPut,
    ...(options.mode === 'merge'
      ? {
        refreshMerge: (current) => {
          const rebuilt = buildMergePlan(
            incoming.adsToPut,
            incoming.archivesToPut,
            incoming.scenariosToPut,
            current.ads,
            current.archives,
            current.scenarios
          );
          if (!mergePreviewsMatch(preview, rebuilt.preview)) {
            throw new BackupValidationError(
              'Local data changed since this backup was previewed. Inspect the file again before importing.',
              'preview-stale'
            );
          }
          return rebuilt.planned;
        },
      }
      : {}),
  });
  notifyDurableDataChanged();
  return { ...result, preview };
}

export function downloadParleBackup(filename: string, bytes: Uint8Array): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readBackupFile(file: Blob): Promise<Uint8Array> {
  if (file.size > BACKUP_LIMITS.maxCompressedBytes) {
    throw new BackupValidationError(
      `Compressed package exceeds ${BACKUP_LIMITS.maxCompressedBytes} bytes`,
      'package-too-large'
    );
  }
  return new Uint8Array(await file.arrayBuffer());
}
