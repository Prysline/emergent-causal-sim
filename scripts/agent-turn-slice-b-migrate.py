from pathlib import Path

OLD_RELEASE = "11.49.0-agent-facing-foundation"
NEW_RELEASE = "11.50.0-agent-turn-execution"
OLD_SHORT = "v11.49.0"
NEW_SHORT = "v11.50.0"
OLD_LOCOMOTION = "11.38.0-carried-handling-risk"
NEW_LOCOMOTION = NEW_RELEASE


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_once(text, old, new, path):
    if old not in text:
        raise SystemExit(f"missing expected text in {path}: {old!r}")
    return text.replace(old, new, 1)


# Runtime canonical direction bridge: reference the World Authoring frozen representation.
path = "src/world.js"
text = read(path)
text = replace_once(
    text,
    "    WORLD_SCHEMA_VERSION,WIDTH,HEIGHT,RESOURCE_TYPES,SPECIES_PROFILES,ZH,DATA_ZH,createInitialState,createInitialStateFromAuthoring,",
    "    WORLD_SCHEMA_VERSION,AGENT_FACING_DIRECTIONS:A.AGENT_FACING_DIRECTIONS,WIDTH,HEIGHT,RESOURCE_TYPES,SPECIES_PROFILES,ZH,DATA_ZH,createInitialState,createInitialStateFromAuthoring,",
    path,
)
write(path, text)

# Locomotion owns explicit turn execution and deterministic unitless angular burden.
path = "src/systems/locomotion.js"
text = read(path)
text = replace_once(text, f"const VERSION='{OLD_LOCOMOTION}';", f"const VERSION='{NEW_LOCOMOTION}';", path)
text = replace_once(
    text,
    "  const MODE_TRAVERSAL_BURDEN=Object.freeze({walk:0,kneelCrawl:1,proneCrawl:2});",
    "  const FACING_DIRECTIONS=W.AGENT_FACING_DIRECTIONS;if(!Array.isArray(FACING_DIRECTIONS)||FACING_DIRECTIONS.length!==8)throw new Error('systems/locomotion.js requires canonical Agent facing directions from world.js.');\n  const FACING_INDEX=new Map(FACING_DIRECTIONS.map((direction,index)=>[direction,index]));\n  const ANGULAR_BURDEN_BY_DELTA=Object.freeze({0:0,45:1,90:2,135:3,180:4});\n  const MODE_TRAVERSAL_BURDEN=Object.freeze({walk:0,kneelCrawl:1,proneCrawl:2});",
    path,
)
text = replace_once(
    text,
    "  function transitionTicks(fromMode,toMode){return fromMode===toMode?0:1;}",
    "  function assertFacing(facing,label='facing'){if(!FACING_INDEX.has(facing))throw new Error(`Invalid ${label}: ${String(facing)}`);return facing;}\n  function angularDelta(fromFacing,toFacing){assertFacing(fromFacing,'fromFacing');assertFacing(toFacing,'toFacing');const raw=Math.abs(FACING_INDEX.get(fromFacing)-FACING_INDEX.get(toFacing)),steps=Math.min(raw,FACING_DIRECTIONS.length-raw);return steps*45;}\n  function angularCost(fromFacing,toFacing){const delta=angularDelta(fromFacing,toFacing),cost=ANGULAR_BURDEN_BY_DELTA[delta];if(!Number.isFinite(cost))throw new Error(`Unsupported angular delta: ${delta}`);return cost;}\n  function beginTurnExecution(agent,toFacing){if(!agent)throw new Error('Turn execution requires an Agent.');const fromFacing=assertFacing(agent.facing,'Agent.facing');assertFacing(toFacing,'toFacing');const delta=angularDelta(fromFacing,toFacing);return Object.freeze({kind:'turn',fromFacing,toFacing,angularDelta:delta,angularCost:angularCost(fromFacing,toFacing)});}\n  function completeTurnExecution(agent,evidence,{succeeded=true}={}){if(!agent)throw new Error('Turn completion requires an Agent.');if(!evidence||evidence.kind!=='turn')throw new Error('Turn completion requires turn execution evidence.');const fromFacing=assertFacing(evidence.fromFacing,'evidence.fromFacing'),toFacing=assertFacing(evidence.toFacing,'evidence.toFacing'),delta=angularDelta(fromFacing,toFacing),cost=angularCost(fromFacing,toFacing);if(evidence.angularDelta!==delta||evidence.angularCost!==cost)throw new Error('Turn execution evidence does not match canonical angular burden.');if(agent.facing!==fromFacing)throw new Error(`Stale turn execution evidence: Agent.facing=${String(agent.facing)}, fromFacing=${fromFacing}.`);const ok=succeeded===true;if(ok)agent.facing=toFacing;return Object.freeze({...evidence,completed:true,succeeded:ok});}\n  function transitionTicks(fromMode,toMode){return fromMode===toMode?0:1;}",
    path,
)
text = replace_once(
    text,
    "  window.SimLocomotion={VERSION,POSTURE_BY_MODE,MODE_BY_POSTURE,MODE_TRAVERSAL_BURDEN,MODE_TRANSITION_BURDEN,SURFACE_TRAVERSAL_BURDEN_BY_KIND,SURFACE_MANEUVER_BURDEN_BY_KIND,postureForMode,modeFromPosture,transitionTicks,movementTiming,edgeMoveTicks,modeTraversalBurden,modeTransitionBurden,isSurfaceManeuver,surfaceManeuverKey,surfaceTraversalBurden,surfaceManeuverBurden,surfaceManeuverTiming,selectSurfaceManeuver,HANDLING_EXPOSURE_BY_MODE,HANDLING_EXPOSURE_BY_MANEUVER,HANDLING_EXPOSURE_BY_VERTICAL_DIRECTION,handlingExposureForEdge,executeSurfaceManeuver,modeLabel,setState,clearState};",
    "  window.SimLocomotion={VERSION,FACING_DIRECTIONS,ANGULAR_BURDEN_BY_DELTA,POSTURE_BY_MODE,MODE_BY_POSTURE,MODE_TRAVERSAL_BURDEN,MODE_TRANSITION_BURDEN,SURFACE_TRAVERSAL_BURDEN_BY_KIND,SURFACE_MANEUVER_BURDEN_BY_KIND,postureForMode,modeFromPosture,angularDelta,angularCost,beginTurnExecution,completeTurnExecution,transitionTicks,movementTiming,edgeMoveTicks,modeTraversalBurden,modeTransitionBurden,isSurfaceManeuver,surfaceManeuverKey,surfaceTraversalBurden,surfaceManeuverBurden,surfaceManeuverTiming,selectSurfaceManeuver,HANDLING_EXPOSURE_BY_MODE,HANDLING_EXPOSURE_BY_MANEUVER,HANDLING_EXPOSURE_BY_VERTICAL_DIRECTION,handlingExposureForEdge,executeSurfaceManeuver,modeLabel,setState,clearState};",
    path,
)
write(path, text)

