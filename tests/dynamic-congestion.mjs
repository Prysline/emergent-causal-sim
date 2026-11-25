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
const CURRENT_VERSION=globalThis.SimRelease.VERSION;
const CROWDING_VERSION='11.31.0-crowding-8-direction';
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
for(const profile of [same,stationary,opposite])assert.equal(profile.hardBlocked,false,'Slice 4 congestion must remain soft');

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


// Independent reference for the former production per-approach traversalCost
// ranking. Do not replace its winning-route distance with shortest distance.
const batchSlotApproach=SP.bestSlotApproachNode;
function legacySlotApproach(st,slot,a,options={}){
  const {mode='walk',objective='traversalCost'}=options;
  if(objective!=='traversalCost'||!a)return batchSlotApproach(st,slot,a,options);
  const requested=globalThis.SimLocomotion?'auto':mode;
  const ranked=SP.slotApproachNodes(st,slot,a,mode).map(node=>{
    const route=SP.planRoute(st,a,node,{mode:requested,objective});
    return {node,value:route.traversalCost,pathDistance:route.pathDistance};
  }).filter(row=>Number.isFinite(row.value));
  ranked.sort((x,y)=>x.value-y.value||x.pathDistance-y.pathDistance||SP.nodeKey(st,x.node).localeCompare(SP.nodeKey(st,y.node)));
  return ranked[0]?.node||null;
}

function assertSlotParity(st,slot,a,label){
  const expected=legacySlotApproach(st,slot,a);
  assert.deepEqual(SP.bestSlotApproachNode(st,slot,a),expected,label);
  return expected;
}

// Controlled symmetric floor fixture: the Slot anchor itself is not a
// walkable route goal. Both approaches must be considered independently.
{
  const {st,mover,other}=resetFixture({knownWidth:false});
  st.map.boundaries={};st.doors={};st.objects={};st.sources={};st.structures={};
  for(const tile of Object.values(st.map.tiles))tile.walkable=false;
  for(const [x,y] of [[1,1],[1,2],[2,2],[3,2],[3,1]]){
    const tile=st.map.tiles[`${x},${y}`];tile.terrain='floor';tile.walkable=true;
  }
  other.offMap=true;mover.position=floor(st,2,2);
  const slot={position:{x:2,y:1},approachEdges:['east','west']};
  const west=floor(st,1,1),east=floor(st,3,1),approaches=SP.slotApproachNodes(st,slot,mover,'walk');
  assert.equal(approaches.length,2,'fixture must have two approach goals');
  const plan=node=>SP.planRoute(st,mover,node,{mode:'auto',objective:'traversalCost'});
  assert.equal(plan(west).traversalCost,plan(east).traversalCost,'symmetric goals must tie on traversal cost');
  assert.equal(plan(west).pathDistance,plan(east).pathDistance,'symmetric goals must tie on route distance');
  assert.ok(Number.isFinite(plan(west).traversalCost));
  const expectedKey=[west,east].sort((x,y)=>SP.nodeKey(st,x).localeCompare(SP.nodeKey(st,y)))[0];
  assert.deepEqual(assertSlotParity(st,slot,mover,'equal costs and distance retain nodeKey tie-break'),expectedKey);

  // A test-only congestion cost makes the nearer east goal tie with the
  // farther west goal. East must win by actual path distance, despite nodeKey.
  mover.position=floor(st,3,2);
  const extra=plan(west).traversalCost-plan(east).traversalCost;
  assert.ok(Number.isFinite(extra)&&extra>0);
  const originalCrowding=C.getCrowdingProfile;
  C.getCrowdingProfile=(state,agent,from,to,...args)=>{
    const profile=originalCrowding(state,agent,from,to,...args);
    return SP.nodeSame(state,to,east)?{...profile,congestionCost:profile.congestionCost+extra}:profile;
  };
  try{
    const w=plan(west),e=plan(east);
    assert.equal(w.traversalCost,e.traversalCost,'controlled equal-cost fixture');
    assert.ok(e.pathDistance<w.pathDistance,'the traversalCost-optimal paths must have different distances');
    assert.deepEqual(assertSlotParity(st,slot,mover,'equal cost must use the winning route distance'),east);
  }finally{C.getCrowdingProfile=originalCrowding;}

  // Change geometry in place between calls: no cross-query reachability cache.
  st.map.boundaries['0|h:3,2']={kind:'wall'};
  assert.equal(plan(east).traversalCost,Infinity);
  assert.deepEqual(assertSlotParity(st,slot,mover,'new boundary must invalidate east reachability'),west);
  st.map.boundaries['0|h:1,2']={kind:'wall'};
  assert.equal(assertSlotParity(st,slot,mover,'both approaches unreachable'),null);
}

