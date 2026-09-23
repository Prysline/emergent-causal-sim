import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js',
  'systems/locomotion.js','crowding-runtime-v1200.js',
  'engine.js'
]);

const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial,C=globalThis.SimCrowding;
const CURRENT_VERSION='11.28.1-furniture-facing-semantics';
const CROWDING_VERSION='11.28.0-effective-passage-width';
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

function resetFixture({knownWidth=true}={}){
  E.reset(12000);
  const st=E.getState(),mover=st.agents.zhen,other=st.agents.zhou;
  for(const tile of Object.values(st.map.tiles||{})){
    tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];tile.surface={contents:{}};
  }
  for(const [x,y] of [[1,1],[2,1],[3,1]]){
    const tile=st.map.tiles[`${x},${y}`];tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];
  }
  st.furniture={};st.map.passageConstraints={};
  const start=floor(st,1,1),mid=floor(st,2,1),goal=floor(st,3,1);
  if(knownWidth)st.map.passageConstraints[SP.passageConstraintKey(st,start,mid)]={clearanceWidth:.8};
  mover.position={...start};mover.action=null;mover.posture={kind:'standing',slotId:null,furnitureId:null};mover.locomotion={mode:null,phase:'idle'};
  other.position={...mid};other.action=null;other.posture={kind:'standing',slotId:null,furnitureId:null};other.locomotion={mode:null,phase:'idle'};
  st.agents.orange.offMap=true;
  return {st,mover,other,start,mid,goal};
}
function setOtherDirection(f,kind){
  if(kind==='stationary'){f.other.action=null;f.other.locomotion={mode:null,phase:'idle'};return;}
  const next=kind==='same'?f.goal:f.start;
  f.other.action={kind:'wander',phase:'move',started:f.st.tick,wait:0,targetTile:{...next},lastPath:[{...f.mid},{...next}]};
  f.other.locomotion={mode:'walk',phase:'moving'};
}
function armWander(f){
  f.mover.action={kind:'wander',phase:'move',started:f.st.tick,wait:0,targetTile:{...f.goal},oneShot:true};
}

E.reset(12000);
assert.equal(E.getState().version,CURRENT_VERSION);
assert.equal(C.VERSION,CROWDING_VERSION);
assert.equal(SP.CROWDING_VERSION,CROWDING_VERSION);

// A: direction severity is soft and ordered; none of the cases becomes a hard block.
let f=resetFixture({knownWidth:true});
setOtherDirection(f,'same');
const same=C.getCrowdingProfile(f.st,f.mover,f.start,f.mid,'walk');
setOtherDirection(f,'stationary');
const stationary=C.getCrowdingProfile(f.st,f.mover,f.start,f.mid,'walk');
setOtherDirection(f,'opposite');
const opposite=C.getCrowdingProfile(f.st,f.mover,f.start,f.mid,'walk');

assert.equal(same.widthKnown,true);
assert.equal(same.passageWidth,.8);
assert.equal(same.occupantCount,1);
assert.equal(same.occupants[0].direction,'same');
assert.equal(stationary.occupants[0].direction,'stationary');
assert.equal(opposite.occupants[0].direction,'opposite');
assert.ok(same.congestionPressure<stationary.congestionPressure&&stationary.congestionPressure<opposite.congestionPressure,'same < stationary < opposite congestion severity');
assert.ok(same.congestionCost<stationary.congestionCost&&stationary.congestionCost<opposite.congestionCost);
assert.equal(same.delayTicks,0,'same-direction passing may remain fluid');
assert.equal(stationary.delayTicks,1,'narrow stationary encounter should cost one adjustment tick');
assert.equal(opposite.delayTicks,2,'narrow opposite flow should cost more adjustment time');
for(const profile of [same,stationary,opposite])assert.equal(profile.hardBlocked,false,'Slice 5 congestion must remain soft');

// B: metric geometry makes an unobstructed floor edge a known 1m opening; an authored .8m edge is narrower and adds more pressure.
f=resetFixture({knownWidth:true});setOtherDirection(f,'stationary');
const narrow=C.getCrowdingProfile(f.st,f.mover,f.start,f.mid,'walk');
const narrowEdge=SP.traversalEdgeCost(f.st,f.start,f.mid,f.mover,'walk');
const fullFixture=resetFixture({knownWidth:false});setOtherDirection(fullFixture,'stationary');
const full=C.getCrowdingProfile(fullFixture.st,fullFixture.mover,fullFixture.start,fullFixture.mid,'walk');
assert.equal(full.widthKnown,true);
assert.equal(full.passageWidth,1,'unobstructed 1m authored grid edge should expose its real metric width');
assert.ok(narrow.congestionPressure>full.congestionPressure,'narrower geometry should add maneuvering pressure');
assert.equal(full.hardBlocked,false);
assert.ok(Math.abs(narrowEdge-(1+narrow.congestionCost))<1e-9,'old occupiedCount fixed penalty must be replaced by canonical congestion cost');

