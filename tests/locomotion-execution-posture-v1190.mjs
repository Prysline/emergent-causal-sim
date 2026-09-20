import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of [
  'world-authoring-v1.js','world-initializer.js','world.js','release.js','spatial.js','spatial-v111.js',
  'physical-schema-v1160.js','physical-runtime-v1160.js','spatial-passage-v1170.js',
  'locomotion-schema-v1190.js','locomotion-runtime-v1190.js','engine.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1160.js','state-validator-v1190.js'
])vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial,P=globalThis.SimPhysical,L=globalThis.SimLocomotion,V=globalThis.SimValidator;
const APP_VERSION='11.22.0-spatial-z-identity';
const LOCOMOTION_VERSION='11.19.0-locomotion-execution-posture';
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

function resetFixture({height=2,width=.8,edgeWidth=null,kneelSpeed=null}={}){
  E.reset(11900);
  const st=E.getState(),human=st.agents.zhen;
  for(const tile of Object.values(st.map.tiles||{})){
    tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];tile.surface={contents:{}};
  }
  for(const [x,y] of [[1,1],[2,1],[3,1]]){
    const tile=st.map.tiles[`${x},${y}`];tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];
  }
  human.position=floor(st,1,1);
  human.action=null;
  human.posture={kind:'standing',slotId:null,furnitureId:null};
  human.locomotion={mode:null,phase:'idle'};
  if(kneelSpeed!==null)human.physical.locomotionProfiles.kneelCrawl.speedFactor=kneelSpeed;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  const water=st.containers.waterBucket;
  water.supportId=null;water.position=floor(st,3,1);
  st.furniture={
    testPassageCover:{
      id:'testPassageCover',name:'測試通道上蓋',blocksMovement:true,
      footprint:[{x:2,y:1}],displayAt:{x:2,y:1},slots:[],
      spatial:{under:{clearance:height,clearanceWidth:width,cover:'overhead'}}
    }
  };
  st.map.passageConstraints={};
  const start=floor(st,1,1),mid=floor(st,2,1),goal=floor(st,3,1);
  if(edgeWidth!=null)st.map.passageConstraints[SP.passageConstraintKey(st,start,mid)]={clearanceWidth:edgeWidth};
  return {st,human,water,start,mid,goal};
}

function armWander(f){
  f.human.action={kind:'wander',phase:'move',started:f.st.tick,wait:0,targetTile:{...f.goal},oneShot:true};
}
function tickN(n){for(let i=0;i<n;i++)E.tick();}

E.reset(11900);
let st=E.getState(),human=st.agents.zhen;
assert.equal(st.version,APP_VERSION);
assert.equal(W.LOCOMOTION_SCHEMA_VERSION,LOCOMOTION_VERSION);
assert.equal(L.VERSION,LOCOMOTION_VERSION);
assert.deepEqual(human.locomotion,{mode:null,phase:'idle'});
assert.equal(L.postureForMode('walk'),'standing');
assert.equal(L.postureForMode('kneelCrawl'),'kneeling');
assert.equal(L.postureForMode('proneCrawl'),'prone');
assert.equal(L.edgeMoveTicks(human,'walk'),1);
assert.equal(L.edgeMoveTicks(human,'kneelCrawl'),2);
assert.equal(L.edgeMoveTicks(human,'proneCrawl'),3);

// A: normal corridor stays walk-first; no posture-transition tax when already standing.
let f=resetFixture({height:2,width:.8});
let plan=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'traversalCost'});
assert.equal(plan.pathDistance,2);
assert.equal(plan.travelTime,2);
assert.deepEqual(plan.steps.map(x=>x.mode),['walk','walk']);
assert.equal(plan.transitionTicks,0);
assert.equal(f.human.posture.kind,'standing','route queries must remain state-inert');
assert.deepEqual(f.human.locomotion,{mode:null,phase:'idle'});
armWander(f);
E.tick();assert.ok(SP.nodeSame(E.getState(),f.human.position,f.mid),'walk should advance one edge in one tick');assert.equal(f.human.posture.kind,'standing');assert.equal(f.human.locomotion.mode,'walk');
E.tick();assert.ok(SP.nodeSame(E.getState(),f.human.position,f.goal),'walk should reach a two-edge goal in two movement ticks');
E.tick();assert.equal(f.human.action,null,'existing action lifecycle may settle on the tick after arrival');assert.deepEqual(f.human.locomotion,{mode:null,phase:'idle'});

