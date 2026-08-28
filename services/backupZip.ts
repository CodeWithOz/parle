import { strFromU8, strToU8, unzip, zip, type AsyncZippable, type UnzipFileInfo } from 'fflate';
import { BACKUP_LIMITS } from './backupLimits';
import {
  BackupValidationError,
  isImagePath,
  isManifestPath,
  MANIFEST_ENTRY_NAME,
  normalizeZipPath,
} from './backupFormat';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;

export interface ZipEntryMeta {
  name: string;
  normalizedName: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  encrypted: boolean;
}

export interface InspectedParleZip {
  entries: ZipEntryMeta[];
  files: Record<string, Uint8Array>;
  manifestText: string;
}

function zipAsync(data: AsyncZippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(data, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function unzipAsync(
  data: Uint8Array,
  filter?: (file: UnzipFileInfo) => boolean
): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, filter ? { filter } : {}, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function readEocdOffset(bytes: Uint8Array): number {
  if (bytes.byteLength < 22) {
    throw new BackupValidationError('File is too small to be a ZIP archive', 'invalid-zip');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.byteLength - 22 - 65535);
  for (let offset = bytes.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === bytes.byteLength) return offset;
  }
  throw new BackupValidationError('ZIP end-of-central-directory record was not found', 'invalid-zip');
}

export function inspectZipCentralDirectory(bytes: Uint8Array): ZipEntryMeta[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = readEocdOffset(bytes);
  const entryCount = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (entryCount === ZIP64_MARKER_16 || cdSize === ZIP64_MARKER_32 || cdOffset === ZIP64_MARKER_32) {
    throw new BackupValidationError('ZIP64 archives are not supported', 'invalid-zip');
  }
  if (entryCount > BACKUP_LIMITS.maxZipEntries) {
    throw new BackupValidationError(
      `ZIP has ${entryCount} entries; the limit is ${BACKUP_LIMITS.maxZipEntries}`,
      'too-many-entries'
    );
  }
  if (cdOffset + cdSize > bytes.byteLength) {
    throw new BackupValidationError('ZIP central directory is truncated', 'invalid-zip');
  }

  const entries: ZipEntryMeta[] = [];
  let cursor = cdOffset;
  let uncompressedTotal = 0;
  const seenNames = new Set<string>();

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new BackupValidationError('ZIP central directory is malformed', 'invalid-zip');
    }
    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > bytes.byteLength) {
      throw new BackupValidationError('ZIP entry filename is truncated', 'invalid-zip');
    }
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd));
    if (name.endsWith('/')) {
      cursor = nameEnd + extraLength + commentLength;
      continue;
    }
    if ((flags & 0x0001) !== 0) {
      throw new BackupValidationError(`Encrypted ZIP entry is not allowed: ${name}`, 'encrypted-entry');
    }
    if (compressedSize === ZIP64_MARKER_32 || uncompressedSize === ZIP64_MARKER_32) {
      throw new BackupValidationError('ZIP64 entry sizes are not supported', 'invalid-zip');
    }
    const normalizedName = normalizeZipPath(name);
    if (seenNames.has(normalizedName)) {
      throw new BackupValidationError(`Duplicate ZIP path: ${normalizedName}`, 'duplicate-path');
    }
    seenNames.add(normalizedName);
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > BACKUP_LIMITS.maxUncompressedBytes) {
      throw new BackupValidationError(
        `Uncompressed package size exceeds ${BACKUP_LIMITS.maxUncompressedBytes} bytes`,
        'uncompressed-too-large'
      );
    }
    entries.push({
      name,
      normalizedName,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      encrypted: false,
    });
    cursor = nameEnd + extraLength + commentLength;
  }

  return entries;
}

export async function createParleZip(files: Record<string, { bytes: Uint8Array; store: boolean }>): Promise<Uint8Array> {
  const zippable: AsyncZippable = {};
  for (const [path, file] of Object.entries(files)) {
    zippable[path] = [file.bytes, { level: file.store ? 0 : 6 }];
  }
  return zipAsync(zippable);
}

export async function extractParleZip(bytes: Uint8Array): Promise<InspectedParleZip> {
  if (bytes.byteLength > BACKUP_LIMITS.maxCompressedBytes) {
    throw new BackupValidationError(
      `Compressed package exceeds ${BACKUP_LIMITS.maxCompressedBytes} bytes`,
      'package-too-large'
    );
  }

  const entries = inspectZipCentralDirectory(bytes);
  const imageEntries = entries.filter((entry) => isImagePath(entry.normalizedName));
  if (imageEntries.length > BACKUP_LIMITS.maxImages) {
    throw new BackupValidationError(
      `Package contains ${imageEntries.length} images; the limit is ${BACKUP_LIMITS.maxImages}`,
      'too-many-images'
    );
  }
  for (const entry of imageEntries) {
    if (entry.uncompressedSize > BACKUP_LIMITS.maxImageBytes) {
      throw new BackupValidationError(
        `Image ${entry.normalizedName} exceeds the ${BACKUP_LIMITS.maxImageBytes} byte limit`,
        'image-too-large'
      );
    }
  }
  const manifestEntry = entries.find((entry) => isManifestPath(entry.normalizedName));
  if (!manifestEntry) {
    throw new BackupValidationError('Package is missing manifest.json', 'missing-manifest');
  }
  if (manifestEntry.uncompressedSize > BACKUP_LIMITS.maxManifestBytes) {
    throw new BackupValidationError(
      `manifest.json exceeds the ${BACKUP_LIMITS.maxManifestBytes} byte limit`,
      'manifest-too-large'
    );
  }
  for (const entry of entries) {
    if (!isManifestPath(entry.normalizedName) && !isImagePath(entry.normalizedName)) {
      throw new BackupValidationError(
        `Unexpected ZIP entry: ${entry.normalizedName}`,
        'undeclared-asset'
      );
    }
  }

  const allowed = new Set(entries.map((entry) => entry.normalizedName));
  const extracted = await unzipAsync(bytes, (file) => {
    if (file.name.endsWith('/')) return false;
    const normalized = normalizeZipPath(file.name);
    if (!allowed.has(normalized)) return false;
    if (file.originalSize > BACKUP_LIMITS.maxUncompressedBytes) return false;
    return file.compression === 0 || file.compression === 8;
  });

  const files: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(extracted)) {
    files[normalizeZipPath(name)] = content;
  }
  const manifestBytes = files[MANIFEST_ENTRY_NAME];
  if (!manifestBytes) {
    throw new BackupValidationError('Package is missing manifest.json', 'missing-manifest');
  }
  return {
    entries,
    files,
    manifestText: strFromU8(manifestBytes),
  };
}

export function encodeUtf8(text: string): Uint8Array {
  return strToU8(text);
}
