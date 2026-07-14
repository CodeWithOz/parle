# Data Portability Test Plan

These tests protect user data across the entire multi-deployment program. Each stage document
identifies the subset required before that stage can be marked complete.

## Migration fixtures

Maintain fixtures covering:

- Empty browser storage
- localStorage archives with no IndexedDB archive store yet
- Multiple ads and archives across both TEF exercise types
- Multiple archives referencing one ad
- Legacy saved role-play scenarios without roadmap steps
- Current scenarios with characters and roadmap steps
- IndexedDB partially populated from an interrupted backfill
- Same ID with differing record content
- Deleted localStorage archive still present in IndexedDB during authoritative stages
- IndexedDB unavailable or transaction failing
- Malformed localStorage JSON

Fixtures must use valid `TefTopicSuggestion` values, including bilingual examples.

## Permanent migration invariants

- Database upgrade preserves all existing `savedAds` records and indexes.
- Existing localStorage-only users retain every valid topic archive.
- Backfill can run repeatedly without changing IDs or creating duplicates.
- Reconciliation compares content as well as counts.
- Deletions do not reappear after authoritative reconciliation.
- Archive-to-ad relationships remain correct.
- Persuasion and questioning records remain correctly typed and filtered.
- One failed mirror write does not erase authoritative localStorage data.
- No migration path clears `parle-tef-topic-archives`.
- A failed or interrupted migration is safe to retry.

## Stage 3 UI regression coverage

- Topic history loads asynchronously without rendering stale results after close/reopen.
- Filtering history by saved-ad ID returns the same records as before migration.
- Latest-topic practice guide selects the same archive as before migration.
- Deleting an archive refreshes the history UI.
- Deleting a saved ad removes its linked topic archives under the active bridge policy.
- Starting persuasion and questioning from a saved ad still works.
- Empty, loading, and storage-error states are distinguishable.
- Guarded localStorage fallback works only in documented conditions.

## Backup export coverage

- Includes all saved TEF ads for both exercise types.
- Converts image data URLs into the correct binary assets.
- Includes every linked topic archive.
- Includes every valid saved role-play scenario, including legacy scenarios.
- Preserves IDs, exercise types, confirmation data, timestamps, characters, and roadmap steps.
- Rejects or reports orphaned archives instead of silently dropping them.
- Excludes API keys, conversations, messages, audio, and transient UI/review state.
- Produces a package accepted by the importer.

## Backup import coverage

- Valid package imports all declared data and relationships.
- Importing the same package twice does not duplicate data.
- Equivalent ID collisions are skipped.
- Differing ID collisions are remapped with all references rewritten.
- Missing, duplicate, oversized, path-traversing, or signature-mismatched assets are rejected.
- Unsupported manifest versions fail before writes.
- A malformed scenario does not partially overwrite saved scenarios.
- Failed TEF transaction leaves existing ads and archives unchanged.
- Replace mode, if implemented, requires explicit confirmation and remains atomic where possible.
- Existing browser data remains untouched when preview is cancelled.

## Manual browser checks for every deployed stage

1. Seed realistic saved ads and topic archives in the storage layout used by the previous release.
2. Load the new build and verify migration/reconciliation behavior.
3. Open Past topic suggestions globally and for a single saved ad.
4. Restart both TEF exercise types from saved advertisements.
5. Complete a session and confirm its topics appear exactly once.
6. Delete one topic archive and one saved ad; reload and verify they remain deleted.
7. Close and reopen the browser context and verify persistence.
8. For primary-read stages, simulate IndexedDB failure and verify documented fallback behavior.

Record the test command results and manual evidence in the active stage document. Temporary
browser artifacts remain gitignored as directed by `AGENTS.md`.
