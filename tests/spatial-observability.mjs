import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';
globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','engine.js','validation/registry.js','validation/rules/spatial-node.js']);
const E=globalThis.SimEngine,SP=globalThis.SimSpatial;

E.reset(20260911);
const st=E.getState(),orange=st.agents.orange,zhen=st.agents.zhen;
assert.equal(st.version,'11.22.1-editor-resident-capabilities');
assert.equal(E.VERSION,'11.22.1-editor-resident-capabilities');

let obs=SP.agentObservation(st,orange);
assert.equal(obs.surfaceId,'floor');
assert.equal(obs.surfaceLabel,'地板');
assert.equal(obs.spaceLabel,'主室');
assert.equal(obs.covered,false);
assert.equal(obs.walkable,true);
assert.match(obs.nodeKey,/\|floor\|2,6$/);

orange.position={...SP.normalizeNode(st,{x:5,y:2},'floor')};
obs=SP.agentObservation(st,orange);
assert.equal(obs.covered,true,'餐桌 footprint 下方應顯示 covered floor');
assert.equal(obs.overhead[0].id,'diningTable');
assert.equal(obs.clearance,.72);
assert.equal(obs.requiredClearance,.32);
assert.equal(obs.walkable,true,'Cat 在餐桌下 floor 可通行');

const humanUnder=SP.nodeObservation(st,{x:5,y:2,surfaceId:'floor'},zhen);
assert.equal(humanUnder.walkable,false,'Standing human 在相同 covered floor 不可通行');
assert.equal(humanUnder.requiredClearance,1.65);

orange.position={...SP.normalizeNode(st,{x:5,y:2},'diningTable:surface')};
orange.action={kind:'wander',phase:'move',spatialGoal:{...SP.normalizeNode(st,{x:6,y:2},'diningTable:surface')},lastPath:[SP.normalizeNode(st,{x:4,y:2},'floor'),SP.normalizeNode(st,{x:5,y:2},'diningTable:surface')]};
obs=SP.agentObservation(st,orange);
assert.equal(obs.surfaceId,'diningTable:surface');
assert.equal(obs.surfaceLabel,'餐桌桌面');
assert.equal(obs.covered,false,'桌面 node 不應被標成桌下 covered floor');
assert.equal(obs.spatialGoal.surfaceId,'diningTable:surface');
assert.equal(obs.lastPath.length,2);
assert.equal(obs.lastPath[0].surfaceId,'floor');
assert.equal(obs.lastPath[1].surfaceId,'diningTable:surface');
assert.equal(obs.routePlan.pathDistance,1,'current spatial goal route should expose selected-path topology distance');
assert.ok(Math.abs(obs.routePlan.traversalCost-1.1)<1e-9,'current spatial goal route should expose objective traversal cost');
assert.equal(obs.routePlan.travelTime,1,'current executable travel time is one tick for one walk edge');
assert.equal(SP.formatNode(st,orange.position),'主室・餐桌桌面 (5, 2)');

const tray=SP.objectObservation(st,'mealTray');
assert.equal(tray.surfaceId,'diningTable:surface','supported food 必須可觀測為桌面物件');
assert.equal(tray.supportId,'diningTable');
assert.equal(tray.position.x,5);
assert.equal(tray.position.y,2);

const table=SP.furnitureObservation(st,'diningTable');
assert.equal(table.surfaceId,'diningTable:surface');
assert.equal(table.traversable,true);
assert.equal(table.cells.length,4);
assert.equal(table.clearance,.72);

console.log('spatial observability contract passed');
