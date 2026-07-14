# Stage 2 — Shadow Verification and Reconciliation

Status: **pending Stage 1 deployment verification**

## Objective

Prove that IndexedDB contains the same topic archives as authoritative localStorage while the
UI continues reading localStorage.

## Preconditions

- Stage 1 is deployed and verified.
- Backfill and dual writes have operated for an agreed observation period.
- Stage 1 documentation records no unresolved data-loss issue.

## Required implementation

- Shadow-read IndexedDB without changing displayed data.
- Compare archive IDs and canonical record content, not only counts.
- Detect missing, extra, differing, and relationship-invalid records.
- Reconcile IndexedDB to authoritative localStorage at this stage.
- Persist testable verification metadata and timestamps.
- Keep all user-facing reads sourced from localStorage.

## Explicit non-goals

- Do not make IndexedDB the primary read source.
- Do not remove localStorage writes or fallback data.
- Do not implement export/import.

## Required tests

- Matching stores verify successfully.
- Missing, extra, and differing IDB records are detected and repaired.
- Same counts with different content do not falsely verify.
- Deleted localStorage records are removed from the IDB mirror.
- Verification failure never mutates localStorage.

## Completion record

Record branch, commits, tests, merge, deployment, observed verification results, mismatch
counts, and repairs. Then update `../README.md` so Stage 3 is next only if evidence is clean.