# Overall / Presentation release marker.
path = "src/release.js"
text = read(path)
text = replace_once(text, OLD_RELEASE, NEW_RELEASE, path)
write(path, text)

# Current-release assertions in tests. This intentionally does not alter subsystem markers
# other than Locomotion's own generation.
for path_obj in Path("tests").rglob("*.mjs"):
    text = path_obj.read_text()
    new = text.replace(OLD_RELEASE, NEW_RELEASE).replace(OLD_SHORT, NEW_SHORT)
    if OLD_LOCOMOTION in new:
        new = new.replace(OLD_LOCOMOTION, NEW_LOCOMOTION)
    if new != text:
        path_obj.write_text(new)

# Dedicated Slice B regression.
turn_test = '''import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadInitialStateProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','systems/resources.js','systems/agent-carry.js','systems/physical.js','systems/locomotion.js']);

const A=globalThis.SimWorldAuthoring,W=globalThis.SimWorld,L=globalThis.SimLocomotion;
assert.equal(W.VERSION,'11.50.0-agent-turn-execution');
assert.equal(L.VERSION,'11.50.0-agent-turn-execution');
assert.strictEqual(W.AGENT_FACING_DIRECTIONS,A.AGENT_FACING_DIRECTIONS,'runtime World must reference the canonical authored facing representation');
assert.strictEqual(L.FACING_DIRECTIONS,W.AGENT_FACING_DIRECTIONS,'Locomotion must consume the same canonical facing representation');
assert.deepEqual(L.ANGULAR_BURDEN_BY_DELTA,{0:0,45:1,90:2,135:3,180:4});

const st=W.createInitialState(49),agent=st.agents.zhen;
agent.facing='north';
const samples=[['northEast',45,1],['east',90,2],['southEast',135,3],['south',180,4],['west',90,2],['northWest',45,1]];
for(const [toFacing,delta,cost] of samples){
  assert.equal(L.angularDelta('north',toFacing),delta,toFacing+' angular delta');
  assert.equal(L.angularCost('north',toFacing),cost,toFacing+' angular cost');
}
assert.ok(L.angularCost('north','northEast')<L.angularCost('north','east'));
assert.ok(L.angularCost('north','east')<L.angularCost('north','southEast'));
assert.ok(L.angularCost('north','southEast')<L.angularCost('north','south'));

const positionBefore={...agent.position};
const pending=L.beginTurnExecution(agent,'east');
assert.deepEqual(pending,{kind:'turn',fromFacing:'north',toFacing:'east',angularDelta:90,angularCost:2});
assert.ok(Object.isFrozen(pending));
assert.equal(agent.facing,'north','beginning a turn must not commit canonical facing');
assert.deepEqual(agent.position,positionBefore,'turn preparation must not move the Agent');

const failed=L.completeTurnExecution(agent,pending,{succeeded:false});
assert.equal(failed.completed,true);
assert.equal(failed.succeeded,false);
assert.equal(agent.facing,'north','failed turn completion must not commit canonical facing');

const completed=L.completeTurnExecution(agent,L.beginTurnExecution(agent,'east'));
assert.equal(completed.completed,true);
assert.equal(completed.succeeded,true);
assert.equal(agent.facing,'east','successful completion is the canonical facing commit point');
assert.deepEqual(agent.position,positionBefore,'turn completion must not imply movement');

const tickStartFacing=agent.facing;
const laterTurn=L.beginTurnExecution(agent,'south');
assert.equal(tickStartFacing,'east','tick-start facing snapshots remain ordinary values and are not retroactively rewritten');
assert.equal(agent.facing,'east');
L.completeTurnExecution(agent,laterTurn);
assert.equal(agent.facing,'south');
assert.equal(tickStartFacing,'east','a completed turn cannot rewrite an already captured same-tick orientation snapshot');

const stale=L.beginTurnExecution(agent,'west');
L.completeTurnExecution(agent,L.beginTurnExecution(agent,'southWest'));
assert.throws(()=>L.completeTurnExecution(agent,stale),/Stale turn execution evidence/,'stale evidence must not overwrite a newer canonical facing');
assert.equal(agent.facing,'southWest');

const forged={...L.beginTurnExecution(agent,'north'),angularCost:999};
assert.throws(()=>L.completeTurnExecution(agent,forged),/does not match canonical angular burden/);
assert.throws(()=>L.beginTurnExecution(agent,'up'),/Invalid toFacing/);
assert.equal(agent.facing,'southWest');

console.log('agent turn execution: ok');
'''
Path('tests/agent-turn-execution.mjs').write_text(turn_test)

