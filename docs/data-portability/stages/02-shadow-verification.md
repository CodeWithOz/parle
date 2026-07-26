# Stage 2 — Shadow Verification and Reconciliation

Status: **implemented and verified locally — deployment verification pending**

## Objective

Prove that IndexedDB contains the same topic archives and saved role-play scenarios as their
authoritative localStorage sources while the UI continues reading localStorage.

## Preconditions

- Stage 1 is deployed and verified.
- Backfill and dual writes have operated for an agreed observation period.
- Stage 1 documentation records no unresolved data-loss issue.

## Required implementation

- Shadow-read both IndexedDB mirrors without changing displayed data.
- Compare IDs and canonical record content per dataset, not only counts.
- Detect missing, extra, differing, relationship-invalid, and legacy-shape records.
- Reconcile each IndexedDB mirror to its authoritative localStorage source at this stage.
- Persist independent, testable verification metadata and timestamps.
- Keep all user-facing reads sourced from localStorage.

## Explicit non-goals

- Do not make IndexedDB the primary read source.
- Do not remove localStorage writes or fallback data.
- Do not implement export/import.

## Required tests

- Matching archive and scenario stores verify independently.
- Missing, extra, and differing IDB records are detected and repaired for both datasets.
- Same counts with different content do not falsely verify.
- Deleted localStorage records are removed from the corresponding IDB mirror.
- Verification failure never mutates localStorage.

## Completion record

Record branch, commits, tests, merge, deployment, observed verification results, mismatch
counts, and repairs. Then update `../README.md` so Stage 3 is next only if evidence is clean.

### Implementation handoff (2026-07-26)

- Branch: `codex/data-portability-stage-2`
- Base commit: `424d614` (`Mark data portability Stage 1 complete`)
- Commit/merge/deployment references: pending
- Implementation:
  - App startup now runs `verifyDurableDataMirrors()` in the background.
  - Topic archives and saved scenarios are still displayed exclusively from their existing
    synchronous localStorage read paths.
  - Each verifier first shadow-reads its IndexedDB store, compares records by ID and canonical
    content, then reconciles missing, extra, and differing records from authoritative
    localStorage.
  - Diagnostics expose the exact missing, extra, differing, relationship-invalid, and
    legacy-shape IDs, plus inserted/updated/deleted repair counts.
  - Independent migration metadata records persist verification timestamps, mismatch counts,
    repair counts, relationship-invalid counts, legacy-shape counts, and failed-verification
    details. New fields are optional so Stage 1 metadata remains readable.
  - Topic archive relationship diagnostics resolve `adId` against IndexedDB `savedAds`.
    Orphaned authoritative archives are reported but retained and mirrored exactly; Stage 2
    does not silently delete or rewrite localStorage user data.
  - Legacy scenarios are reported without adding absent `characters` or `steps` fields.
  - Malformed/unreadable localStorage produces a failed diagnostic and, when IndexedDB is
    available, durable failed-verification metadata. It never triggers reconciliation or a
    localStorage mutation.
- Automated verification:
  - Focused migration suite:
    `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run __tests__/tefArchiveStage1Mirror.test.ts __tests__/tefArchiveService.test.ts __tests__/scenarioService.roadmapSteps.test.ts`
    — 3 files / 28 tests passed.
  - Full suite:
    `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run`
    — 52 files / 621 tests passed (pre-existing warning output only).
  - `npm run build` — passed (existing large-chunk warning only).
  - Focused Stage 2 fixtures proved equal-count/different-content detection and exact repair
    counts of one missing/inserted, one extra/deleted, and one differing/updated record for
    each dataset. They also covered orphan relationship reporting, legacy-shape reporting,
    independent failure metadata, and byte-for-byte preservation of authoritative
    localStorage values.
- Review:
  - CodeRabbit CLI was installed but unauthenticated, so its automated review could not run.
  - Manual data-safety review found no critical or warning-level issue.
- Manual browser/deployment verification: pending. Stage 3 remains unauthorized until the
  Stage 2 deployment is observed and this record is updated with real per-dataset results.
