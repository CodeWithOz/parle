# Stage 2 — Shadow Verification and Reconciliation

Status: **pending Stage 1 deployment verification**

## Objective

Prove that IndexedDB contains the same topic archives and saved role-play scenarios as their
authoritative localStorage sources while the UI continues reading localStorage.

## Preconditions

- Stage 1 is deployed and verified.
- Backfill and dual writes have operated for an agreed observation period.
- Stage 1 documentation records no unresolved data-loss issue.

## Required implementation

- Shadow-read both IndexedDB mirrors without changing displayed data.
- Compare IDs and canonical record content per dataset, not only counts.
- Detect missing, extra, differing, relationship-invalid, and legacy-shape records.
- Reconcile each IndexedDB mirror to its authoritative localStorage source at this stage.
- Persist independent, testable verification metadata and timestamps.
- Keep all user-facing reads sourced from localStorage.

## Explicit non-goals

- Do not make IndexedDB the primary read source.
- Do not remove localStorage writes or fallback data.
- Do not implement export/import.

## Required tests

- Matching archive and scenario stores verify independently.
- Missing, extra, and differing IDB records are detected and repaired for both datasets.
- Same counts with different content do not falsely verify.
- Deleted localStorage records are removed from the corresponding IDB mirror.
- Verification failure never mutates localStorage.

## Completion record

Record branch, commits, tests, merge, deployment, observed verification results, mismatch
counts, and repairs. Then update `../README.md` so Stage 3 is next only if evidence is clean.
