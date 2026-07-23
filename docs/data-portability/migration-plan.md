# Durable Exercise Data Migration Plan

This plan moves both `parle-tef-topic-archives` and `parle-scenarios` from localStorage into the
existing `parle-tef` IndexedDB database without a destructive one-release cutover. Saved TEF
ads already live in that database. The target is one transactional home for all durable
exercise data.

## Storage-state matrix

| Stage | Read source | Write/delete behavior | localStorage role |
|---|---|---|---|
| 1 | localStorage for archives and scenarios | localStorage first, then independent IDB mirrors | Authoritative |
| 2 | localStorage; IndexedDB shadow-read | Both datasets reconciled IDB-to-localStorage | Authoritative |
| 3 | IndexedDB; guarded per-dataset localStorage fallback | IDB primary, localStorage mirrors | Rollback copy |
| 4 | IndexedDB; fallbacks retained as specified | Both datasets dual-written | Rollback copy |
| 5 | IndexedDB | Through repository; bridge policy still honored | Determined after Stage 4 evidence |

Stopping localStorage bridge writes is a separate future decision. It is not implicitly
authorized by implementing export/import.

Migration state is per dataset throughout this matrix. An archive migration marked verified or
IDB-primary must not be used as evidence that the scenario migration has reached the same state,
or vice versa. Later-stage agents must preserve the independent metadata, fallback, and bridge
decisions introduced in Stage 1.

## Proposed IndexedDB schema

Upgrade `parle-tef` to database version 3 and ensure the following stores exist:

The existing database name is retained for compatibility even though it will now contain
non-TEF role-play scenarios. Keeping one database is what permits atomic backup imports.

Version 2 is already present in browsers that ran the topic-only Stage 1 implementation. It
contains `savedAds`, `topicArchives`, and `migrationMetadata`, but no `scenarios` store. The
version 3 upgrade must be additive and conditional:

- v1 → v3: retain `savedAds`; create `topicArchives`, `scenarios`, and `migrationMetadata`.
- v2 → v3: retain all existing stores and records; create only the missing `scenarios` store
  and any missing scenario indexes.
- Fresh database → v3: create the complete schema.

Never delete/recreate an existing store to make its schema match. Use
`db.objectStoreNames.contains(...)` and the upgrade transaction for additive creation.

### `topicArchives`

- Key path: `id`
- Indexes: `adId`, `exerciseType`, `createdAt`
- Record shape: existing `TefTopicArchive`

### `scenarios`

- Key path: `id`
- Index: `createdAt`
- Record shape: existing `Scenario`, including optional characters and roadmap steps
- Legacy scenarios without optional fields must be preserved without destructive normalization

### `migrationMetadata`

- Key path: `name`
- Stores independent records for the topic-archive and saved-scenario migrations, including
  migration version, phase, last reconciliation time, counts, and verification status

Creating the store does not prove migration completion. Migration state must be marked only
after record-level verification.

## Stage 1: localStorage-authoritative mirror

- Create the new object stores safely in `onupgradeneeded`.
- Post-open, copy current localStorage archives and scenarios to their IndexedDB stores using
  stable existing IDs.
- Keep all public topic-archive and saved-scenario reads sourced from localStorage.
- Preserve current synchronous UI behavior.
- Write each dataset to localStorage first; mirror successful changes and deletions to its
  corresponding IndexedDB store.
- A mirror failure must not make a successful localStorage operation look lost.
- Record/return per-dataset diagnostics for tests and later verification.

Request database version 3. Merely adding `scenarios` while continuing to open version 2 is a
release-blocking error because existing v2 browsers will not receive an upgrade event.

Backfill must be idempotent. At this stage, localStorage remains the complete authority, so a
full reconciliation may remove IndexedDB records absent from the corresponding authoritative
localStorage dataset. That behavior must not be carried forward blindly after IndexedDB becomes
primary.

## Stage 2: shadow verification

- Continue displaying topic archives and saved scenarios from localStorage.
- Shadow-read both IndexedDB stores asynchronously in the background.
- Compare IDs and canonical record content per dataset, not only counts.
- Detect missing, extra, differing, relationship-invalid, and legacy-shape records.
- Repair each IndexedDB mirror from its corresponding authoritative localStorage source.
- Expose testable, independent verification results and durable migration metadata.
- Do not switch UI reads.

## Stage 3: IndexedDB primary

- Change topic-archive and saved-scenario repository reads to IndexedDB.
- Update both sets of consumers for asynchronous loading, errors, and stale-request protection.
- Fall back to localStorage if IndexedDB is unavailable, migration is unverified, or the store
  is unexpectedly empty while localStorage contains data.
- Continue mirroring successful writes and deletions for both datasets to localStorage.
- Never interpret a temporary IndexedDB failure as permission to overwrite it with an empty set.

## Stage 4: rollback window

- Keep IndexedDB primary for both datasets in production.
- Retain both localStorage mirrors and fallbacks for at least one separately deployed
  observation period, or longer if evidence is incomplete.
- Exercise rollback and recovery tests.
- Record real deployment verification in `stages/04-rollback-window.md`.
- Do not clear localStorage.

## Stage 5: export/import

- Implement the accepted `.parle` format.
- Read saved ads, topic archives, and saved scenarios through IndexedDB repositories.
- Import all three datasets in a single IndexedDB transaction after complete validation and
  conflict resolution.
- Honor the per-dataset localStorage bridge policies Stage 4 leaves active.

## Rollback invariants

- Before Stage 3, rolling back restores a version that still reads authoritative localStorage.
- During Stages 3 and 4, both mirrored localStorage datasets must remain current enough for
  application rollback.
- Database upgrades only add stores/indexes; old app versions must continue using `savedAds`.
- Browsers that already ran the topic-only version 2 build must upgrade to version 3 without
  losing saved ads, mirrored topic archives, or migration metadata.
- No stage deletes or rewrites saved-ad images as part of topic-archive migration.
- No stage drops optional or unknown-compatible fields from legacy saved scenarios.
- A failed backfill or verification attempt is retryable on the next launch.

## Migration metadata example

```ts
{
  name: 'topic-archives-localstorage-to-idb',
  version: 1,
  state: 'mirroring' | 'verified' | 'idb-primary',
  lastReconciledAt: 0,
  sourceRecordCount: 0,
  destinationRecordCount: 0
}

// A separate record with the same lifecycle is maintained for:
// name: 'scenarios-localstorage-to-idb'
```

The exact type belongs to Stage 1, but its semantics must remain compatible with this plan.
