# Debug Inspector information architecture + contextual diagnostics

## Scope

This slice changes Debug / Presentation observability only. It does not change simulation semantics, Sleep conflict calibration, Agent Carry legality, Spatial occupancy, Decision Evidence ownership, or any simulation subsystem generation.

The overall runtime / `SimUI.PRESENTATION_VERSION` remains `11.48.0-carrying-replanning`. `UI_OBSERVABILITY_CONTROLS_VERSION` remains `11.48.0-debug-replay-p1`; Debug Replay is an independent presentation module. The new Inspector-only module marker is `SimUI.DEBUG_INSPECTOR_DIAGNOSTICS_VERSION = 11.48.0-debug-inspector-contextual-diagnostics`.

## Debug views

Agent Debug Inspector reuses the existing `registerInspectorDecorator` lifecycle and adds seven projection filters:

- Overview
- Decision / Intent
- Execution / Physical
- World / Spatial
- Perception / Memory
- Social / Affect
- All

The selected view is presentation-local ephemeral state. It is not stored in simulation state. `All` shows every existing Debug Inspector section; filtering only toggles presentation visibility.

Existing section owners remain authoritative. The diagnostics layer classifies their rendered sections after the canonical Resident / Debug shell and subsystem decorators have been composed; it does not create a second Inspector framework.

## Sleep preferred Slot conflict contextual diagnostic

When the selected Agent is in a current sleep preferred-Slot conflict context, the Inspector prioritizes a Sleep conflict diagnostic. It projects:

- preferred Slot and Usage-owned preference sources / contributors / strength,
- canonical current Spatial occupant,
- current `conflictWaitSource`, `conflictWaitStartedTick`, and `conflictWaitUntilTick`,
- frozen conflict Decision Evidence when available,
- current Sleep resolver candidate probe,
- carry target / placement / cooperation context when returned by the resolver,
- current candidate rejection diagnostics where existing query boundaries can answer them.

Agent Carry candidate-time explanations consume `SimAgentCarry.candidateAttemptability(...)`. Full execution legality remains owned by Agent Carry and is not reimplemented here.

## Historical vs current-derived boundary

The UI renders two explicitly separated blocks:

- **Historical / adopted evidence** reads `currentConflictResolutionEvidence(...)` or the Agent's frozen `conflictResolutionEvidence`. It answers why the decision was adopted at that time.
- **Current-derived probe** calls the current `SimSleepConflict.conflictCandidates(...)` query. It answers what the resolver would currently see.

If historical evidence did not store a candidate rejection reason, the UI says so. It never fills a historical gap with a current-state recomputation.

No new persisted Debug truth is introduced.

## Regression boundary

Node coverage locks the presentation-only ownership, source ordering, labels, authority reuse, and version boundaries. Browser coverage uses a controlled conflict fixture rather than a fixed emergent story, then checks desktop/mobile category switching, `All` completeness, contextual diagnostic visibility, historical/current labeling, validator cleanliness, and mobile document overflow.
