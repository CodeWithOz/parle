# Topic-Archive Migration Plan

This plan moves `parle-tef-topic-archives` from localStorage into the existing `parle-tef`
IndexedDB database without a destructive one-release cutover.

## Storage-state matrix

| Stage | Read source | Write/delete behavior | localStorage role |
|---|---|---|---|
| 1 | localStorage | localStorage first, then IndexedDB mirror | Authoritative |
| 2 | localStorage; IndexedDB shadow-read | Both; reconcile IDB to localStorage | Authoritative |
| 3 | IndexedDB; guarded localStorage fallback | IndexedDB primary, localStorage mirror | Rollback copy |
| 4 | IndexedDB; fallback retained as specified | Both | Rollback copy |
| 5 | IndexedDB | Through repository; bridge policy still honored | Determined after Stage 4 evidence |

Stopping localStorage bridge writes is a separate future decision. It is not implicitly
authorized by implementing export/import.

## Proposed IndexedDB schema

Upgrade `parle-tef` from database version 1 to version 2 and add:

### `topicArchives`

- Key path: `id`
- Indexes: `adId`, `exerciseType`, `createdAt`
- Record shape: existing `TefTopicArchive`

### `migrationMetadata`

- Key path: `name`
- Stores state such as migration version, phase, last reconciliation time, counts, and
  verification status

Creating the store does not prove migration completion. Migration state must be marked only
after record-level verification.

## Stage 1: localStorage-authoritative mirror

- Create the new object stores safely in `onupgradeneeded`.
- Post-open, copy current localStorage archives to IndexedDB using stable existing IDs.
- Keep all public topic-archive reads sourced from localStorage.
- Preserve current synchronous UI behavior.
- Write localStorage first; mirror successful changes to IndexedDB.
- Apply deletions to both stores.
- A mirror failure must not make a successful localStorage operation look lost.
- Record/return enough diagnostic information for tests and later verification.

Backfill must be idempotent. At this stage, localStorage remains the complete authority, so a
full reconciliation may remove IndexedDB topic-archive records absent from localStorage. That
behavior must not be carried forward blindly after IndexedDB becomes primary.

## Stage 2: shadow verification

- Continue displaying localStorage data.
- Read IndexedDB asynchronously in the background.
- Compare IDs and canonical record content, not only counts.
- Detect missing, extra, or differing records and relationship mismatches.
- Repair IndexedDB from authoritative localStorage data.
- Expose testable verification results and durable migration metadata.
- Do not switch UI reads.

## Stage 3: IndexedDB primary

- Change repository reads to IndexedDB.
- Update consumers for asynchronous loading, errors, and stale-request protection.
- Fall back to localStorage if IndexedDB is unavailable, migration is unverified, or the store
  is unexpectedly empty while localStorage contains data.
- Continue mirroring successful writes and deletions to localStorage.
- Never interpret a temporary IndexedDB failure as permission to overwrite it with an empty set.

## Stage 4: rollback window

- Keep IndexedDB primary in production.
- Retain localStorage mirroring and fallback for at least one separately deployed observation
  period, or longer if evidence is incomplete.
- Exercise rollback and recovery tests.
- Record real deployment verification in `stages/04-rollback-window.md`.
- Do not clear localStorage.

## Stage 5: export/import

- Implement the accepted `.parle` format.
- Read saved ads and topic archives through the IndexedDB repository.
- Read saved scenarios through validated scenario persistence.
- Import ads and topic archives in a single IndexedDB transaction after complete validation.
- Apply scenario changes only after the TEF transaction can succeed, with an explicit recovery
  design because scenario localStorage writes cannot join an IndexedDB transaction.
- Honor whatever localStorage bridge policy Stage 4 leaves active.

## Rollback invariants

- Before Stage 3, rolling back restores a version that still reads authoritative localStorage.
- During Stages 3 and 4, mirrored localStorage must remain current enough for application rollback.
- Database upgrades only add stores/indexes; old app versions must continue using `savedAds`.
- No stage deletes or rewrites saved-ad images as part of topic-archive migration.
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
```

The exact type belongs to Stage 1, but its semantics must remain compatible with this plan.
