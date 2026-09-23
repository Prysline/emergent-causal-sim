import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadInitialStateProfile(['world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js']);

const W=globalThis.SimWorld,SP=globalThis.SimSpatial;
const st=W.createInitialState(11800);
const actor=st.agents.zhen;
actor.position={...SP.normalizeNode(st,{x:1,y:3},'floor')};
st.agents.zhou.offMap=true;
st.agents.orange.offMap=true;
st.furniture={};
st.containers={};
st.sources={};

const allowed=new Set([
  '1,3','2,3','3,3','4,3','5,3',
  '1,4','2,4','3,4','4,4','5,4'
]);
for(const tile of Object.values(st.map.tiles)){
  const k=`${tile.x},${tile.y}`;
  tile.walkable=allowed.has(k);
  tile.terrain=tile.walkable?'floor':'wall';
  tile.surface={contents:{}};
}
for(const x of [2,3,4])st.map.tiles[`${x},3`].surface.contents.water=50;

const goal=SP.normalizeNode(st,{x:5,y:3},'floor');
const shortest=SP.planRoute(st,actor,goal,{mode:'walk',objective:'pathDistance'});
const easiest=SP.planRoute(st,actor,goal,{mode:'walk',objective:'traversalCost'});

assert.equal(SP.ROUTE_SEMANTICS_VERSION,'11.24.0-route-locomotion-cost');
assert.equal(shortest.pathDistance,4,'shortest feasible topology route should be four edges');
assert.equal(shortest.travelTime,4,'current executable travel time is one tick per selected walk edge');
assert.ok(Math.abs(shortest.traversalCost-14.5)<1e-9,`short route cost expected 14.5, got ${shortest.traversalCost}`);
assert.ok(shortest.path.every(p=>p.y===3),'pathDistance objective should take the direct wet corridor');

assert.equal(easiest.pathDistance,6,'lowest-burden route may be longer than the shortest route');
assert.equal(easiest.traversalCost,6,'dry detour should cost six');
assert.equal(easiest.travelTime,6,'current executable travel time should match six selected walk edges');
assert.ok(easiest.path.some(p=>p.y===4),'traversalCost objective should use the longer dry detour');

assert.equal(SP.pathDistance(st,actor,goal),4,'standalone pathDistance must answer shortest feasible topology distance');
assert.equal(SP.traversalCost(st,actor,goal),6,'standalone traversalCost must answer minimum objective route burden');
assert.equal(SP.pathCost(st,actor,goal),6,'legacy pathCost compatibility alias must preserve traversal-cost semantics');
assert.equal(SP.travelTime(st,actor,goal),6,'standalone travelTime follows the default executable traversal-cost route');
assert.deepEqual(SP.astar(st,actor.position,goal,actor.id),easiest.path,'existing A* compatibility surface must retain traversal-cost route choice');
assert.throws(()=>SP.planRoute(st,actor,goal,{mode:'proneCrawl'}),/supports walk only/,'Slice 3 must not silently turn crawl feasibility into execution');

const batchGoals=[
  goal,
  SP.normalizeNode(st,{x:5,y:4},'floor'),
  SP.normalizeNode(st,{x:10,y:7},'floor')
];
assert.deepEqual(
  SP.pathDistances(st,actor,batchGoals,{mode:'walk'}),
  batchGoals.map(target=>SP.pathDistance(st,actor,target)),
  'batch pathDistances must preserve standalone pathDistance results for reachable and unreachable goals'
);

assert.equal(SP.pathDistance(st,actor,goal),4,'pre-mutation route must still use the four-edge direct corridor');
st.furniture.runtimeBlocker={
  id:'runtimeBlocker',
  spatial:{solids:[{key:'body',layerZ:0,bounds:{x:3,y:3,z:0,width:1,depth:1,height:2}}]}
};
assert.equal(
  SP.pathDistance(st,actor,goal),
  6,
  'route-scope geometry memoization must expire between searches so in-place Furniture mutation is visible immediately'
);
delete st.furniture.runtimeBlocker;

console.log('v11.24.0 route locomotion cost regression: ok');
