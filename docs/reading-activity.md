# Reading Activity v1

Current capability marker: `read-activity-v1`. World Authoring: `world-authoring-v17`. Mental Regulation: `mental-regulation-v4`. Ordinary-object interaction: `ordinary-object-interaction-v2`.

## Canonical ownership

- `entities.objects -> state.objects` is the canonical ordinary-object path. A readable book is an Object without Resource-container capability; it is not disguised as a Resource Container or Source.
- `read` is a sustained Human Action / `read` Intent targeting an ordinary object with the explicit `read` affordance. Target feasibility and access consume canonical Interaction Geometry and `traversalCost`; entity position is not an interaction shortcut.
- The Action owns reading execution progress only. Each valid `reading` execution tick realizes one feedback unit; merely choosing the Intent, moving toward the target, or holding a timer does not.
- Mental Regulation owns `ACTIVITY_PROFILES.read` and converts realized feedback into Stimulation / Relaxation effects. The Activity never writes Needs directly.
- Generic Activity Continuity v1 owns cross-interruption episode continuity for realized `read`: once reading has produced feedback, emergency preemption may suspend the same Agent-private `activityEpisode`; resume returns through normal Deliberation and creates a new concrete Action rather than restoring stale execution state. See [`activity-continuity.md`](activity-continuity.md).

## First concrete object

`bookA` is authored on the existing dining-table Surface with `interactions.read.mode = supportReach`. Existing Furniture geometry is reused; no read-specific Furniture suitability, seat requirement, hand/gaze model, or new Furniture definition is introduced.

## Deliberation

The Mental Regulation provider contributes `read` only when canonical Stimulation / Relaxation pressure exists and a readable object has finite canonical interaction traversal cost. The nearest reachable readable object is selected deterministically by traversal cost then id; access burden is a bounded decision cost. Initial Mental Regulation state remains neutral `0 / 0`, but current `mental-regulation-v4` gradually generates Stimulation pressure for eligible awake Humans; `read` can therefore become competitive in the production default only after that canonical pressure actually exists, not merely because a book exists.

Activity Continuity resume evidence is separate from the Mental Regulation provider: a suspended realized-reading episode may contribute a bounded `read` option for the same target, but it still competes through the existing chooser / Deliberation path and does not make an otherwise infeasible target legal.

## Deferred

This slice does not model book content, literacy, genre preference, novelty/familiarity, learning, Memory of content, bookshelves, reading posture, detailed hands/gaze, Environment Interference, generic leisure taxonomy, or Activity-specific Need-generation policy beyond the shared Mental Regulation settlement. Generic Activity Continuity beyond the current bounded `read` consumer remains outside the Reading Activity contract; its lifecycle and future consumer scope belong to [`activity-continuity.md`](activity-continuity.md).