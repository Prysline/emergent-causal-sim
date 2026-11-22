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

These longer runs may be expensive; no CI throughput guarantee is implied. Use matching hardware and browser environments for comparisons. The dedicated benchmark workflow is **not** a required Merge Gate check; the existing Node and Browser regression workflows are unchanged.

## GitHub Actions (independent, non-gating)

The separate `.github/workflows/playback-speed-benchmark.yml` runs for pull requests that change the benchmark workflow, script, or this document. The PR profile runs the default 10 full ticks for each of `700,350,175,87.5` ms, with and without the Agent Inspector. It does not enforce any performance target. The runner uses Node.js 22, Playwright 1.55.0, Chromium, and the same local HTTP server as the existing Browser regression.

Open the **Playback Speed Benchmark (non-gating)** workflow run under GitHub Actions, and download the `playback-speed-benchmark-<run-id>-<attempt>` artifact. It contains `result.json` when the benchmark completes and `ci.log` even if the benchmark fails.

After this workflow exists on the repository's **default branch**, use **Actions → Playback Speed Benchmark → Run workflow** for the optional 100- or 720-tick profiles. Select the tick count, comma-separated nominal intervals, and Inspector selection. GitHub only permits `workflow_dispatch` to be manually triggered when the workflow file is present on the default branch; before merge, PR-triggered 10-tick measurement is the available entry point.

These figures describe GitHub-hosted runner throughput, not player device performance or a guarantee of visibly painted frames.

## Output and interpretation

The script writes `artifacts/browser-autoplay-speed-benchmark/result.json` and prints one `AUTOPLAY_SPEED_CASE` summary per test case. Each report includes the target interval, configured multiplier relative to the current 700-ms baseline, achieved start-to-start multiplier, timing distributions for `E.tick()`, synchronous `render()`, complete callbacks, and browser frame opportunities, plus long-task telemetry where supported.

It also checks exact tick count, full `stepOne()` invocation count, per-tick `render()` completion, two browser frame opportunities before the next tick, canonical state/RNG parity against direct `E.tick()` calls from the same seed, no page/console errors, and no stale extra tick after Reset.

The first autoplay callback includes the initial countdown, whereas the achieved multiplier uses **adjacent callback starts** to exclude this startup effect. A measured multiplier below a configured target is a valid benchmark outcome, not a test failure. The synchronous render timing excludes deferred MutationObserver/Inspector work and does not measure physical pixel presentation. `requestAnimationFrame` callbacks indicate rendering opportunities, **not a guarantee that a frame became visible**. For long-term smoothness, report stalls, long tasks, p95, and visible responsiveness separately from mean cadence.

This test is measurement tooling, not proof of stable 2×/4×/8× product playback. Any change to production speed controls, actual animation smoothness, or Rendering optimization requires a separate design/implementation gate.