// B: low unique passage selects kneel crawl and spends one explicit transition tick.
f=resetFixture({height:.95,width:.8});
plan=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'traversalCost'});
assert.deepEqual(plan.steps.map(x=>x.mode),['kneelCrawl','kneelCrawl']);
assert.equal(plan.transitionTicks,1);
assert.equal(plan.travelTime,5,'standing -> kneel costs one tick, then two edges at two ticks each');
assert.equal(f.human.posture.kind,'standing','planning must not mutate posture');
armWander(f);
E.tick();
assert.ok(SP.nodeSame(E.getState(),f.human.position,f.start),'transition tick must not also move');
assert.equal(f.human.posture.kind,'kneeling');
assert.deepEqual(f.human.locomotion,{mode:'kneelCrawl',phase:'transition'});
E.tick();assert.ok(SP.nodeSame(E.getState(),f.human.position,f.start),'first kneel-crawl movement tick should be in progress');
assert.equal(f.human.action.locomotionStep.ticksRemaining,1);
E.tick();assert.ok(SP.nodeSame(E.getState(),f.human.position,f.mid),'second kneel-crawl movement tick completes first edge');
E.tick();assert.ok(SP.nodeSame(E.getState(),f.human.position,f.mid),'second edge also takes two ticks');
E.tick();assert.ok(SP.nodeSame(E.getState(),f.human.position,f.goal),'planned travelTime must match actual arrival timing');
assert.equal(f.human.posture.kind,'kneeling','arrival must not silently stand up after crawl');
E.tick();assert.equal(f.human.action,null);assert.equal(f.human.posture.kind,'kneeling','action completion keeps authoritative posture until a later transition');
assert.deepEqual(f.water.position,f.goal,'water remains on the far side of the unique passage');

// C: lower passage only permits prone crawl.
f=resetFixture({height:.70,width:.8});
plan=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'traversalCost'});
assert.deepEqual(plan.steps.map(x=>x.mode),['proneCrawl','proneCrawl']);
assert.equal(plan.travelTime,7,'standing -> prone costs one tick plus two three-tick edges');
armWander(f);tickN(7);
assert.ok(SP.nodeSame(E.getState(),f.human.position,f.goal));
assert.equal(f.human.posture.kind,'prone');
assert.equal(f.human.locomotion.mode,'proneCrawl');

// D: width-blocked passage remains impossible in every Human mode.
f=resetFixture({height:2,width:null,edgeWidth:.44});
plan=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'traversalCost'});
assert.deepEqual(plan.path,[]);
assert.equal(plan.travelTime,Infinity);
assert.equal(f.human.posture.kind,'standing');

// E: individual speedFactor override can change executable mode choice on an equal traversal-cost route.
f=resetFixture({height:.95,width:.8,kneelSpeed:.25});
plan=SP.planRoute(f.st,f.human,f.goal,{mode:'auto',objective:'traversalCost'});
assert.equal(L.edgeMoveTicks(f.human,'kneelCrawl'),4,'individual profile override must change kneel edge timing');
assert.deepEqual(plan.steps.map(x=>x.mode),['proneCrawl','proneCrawl'],'when kneel becomes slower than prone, executable-time tie-break may choose prone');
assert.equal(plan.travelTime,7,'selected prone route is one transition tick plus two three-tick edges');
armWander(f);tickN(6);
assert.ok(!SP.nodeSame(E.getState(),f.human.position,f.goal),'agent must not arrive before the selected plan travelTime');
E.tick();
assert.ok(SP.nodeSame(E.getState(),f.human.position,f.goal),'actual movement must honor the speedFactor-sensitive selected mode timing');

// Validator owns locomotion/posture consistency and pending edge timing.
let validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\n'));
f.human.locomotion={mode:'kneelCrawl',phase:'moving'};f.human.posture={kind:'standing',slotId:null,furnitureId:null};
validation=V.validateState(f.st);
assert.ok(validation.issues.some(x=>x.code==='locomotion_posture_mode_mismatch'));
f.human.posture={kind:'kneeling',slotId:null,furnitureId:null};
f.human.action={kind:'wander',phase:'move',locomotionStep:{mode:'kneelCrawl',to:{...f.mid},toKey:SP.nodeKey(f.st,f.mid),ticksRemaining:0}};
validation=V.validateState(f.st);
assert.ok(validation.issues.some(x=>x.code==='locomotion_step_ticks_invalid'));

console.log('v11.19.0 locomotion execution + posture transition regression: ok');
