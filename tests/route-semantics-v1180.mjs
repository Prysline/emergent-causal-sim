import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world-authoring-v1.js','world-initializer.js','world.js','spatial.js','spatial-v111.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const W=globalThis.SimWorld,SP=globalThis.SimSpatial;
const st=W.createInitialState(11800);
SP.init(st);
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

assert.equal(SP.ROUTE_SEMANTICS_VERSION,'11.18.0-route-semantics-split');
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

console.log('v11.18.0 route semantics split regression: ok');
