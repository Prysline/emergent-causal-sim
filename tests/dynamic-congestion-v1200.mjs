import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of [
  'world-authoring-v1.js','world-initializer.js','world.js','spatial.js','spatial-v111.js','presentation-schema-v1140.js',
  'physical-schema-v1160.js','physical-runtime-v1160.js','spatial-passage-v1170.js',
  'locomotion-schema-v1190.js','locomotion-runtime-v1190.js','crowding-runtime-v1200.js',
  'engine.js'
])vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial,C=globalThis.SimCrowding;
const CURRENT_VERSION='11.20.0-dynamic-congestion';
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
assert.equal(C.VERSION,CURRENT_VERSION);
assert.equal(SP.CROWDING_VERSION,CURRENT_VERSION);

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

// B: a known narrow passage amplifies crowding, but unknown width never invents a hard capacity.
f=resetFixture({knownWidth:true});setOtherDirection(f,'stationary');
const narrow=C.getCrowdingProfile(f.st,f.mover,f.start,f.mid,'walk');
const narrowEdge=SP.traversalEdgeCost(f.st,f.start,f.mid,f.mover,'walk');
const unknownFixture=resetFixture({knownWidth:false});setOtherDirection(unknownFixture,'stationary');
const unknown=C.getCrowdingProfile(unknownFixture.st,unknownFixture.mover,unknownFixture.start,unknownFixture.mid,'walk');
assert.equal(unknown.widthKnown,false);
assert.equal(unknown.passageWidth,null);
assert.ok(narrow.congestionPressure>unknown.congestionPressure,'known narrow geometry should add maneuvering pressure');
assert.equal(unknown.hardBlocked,false);
assert.ok(Math.abs(narrowEdge-(1+narrow.congestionCost))<1e-9,'old occupiedCount fixed penalty must be replaced by canonical congestion cost');

// C: route planning reads a crowding snapshot and still finds a route through overlap.
f=resetFixture({knownWidth:true});setOtherDirection(f,'stationary');
const crowdedPlan=SP.planRoute(f.st,f.mover,f.goal,{mode:'auto',objective:'traversalCost'});
assert.equal(crowdedPlan.pathDistance,2);
assert.ok(crowdedPlan.path.length>0,'crowding must not make the corridor unreachable');
assert.ok(crowdedPlan.traversalCost>2,'crowding should raise objective route burden');
assert.ok(crowdedPlan.travelTime>2,'crowding should raise estimated executable travel time');
assert.ok(crowdedPlan.steps.some(step=>step.congestion?.occupantCount===1),'route steps should expose the planning-time crowding snapshot');

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

console.log('v11.20.0 Dynamic Congestion regression: ok');
