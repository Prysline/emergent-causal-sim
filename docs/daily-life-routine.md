# Daily Life Structure｜Routine Slice A

Current subsystem marker: `daily-life-routine-v1`.

## Scope

Routine Slice A adds the first minimal **Agent-private soft Routine anchor → bounded Decision Evidence → existing Deliberation** path.

Routine answers: 「在這個時間／情境下，我通常比較傾向做什麼？」 It is not a Need, obligation, Standing Responsibility, hard schedule, Action command, second deliberation system, or Household / group hidden schedule.

## Canonical state

`Agent.routine.anchors` is the only canonical Routine truth in this slice. There is no `state.routines` World-level personal schedule registry. The DAY 0 bootstrap gives Human agents one minimal private evening `read` anchor; its time window is deterministically derived from the initial simulation seed plus Agent identity so residents do not share one hidden household clock.

The first anchor shape is intentionally narrow:

- `id`
- `activityKind: 'read'`
- `source: 'day0'`
- `context.kind: 'daily-time-window'`
- `context.startMinute / endMinute`

There is no learned strength, decay, success/failure status, personality modifier, resume lifecycle, obligation state, or generic scheduling framework.

## Decision boundary

`dailyLifeRoutine.read` is a normal Decision Option Provider. It may propose a feasible `read` candidate only while the Agent's own anchor is contextually active. Its score is fixed to a bounded v1 range and carries traceable Routine / temporal-context / spatial-cost contributors.

The provider does **not** create Active Intent, Action, World Event, or mutate Routine state. Existing Deliberation remains the sole chooser. Stronger physiological Need, social reason, emergency handling, or another higher-ranked legal candidate may beat Routine. Choosing something else does not create a Routine failure.

`read` feasibility reuses the shared readable-object opportunity query extracted from the existing reading integration. If no readable target has a legal interaction position, Routine contributes no `read` option and cannot fabricate an Action.

## Deferred

This slice does not implement Learned Habit learning/decay, Standing Responsibility, household/group routine truth, generic Activity Continuity/resume, Character Traits, Routine personality modifiers, detailed strength calibration, Environment Interference, book/content knowledge, literacy/genre/novelty/learning/memory, or a generic scheduling framework.

## Version impact

Routine is active in the default Human DAY 0 state and therefore changes player-observable autonomous candidate competition. Overall runtime / Presentation advance to `11.52.0-daily-life-routine`. The Routine subsystem owns `daily-life-routine-v1`. Action remains `11.51.0-activity-concurrency`; Human Social Response remains `11.51.0-activity-concurrency`; Deliberation / Decision Evidence / Sleep Slot Conflict remains `11.48.1-sleep-perception-approach`; Mental Regulation remains `mental-regulation-v3`; World Authoring remains `world-authoring-v13`.
