# Stage 1 — IndexedDB Mirror

Status: **implementation complete on branch; pending commit, merge, deployment, and post-deployment verification**

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

### Implementation handoff (2026-07-14)

- Branch: `codex/data-portability-stage-1`
- Commits: pending
- Files changed:
  - `App.tsx`
  - `services/tefArchiveService.ts`
  - `types.ts`
  - `__tests__/tefArchiveService.test.ts`
  - `__tests__/tefArchiveStage1Mirror.test.ts`
  - `package.json` / `package-lock.json` (test-only `fake-indexeddb` dependency)
- Final IndexedDB schema version: `2`
- Added stores: `topicArchives` (`id` key path; `adId`, `exerciseType`, and
  `createdAt` indexes) and `migrationMetadata` (`name` key path)
- Automated verification:
  - Runtime: Node `v24.4.1`, npm `11.4.2`
  - Portable test invocation (also required when Node 26 experimental web storage is enabled):
    `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run`
  - `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run __tests__/tefArchiveStage1Mirror.test.ts __tests__/tefArchiveService.test.ts`
    — 12 tests passed
  - Full-suite result: 52 files / 613 tests passed (pre-existing warning output only)
  - `npm run build` — passed (existing large-chunk warning only)
- Manual browser verification (local Vite build, persistent Chromium context):
  - Seeded a version-1 `parle-tef` database with one saved ad and seeded one archive in
    `parle-tef-topic-archives`.
  - Reload upgraded the database to version 2, retained the saved ad, created both new
    stores, copied the archive exactly once, and wrote verified `mirroring` metadata.
  - A service-level create followed by delete updated both localStorage and IndexedDB;
    both operations returned successful diagnostics and the deleted record stayed absent.
- Merge reference: pending
- Deployment date/environment: pending
- Post-deployment verification: pending. Before Stage 1 can be marked complete, run and record
  the remaining browser checks from `test-plan.md`:
  - Open Past topic suggestions globally and filtered to one saved ad.
  - Restart both TEF exercise types from saved advertisements.
  - Complete a session and confirm its topic archive appears exactly once.
  - Delete an archive and a saved ad through the UI, reload, and confirm both stay deleted.
  - Close and reopen the browser context and confirm persistence.
- Deviations: none. The implementation intentionally leaves all public reads synchronous and
  localStorage-backed. Mirror work reads localStorage only when its queue turn begins and retries
  if the authoritative source changes during reconciliation. Malformed localStorage is reported
  as unreadable and does not trigger destructive reconciliation of an existing mirror.

Stage 1 must not be marked complete, and Stage 2 must not be identified as next, until the
pending merge, deployment, and post-deployment checks are recorded above.
