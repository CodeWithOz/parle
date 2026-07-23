# Stage 3 — IndexedDB Primary Reads

Status: **pending Stage 2 deployment verification**

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
