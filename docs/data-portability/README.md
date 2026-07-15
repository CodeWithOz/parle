# Parle Data Portability Program

This directory is the durable source of truth for migrating TEF topic archives from
`localStorage` to IndexedDB and then adding browser-only export/import. It is intended
to carry context across separate branches, deployments, and AI-agent chats.

## Current status

- Program status: **Stage 1 implemented on branch; deployment verification pending**
- Current implementation behavior: **localStorage-authoritative IndexedDB mirror**
- Deployed behavior: **not verified; confirm before merge/deployment**
- Last completed stage: **Stage 0 — specification and handoff documentation**
- Next action: **merge, deploy, and verify [Stage 1 — IndexedDB mirror](stages/01-idb-mirror.md)**
- Current authoritative topic-archive source: `localStorage`
- IndexedDB topic-archive store exists in this implementation: **yes (schema version 2)**
- Dual writes are active in this implementation: **yes; localStorage first**
- Export/import is available: **no**

The next implementation branch must do Stage 1 only. It must not switch UI reads to
IndexedDB and must not remove or clear the existing localStorage data.

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
3. No stage may silently clear `parle-tef-topic-archives` from localStorage.
4. Backfill and reconciliation must be idempotent and must not create duplicates.
5. Deletions must not reappear after reconciliation.
6. `TefTopicArchive.adId` must continue to reference the correct `TefSavedAd.id`.
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

- `savedAds` and `topicArchives` reside in the same IndexedDB database.
- A repository/service boundary owns migration, reconciliation, reads, and writes.
- Saved role-play scenarios may remain in localStorage initially; export reads them through
  `scenarioService` and import writes them through validated scenario persistence logic.
- A versioned `.parle` ZIP contains `manifest.json` and binary image assets.
- Export and import execute entirely in the browser.

See [backup-format.md](backup-format.md), [migration-plan.md](migration-plan.md), and
[test-plan.md](test-plan.md) for the accepted contracts.

## Deployment stages

| Stage | Purpose | Status |
|---|---|---|
| 0 | Specify scope, invariants, and handoff process | Complete (documentation only) |
| 1 | Add IndexedDB archive store; localStorage remains authoritative | Implemented; deployment verification pending |
| 2 | Shadow-read, compare, and reconcile | Pending |
| 3 | Make IndexedDB primary with localStorage fallback | Pending |
| 4 | Maintain rollback window and prove stability | Pending |
| 5 | Implement versioned export/import | Pending |

Detailed handoffs are in [`stages/`](stages/).

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
- Which store is authoritative at that stage
- Whether dual writes and fallback reads are active
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
