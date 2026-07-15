# Stage 1 — IndexedDB Mirror

Status: **next; not started**

## Objective

Add durable IndexedDB storage for topic archives and mirror authoritative localStorage data
into it without changing existing read behavior or UI behavior.

## Explicit non-goals

- Do not read topic history from IndexedDB in production UI.
- Do not make existing topic-archive APIs asynchronous merely for future stages.
- Do not clear, shrink, rename, or stop updating `parle-tef-topic-archives`.
- Do not implement shadow comparison UI, export/import, or add a ZIP dependency.
- Do not migrate saved role-play scenarios.

## Required implementation

- Upgrade the `parle-tef` IndexedDB schema additively.
- Add `topicArchives` and migration-metadata storage described in `migration-plan.md`.
- Preserve the existing `savedAds` store and behavior.
- Implement idempotent localStorage-to-IndexedDB backfill.
- Mirror archive creates and deletes after successful localStorage operations.
- Keep localStorage authoritative and public reads unchanged.
- Make mirror failures observable/testable without losing successful localStorage behavior.

## Required tests

- Upgrade from database version 1 retains seeded saved ads.
- Empty and populated localStorage backfill.
- Repeated backfill produces no duplicates.
- Create and delete update both stores.
- Mirror failure preserves authoritative localStorage data.
- Interrupted/partial IndexedDB content is safely repaired on retry.

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
