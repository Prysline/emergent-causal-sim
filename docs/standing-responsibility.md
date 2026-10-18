# Standing Responsibility v1 — Current Contract

Current subsystem generation: `standing-responsibility-v1`.

Current overall runtime marker: `11.62.0-furniture-passage-yielding`.

Current World Authoring: `world-authoring-v17`.

## Purpose

Standing Responsibility answers a narrow long-term question: **why is this durable task this Agent’s responsibility?**

It is not objective necessity, a temporary Obligation, Routine, Learned Habit, Intent, Action, or a generic Role / Household framework.

v1 is intentionally bounded to **Resources replenishment responsibility**. The first production consumer is the already-existing legal `restockContainer` Decision Option.

## Canonical truth and knowledge boundary

Canonical World truth is stored once as `resourceResponsibilityAssignments[]`:

```js
{
  id,
  principal: { kind: 'agent', id: 'zhen' },
  responsibility: 'restock',
  scope: { resource: 'food' }
}
```

Agent-private knowledge stores only canonical assignment references in `agent.knownResponsibilityAssignmentIds[]`. It does not copy assignment contents into Agent-private state.

World assignment existence does **not** imply every Agent knows it. An authored assignee receives references to their own authored assignments at DAY 0. Decision logic resolves responsibility only through that Agent’s private known refs; it must not inspect arbitrary World assignments as if they were known.

Completing one restock does not remove the durable World assignment or the assignee’s knowledge of it.

## Decision integration

Standing Responsibility does not provide a candidate source. `restockJobs(a)` / the existing restock production path remains the authority for whether a legal `restockContainer` candidate exists.

For an already-existing legal `restockContainer` option whose resource matches a known assignment, Standing Responsibility may append one bounded `standingResponsibility` contributor. v1 contribution is capped at `+8` and includes the canonical `assignmentId` for traceability.

Therefore responsibility cannot:

- create a resource shortage or objective necessity;
- create a `restockContainer` option when the Resources owner did not produce one;
- create or mutate an Action or Active Intent merely by being queried;
- make an infeasible restock legal;
- mirror or double-weight Routine, Learned Habit, Usage Habit, or Obligation truth.

## World Authoring and validation

`resourceResponsibilityAssignments[]` was introduced by `world-authoring-v16` and remains preserved by current `world-authoring-v17` alongside other World-level relation collections. The v17 Passage Yielding extension does not redefine Standing Responsibility semantics.

Current v1 validation fails loudly for:

- non-array relation storage;
- duplicate assignment IDs;
- duplicate assignment semantics;
- missing / non-Agent principals;
- unsupported responsibility kinds;
- invalid or unsupported resource scopes.

Canonicalization sorts assignments deterministically by assignment ID; clone / serialize / parse preserve the relation as World truth.

## Editor

The World Editor exposes the first bounded authoring surface in the selected Resident inspector under **長期責任**.

The UI is resident-centered for authoring convenience, but the mutation writes `resourceResponsibilityAssignments[]` at World level. It does not write responsibility truth into the resident object and does not introduce a generic Role / Household editor.

v1 only exposes Resources that are actually represented by authored restock-capable world content.

## Presentation

Resident View projects only assignments the selected Agent knows through `knownResponsibilityAssignmentIds[]`.

Debug Inspector exposes both sides of the boundary: canonical World assignments and the selected Agent’s known refs, including whether each ref resolves to canonical truth.

Presentation is read-only projection and must not repair, create, or mirror responsibility state.

## Version boundaries

- Standing Responsibility: `standing-responsibility-v1`
- Current World Authoring: `world-authoring-v17` (`resourceResponsibilityAssignments[]` introduced in v16)
- Current overall runtime / Presentation: `11.62.0-furniture-passage-yielding`
- Daily Life Routine remains `daily-life-routine-v1`
- Daily Life Learned Habit remains `daily-life-learned-habit-v1`
- generic Deliberation / Decision Evidence remains `11.48.1-sleep-perception-approach`

Those unchanged subsystem generations remain unchanged because Standing Responsibility consumes their stable boundaries rather than redefining their public contracts.
