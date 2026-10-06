# Debug Replay / Simulation Inspection P1

Status: PR implementation candidate. This document describes the P1 Debug / Presentation tooling contract; it does not create simulation truth.

## Scope

P1 adds three fast-forward operations to the existing simulator turn controls:

- `Run N`: execute exactly N future canonical ticks.
- `Run to tick`: execute until an explicit future `state.tick` and stop exactly there.
- `Run to simulation time`: convert a future canonical `day / minute` target into a tick count and stop exactly there.

The existing `10 步` shortcut uses the same generic fast-forward controller. `Step 1 tick` remains the existing synchronous single-step path.

## Truth and execution boundary

`SimEngine.tick` remains the only simulation tick owner. Debug Replay does not replace it, split a tick, mutate hook ordering, create a second clock, or persist a replay mirror in simulation state.

Each simulation tick remains synchronous and atomic. The UI may yield to the browser only between complete ticks. Intermediate fast-forward ticks may suppress expensive presentation refresh, but all normal simulation runtime hooks and after-tick observers still execute against canonical state.

The final target tick uses the existing single-step presentation path so the map, action cards, timeline, Inspector, mobile summary, and other projections all refresh from the same final canonical state.

## Simulation-time conversion

The current simulation clock advances by the existing canonical two-minute tick quantum. Debug Replay only projects that rule into input validation; it does not own a separate clock.

A simulation-time request must be exactly reachable from the current canonical `day / minute` on that tick lattice. If it is not exactly reachable, the request is rejected. P1 never rounds forward or backward.

Targets at or before the current tick/time are also rejected. They do not reset, wrap to another day, or invoke any backward-time behavior.

## Cancellation and mutual exclusion

A fast-forward run owns one UI-local generation token. Reset invalidates that token before the canonical reset path proceeds, so a stale continuation cannot execute an additional tick or final render after reset.

Fast-forward, the existing manual batch mechanism, and autoplay cannot own the tick source at the same time. Simulation-dependent controls are disabled while a Debug Replay run is active; Reset remains available.

Control disabled/inert state is restored to its pre-run values when the run completes or is cancelled rather than being blindly enabled.

## Determinism requirements

For the same initial state and seed, executing N ticks through Debug Replay must produce the same canonical state and `rngState` as N direct canonical `SimEngine.tick()` calls.

Regression coverage locks:

- exact tick count / no overdue extra tick;
- canonical state and RNG parity;
- intermediate projection suppression;
- exact target tick and simulation time;
- rejection of unreachable or non-future targets;
- Reset cancellation without stale continuation;
- reuse of the generic controller by the legacy 10-step shortcut;
- no second tick owner.

## Version boundary

P1 changes Debug / Presentation controls, not simulation semantics. The overall runtime / Presentation release marker remains `11.48.0-carrying-replanning`.

The directly changed observability-controls module generation is `11.48.0-debug-replay-p1`. Deliberation, Decision Evidence, Social Bid, Agent Carry, Physical, Spatial, Route, Locomotion, World Authoring, Furniture Catalog, and other unchanged subsystem generations do not receive formal version bumps.

## Explicitly out of scope

P1 does not implement:

- `Step Back`;
- checkpoint / restore;
- subsystem-local undo;
- timeline branching or editing history;
- run-until-condition / semantic breakpoints;
- save-game serialization changes.

Those capabilities require their own later contract and validation gates.
