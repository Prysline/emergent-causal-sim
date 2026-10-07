# Debug Inspector information architecture + contextual diagnostics

## Scope

The original Debug Inspector slice changes Debug / Presentation observability only. The current `11.48.1-sleep-perception-approach` runtime separately changes Sleep semantics; this document only describes how the existing Inspector projects that new boundary without becoming a truth owner.

The overall runtime / `SimUI.PRESENTATION_VERSION` now follows `11.48.1-sleep-perception-approach`. `UI_OBSERVABILITY_CONTROLS_VERSION` remains `11.48.0-debug-replay-p1`; Debug Replay is an independent presentation module. The Inspector-only module marker is `SimUI.DEBUG_INSPECTOR_DIAGNOSTICS_VERSION = 11.48.1-debug-inspector-sleep-perception-approach`.

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

### Layout hierarchy and sticky navigation

Shared Overview sections remain above the Debug category navigation so repeated Agent / general Debug context is read before choosing a diagnostic domain. The category navigation is inserted immediately after the leading shared Overview sections and before domain-specific content.

The Resident / Debug mode toggle remains the first sticky layer at the top of the Inspector scroll container. The Debug category navigation is the second sticky layer and uses the measured mode-toggle height as its top offset, so it stays directly beneath the mode toggle without covering it. On narrow screens the category buttons scroll horizontally inside the toolbar while the native horizontal scrollbar is hidden.

Contextual domain diagnostics remain content below the category navigation. An active contextual diagnostic may stay visible while another category is selected, but it does not become a third persistent header.

Long structured Debug values such as Usage reasons / contributors, observation snapshots, placement proposals, and candidate contributors are summarized in the main layout and keep the complete raw value in collapsed `<details>` blocks. This is a presentation-only readability change; the raw projection is not removed or rewritten into a new truth source.

On mobile, contextual diagnostic key/value rows collapse to a single column and long structured values use wrapping inside the card instead of widening the Inspector or document viewport.

## Sleep preferred Slot conflict contextual diagnostic

When the selected Agent is in a current sleep preferred-Slot approach or formal conflict context, the Inspector prioritizes the same contextual diagnostic. It projects:

- preferred Slot and Usage-owned preference sources / contributors / strength,
- canonical current Spatial occupant explicitly labeled as Debug World projection,
- requester `Agent-context observation` as a separate current-derived probe,
- whether formal conflict has actually been established or the Action is still `approachPreferred`,
- current `conflictWaitSource`, `conflictWaitStartedTick`, and `conflictWaitUntilTick`,
- frozen conflict Decision Evidence when available,
- current Sleep resolver candidate probe,
- carry target / placement / cooperation context when returned by the resolver,
- current candidate rejection diagnostics where existing query boundaries can answer them.

Agent Carry candidate-time explanations consume `SimAgentCarry.candidateAttemptability(...)`. Full execution legality remains owned by Agent Carry and is not reimplemented here.

## Historical vs current-derived boundary

The UI renders two explicitly separated blocks:

- **Historical / adopted evidence** reads `currentConflictResolutionEvidence(...)` or the Agent's frozen `conflictResolutionEvidence`. It answers why the decision was adopted at that time.
- **Current-derived probe** calls `SimSleepConflict.conflictCandidates(...)` only after `observedPreferredSleepConflict(...)` succeeds. During unobserved `approachPreferred`, it shows the observation boundary and does not fabricate occupant-specific candidate ranking.

If historical evidence did not store a candidate rejection reason, the UI says so. It never fills a historical gap with a current-state recomputation.

No new persisted Debug truth is introduced.

## Regression boundary

Node coverage locks the presentation-only ownership, source ordering, labels, authority reuse, version boundaries, category-nav placement, second-layer sticky contract, collapsed structured values, and mobile single-column diagnostic layout. Browser coverage uses a controlled conflict fixture rather than a fixed emergent story, then checks desktop/mobile category switching, `All` completeness, shared-content-before-navigation ordering, sticky-layer offsets, contextual diagnostic visibility, historical/current labeling, validator cleanliness, internal category scrolling, and document/card overflow.
