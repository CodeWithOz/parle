# Stage 4 — Rollback Window

Status: **deployed — merged via [PR #51](https://github.com/CodeWithOz/parle/pull/51); rollback observation window now open, final sign-off pending observation evidence**

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

**Branch/commit:** `claude/phase-4-6cf0a2`, commit `541e315` ("test: add Stage 4
rollback-window verification coverage").

**What was verified:** A new test file,
[`__tests__/tefArchiveStage4RollbackWindow.test.ts`](../../../__tests__/tefArchiveStage4RollbackWindow.test.ts),
adds 6 tests across 3 describe blocks, covering both the `topicArchives` and `scenarios`
datasets independently:

- *Record equality under ordinary CRUD* (2 tests) — proves the IndexedDB primary store and the
  localStorage rollback bridge stay equal by full content, not just by count, through
  create/update/delete sequences for topic archives and for saved scenarios.
- *Rollback-compatible recovery simulation* (2 tests) — simulates an old/rolled-back build by
  reading the raw `parle-tef-topic-archives` / `parle-scenarios` localStorage keys directly
  (bypassing the current build's IndexedDB-aware read path) and proves that view is complete and
  correct after a mix of creates, updates, and deletes.
- *Legacy vs. current scenario field preservation* (2 tests) — proves both legacy-shaped and
  current-shaped saved scenarios preserve every supported field (name, description, `aiSummary`,
  `characters`, `steps`, `isTefQuestioning`, etc.) through save/update/delete-and-recreate
  cycles in both the IndexedDB primary and the localStorage mirror, and that no optional fields
  are fabricated for legacy scenarios that never had them.

No production source files were changed. All three verification passes performed in this
session (test design, an independent build/re-check pass, and code review) confirmed that
Stage 3's existing rollback-bridge machinery in `services/tefArchiveService.ts` —
specifically `mutatePrimaryDataset`, `persistRollbackBridge`, and `readPrimaryDataset` — already
satisfies every Stage 4 guarantee for both datasets. No code changes were required to pass this
stage's requirements.

**Test results:** Full suite 676/676 passing (after merging the latest `main`, which added its
own unrelated test coverage). CodeRabbit review (`coderabbit review --plain --base main`)
returned 0 critical/warning/suggestion findings.

**Deployment observation:** This session implemented and verified the required behavior via
automated tests only; it did not itself perform a deployment.

**Deployment confirmed (2026-08-23):** This branch was merged into `main` via
[PR #51](https://github.com/CodeWithOz/parle/pull/51) and deployed, confirmed by the operator.
The rollback-observation window described above is now open. No data-loss or fallback issue has
been reported as of this confirmation. Full Stage 4 completion — the actual observation
duration/evidence and a final sign-off — is still to be recorded once that window has run; until
then this record should not be read as claiming the multi-day observation itself is finished.

**Exit decision (bridge policy for Stage 5):** Both bridges — the topic-archive localStorage
mirror/fallback and the saved-scenario localStorage mirror/fallback — should continue into
Stage 5. This follows the plan's explicit default: "Default to continuing the affected bridge
when evidence is ambiguous." Because no real deployment observation period has occurred yet, the
evidence is necessarily ambiguous/incomplete (automated tests only, no production signal), so
continuing both bridges unchanged is the only defensible choice at this time. This decision
should be revisited once an operator has deployed this branch and observed it in production.