// C: route planning reads a crowding snapshot and still finds a route through overlap.
f=resetFixture({knownWidth:true});setOtherDirection(f,'stationary');
const crowdedPlan=SP.planRoute(f.st,f.mover,f.goal,{mode:'auto',objective:'traversalCost'});
assert.equal(crowdedPlan.pathDistance,2);
assert.ok(crowdedPlan.path.length>0,'crowding must not make the corridor unreachable');
assert.ok(crowdedPlan.traversalCost>2,'crowding should raise objective route burden');
assert.ok(crowdedPlan.travelTime>2,'crowding should raise estimated executable travel time');
assert.ok(crowdedPlan.steps.some(step=>step.congestion?.occupantCount===1),'route steps should expose the planning-time crowding snapshot');

// C2: one route edge must reuse one physical feasibility snapshot across all candidate locomotion modes and crowding consumers.
f=resetFixture({knownWidth:true});setOtherDirection(f,'stationary');
const originalTraversalFeasibility=SP.traversalFeasibility;
let feasibilityCalls=0;
SP.traversalFeasibility=(...args)=>{feasibilityCalls++;return originalTraversalFeasibility(...args);};
try{
  const oneEdgePlan=SP.planRoute(f.st,f.mover,f.mid,{mode:'auto',objective:'traversalCost'});
  assert.equal(oneEdgePlan.pathDistance,1);
  assert.equal(feasibilityCalls,1,'one route edge should compute traversal feasibility once, then reuse the snapshot for all modes / crowding cost / timing');
}finally{
  SP.traversalFeasibility=originalTraversalFeasibility;
}

// D: execution replans from current congestion, so clearing the crowd can beat the earlier estimate.
const estimated=crowdedPlan.travelTime;
f.other.offMap=true;
armWander(f);
let arrivalTicks=0;
while(!SP.nodeSame(E.getState(),f.mover.position,f.goal)&&arrivalTicks<20){E.tick();arrivalTicks++;}
assert.ok(SP.nodeSame(E.getState(),f.mover.position,f.goal),'mover must still reach the goal');
assert.ok(arrivalTicks<estimated,`actual travel (${arrivalTicks}) should beat stale crowded estimate (${estimated}) after the crowd clears`);
assert.equal(arrivalTicks,2,'with the crowd gone before execution, two walk edges should again take two ticks');

// E: overlapping agents are still allowed; congestion gives the overlap a cost instead of collision/yield semantics.
f=resetFixture({knownWidth:false});
f.other.position={...f.start};
setOtherDirection(f,'same');
const overlap=C.getCrowdingProfile(f.st,f.mover,f.start,f.mid,'walk');
assert.equal(overlap.occupantCount,1);
assert.equal(overlap.hardBlocked,false);
assert.ok(overlap.congestionCost>0,'shared-node traffic should have a soft objective consequence');


function measureTargetRouteWork(agentId,kind){
  E.reset(20260911);
  const st=E.getState(),agent=st.agents[agentId];
  for(const other of Object.values(st.agents))if(other.id!==agent.id)other.offMap=true;
  const originalFeasibility=SP.traversalFeasibility;
  const originalPathDistance=SP.pathDistance;
  const originalBestSlotApproach=SP.bestSlotApproachNode;
  const metrics={agentId,kind,bestSlotApproachCalls:0,pathDistanceCalls:0,traversalFeasibilityCalls:0,targetCount:0,floorTargetCount:0};
  SP.traversalFeasibility=(...args)=>{metrics.traversalFeasibilityCalls++;return originalFeasibility(...args);};
  SP.pathDistance=(...args)=>{metrics.pathDistanceCalls++;return originalPathDistance(...args);};
  SP.bestSlotApproachNode=(...args)=>{metrics.bestSlotApproachCalls++;return originalBestSlotApproach(...args);};
  try{
    const targets=kind==='sleep'?SP.sleepTargets(st,agent):SP.restTargets(st,agent);
    metrics.targetCount=targets.length;
    metrics.floorTargetCount=targets.filter(target=>target.kind==='floor').length;
    return metrics;
  }finally{
    SP.traversalFeasibility=originalFeasibility;
    SP.pathDistance=originalPathDistance;
    SP.bestSlotApproachNode=originalBestSlotApproach;
  }
}

const targetRouteMetrics=[
  measureTargetRouteWork('zhen','rest'),
  measureTargetRouteWork('zhen','sleep'),
  measureTargetRouteWork('orange','rest')
];
const [humanRestMetrics,humanSleepMetrics,catRestMetrics]=targetRouteMetrics;
for(const metrics of targetRouteMetrics)assert.equal(metrics.pathDistanceCalls,0,'rest / sleep target scoring must batch path-distance queries instead of calling standalone pathDistance per target');
assert.ok(humanRestMetrics.traversalFeasibilityCalls<1800,`Human rest target scoring regressed to ${humanRestMetrics.traversalFeasibilityCalls} feasibility calls`);
assert.ok(humanSleepMetrics.traversalFeasibilityCalls<380,`Human sleep target scoring regressed to ${humanSleepMetrics.traversalFeasibilityCalls} feasibility calls`);
assert.ok(catRestMetrics.floorTargetCount>20,'Cat rest fixture must exercise a broad floor-candidate set');
assert.ok(catRestMetrics.traversalFeasibilityCalls<1000,`Cat rest batch scoring regressed to ${catRestMetrics.traversalFeasibilityCalls} feasibility calls`);
console.log('TARGET_ROUTE_METRICS '+JSON.stringify(targetRouteMetrics));

console.log('v11.20.0 Dynamic Congestion regression: ok');
