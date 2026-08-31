# Parle Data Portability Program

This directory is the durable source of truth for migrating all durable exercise data to
IndexedDB and then adding browser-only export/import. It is intended to carry context across
separate branches, deployments, and AI-agent chats.

## Current status

- Program status: **Stages 0–5 complete. The operator then authorized retiring the
  localStorage bridge, which is implemented but not yet deployed.**
- Current implementation behavior: **IndexedDB only. No durable dataset is read from or
  written to localStorage. Leftover pre-IndexedDB localStorage state is adopted once at
  startup and then removed.**
- Deployed behavior: **IndexedDB primary with guarded localStorage fallback and rollback
  bridge writes, plus Settings → Backup `.parle` export/import (Stage 5)**
- Last completed stage: **[Stage 5 — export/import](stages/05-export-import.md) (complete; merged via [PR #54](https://github.com/CodeWithOz/parle/pull/54), deployed, and operator-confirmed 2026-08-29)**
- Next action: **deploy and verify the bridge removal.** After it ships, rolling the
  application back to a Stage ≤ 5 build no longer restores data from localStorage; a
  `.parle` export is the only rollback copy.
- Current authoritative topic-archive source: `IndexedDB` (no fallback)
- Current authoritative saved-scenario source: `IndexedDB` (no fallback)
- IndexedDB topic-archive store exists in this implementation: **yes (schema version 3)**
- IndexedDB saved-scenario store exists in this implementation: **yes (schema version 3)**
- Dual writes are active in this implementation: **no. Both bridges were removed.**
- Export/import is available: **yes in the deployed app (`.parle` v1 via Settings → Backup)**

The only remaining localStorage consumer in the application is `services/apiKeyService.ts`
(`parle_api_key_gemini`, `parle_api_key_openai`). Credentials are deliberately excluded from
this program and from backups; they were left in localStorage untouched.

Compatibility requirement: Stage 1 topic-only builds have already created database version 2
in at least one browser. The corrected schema target is therefore version 3; code must support
both version 1 → 3 and version 2 → 3 upgrades without recreating or clearing existing stores.

The currently deployed application implements Stage 5 export/import on the Stage 4 storage
layout, with both localStorage bridges still active. The bridge removal described above is
implemented on this branch and changes that as soon as it deploys.

## Accepted scope

The backup includes only data that is currently durable user data:

- Saved TEF advertisement images and their metadata
- TEF topic-suggestion archives and their relationships to saved advertisements
- Saved role-play scenarios, including roadmap steps and character data where present

The backup explicitly excludes:

- Conversation transcripts or messages
- Recorded or generated audio
- Complete transient TEF review objects beyond the topic suggestions already archived
- API keys or other credentials
- In-progress exercise/UI state

## Non-negotiable principles

1. Existing local data must survive every deployment and rollback.
2. Migration is incremental: backfill, mirror, verify, cut over, retain rollback, then retire.
3. No stage may silently clear `parle-tef-topic-archives` or `parle-scenarios` from localStorage.
   The authorized bridge removal (2026-08-31) clears them only after the same records have been
   written to IndexedDB and read back; unreadable legacy data is left in place and reported.
4. Backfill and reconciliation must be idempotent and must not create duplicates.
5. Deletions must not reappear after reconciliation.
6. `TefTopicArchive.adId` must continue to reference the correct `TefSavedAd.id`, and saved
   role-play scenarios must preserve their IDs, characters, roadmap steps, and timestamps.
7. Only one migration stage is implemented per branch and deployment.
8. Export/import runs entirely in the browser; no backend or upload is required.
9. Import validates the complete package before changing user data.
10. API credentials are never exported.

## Current architecture

| Data | Current location | Current key/store |
|---|---|---|
| Saved TEF ads and images | IndexedDB | database `parle-tef`, store `savedAds` |
| TEF topic archives | IndexedDB only | store `topicArchives` |
| Saved role-play scenarios | IndexedDB only | store `scenarios` |
| API keys | localStorage (out of scope for this program) | `parle_api_key_*` (excluded from backups) |

Legacy localStorage keys (`parle-tef-topic-archives`, `parle-scenarios`, and their
`-mirror-dirty` / `-bridge-dirty` / `-idb-primary` / `-pending-mutations` /
`-quarantined-mutations` companions) are read once by `initializeDurableData()` and removed
after their records are verified in IndexedDB. Nothing writes them again.

Primary implementation locations:

- `services/tefArchiveService.ts`
- `services/scenarioService.ts`
- `services/backupService.ts`, `services/backupFormat.ts`, `services/backupZip.ts`,
  `services/backupLimits.ts`
- `components/BackupPanel.tsx`
- `components/TefTopicHistorySheet.tsx`
- `components/TefRecentAdsCarousel.tsx`
- `App.tsx`
- `types.ts`

## Target architecture

- `savedAds`, `topicArchives`, and saved role-play `scenarios` reside in the same IndexedDB
  database so the complete backup can be imported transactionally.
- A repository/service boundary owns reads, writes, and the one-time adoption of any leftover
  pre-IndexedDB localStorage data.
- localStorage holds no durable exercise data. A `.parle` export is the only copy outside the
  database.
- A versioned `.parle` ZIP contains `manifest.json` and binary image assets.
- Export and import execute entirely in the browser.

See [backup-format.md](backup-format.md), [migration-plan.md](migration-plan.md), and
[test-plan.md](test-plan.md) for the accepted contracts.

## Deployment stages

| Stage | Purpose | Status |
|---|---|---|
| 0 | Specify scope, invariants, and handoff process | Complete (documentation only) |
| 1 | Add IndexedDB mirrors for topic archives and saved scenarios | Complete; deployed and verified |
| 2 | Shadow-read, compare, and reconcile both datasets | Complete; merged, deployed, and verified |
| 3 | Make IndexedDB primary for both with localStorage fallback | Complete; merged, deployed, and operator-verified |
| 4 | Maintain rollback windows and prove both datasets stable | Complete; merged, deployed, and operator-verified |
| 5 | Implement versioned export/import | Complete; merged, deployed, and operator-confirmed |

The numbered program is Stages 0–5. Stopping localStorage bridge writes was the separate
decision the plan reserved; the operator authorized it on 2026-08-31 and it is implemented
outside the numbered stages.

Detailed handoffs are in [`stages/`](stages/).

For Stages 2–5, readiness is tracked independently for topic archives and saved scenarios.
Completing verification or cutover for one dataset does not authorize advancing the other.

## Required branch and deployment protocol

For each numbered stage:

1. Create a new branch for that stage only.
2. Read this file, `migration-plan.md`, `test-plan.md`, and the stage document.
3. Verify the status above still matches the deployed application.
4. Implement only the authorized stage.
5. Run the stage's automated and manual checks.
6. Update its stage document with actual implementation details and results.
7. Update this page's current status and stage table.
8. Commit, merge, and deploy through the normal project process.
9. Record deployment verification in the completed stage document.
10. Start the next stage in a fresh branch and, when desired, a fresh chat.

Documentation updates are part of the definition of done. A stage is not complete merely
because code has been merged.

## Fresh-agent handoff checklist

A new agent must establish all of the following before editing code:

- Which stage is deployed, not merely merged
- Which source is authoritative for each dataset at that stage
- Whether dual writes and fallback reads are active for each dataset
- Whether reconciliation is allowed to delete IndexedDB-only records
- Which rollback behavior must remain possible
- Which stage-specific tests are mandatory

If repository documentation and deployed behavior disagree, stop and resolve the mismatch;
do not infer that the later stage is safe.

## Decision log

- 2026-07-14: Backup scope includes saved ads/images, topic archives, and saved role-play
  scenarios. Conversations, audio, transient full reviews, and credentials are excluded.
- 2026-07-14: Export/import will be browser-only and packaged as a versioned `.parle` ZIP.
- 2026-07-14: `fflate` is the preferred ZIP candidate; dependency selection will be finalized
  and the chosen package installed only in Stage 5 after a current compatibility review.
- 2026-07-14: Topic archives will move to IndexedDB through multiple deployments with a
  localStorage-authoritative mirror, shadow verification, primary-read cutover, and a
  rollback window.
- 2026-07-23: Clarified the target architecture: all durable exercise data must live in
  IndexedDB. Saved role-play scenarios follow the same staged mirror, verification, cutover,
  and rollback process as topic archives; they are not merely read from localStorage at export.
- 2026-07-23: Reserved IndexedDB version 3 for the saved-scenario store because topic-only
  Stage 1 code has already upgraded a browser to version 2. Reusing version 2 would not trigger
  `onupgradeneeded`; both v1 → v3 and v2 → v3 are required compatibility paths.
- 2026-07-25: Stage 1 was merged through PR #45, deployed, and confirmed working by the
  operator. Stage 2 is now the next authorized implementation stage.
- 2026-08-02: Stage 2 was merged through PR #46 and confirmed working by the operator after
  deployment. Manual divergence exercises reconciled topic archives and saved scenarios as
  expected. Stage 3 is now the next authorized implementation stage.
- 2026-08-10: Stage 3 was merged through PR #47 and confirmed deployed by the operator after
  the browser recovery checks had passed. No unresolved data-loss or fallback issue was
  reported. IndexedDB is now the deployed primary source for both migrated datasets, and
  Stage 4 is the next authorized implementation stage.
- 2026-08-19: Stage 4 test coverage was added (commit `541e315`) proving the existing Stage 3
  rollback-bridge machinery already satisfies Stage 4's record-equality and rollback-recovery
  guarantees for both datasets, with no source changes required. Both localStorage bridges will
  continue into Stage 5 by default, since real deployment observation evidence does not yet
  exist. This branch has **not** been deployed or operator-verified yet.
- 2026-08-23: Stage 4 was merged into `main` through
  [PR #51](https://github.com/CodeWithOz/parle/pull/51) and deployed, confirmed by the operator.
  The rollback-observation window is now open for both datasets. Both localStorage bridges
  remain active per the Stage 4 exit decision. Recording the observation duration/evidence and a
  final Stage 4 sign-off is still outstanding before Stage 5 may begin.
- 2026-08-26: The Stage 4 rollback-observation window closed after three days in production with
  no data-loss, fallback misbehavior, or IndexedDB/localStorage divergence reported for either
  dataset. Stage 4 is complete. Per its exit decision, both the topic-archive and saved-scenario
  localStorage bridges continue unchanged into Stage 5, which is now the next authorized
  implementation stage.
- 2026-08-28: Stage 5 export/import was implemented on `cursor/3d90f5f9`. `fflate@0.8.3` (MIT)
  was revalidated and installed. Backups are `.parle` ZIP packages with `parle-backup` format
  version 1, SHA-256 image integrity, preview-before-write merge import, optional confirmed
  replace, and post-commit reconciliation of both localStorage rollback bridges.
- 2026-08-29: Stage 5 was merged into `main` through
  [PR #54](https://github.com/CodeWithOz/parle/pull/54), pulled into the primary workspace, and
  deployed, confirmed by the operator. Stage 5 is complete. There is no Stage 6; stopping
  localStorage bridge writes remains an unauthorized future decision.
- 2026-08-31: The operator authorized retiring the localStorage bridge. `services/tefArchiveService.ts`
  now reads and writes durable exercise data through IndexedDB only: the rollback bridge, the
  fallback reads, the dirty/primary markers, the recovery journal, and the Stage 1/2 mirror
  machinery were all removed, along with the migration-metadata types they used. A browser that
  still holds pre-IndexedDB localStorage data has it folded into IndexedDB once at startup by
  `initializeDurableData()` — IndexedDB wins on ID conflicts, any unreplayed recovery-journal
  entries are applied, and the legacy keys are removed only after the merged result is read back.
  Unreadable legacy data is left in place and reported instead of being discarded. API keys were
  intentionally left in localStorage; they are outside this program's scope.
