import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js',
  'systems/locomotion.js','crowding-runtime-v1200.js',
  'engine.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,C=globalThis.SimCrowding,L=globalThis.SimLocomotion;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const approx=(actual,expected,msg)=>assert.ok(Math.abs(actual-expected)<1e-9,`${msg}: expected ${expected}, got ${actual}`);

function openArea(){
  E.reset(20260926);
  const st=E.getState(),mover=st.agents.zhen,other=st.agents.zhou;
  for(const tile of Object.values(st.map.tiles||{})){tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];}
  for(let y=1;y<=3;y++)for(let x=1;x<=3;x++){
    const tile=st.map.tiles[`${x},${y}`];tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];
  }
  st.furniture={};st.map.boundaries={};st.doors={};st.map.passageConstraints={};
  for(const c of Object.values(st.containers||{}))if(c.position)c.position={x:7,y:4};
  for(const source of Object.values(st.sources||{}))if(source.position)source.position={x:7,y:4};
  for(const a of Object.values(st.agents))if(a.id!==mover.id&&a.id!==other.id)a.offMap=true;
  mover.offMap=false;mover.position=floor(st,1,1);mover.action=null;mover.posture={kind:'standing',slotId:null,furnitureId:null};mover.locomotion={mode:null,phase:'idle'};
  other.offMap=false;other.position=floor(st,1,2);other.action=null;other.posture={kind:'standing',slotId:null,furnitureId:null};other.locomotion={mode:null,phase:'idle'};
  return {st,mover,other,a:floor(st,1,1),b:floor(st,2,2),c:floor(st,1,2),d:floor(st,2,1)};
}
function moveAgent(st,agent,from,to){
  agent.offMap=false;agent.position={...from};
  agent.action={
    kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...to},
    locomotionStep:{mode:'walk',to:{...to},toKey:SP.nodeKey(st,to),ticksRemaining:1},
    lastPath:[{...from},{...to}]
  };
  agent.locomotion={mode:'walk',phase:'moving'};
}
function idleAgent(agent,node){
  agent.offMap=false;agent.position={...node};agent.action=null;agent.locomotion={mode:null,phase:'idle'};
}

E.reset(20260926);
assert.equal(E.getState().version,'11.31.0-crowding-8-direction');
assert.equal(C.VERSION,'11.31.0-crowding-8-direction');
assert.equal(SP.CROWDING_VERSION,'11.31.0-crowding-8-direction');

{
  const {st,mover,other,a,b,c,d}=openArea();
  const maneuver=SP.traversalManeuver(st,a,b);
  assert.equal(maneuver.primaryResource,'corner:world|floor|0|2,2');
  assert.equal(maneuver.influenceNodes.length,4);

  const cases=[
    {name:'same',from:c,to:floor(st,2,3),direction:'same',weight:.65},
    {name:'45-degree',from:c,to:b,direction:'angle45',weight:.9125},
    {name:'90-degree crossing',from:c,to:d,direction:'angle90',weight:1.175},
    {name:'135-degree',from:c,to:a,direction:'angle135',weight:1.4375},
    {name:'opposite',from:b,to:a,direction:'opposite',weight:1.7}
  ];
  for(const testCase of cases){
    moveAgent(st,other,testCase.from,testCase.to);
    const profile=C.getCrowdingProfile(st,mover,a,b,'walk');
    assert.equal(profile.occupantCount,1,`${testCase.name}: mover corner influence nodes should discover the moving candidate`);
    assert.equal(profile.occupants[0].direction,testCase.direction,`${testCase.name}: horizontal direction class`);
    approx(profile.occupants[0].directionWeight,testCase.weight,`${testCase.name}: interpolated direction weight`);
    assert.equal(profile.hardBlocked,false,`${testCase.name}: Slice 4 remains soft-only`);
  }

  idleAgent(other,c);
  let profile=C.getCrowdingProfile(st,mover,a,b,'walk');
  assert.equal(profile.occupants[0].direction,'stationary');
  assert.equal(profile.occupants[0].directionWeight,1);

  other.locomotion={mode:'walk',phase:'moving'};other.action=null;
  profile=C.getCrowdingProfile(st,mover,a,b,'walk');
  assert.equal(profile.occupants[0].direction,'unknown');
  assert.equal(profile.occupants[0].directionWeight,1);
}

{
  const {st,mover,other,a,b,c,d}=openArea();
  moveAgent(st,other,c,d);
  const profile=C.getCrowdingProfile(st,mover,a,b,'walk');
  assert.equal(profile.occupantCount,1,'crossing diagonals without shared endpoints must still discover each other through the shared corner influence area');
  assert.equal(profile.occupants[0].direction,'angle90');
  assert.ok(profile.congestionCost>0);
  assert.ok(profile.delayTicks>=0);
  assert.equal(profile.hardBlocked,false);

  const edgeCost=SP.traversalEdgeCost(st,a,b,mover,'walk','walk',profile);
  approx(edgeCost,Math.SQRT2+profile.congestionCost,'diagonal traversal burden must add Crowding once without multiplying it by sqrt(2)');

  const expectedMoveTicks=L.edgeMoveTicks(mover,'walk',Math.SQRT2)+(profile.delayTicks||0);
  assert.equal(C.edgeMoveTicks(st,mover,a,b,'walk',profile),expectedMoveTicks,'Crowding edgeMoveTicks helper must preserve metric diagonal base timing');
}

{
  const {st,mover,other,a,b}=openArea();
  moveAgent(st,other,floor(st,1,2),floor(st,2,1));
  const originalOccupants=SP.nodeOccupantsAt,originalManeuver=SP.traversalManeuver;
  let queriedNodes=0,maneuverCalls=0;
  SP.nodeOccupantsAt=(...args)=>{queriedNodes++;return [other];};
  SP.traversalManeuver=(...args)=>{maneuverCalls++;return originalManeuver(...args);};
  try{
    const profile=C.getCrowdingProfile(st,mover,a,b,'walk');
    assert.equal(queriedNodes,4,'diagonal candidate discovery must scan exactly the four maneuver influence nodes');
    assert.equal(maneuverCalls,1,'one Crowding profile should derive the mover maneuver once; occupant traffic direction must not re-query Passage geometry');
    assert.equal(profile.occupantCount,1,'the same Agent returned from multiple influence nodes must only contribute pressure once');
    assert.equal(profile.occupants[0].agentId,other.id);
  }finally{
    SP.nodeOccupantsAt=originalOccupants;
    SP.traversalManeuver=originalManeuver;
  }
}

{
  const {st,mover,other,a}=openArea();
  const east=floor(st,2,1);
  moveAgent(st,other,east,a);
  const profile=C.getCrowdingProfile(st,mover,a,east,'walk');
  assert.equal(profile.occupantCount,1);
  assert.equal(profile.occupants[0].direction,'opposite','cardinal opposite-flow semantics must remain unchanged');
  assert.equal(profile.occupants[0].directionWeight,1.7);
}

console.log('8-direction Crowding focused regression: ok');
