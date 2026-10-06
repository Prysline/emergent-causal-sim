import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync(new URL('../src/ui/observability-controls.js',import.meta.url),'utf8');
const engine=fs.readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');

assert.match(ui,/const VERSION='11\.48\.0-debug-replay-p1'/,'Debug Replay P1 must have an explicit UI observability generation marker');
assert.match(ui,/const SIMULATION_MINUTES_PER_TICK=2;/,'Debug Replay time conversion must declare the current canonical tick quantum it projects');
assert.match(engine,/state\.tick\+\+;state\.minute\+=2;/,'engine remains the canonical owner of the current 2-minute tick clock');
assert.doesNotMatch(ui,/E\.tick\s*=/,'Debug Replay must not replace the canonical runtime tick owner');
assert.match(ui,/UI\.isManualBatchIntermediate=\(\)=>!!debugRun\?\.intermediate\|\|priorManualBatchIntermediate\(\)/,'Debug Replay must compose with the existing intermediate-projection suppression contract');
assert.match(ui,/if\(context\.intermediate\)E\.tick\(\);else dispatchFinalStep\(\);/,'intermediate ticks must stay canonical while the final tick uses the existing single-step render owner');
assert.match(ui,/finalTick!==startTick\+total/,'Debug Replay must verify exact-stop tick count');
assert.match(ui,/delta%SIMULATION_MINUTES_PER_TICK!==0/,'Run to simulation time must reject targets that are not exactly reachable');
assert.match(ui,/target tick 必須大於目前 tick/,'Run to tick must reject current or past targets');
assert.match(ui,/目標 simulation time 必須晚於目前時間/,'Run to simulation time must reject current or past targets');
assert.match(ui,/addEventListener\('click',\(\)=>cancelDebugRun\('已重置'\),\{capture:true\}\)/,'Reset must invalidate the Debug Replay generation before the canonical reset handler runs');
assert.match(ui,/stopImmediatePropagation\(\)[\s\S]*runDebugTicks\(10/,'the legacy 10-step control must reuse the generic Debug Replay controller instead of owning another tick loop');
assert.doesNotMatch(ui,/checkpoint|restoreSnapshot|stepBack/i,'P1 must not smuggle checkpoint/Step Back semantics into fast-forward tooling');

console.log('debug replay P1 contract: single tick owner + exact-stop + cancellation boundaries pass');
