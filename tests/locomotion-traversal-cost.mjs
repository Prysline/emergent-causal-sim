import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js',
  'systems/locomotion.js','engine.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,L=globalThis.SimLocomotion;
const APP_VERSION='11.28.0-furniture-local-geometry';
const ROUTE_VERSION='11.24.0-route-locomotion-cost';
const LOCOMOTION_VERSION='11.24.0-locomotion-objective-burden';
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

function resetFixture({detour='short',clearanceHeight=.70,posture='standing',kneelSpeed=null}={}){
  E.reset(12400);
  const st=E.getState(),human=st.agents.zhen;
  st.furniture={};st.containers={};st.sources={};st.doors={};
  st.map.boundaries={};st.map.passageConstraints={};
  for(const tile of Object.values(st.map.tiles||{})){
    tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];tile.surface={contents:{}};
  }
  const direct=[[1,3],[2,3],[3,3]];
  const shortDetour=[[1,4],[2,4],[3,4]];
  const longDetour=[[1,4],[1,5],[2,5],[3,5],[4,5],[4,4],[4,3]];
  const extra=detour==='short'?shortDetour:detour==='long'?longDetour:[];
  for(const [x,y] of [...direct,...extra]){
    const tile=st.map.tiles[`${x},${y}`];
    tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];tile.surface={contents:{}};
  }
  const start=floor(st,1,3),mid=floor(st,2,3),goal=floor(st,3,3);
  st.map.passageConstraints[SP.passageConstraintKey(st,start,mid)]={clearanceHeight};
  st.map.passageConstraints[SP.passageConstraintKey(st,mid,goal)]={clearanceHeight};
  human.position={...start};human.action=null;
  human.posture={kind:posture,slotId:null,furnitureId:null};
  human.locomotion={mode:null,phase:'idle'};
  if(kneelSpeed!==null)human.physical.locomotionProfiles.kneelCrawl.speedFactor=kneelSpeed;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  return {st,human,start,mid,goal};
}

E.reset(12400);
assert.equal(E.getState().version,APP_VERSION);
assert.equal(SP.ROUTE_SEMANTICS_VERSION,ROUTE_VERSION);
assert.equal(L.VERSION,LOCOMOTION_VERSION);

let f=resetFixture();
assert.equal(L.modeTraversalBurden(f.human,'walk'),0);
assert.equal(L.modeTraversalBurden(f.human,'kneelCrawl'),1);
assert.equal(L.modeTraversalBurden(f.human,'proneCrawl'),2);
assert.equal(L.modeTransitionBurden(f.human,'walk','proneCrawl'),1);
assert.equal(L.modeTransitionBurden(f.human,'proneCrawl','proneCrawl'),0);

// A: two-edge prone shortcut must not beat a four-edge walk detour only because it is shorter.
let shortest=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'pathDistance'});
let easiest=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'traversalCost'});
assert.equal(shortest.pathDistance,2);
assert.deepEqual(shortest.steps.map(step=>step.mode),['proneCrawl','proneCrawl']);
assert.equal(shortest.traversalCost,7,'selected short crawl path still reports its full objective burden');
assert.equal(shortest.travelTime,7,'pathDistance remains distinct from both cost and execution time');
assert.equal(easiest.pathDistance,4);
assert.deepEqual(easiest.steps.map(step=>step.mode),['walk','walk','walk','walk']);
assert.equal(easiest.traversalCost,4,'four normal walk edges should beat the objectively harder prone shortcut');
assert.equal(easiest.travelTime,4);

// B: sufficiently long walk detour can still lose to crawl when crawl has the lower total objective burden.
f=resetFixture({detour:'long'});
easiest=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'traversalCost'});
assert.equal(easiest.pathDistance,2);
assert.deepEqual(easiest.steps.map(step=>step.mode),['proneCrawl','proneCrawl']);
assert.equal(easiest.traversalCost,7);
assert.equal(easiest.travelTime,7);

// C: already being prone removes transition burden without making prone movement free.
f=resetFixture({detour:'none',posture:'prone'});
easiest=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'traversalCost'});
assert.deepEqual(easiest.steps.map(step=>step.mode),['proneCrawl','proneCrawl']);
assert.equal(easiest.transitionTicks,0);
assert.equal(easiest.traversalCost,6,'two prone edges pay mode burden but no duplicate transition burden');
assert.equal(easiest.travelTime,6);

// D: speedFactor remains timing truth; making kneel slower must not make the objectively harder prone mode win.
f=resetFixture({detour:'none',clearanceHeight:.95,kneelSpeed:.25});
assert.equal(L.edgeMoveTicks(f.human,'kneelCrawl'),4);
easiest=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'traversalCost'});
assert.deepEqual(easiest.steps.map(step=>step.mode),['kneelCrawl','kneelCrawl']);
assert.equal(easiest.traversalCost,5);
assert.equal(easiest.travelTime,9,'speed override changes executable time without silently redefining objective burden');

console.log('v11.24.0 locomotion traversal cost completeness regression: ok');
