# Stage 1 — IndexedDB Mirror

Status: **complete — merged, deployed, and operator-verified**

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

### Implementation handoff (updated 2026-07-23)

- Branch: `codex/data-portability-stage-1`
- Commits:
  - `d4d092e` (`Implement Stage 1 topic archive mirror`)
  - `87ecb81` (merge revised plan and implement saved-scenario mirror)
  - `9efceb5` (`Record corrected Stage 1 handoff`)
- Files changed:
  - `App.tsx`
  - `services/scenarioService.ts`
  - `services/tefArchiveService.ts`
  - `types.ts`
  - `__tests__/tefArchiveService.test.ts`
  - `__tests__/tefArchiveStage1Mirror.test.ts`
  - `package.json` / `package-lock.json` (test-only `fake-indexeddb` dependency)
- Final IndexedDB schema version: `3`
- Added stores:
  - `topicArchives` (`id` key path; `adId`, `exerciseType`, and `createdAt` indexes)
  - `scenarios` (`id` key path; `createdAt` index)
  - `migrationMetadata` (`name` key path), with independent verified records for topic
    archives and scenarios
- Upgrade compatibility:
  - Version 1 → 3 preserves `savedAds` and creates the complete schema.
  - The exact topic-only version 2 → 3 preserves `savedAds`, `topicArchives`, and existing
    migration metadata while adding the scenario store.
- Automated verification:
  - Runtime: Node `v24.4.1`, npm `11.4.2`
  - Portable test invocation (required when Node experimental web storage is enabled, including
    the workspace's Node 26 runtime):
    `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run`
  - `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run __tests__/tefArchiveStage1Mirror.test.ts __tests__/tefArchiveService.test.ts __tests__/scenarioService.roadmapSteps.test.ts`
    — 3 files / 25 tests passed, including 13 focused Stage 1 mirror tests
  - Full-suite result: 52 files / 618 tests passed (pre-existing warning output only)
  - `npm run build` — passed (existing large-chunk warning only)
- Manual browser verification (local Vite build, Chromium context):
  - Seeded the exact topic-only version 2 `parle-tef` layout with one saved ad, one topic
    archive, and its verified metadata. Seeded localStorage with that archive plus one legacy
    scenario and one current scenario containing character and roadmap fields.
  - Reload upgraded the database to version 3, retained the saved ad/archive/topic metadata,
    added the indexed scenario store, copied both scenario shapes without field loss, and wrote
    independent verified metadata for both mirrors.
  - Opened the Role Play setup and confirmed both migrated scenarios were listed. Opening the
    current record repopulated its editor values.
  - Deleted the disposable legacy scenario through the Role Play UI and confirmed it was removed
    from both localStorage and IndexedDB while the current scenario remained identical.
- Merge reference: PR #45, merge commit `c8a69b6`
- Deployment date/environment: confirmed 2026-07-25 in the deployed application; the
  environment name and original deployment timestamp were not separately supplied.
- Post-deployment verification: complete by operator confirmation on 2026-07-25. The operator
  reported that the merged and deployed Stage 1 behavior is working. This closeout records that
  confirmation as the deployment evidence; it does not claim additional browser checks beyond
  the pre-merge evidence itemized above.
- Implementation deviations: none. The implementation intentionally leaves all public reads
  synchronous and localStorage-backed for both datasets. Each independent mirror reads
  localStorage only when its queue turn begins and retries if the authoritative source changes
  during reconciliation. Malformed localStorage is reported as unreadable and does not trigger
  destructive reconciliation of that dataset's existing mirror.
- Verification-record note: the post-deployment evidence available for this closeout is the
  operator's confirmation that Stage 1 is deployed and working; individual production browser
  check results and the environment name were not supplied.

Stage 1 is complete. Stage 2 is the next authorized implementation stage.
