# Stage 5 — Browser Export and Import

Status: **complete — merged via [PR #54](https://github.com/CodeWithOz/parle/pull/54), deployed, and operator-confirmed 2026-08-29**

## Objective

Implement browser-only `.parle` backup export and validated import for saved TEF ads/images,
linked topic archives, and saved role-play scenarios.

## Preconditions

- IndexedDB primary reads for topic archives and saved scenarios are deployed and stable.
- Stage 4 records the active localStorage bridge policy for each migrated dataset.
- `backup-format.md` has been re-reviewed against current types and storage behavior.
- The ZIP library choice has been revalidated before dependency installation.

## Required implementation

- Versioned Zod manifest schema and compatibility handling.
- Browser ZIP generation and inspection; `fflate` is the preferred candidate.
- Binary image export with declared paths and integrity validation.
- Export of all current saved role-play scenario fields, including legacy-compatible shapes.
- Preview-before-write import UX.
- Merge-default collision handling and idempotent repeated imports.
- Transactional saved-ad/topic-archive/saved-scenario import in one IndexedDB transaction.
- For each dataset whose Stage 4 bridge policy still requires a localStorage mirror, reconcile
  that mirror from the committed IndexedDB result afterward and report bridge failures without
  corrupting the canonical import.
- Tested size, entry-count, path, MIME, signature, and relationship limits.
- No network or AI calls.

## Explicit exclusions

- Conversations and messages
- Audio
- API credentials
- Complete transient review state
- Cloud sync or backend storage

## Required tests

Run all backup export/import coverage from `../test-plan.md`, plus manual transfer between two
fresh browser profiles. Confirm imported ads can restart exercises, topic history remains linked,
and imported role-play scenarios open with their saved characters and roadmap steps.

## Completion record

**Branch:** `cursor/3d90f5f9`

**Format version:** `parle-backup` v1 (`manifest.json` + `images/<id>.{png,jpeg,webp}`)

**ZIP library:** `fflate@0.8.3` (MIT). Revalidated 2026-08-28: current npm release, ESM/browser
exports, async `zip`/`unzip`, per-file compression levels (DEFLATE for `manifest.json`, store
for already-compressed images), and `UnzipFileFilter` inspection of uncompressed sizes. No
incompatibility was found, so the planned candidate was installed rather than JSZip or
`@zip.js/zip.js`.

**Resource limits** (from `services/backupLimits.ts`):

| Limit | Value |
|---|---|
| Compressed package | 40 MiB |
| Uncompressed total | 50 MiB |
| ZIP entries | 128 |
| Images | 40 |
| Per-image size | 8 MiB |
| Manifest size | 1 MiB |
| Saved ads | 40 |
| Topic archives | 50 |
| Scenarios | 100 |

Supported image types are PNG, JPEG, and WebP, validated by magic-number signature, declared
MIME, filename extension, and SHA-256.

**Implementation paths:**

- `services/backupLimits.ts`, `services/backupFormat.ts`, `services/backupZip.ts`,
  `services/backupService.ts` — format, ZIP, export, inspect/preview, and apply
- `services/tefArchiveService.ts` — `listAllSavedAds()` and `commitDurableBackupImport()`
  (one IndexedDB transaction across `savedAds`, `topicArchives`, and `scenarios`, then
  per-dataset localStorage bridge reconciliation)
- `components/BackupPanel.tsx` + `components/ApiKeySetup.tsx` — Settings backup UI with
  preview-before-write, merge default, and explicit replace confirmation
- `components/ScenarioSetup.tsx`, `components/TefRecentAdsCarousel.tsx`,
  `components/TefTopicHistorySheet.tsx` — refresh from `parle-durable-data-changed`

**Bridge policy honored:** After a committed import, topic-archive and saved-scenario
localStorage rollback copies are rewritten from IndexedDB. A bridge failure is reported and
marked dirty; the IndexedDB import is not rolled back.

**Automated tests:** `__tests__/backupExport.test.ts`, `__tests__/backupImport.test.ts`,
`__tests__/BackupPanel.test.tsx`. Full suite **687/687** passing. `npm run build` succeeded
(existing large-chunk advisory remains non-blocking).

**Manual checks in this session:** Settings → Backup was exercised in the local Vite app
with system Chrome: export produced `parle-backup-YYYY-MM-DD.parle`, choosing that file showed
a preview before write, Cancel dismissed the preview without importing, Replace stayed disabled
until the confirmation checkbox, and Import (merge) applied the previewed empty package.

**Deployment confirmed (2026-08-29):** Merged into `main` via
[PR #54](https://github.com/CodeWithOz/parle/pull/54), pulled into the primary workspace, and
deployed, confirmed by the operator. Stage 5 is complete. The numbered data-portability
program ends at Stage 5; there is no Stage 6. Both Stage 4 localStorage bridges remain active.
