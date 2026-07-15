# Stage 4 — Rollback Window

Status: **pending Stage 3 deployment verification**

## Objective

Operate IndexedDB as the primary source while preserving and proving the localStorage rollback
path before export/import begins.

## Required work

- Keep localStorage mirror writes and guarded fallback active unless this stage is explicitly
  revised after deployment evidence.
- Monitor/test record equality under ordinary creation and deletion flows.
- Exercise a rollback-compatible build or equivalent controlled recovery test.
- Verify legacy and current saved role-play scenarios remain unaffected.
- Document actual observation duration and evidence.

## Exit decision

At the end of this stage, explicitly decide and record whether Stage 5 must continue bridge
writes. Export/import does not itself authorize removal. Default to continuing the bridge when
evidence is ambiguous.

## Explicit non-goals

- Do not clear the old localStorage archive key.
- Do not add ZIP/export/import behavior merely to accelerate the schedule.

## Completion record

Record branch/commits if code changes are needed, tests, deployment observations, rollback
exercise, and the bridge policy handed to Stage 5. Update `../README.md` afterward.