// Controlled runtime geometry for multi-source Slot egress. The authored
// default home need not expose two human bed exits; this is a query fixture.
{
  const {st,mover:a,other}=resetFixture({knownWidth:false});
  st.map.boundaries={};st.doors={};st.objects={};st.sources={};st.structures={};
  for(const tile of Object.values(st.map.tiles))tile.walkable=false;
  for(const [x,y] of [[1,1],[3,1],[1,2],[2,2],[3,2],[1,3],[3,3]]){
    const tile=st.map.tiles[`${x},${y}`];tile.terrain='floor';tile.walkable=true;
  }
  const origin={id:'routeFixture:origin',position:{x:2,y:1},approachEdges:['east','west']};
  const target={id:'routeFixture:target',position:{x:2,y:3},approachEdges:['east','west']};
  st.furniture.routeFixture={id:'routeFixture',slots:[origin,target],spatial:{solids:[],surfaces:[]}};
  other.offMap=true;
  a.position={...origin.position};a.posture={kind:'lying',slotId:origin.id,furnitureId:'routeFixture'};
  const exits=SP.routeOriginsForAgent(st,a,'walk');
  assert.equal(exits.length,2,'controlled origin must expose two legal egress nodes');
  assert.equal(SP.slotApproachNodes(st,target,a,'walk').length,2);
  assert.ok(assertSlotParity(st,target,a,'slot-bound multi-source origins'));
  other.offMap=false;other.position={...exits[0]};other.posture={kind:'standing',slotId:null,furnitureId:null};
  assert.equal(SP.routeOriginsForAgent(st,a,'walk').length,1,'occupied egress must be excluded');
  assert.ok(assertSlotParity(st,target,a,'changed egress occupancy'));
  other.offMap=true;
  a.posture={kind:'standing',slotId:null,furnitureId:null};a.position={...exits[0]};
  // Define a valid, deliberately wider portable Object locally rather
  // than depending on the current authored scene's inventory or IDs.
  const P=globalThis.SimPhysical;
  const emptyEnvelope=P.getEffectiveTraversalEnvelope(st,a,'walk');
  const cargo={id:'routeFixture:cargo',name:'Route fixture cargo',portable:true,handling:{massKg:1,handsRequired:1,carryGeometry:{width:emptyEnvelope.clearanceWidth+.1,height:.3,length:.4}}};
  assert.ok(globalThis.SimObjectHandling.canHoldObject(st,a,cargo),'fixture actor must be able to hold the test Object');
  st.objects[cargo.id]=cargo;a.held=cargo.id;
  const loadedEnvelope=P.getEffectiveTraversalEnvelope(st,a,'walk');
  assert.equal(loadedEnvelope.carriedObjectId,cargo.id);
  assert.ok(loadedEnvelope.clearanceWidth>emptyEnvelope.clearanceWidth,'carry fixture must actually change the traversal envelope');
  assertSlotParity(st,target,a,'current carried Object envelope');
  a.held=null;cargo.position={...a.position};
  assert.deepEqual(P.getEffectiveTraversalEnvelope(st,a,'walk'),emptyEnvelope,'release must restore the current body-only envelope');
  assert.ok(assertSlotParity(st,target,a,'released carry envelope must be queried fresh'));
}

