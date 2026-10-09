import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadInitialStateProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','systems/resources.js','systems/agent-carry.js','systems/physical.js','systems/locomotion.js']);

const A=globalThis.SimWorldAuthoring,W=globalThis.SimWorld,L=globalThis.SimLocomotion;
assert.equal(W.VERSION,'11.52.0-daily-life-routine');
assert.equal(L.VERSION,'11.50.1-prone-transition-burden');
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
