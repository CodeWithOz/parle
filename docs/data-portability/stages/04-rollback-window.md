# Stage 4 — Rollback Window

Status: **pending Stage 3 deployment verification**

## Objective

Operate IndexedDB as the primary source for topic archives and saved scenarios while preserving
and proving both localStorage rollback paths before export/import begins.

## Required work

- Keep localStorage mirror writes and guarded fallback active unless this stage is explicitly
  revised after deployment evidence.
- Monitor/test record equality under ordinary archive and scenario create/update/delete flows.
- Exercise a rollback-compatible build or equivalent controlled recovery test.
- Verify legacy and current saved role-play scenarios retain every supported field.
- Document actual observation duration and evidence.

## Exit decision

At the end of this stage, explicitly decide and record, separately for topic archives and saved
scenarios, whether Stage 5 must continue bridge writes. Export/import does not itself authorize
removal. Default to continuing the affected bridge when evidence is ambiguous.

## Explicit non-goals

- Do not clear either old localStorage key.
- Do not add ZIP/export/import behavior merely to accelerate the schedule.

## Completion record

Record branch/commits if code changes are needed, tests, deployment observations, rollback
exercise, and the bridge policy handed to Stage 5. Update `../README.md` afterward.