# README current release summary only.
path = 'README.md'
text = read(path)
text = replace_once(text, f'目前 runtime marker：**{OLD_SHORT}・Agent facing foundation** (`{OLD_RELEASE}`)。', f'目前 runtime marker：**{NEW_SHORT}・Agent turn execution** (`{NEW_RELEASE}`)。', path)
write(path, text)

# Versioning current section + new release contract; preserve Slice A as history.
path = 'docs/versioning.md'
text = read(path)
text = replace_once(text, f'`{OLD_RELEASE}`\n\nCurrent release: World Authoring now requires explicit resident `initial.facing`, and runtime Agent state carries the same canonical body orientation as an independent 8-direction fact. Slice A does not derive facing from movement or Furniture orientation and does not implement turning, FOV / LOS, auditory / tactile perception, or turn cost.', f'`{NEW_RELEASE}`\n\nCurrent release: Locomotion now owns explicit Agent turn execution. Turn preparation records deterministic unitless angular burden without changing canonical `Agent.facing`; only successful completion commits the new facing. The P1 45°-step burden is a centralized baseline, not tick/seconds duration or final physical calibration. Route optimization, forward/backward/strafe policy, Visual / Auditory / Tactile implementation and micro-time scheduling remain out of scope.\n\nPrevious release: `{OLD_RELEASE}` established canonical authored/runtime facing.', path)
text = replace_once(text, f'目前 current runtime marker：\n\n`{OLD_RELEASE}`', f'目前 current runtime marker：\n\n`{NEW_RELEASE}`', path)
text = replace_once(text, f'玩家可見的 app 頁首 current-version display 使用短版 `{OLD_SHORT}`', f'玩家可見的 app 頁首 current-version display 使用短版 `{NEW_SHORT}`', path)
text = replace_once(text, f'Locomotion `{OLD_LOCOMOTION}`；Dynamic Congestion', f'Locomotion `{NEW_LOCOMOTION}`；Dynamic Congestion', path)
text = replace_once(text, '### Current Agent facing foundation release', '''### Current Agent turn execution release

`11.50.0-agent-turn-execution` 建立 Perception / Agent Orientation Slice B 的 turn execution foundation。`SimWorld.AGENT_FACING_DIRECTIONS` 只引用 World Authoring 的 frozen 8-direction canonical representation；`SimLocomotion` 由同一 authority 計算 shortest angular delta，並以集中式 `ANGULAR_BURDEN_BY_DELTA` 提供 P1 unitless baseline：0°/45°/90°/135°/180° → 0/1/2/3/4。這些值只保留 deterministic monotonic burden，不代表 tick、秒數或最終 physical calibration。

`beginTurnExecution(agent,toFacing)` 只建立 frozen `fromFacing / toFacing / angularDelta / angularCost` evidence，不修改 Agent。`completeTurnExecution(...)` 會重新驗證 evidence 與 current `Agent.facing`；只有 `succeeded === true` 才 commit canonical facing，failed 或尚未完成的 execution 都不提前改 facing，stale / forged evidence 明確失敗。Turn 不改 position，也沒有把 movement direction、interaction target 或 Presentation 變成 facing authority。

Same-tick perception contract 不變：本 Slice 不新增 runtime hook，也不實作 Visual perception；未來一般 perception 必須使用 tick-start canonical facing snapshot，本 tick 才完成的 turn 不得回寫已形成的同 tick observation。Route turn-aware cost、forward/backward/strafe locomotion policy、maneuver planner、Visual / Auditory / Tactile 與 micro-time scheduler 均 deferred。

Version impact：overall / Presentation、Locomotion → `11.50.0-agent-turn-execution`；World Authoring 維持 `world-authoring-v12`。Spatial Traversal / Route 維持 `11.38.0-carried-handling-risk`；Physical、Agent Carry、Social Bid、Spatial Passage、Deliberation / Decision Evidence / Sleep Slot Conflict、Memory / Usage、Affect、Contact、Dynamic Congestion、Furniture Catalog、Embodiment Capabilities 均未改 contract，不假升。

### Previous Agent facing foundation release''', path)
write(path, text)

