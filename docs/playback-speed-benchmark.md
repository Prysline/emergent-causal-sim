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

## Output and interpretation

The script writes `artifacts/browser-autoplay-speed-benchmark/result.json` and prints one `AUTOPLAY_SPEED_CASE` summary per test case. Each report includes the target interval, configured multiplier relative to the current 700-ms baseline, achieved start-to-start multiplier, timing distributions for `E.tick()`, synchronous `render()`, complete callbacks, and browser frame opportunities, plus long-task telemetry where supported.

It also checks exact tick count, full `stepOne()` invocation count, per-tick `render()` completion, two browser frame opportunities before the next tick, canonical state/RNG parity against direct `E.tick()` calls from the same seed, no page/console errors, and no stale extra tick after Reset.

The first autoplay callback includes the initial countdown, whereas the achieved multiplier uses **adjacent callback starts** to exclude this startup effect. A measured multiplier below a configured target is a valid benchmark outcome, not a test failure. The synchronous render timing excludes deferred MutationObserver/Inspector work and does not measure physical pixel presentation. `requestAnimationFrame` callbacks indicate rendering opportunities, **not a guarantee that a frame became visible**. For long-term smoothness, report stalls, long tasks, p95, and visible responsiveness separately from mean cadence.

This test is measurement tooling, not proof of stable 2×/4×/8× product playback. Any change to production speed controls, actual animation smoothness, or Rendering optimization requires a separate design/implementation gate.