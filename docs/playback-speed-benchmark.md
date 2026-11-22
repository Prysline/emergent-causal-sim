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

## GitHub Actions (opt-in Browser workflow job)

The canonical `.github/workflows/browser-regression.yml` retains its existing 20-case Browser matrix and also provides an isolated, **non-gating** `playback-benchmark` job. The benchmark runs automatically only for pull requests whose source branch begins `chore/playback-speed-benchmark-`, including PR #251. Regular PRs do not run this additional job.

It measures the default 10 full ticks for each of `700,350,175,87.5` ms, with and without the Agent Inspector. This is a measurement, not a pass/fail threshold for target speed. The runner uses Node.js 22, Playwright 1.55.0, Chromium and the existing local HTTP server. Its `continue-on-error` setting means a Benchmark failure cannot replace the canonical Node/Browser Merge Gate; inspect its own job logs and artifact rather than inferring success from the workflow summary alone.

Open the **Browser regression** workflow run under GitHub Actions, select the **Opt-in full-render autoplay measurement (non-gating)** job and download the `browser-playback-speed-benchmark-<run-id>-<attempt>` artifact. It contains `result.json` when measurement completes and `ci.log` even if the measurement fails.

Once these changes are on the repository's default branch, choose **Actions → Browser regression → Run workflow**, enable `playback_benchmark` and select `ticks` (`10`, `100`, `720`), `intervals`, and `selection`. Before merge, the PR-specific branch trigger is the way to run the benchmark on this head.

These figures describe GitHub-hosted runner throughput, not player device performance or a guarantee of visibly painted frames.

## Inspector cost boundary

When an Agent is displayed in readable **Resident** mode, heavy current-derived Intent / Sleep conflict Debug diagnostics are deferred. Switching to **Debug** immediately refreshes them against the current canonical state and keeps them updated each tick while Debug is visible. No extra World / Agent-private state cache or gameplay decision is introduced. This optimization targets invisible Debug work; Debug mode itself may still be expensive. Compare the same seed, case order and runner conditions when assessing before/after playback speed.

## Output and interpretation

The script writes `artifacts/browser-autoplay-speed-benchmark/result.json` and prints one `AUTOPLAY_SPEED_CASE` summary per test case. Each report includes the target interval, configured multiplier relative to the current 700-ms baseline, achieved start-to-start multiplier, timing distributions for `E.tick()`, synchronous `render()`, complete callbacks, and browser frame opportunities, plus long-task telemetry where supported.

It also checks exact tick count, full `stepOne()` invocation count, per-tick `render()` completion, two browser frame opportunities before the next tick, canonical state/RNG parity against direct `E.tick()` calls from the same seed, no page/console errors, and no stale extra tick after Reset.

The first autoplay callback includes the initial countdown, whereas the achieved multiplier uses **adjacent callback starts** to exclude this startup effect. A measured multiplier below a configured target is a valid benchmark outcome, not a test failure. The synchronous render timing excludes deferred MutationObserver/Inspector work and does not measure physical pixel presentation. `requestAnimationFrame` callbacks indicate rendering opportunities, **not a guarantee that a frame became visible**. For long-term smoothness, report stalls, long tasks, p95, and visible responsiveness separately from mean cadence.

This test is measurement tooling, not proof of stable 2×/4×/8× product playback. Any change to production speed controls, actual animation smoothness, or Rendering optimization requires a separate design/implementation gate.