# Cross-system docs: only refresh the current orientation contract at the top.
path = 'docs/architecture.md'
text = read(path)
text = replace_once(text, f'> Current `{OLD_RELEASE}`: World Authoring requires explicit 8-direction `initial.facing`; runtime `Agent.facing` is the sole canonical body orientation. Facing is independent of movement direction, and Slice A adds no turning, FOV / LOS, auditory / tactile, or perception-hook semantics.', f'> Previous `{OLD_RELEASE}`: World Authoring requires explicit 8-direction `initial.facing`; runtime `Agent.facing` is the sole canonical body orientation. Facing is independent of movement direction.\n\n> Current `{NEW_RELEASE}`: Locomotion owns explicit turn execution and unitless deterministic angular burden. Begin records evidence without changing facing; only successful completion commits canonical `Agent.facing`. Position updates, movement direction, interaction targets and Presentation remain non-authoritative. No turn-aware route policy, Visual / Auditory / Tactile implementation, new runtime hook or micro-time scheduler is introduced.', path)
text = replace_once(text, '目前 runtime marker：`11.48.1-sleep-perception-approach`。', f'目前 runtime marker：`{NEW_RELEASE}`。', path)
write(path, text)

path = 'docs/tick-pipeline.md'
text = read(path)
needle = f'> Current `{OLD_RELEASE}`:'
if needle in text:
    text = text.replace(needle, f'> Previous `{OLD_RELEASE}`:', 1)
insert_after = f'> Previous `{OLD_RELEASE}`'
idx = text.find(insert_after)
if idx >= 0:
    end = text.find('\n\n', idx)
    if end >= 0:
        note = f'\n\n> Current `{NEW_RELEASE}`: turn execution adds no runtime hook or phase. `beginTurnExecution()` is non-mutating evidence construction; successful `completeTurnExecution()` is the sole turn commit point. Same-tick Visual remains a future consumer obligation: perception must snapshot canonical facing at tick start rather than reread a later same-tick turn result.'
        text = text[:end] + note + text[end:]
write(path, text)

print('Agent turn Slice B migration applied.')
