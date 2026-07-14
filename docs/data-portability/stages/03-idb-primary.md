# Stage 3 — IndexedDB Primary Reads

Status: **pending Stage 2 deployment verification**

## Objective

Make verified IndexedDB topic archives the application read source while retaining a guarded
localStorage fallback and continued bridge writes for rollback.

## Preconditions

- Stage 2 is deployed and reports verified mirrors.
- Mismatch repair has no unresolved cases.
- Async UI behavior has an approved implementation approach.

## Required implementation

- Route topic-archive reads through asynchronous IndexedDB repository APIs.
- Update all consumers with loading, error, and stale-response handling.
- Preserve sorting, filtering, latest-archive selection, and deletion behavior.
- Fall back to localStorage only under documented migration/failure conditions.
- Continue mirroring writes and deletions to localStorage.
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
