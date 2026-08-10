# Stage 3 — IndexedDB Primary Reads

Status: **complete — merged, deployed, and operator-verified**

## Objective

Make verified IndexedDB topic archives and saved scenarios the application read sources while
retaining guarded per-dataset localStorage fallbacks and bridge writes for rollback.

## Preconditions

- Stage 2 is deployed and reports verified mirrors.
- Mismatch repair has no unresolved cases.
- Async UI behavior has an approved implementation approach.

## Required implementation

- Route topic-archive and scenario reads through asynchronous IndexedDB repository APIs.
- Update all consumers with loading, error, and stale-response handling.
- Preserve topic sorting/filtering/latest selection and all scenario list/select/edit behavior.
- Fall back per dataset to localStorage only under documented migration/failure conditions.
- Continue mirroring writes and deletions for both datasets to localStorage.
- Prevent transient empty/error reads from overwriting either store.

## Explicit non-goals

- Do not stop localStorage bridge writes.
- Do not clear localStorage.
- Do not implement export/import.

## Required tests

Run the permanent migration tests and all Stage 3 UI regression coverage in `../test-plan.md`,
including stale close/reopen behavior and an IndexedDB-failure fallback exercise.

## Completion record

Record branch, commits, changed consumers, tests, merge, deployment, fallback observations,
and post-deployment data comparison. Then update `../README.md` so Stage 4 is next.

- Branch: `codex/data-portability-stage-3`
- Commits: `284fa75` (IndexedDB-primary implementation), `0fa1585` (Stage 3
  regression coverage), `0586331` and `59f2577` (CodeRabbit fixes), `6c54e67` and
  `e88368c` (authority-safe recovery), and `ca50c63` and `b53d9f7` (final review
  fixes)
- Changed repository/service paths: `services/tefArchiveService.ts`,
  `services/scenarioService.ts`, and migration metadata in `types.ts`
- Changed consumers: `App.tsx`, `components/TefTopicHistorySheet.tsx`, and
  `components/ScenarioSetup.tsx`
- Primary-read behavior: independently verified topic/scenario datasets read asynchronously
  from IndexedDB; localStorage is used only when IndexedDB is unavailable, migration metadata
  is unverified/dirty, or a verified IndexedDB store is unexpectedly empty while its rollback
  copy contains records; a rollback bridge marked stale is never exposed as a fallback
- Mutation behavior: verified datasets commit serialized mutations to IndexedDB first and
  then update the localStorage rollback bridge; interrupted/fallback mutations persist each
  idempotent operation under its own journal key and replay additions, updates, and deletions
  against the latest IndexedDB state instead of replacing IndexedDB from a localStorage snapshot
- Recovery behavior: startup recovery remains authority-aware — pre-cutover datasets may be
  backfilled from localStorage, while `idb-primary` datasets replay their journal and rebuild
  the rollback bridge from IndexedDB; processed journal keys are removed only after the exact
  bridge and metadata are secured, while concurrent keys and quota-truncated bridges remain stale
- Automated coverage: permanent Stage 1/2 migration coverage retained; Stage 3 coverage added
  for primary reads, independent guarded fallbacks, IndexedDB failure, malformed fallback,
  unexpected-empty non-overwrite, concurrent writes, async loading/error UI, stale
  close/reopen discard, crash-journal replay, non-destructive post-cutover verification,
  bridge quota truncation, restart recovery from legacy dirty metadata, concurrent journal
  insertion, malformed-journal quarantine, Stage 2 reconciliation gating, and interruption
  before bridge or metadata completion
- Automated test result: `npx vitest run --reporter=dot --silent` passed (53 files,
  652 tests)
- Build result: `npm run build` passed; the existing large-chunk advisory remains non-blocking
- Manual browser checks: local Chrome smoke check passed for empty topic history, empty saved
  scenarios, and an IndexedDB-unavailable scenario fallback seeded in the isolated browser
  context (`Show Saved Scenarios (1)` rendered from the localStorage rollback copy)
- Merge/deployment: PR #47 was merged into `main` as `2b40c38`; the operator confirmed the
  Stage 3 application deployed on 2026-08-10 and updated the original `main` worktree from the
  merged branch.
- Deployment verification: before merge, the operator completed the supplied browser
  IndexedDB/localStorage recovery exercises and confirmed that both scenarios and their cleanup
  behaved as expected. After deployment, no unresolved data-loss, fallback, or bridge issue was
  reported.
- Post-deployment data comparison: the available operator evidence confirms the deployed build
  after the pre-merge browser comparisons passed; no additional production record counts were
  supplied, so this record does not claim measurements beyond that confirmation.
