# Stage 3 — IndexedDB Primary Reads

Status: **implemented on branch; merge and deployment verification pending**

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
  regression coverage), `0586331` and `59f2577` (CodeRabbit fixes), plus the
  completion-record and authority-safe recovery commits
- Changed repository/service paths: `services/tefArchiveService.ts`,
  `services/scenarioService.ts`, and migration metadata in `types.ts`
- Changed consumers: `App.tsx`, `components/TefTopicHistorySheet.tsx`, and
  `components/ScenarioSetup.tsx`
- Primary-read behavior: independently verified topic/scenario datasets read asynchronously
  from IndexedDB; localStorage is used only when IndexedDB is unavailable, migration metadata
  is unverified/dirty, or a verified IndexedDB store is unexpectedly empty while its rollback
  copy contains records; a rollback bridge marked stale is never exposed as a fallback
- Mutation behavior: verified datasets commit serialized mutations to IndexedDB first and
  then update the localStorage rollback bridge; interrupted/fallback mutations persist an
  idempotent operation journal and replay additions, updates, and deletions against the latest
  IndexedDB state instead of replacing IndexedDB from a localStorage snapshot
- Recovery behavior: startup recovery remains authority-aware — pre-cutover datasets may be
  backfilled from localStorage, while `idb-primary` datasets replay their journal and rebuild
  the rollback bridge from IndexedDB; quota-truncated bridges remain marked stale
- Automated coverage: permanent Stage 1/2 migration coverage retained; Stage 3 coverage added
  for primary reads, independent guarded fallbacks, IndexedDB failure, malformed fallback,
  unexpected-empty non-overwrite, concurrent writes, async loading/error UI, stale
  close/reopen discard, crash-journal replay, non-destructive post-cutover verification,
  bridge quota truncation, and restart recovery from legacy dirty metadata
- Automated test result: `npx vitest run --reporter=dot --silent` passed (53 files,
  643 tests)
- Build result: `npm run build` passed; the existing large-chunk advisory remains non-blocking
- Manual browser checks: local Chrome smoke check passed for empty topic history, empty saved
  scenarios, and an IndexedDB-unavailable scenario fallback seeded in the isolated browser
  context (`Show Saved Scenarios (1)` rendered from the localStorage rollback copy)
- Merge/deployment: pending
- Post-deployment fallback observations and data comparison: pending
