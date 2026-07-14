# Parle Backup Format Contract

Status: design accepted; implementation belongs to Stage 5.

## Container

A backup is a ZIP-compatible file with a `.parle` extension. It is created, inspected,
validated, and imported entirely in the browser.

Proposed layout:

```text
parle-backup-YYYY-MM-DD.parle
├── manifest.json
└── images/
    ├── <asset-id>.png
    ├── <asset-id>.jpeg
    └── <asset-id>.webp
```

`manifest.json` is the logical data contract. Images are binary ZIP entries rather than
base64 strings so the manifest remains inspectable and images do not incur base64 growth.

## Version 1 logical shape

The final Stage 5 implementation must define and test a Zod schema equivalent to:

```ts
interface ParleBackupV1 {
  format: 'parle-backup';
  version: 1;
  exportedAt: string; // ISO 8601
  appVersion?: string;
  savedAds: Array<{
    id: string;
    exerciseType: 'persuasion' | 'questioning';
    imagePath: string;
    mimeType: string;
    confirmation: { summary: string; roleSummary: string };
    createdAt: number;
    lastUsedAt: number;
  }>;
  topicArchives: TefTopicArchive[];
  scenarios: Scenario[];
}
```

The implementation may add integrity metadata such as SHA-256 asset hashes without changing
the accepted scope. Any material schema change must increment or explicitly migrate the
format version.

## Relationship invariants

- Every exported topic archive must reference an exported saved ad with the same `adId`.
- The archive and referenced ad must have the same `exerciseType`.
- Image paths must be relative, normalized paths under `images/`.
- Each declared image must exist exactly once and match its declared MIME type.
- Scenario IDs and archive IDs must be non-empty and unique within their collections.

Orphaned topic archives must not be exported silently. Export should surface a diagnostic;
import must reject orphaned archives.

## ZIP implementation candidate

The preferred library is `fflate` because it supports browsers, ES modules, asynchronous
processing, streaming ZIP APIs, and a small bundle. Stage 5 must re-check the current package,
license, browser support, and APIs before adding the dependency.

- Use DEFLATE for `manifest.json`.
- Store already-compressed PNG/JPEG/WebP assets without recompressing them.
- Avoid synchronous compression/extraction on the main thread for large packages.

Alternative libraries, if Stage 5 discovers a concrete incompatibility, are JSZip (simpler,
more memory-oriented) and `@zip.js/zip.js` (richer streaming and worker architecture). Record
any selection change in the root decision log.

## Import workflow

1. User selects or drops one `.parle` file.
2. Read its bytes in the browser.
3. Inspect ZIP entries and enforce package limits before extraction.
4. Parse and validate `manifest.json`.
5. Validate assets and all cross-record relationships.
6. Calculate duplicate/conflict handling without writing.
7. Show a preview of additions, skips, and conflicts.
8. Apply accepted changes transactionally where storage permits.
9. Refresh affected UI from the persistence layer.

Import must not call Gemini, OpenAI, or any backend.

## Merge and collision policy

Default mode is **Merge**. A separately confirmed **Replace local data** mode may be offered.

- Same ID and equivalent content: skip as already present.
- Same ID and different content: allocate a new ID and rewrite all incoming references.
- Incoming archive ID collision: skip if equivalent; otherwise allocate a new archive ID.
- Scenario ID collision: skip if equivalent; otherwise allocate a new scenario ID.
- Never silently overwrite different local content.
- Importing the same package repeatedly must not create duplicates.

The import preview must make these results visible before applying changes.

## Security and resource limits

Stage 5 must choose explicit, tested limits for:

- Compressed package size
- Total uncompressed size
- Number of ZIP entries
- Number and individual size of images
- Manifest size and collection lengths
- Supported MIME types and filename extensions

Reject absolute paths, `..` segments, duplicate normalized paths, encrypted entries unless
explicitly supported, undeclared assets, and declared assets that are missing. Do not trust
extensions or manifest MIME strings alone; inspect supported image signatures.

## Exclusions

The package must not include:

- `parle_api_key_gemini`, `parle_api_key_openai`, or any credential
- Messages or conversation history
- Audio blobs, object URLs, or retry audio
- Complete transient review arrays
- Modal, timer, recording, or other in-progress state
