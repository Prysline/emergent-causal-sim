# Playback Speed Benchmark v1 — opt-in measurement

Status: measurement-only. This document does **not** enable new playback speeds in the product.

## Goal and invariant

Compare the nominal completion-aware autoplay cadence of `700 ms/tick` against shorter intervals, while retaining **every** canonical `SimEngine.tick()` and **every** corresponding full `render()` call. A frame opportunity is checked between adjacent ticks. No batch intermediate-render suppression, time skipping, animation interpolation, or runtime-hook changes are introduced.

All cadence changes are temporary Playwright response substitutions of `src/ui/core.js`; the production file and user-facing default remain unchanged. The only modified literal is `AUTOPLAY_INTERVAL_MS`, and the test-only `stepOne()` probe surrounds the original synchronous `E.tick(); render();` sequence. Those anchors fail loudly if the production code changes.

## Usage

Start the repository HTTP server and ensure Playwright + Chromium are installed (the same prerequisites as the existing Browser regressions):

```sh
python3 -m http.server 4173
# In another shell, from repository root:
node tests/browser-autoplay-speed-benchmark.mjs
```

Default sample: 10 complete ticks at each nominal interval of `700,350,175,87.5` ms, once with no Inspector selection and once with the `zhen` Agent Inspector selected. The deterministic `20260911` seed is used for each case. For longer, **non-gating** runs, explicitly supply the desired tick horizon:

```sh
node tests/browser-autoplay-speed-benchmark.mjs --ticks=100 --selection=none
node tests/browser-autoplay-speed-benchmark.mjs --ticks=720 --intervals=700,350 --selection=none --timeout-ms=3600000
```

These longer runs may be expensive; no CI throughput guarantee is implied. Use matching hardware and browser environments for comparisons. The Benchmark runs as an **opt-in, non-gating job** within the existing Browser regression workflow. The original 20 Browser matrix cases and canonical Node regression remain intact.

## GitHub Actions (manual-only, non-gating)

The canonical `.github/workflows/browser-regression.yml` keeps its existing 20 Browser matrix cases and the separate, non-gating `playback-benchmark` job. **No pull request, push, or routine system change automatically executes this potentially long benchmark**. A normal pull request still runs the existing Browser matrix and Node regression as before.

After the workflow configuration has been merged into the repository's **default branch**, go to **Actions → Browser regression → Run workflow**, select the branch/commit to measure, enable `playback_benchmark` and choose `ticks` (`10`, `100`, or `720`), `intervals` and `selection`. With `playback_benchmark=true`, **only the Benchmark job runs**; the regular 20 Browser matrix suites are skipped. Leave the option disabled to invoke only the normal Browser suites.

The benchmark measures complete ticks and per-tick full `render()` with no time skipping. Its usual 10-tick profile covers `700,350,175,87.5` ms intervals, both with and without Agent Inspector selection. The runner uses Node.js 22, Playwright 1.55.0, Chromium and the usual local HTTP server. `continue-on-error` means a measurement failure is not a mandatory Merge Gate failure; always inspect its own logs and artifacts.

In the run, select the **Opt-in full-render autoplay measurement (non-gating)** job and download `browser-playback-speed-benchmark-<run-id>-<attempt>`. It contains `result.json` if measurement completes and `ci.log` even on failure. The initial Benchmark result from Draft PR #251 was gathered under an earlier PR-triggered exploratory configuration; that historical artifact remains valid evidence, but **the new manual-only CI routing cannot be exercised in GitHub Actions until its workflow is registered on `main`**.

