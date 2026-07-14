# Stage 5 — Browser Export and Import

Status: **pending Stage 4 deployment verification and bridge-policy decision**

## Objective

Implement browser-only `.parle` backup export and validated import for saved TEF ads/images,
linked topic archives, and saved role-play scenarios.

## Preconditions

- IndexedDB primary reads are deployed and stable.
- Stage 4 records the active localStorage bridge policy.
- `backup-format.md` has been re-reviewed against current types and storage behavior.
- The ZIP library choice has been revalidated before dependency installation.

## Required implementation

- Versioned Zod manifest schema and compatibility handling.
- Browser ZIP generation and inspection; `fflate` is the preferred candidate.
- Binary image export with declared paths and integrity validation.
- Export of all current saved role-play scenario fields, including legacy-compatible shapes.
- Preview-before-write import UX.
- Merge-default collision handling and idempotent repeated imports.
- Transactional saved-ad/topic-archive import.
- Explicit recovery design for scenario localStorage writes outside the IDB transaction.
- Tested size, entry-count, path, MIME, signature, and relationship limits.
- No network or AI calls.

## Explicit exclusions

- Conversations and messages
- Audio
- API credentials
- Complete transient review state
- Cloud sync or backend storage

## Required tests

Run all backup export/import coverage from `../test-plan.md`, plus manual transfer between two
fresh browser profiles. Confirm imported ads can restart exercises, topic history remains linked,
and imported role-play scenarios open with their saved characters and roadmap steps.

## Completion record

Record final format version, library/version/license, resource limits, branch/commits, test
results, cross-browser transfer evidence, merge, deployment, and post-deployment verification.
