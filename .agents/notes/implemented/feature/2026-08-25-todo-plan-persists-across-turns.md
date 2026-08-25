# Agent Note: Todo plan persists across turns

Status: implemented

English | [中文](2026-08-25-todo-plan-persists-across-turns.zh.md)

## Problem

The turn-boundary clearance rule cleared the rendered plan strip on every `turn/start`. Real sessions break that lifetime assumption twice. First, objectives span many turns — every user reply starts a new turn, so a mid-work checklist vanished between replies even though nothing about the work changed. Second, an errored turn wiped the list exactly when the operator most needs it: the work is unfinished, the next turn must resume it, and rebuilding the list falls on the model or the user. User report 2026-08-25 during the rotation-key work: tasks reset after an error, and re-entering them by hand was the only recovery.

## Decision

The `todos` projection is session-long last-write-wins again: `apply` takes the whole list from each `todo/write`, no event clears it, and only the absence of any write yields `null` (`stateVersion` 3). A finished checklist lingering on screen is acceptable — it documents what the previous task did and is replaced at the first write of the next task, which the tool contract mandates ("send the ENTIRE list"). Clearing is now an authoring act by the model, never an automatic lifetime rule.

### Host projection (web)

Same unit, same carriers: `dsh-tool-todo` folds latest-write-only; `dsh-host-apiproxy` serves the tail value and pushes `session/projection` frames; the web dock reads it through `useProjection('todos')`. The keyless connection-fixture mirror drops its `turn/start` stop so assembled pages converge on the same value.

## Alternatives considered

- **Keep clearance except after failed or interrupted turns** — preserves the anti-staleness intent but hides the decision in turn-end reasons the checklist reader cannot see, and still wipes multi-turn objectives that pause cleanly.
- **Clear on `turn/start` only when every item is completed** — same hidden-state objection, and partial plans of genuinely finished tasks lingered under the old rule anyway.
- **A model-facing explicit clear command** — no need: rewriting the whole list already IS the clear.

## Consequences

The strip shows the last written plan across turns, errors included; reopening a session restores it whenever any write exists. Supersedes and archives the 2026-07-28 turn-clearance note (frozen at `archived/feature/2026-07-28-todo-plan-clears-on-next-turn.md`), restoring the session-long standing-plan wording of the [web todo display](2026-07-23-web-todo-display.md) note, which keeps owning the render surfaces. Coverage: the projection spec pins list survival across a `turn/end` + `turn/start` boundary; the fixture mirror converges with the host fold; existing display snapshots stay valid because the fixture's todo turn is its last.