The separate [Inspector optimization PR #253](https://github.com/Prysline/emergent-causal-sim/pull/253) handles deferred hidden Debug diagnostics; it is not part of this Benchmark tooling PR. Compare same seed, scenario, case order and runner conditions when evaluating before/after results. GitHub-hosted runner throughput does not establish player device performance or guarantee visible display paint.

## Validator cost-boundary comparison (short workload)

The existing `tests/browser-step-batch-performance-qa.mjs` is the short, regular Browser regression for canonical state parity, per-layer Validation cost and Spatial query attribution. The Memory Deliberation Validation correction removes eager `E.currentSocialTargetEvaluations()` calls from the ordinary validation layer; numeric legality is checked at the canonical `E.targetEvaluation()` computation entry instead. The QA asserts zero social-route Spatial queries attributed to `validation/layer:memory-deliberation`, without hardcoding a fixed emergent Action path. Before/after wall-clock comparisons should use identical fixture/seed and are CI-runner estimates, not player-device speed guarantees. Inspector Debug remains a separate cost owner and is not optimized by this fix.

## Resident Inspector hidden Debug cost boundary

The default Agent Inspector opens in the player-readable **Resident** mode. Its hidden Debug pane is not a reason to compute current-derived social target routes: the `memory.deliberation` Inspector decorator now calls `E.currentSocialTargetEvaluations()` only when `UI.isInspectorDebugMode()` is true. Entering Debug performs the evaluation on demand; subsequent visible Debug renders refresh it for the current tick. Returning to Resident suppresses further probes without persisting a route cache or altering any canonical World, Agent-private, Deliberation, or RNG state.

`tests/browser-memory-deliberation-qa.mjs` locks the absence of hidden Resident-mode route evaluations, Debug entry and per-tick refresh, switching back, state parity at mode entry, and existing social-target evidence on desktop/mobile. The optional `--selection=both` autoplay benchmark opens the readable Resident Inspector for its selected-Agent case; it does **not** activate Debug. Compare before/after with the same current-main source fixture and browser environment. The cost of actual Debug mode and Engine tick spikes remains separately measurable; no 2×/4×/8× guarantee is implied.

## Slot approach batch search (scoped optimization)

For a single Furniture Slot with multiple legal approach nodes, `bestSlotApproachNode(..., objective:'traversalCost')` shares one canonical multi-goal route search instead of separately expanding the same actor's route graph for each approach. Each goal's first settlement retains its traversal-cost-optimal path and that path's distance; the winner still uses traversal cost, winning-route distance, then canonical node key. Slot-bound origins, physical / dynamic crowding feasibility, current geometry, and non-traversalCost objectives remain unchanged. No result survives the synchronous query; this is not a cross-tick route cache or a change to sleep / rest / meal policy.

`tests/dynamic-congestion.mjs` compares against the previous per-candidate production route queries, including current-world mutation, equal-cost ranking, complete sleep/rest target lists and a real Engine selection tick. Its `SLOT_APPROACH_BATCH_COMPARISON` diagnostics compare directed-edge feasibility work for identical fixtures. Existing Node and Browser Merge Gates remain required. Query-count reduction does not establish wall-clock or achieved playback improvement; measure the exact head with the existing step-batch performance QA and use the opt-in autoplay benchmark for matched before/after runs when needed. The #1622 historical 10-tick results predate this change and the intervening food / pickup semantic changes. Tick 7/9 costs and formal playback controls are outside this slice.

## Output and interpretation

The script writes `artifacts/browser-autoplay-speed-benchmark/result.json` and prints one `AUTOPLAY_SPEED_CASE` summary per test case. Each report includes the target interval, configured multiplier relative to the current 700-ms baseline, achieved start-to-start multiplier, timing distributions for `E.tick()`, synchronous `render()`, complete callbacks, and browser frame opportunities, plus long-task telemetry where supported.

It also checks exact tick count, full `stepOne()` invocation count, per-tick `render()` completion, two browser frame opportunities before the next tick, canonical state/RNG parity against direct `E.tick()` calls from the same seed, no page/console errors, and no stale extra tick after Reset.

The first autoplay callback includes the initial countdown, whereas the achieved multiplier uses **adjacent callback starts** to exclude this startup effect. A measured multiplier below a configured target is a valid benchmark outcome, not a test failure. The synchronous render timing excludes deferred MutationObserver/Inspector work and does not measure physical pixel presentation. `requestAnimationFrame` callbacks indicate rendering opportunities, **not a guarantee that a frame became visible**. For long-term smoothness, report stalls, long tasks, p95, and visible responsiveness separately from mean cadence.

This test is measurement tooling, not proof of stable 2×/4×/8× product playback. Any change to production speed controls, actual animation smoothness, or Rendering optimization requires a separate design/implementation gate.
## Engine caller attribution (C1; opt-in)

Run `node tests/browser-engine-cost-attribution.mjs` against the same local HTTP server and Chromium setup as above. The independent `engine-caller-attribution.yml` runs only on PR changes to its own script/workflow or manual dispatch (after the workflow is on the default branch). No existing required regression job or runtime marker is changed.

Three rounds rotate minimal timing, caller counting, and detailed attribution; each runs ten real single-step/full-render ticks at the default seed. All nine cases must match the complete canonical state at every tick (including RNG, events, Action and Intent) and both instrumented modes must conserve query counts. Source interception fails closed on missing or non-unique anchors. No production files are modified.

The report records lexical Engine choose/start/step, registered providers, hooks, interaction and slot selection, internal route search, settled states and directed edge cache misses. Query counts are exclusive to the innermost scope, with unscoped counts explicit. Detailed mode records directed edge keys and inclusive scope timing: do not sum nested durations; compare count/minimal/detailed timing to estimate probe overhead. A repeated edge key is only a candidate for investigation, not evidence of equivalent geometry or redundant work. No fixed tick story, speed threshold or long-run playback claim is introduced.

Read `artifacts/browser-engine-cost-attribution/result.json` and `ci.log` (C1_CASE, C1_TICK_ATTRIBUTION). Tick 7/9 are diagnostic output, not hard-coded required behavior. This probe is not the full autoplay benchmark or a replacement for the canonical Node/Browser Merge Gate.
