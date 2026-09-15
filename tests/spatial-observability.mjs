import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','spatial-v111.js','spatial-observability.js','engine.js','state-validator.js','state-validator-v111.js'])vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
const E=globalThis.SimEngine,SP=globalThis.SimSpatial;

E.reset(20260911);
const st=E.getState(),orange=st.agents.orange,zhen=st.agents.zhen;
assert.equal(st.version,'11.11.1-spatial-observability');
assert.equal(E.VERSION,'11.11.1-spatial-observability');

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
