# Parle Data Portability Program

This directory is the durable source of truth for migrating all durable exercise data to
IndexedDB and then adding browser-only export/import. It is intended to carry context across
separate branches, deployments, and AI-agent chats.

## Current status

- Program status: **planning complete; implementation not started**
- Current storage behavior: **unchanged**
- Last completed stage: **Stage 0 — specification and handoff documentation**
- Next stage: **[Stage 1 — IndexedDB mirror](stages/01-idb-mirror.md)**
- Current authoritative topic-archive source: `localStorage`
- Current authoritative saved-scenario source: `localStorage`
- IndexedDB topic-archive store exists: **no**
- IndexedDB saved-scenario store exists: **no**
- Dual writes are active: **no**
- Export/import is available: **no**

Compatibility requirement: Stage 1 topic-only builds have already created database version 2
in at least one browser. The corrected schema target is therefore version 3; code must support
both version 1 → 3 and version 2 → 3 upgrades without recreating or clearing existing stores.

The next implementation branch must do Stage 1 only. It must not switch UI reads to
IndexedDB and must not remove or clear either existing localStorage dataset.

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
| TEF topic archives | localStorage | `parle-tef-topic-archives` |
| Saved role-play scenarios | localStorage | `parle-scenarios` |
| API keys | localStorage | `parle_api_key_*` (excluded from backups) |

Primary implementation locations:

- `services/tefArchiveService.ts`
- `services/scenarioService.ts`
- `components/TefTopicHistorySheet.tsx`
- `components/TefRecentAdsCarousel.tsx`
- `App.tsx`
- `types.ts`

## Target architecture

- `savedAds`, `topicArchives`, and saved role-play `scenarios` reside in the same IndexedDB
  database so the complete backup can be imported transactionally.
- A repository/service boundary owns migration, reconciliation, reads, and writes.
- During migration, topic archives and saved scenarios remain localStorage-authoritative and
  are mirrored independently until both datasets are verified and cut over.
- A versioned `.parle` ZIP contains `manifest.json` and binary image assets.
- Export and import execute entirely in the browser.

See [backup-format.md](backup-format.md), [migration-plan.md](migration-plan.md), and
[test-plan.md](test-plan.md) for the accepted contracts.

## Deployment stages

| Stage | Purpose | Status |
|---|---|---|
| 0 | Specify scope, invariants, and handoff process | Complete (documentation only) |
| 1 | Add IndexedDB mirrors for topic archives and saved scenarios | Next |
| 2 | Shadow-read, compare, and reconcile both datasets | Pending |
| 3 | Make IndexedDB primary for both with localStorage fallback | Pending |
| 4 | Maintain rollback windows and prove both datasets stable | Pending |
| 5 | Implement versioned export/import | Pending |

Detailed handoffs are in [`stages/`](stages/).

For Stages 2–5, readiness is tracked independently for topic archives and saved scenarios.
Completing verification or cutover for one dataset does not authorize advancing the other.
Stage 5 may begin only after Stage 4 has recorded the bridge policy for both datasets.

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