function measureTargetRouteWork(agentId,kind,selector=SP.bestSlotApproachNode){
  E.reset(20260911);
  const st=E.getState(),agent=st.agents[agentId];
  for(const other of Object.values(st.agents))if(other.id!==agent.id)other.offMap=true;
  const originalFeasibility=SP.traversalFeasibility;
  const originalPathDistance=SP.pathDistance;
  const originalBestSlotApproach=SP.bestSlotApproachNode;
  const metrics={agentId,kind,bestSlotApproachCalls:0,pathDistanceCalls:0,traversalFeasibilityCalls:0,targetCount:0,floorTargetCount:0};
  SP.traversalFeasibility=(...args)=>{metrics.traversalFeasibilityCalls++;return originalFeasibility(...args);};
  SP.pathDistance=(...args)=>{metrics.pathDistanceCalls++;return originalPathDistance(...args);};
  SP.bestSlotApproachNode=(...args)=>{metrics.bestSlotApproachCalls++;return selector(...args);};
  try{
    const targets=kind==='sleep'?SP.sleepTargets(st,agent):SP.restTargets(st,agent);
    metrics.targetCount=targets.length;
    metrics.floorTargetCount=targets.filter(target=>target.kind==='floor').length;
    return {metrics,targets};
  }finally{
    SP.traversalFeasibility=originalFeasibility;
    SP.pathDistance=originalPathDistance;
    SP.bestSlotApproachNode=originalBestSlotApproach;
  }
}

const targetCases=[['zhen','rest'],['zhen','sleep'],['orange','rest']];
const targetComparisons=targetCases.map(([agentId,kind])=>{
  const before=measureTargetRouteWork(agentId,kind,legacySlotApproach),after=measureTargetRouteWork(agentId,kind,batchSlotApproach);
  assert.deepEqual(after.targets,before.targets,agentId+' '+kind+' complete target ordering and scores must match');
  assert.ok(after.metrics.traversalFeasibilityCalls<=before.metrics.traversalFeasibilityCalls,agentId+' '+kind+' must not expand more feasibility edges');
  return {before:before.metrics,after:after.metrics};
});
assert.ok(targetComparisons.some(({before,after})=>after.traversalFeasibilityCalls<before.traversalFeasibilityCalls),'multi-goal workload must eliminate repeated edge feasibility work');
console.log('SLOT_APPROACH_BATCH_COMPARISON '+JSON.stringify(targetComparisons));
const targetRouteMetrics=targetComparisons.map(row=>row.after);
const [humanRestMetrics,humanSleepMetrics,catRestMetrics]=targetRouteMetrics;
for(const metrics of targetRouteMetrics)assert.equal(metrics.pathDistanceCalls,0,'rest / sleep target scoring must batch path-distance queries instead of calling standalone pathDistance per target');
assert.ok(humanRestMetrics.traversalFeasibilityCalls<2200,`Human rest target scoring regressed to ${humanRestMetrics.traversalFeasibilityCalls} feasibility calls`);
assert.ok(humanSleepMetrics.traversalFeasibilityCalls<650,`Human sleep target scoring regressed to ${humanSleepMetrics.traversalFeasibilityCalls} feasibility calls`);
assert.ok(catRestMetrics.floorTargetCount>20,'Cat rest fixture must exercise a broad floor-candidate set');
assert.ok(catRestMetrics.traversalFeasibilityCalls<2200,`Cat rest batch scoring regressed to ${catRestMetrics.traversalFeasibilityCalls} feasibility calls`);
console.log('TARGET_ROUTE_METRICS '+JSON.stringify(targetRouteMetrics));

// Actual production Engine target-selection lifecycle, not only helper parity.
for(const kind of ['sleep','rest']){
  function runSelection(selector){
    E.reset(20260911);
    const st=E.getState(),a=st.agents.zhen;
    for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
    a.action={kind,phase:'chooseSurface',started:st.tick,wait:0,restTicks:0,sleepTicks:0};
    a.needs.sleepNeed=85;a.needs.fatigue=70;
    const original=SP.bestSlotApproachNode;
    SP.bestSlotApproachNode=selector;
    try{E.tick();}finally{SP.bestSlotApproachNode=original;}
    assert.equal(a.action?.[kind==='sleep'?'sleepTarget':'restTarget']?.kind,'slot',kind+' must exercise a real Slot target consumer');
    return JSON.stringify(E.getState());
  }
  assert.equal(runSelection(batchSlotApproach),runSelection(legacySlotApproach),kind+' production tick must preserve canonical state and RNG');
}

console.log('Dynamic Congestion regression: ok');
