# Stage 1 — IndexedDB Mirror

Status: **next; not started**

## Objective

Add durable IndexedDB storage for topic archives and saved role-play scenarios, then mirror
their independent authoritative localStorage datasets without changing existing reads or UI.

## Explicit non-goals

- Do not read topic history from IndexedDB in production UI.
- Do not read saved scenarios from IndexedDB in production UI.
- Do not make existing topic-archive or scenario APIs asynchronous merely for future stages.
- Do not clear, shrink, rename, or stop updating `parle-tef-topic-archives` or `parle-scenarios`.
- Do not implement shadow comparison UI, export/import, or add a ZIP dependency.

## Required implementation

- Upgrade the `parle-tef` IndexedDB schema additively.
- Add `topicArchives`, `scenarios`, and migration-metadata storage described in
  `migration-plan.md`.
- Preserve the existing `savedAds` store and behavior.
- Implement independent, idempotent localStorage-to-IndexedDB backfills for archives and
  scenarios.
- Mirror archive and scenario creates, updates, and deletions after successful localStorage
  operations.
- Keep localStorage authoritative and all public reads unchanged.
- Make failures independently observable/testable without losing successful localStorage data.
- Set the database version to `3`. Version `2` has already been exercised by the topic-only
  implementation and must be treated as a real upgrade source, not reused as the final schema.

## Required tests

- Upgrade from database version 1 to version 3 retains seeded saved ads and creates all stores.
- Upgrade from the exact topic-only version 2 layout to version 3 retains saved ads, topic
  archives, and migration metadata while adding only the missing scenario store/indexes.
- Opening an already-complete version 3 database is idempotent.
- Empty and populated backfill for both localStorage keys.
- Repeated backfill produces no duplicates in either store.
- Archive create/delete and scenario create/update/delete update the correct mirrors.
- A failure in either mirror preserves both authoritative localStorage datasets and does not
  block the other dataset from being diagnosed or retried.
- Interrupted/partial IndexedDB content is safely repaired on retry for both datasets.
- Legacy scenarios without roadmap steps and current scenarios with characters/steps round-trip
  without field loss.

## Completion record

Before marking complete, add:

- Branch and commits
- Files changed and final schema version
- Test commands and results
- Manual browser verification
- Merge reference
- Deployment date/environment
- Post-deployment verification
- Any deviation from the plan and its rationale

Then update `../README.md` so Stage 2 is identified as next.
