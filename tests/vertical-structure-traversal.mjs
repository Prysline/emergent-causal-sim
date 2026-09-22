import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadInitialStateProfile([
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','systems/locomotion.js','crowding-runtime-v1200.js'
]);

const A=globalThis.SimWorldAuthoring;
const I=globalThis.SimWorldInitializer;
const W=globalThis.SimWorld;
const SP=globalThis.SimSpatial;
const C=globalThis.SimCrowding;

assert.equal(A.VERSION,'world-authoring-v5','vertical Structure proof requires a new canonical authoring generation');

function authoredFixture({withStair=true}={}){
  const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
  authored.map.layers.push({
    z:1,
    cells:{
      '8,4':{terrain:'floor',material:'wood'},
      '9,4':{terrain:'floor',material:'wood'}
    },
    boundaries:{}
  });
  authored.structures=withStair?{
    stairA:{
      id:'stairA',
      kind:'stair',
      lower:{x:8,y:4,z:0},
      upper:{x:8,y:4,z:1},
      clearanceWidth:.8,
      clearanceHeight:2
    }
  }:{};
  authored.residents.zhen.initial.placement={mode:'exact',node:{x:8,y:4,z:0}};
  authored.residents.zhen.initial.posture={kind:'standing'};
  authored.residents.zhou.initial.placement={mode:'exact',node:{x:8,y:4,z:1}};
  authored.residents.zhou.initial.posture={kind:'standing'};
  authored.residents.orange.initial.placement={mode:'exact',node:{x:9,y:4,z:1}};
  authored.residents.orange.initial.posture={kind:'standing'};
  return authored;
}

const authored=authoredFixture();
let report=A.validateAuthoring(authored);
assert.equal(report.ok,true,report.errors.map(x=>x.code+': '+x.path).join(' | '));
const serialized=A.serializeAuthoring(authored);
const imported=A.parseAuthoringJSON(serialized);
assert.equal(A.semanticFingerprint(imported),A.semanticFingerprint(authored),'Structure must round-trip through canonical authoring');
assert.deepEqual(imported.structures.stairA,authored.structures.stairA,'Structure world facts must persist without derived traversal truth');
assert.equal(Object.hasOwn(imported.structures.stairA,'upCost'),false);
assert.equal(Object.hasOwn(imported.structures.stairA,'downCost'),false);

const horizontal=A.deriveHorizontalTopology(imported,{z:0});
assert.equal(horizontal.cells['8,4'].adjacent.every(id=>!id.includes(',1')),true,'horizontal topology must stay layer-local');
const connections=A.deriveStructureConnections(imported);
assert.equal(connections.length,1);
assert.deepEqual(connections[0].lower,{x:8,y:4,z:0});
assert.deepEqual(connections[0].upper,{x:8,y:4,z:1});

const compatibility=I.analyzeRuntimeCompatibility(imported);
assert.equal(compatibility.ok,true,compatibility.hardErrors.map(x=>x.code+': '+x.message).join(' | '));
assert.equal(
  compatibility.diagnostics.some(x=>x.code==='initial_no_exit_route'&&x.residentId==='zhou'),
  false,
  'authoring-side reachability must understand a legal Structure connection'
);

const st=W.createInitialStateFromAuthoring(imported,20260922);
assert.deepEqual(st.map.zLevels,[0,1]);
assert.deepEqual(st.structures.stairA,{id:'stairA',kind:'stair',lower:{x:8,y:4},upper:{x:8,y:4,z:1},clearanceWidth:.8,clearanceHeight:2},'Initializer must project Structure truth using the existing runtime z=0 position convention');

const lower=SP.normalizeNode(st,{x:8,y:4,z:0},'floor');
const upper=SP.normalizeNode(st,{x:8,y:4,z:1},'floor');
const upperEast=SP.normalizeNode(st,{x:9,y:4,z:1},'floor');
assert.equal(SP.structureBetween(st,lower,upper)?.id,'stairA','Spatial must resolve the Structure edge generically');

const zhen=st.agents.zhen;
const zhou=st.agents.zhou;
const orange=st.agents.orange;
zhen.position={...lower};zhen.action=null;
zhou.offMap=true;orange.offMap=true;

const up=SP.planRoute(st,zhen,upper,{mode:'walk',objective:'traversalCost'});
assert.equal(up.pathDistance,1,'stair must provide one abstract cross-Z edge');
assert.equal(up.steps[0].moveTicks,1,'empty stair traversal must not be hard-coded to two ticks');
assert.equal(up.travelTime,1);

zhen.position={...upper};
const down=SP.planRoute(st,zhen,lower,{mode:'walk',objective:'traversalCost'});
assert.equal(down.pathDistance,1);
assert.equal(down.steps[0].moveTicks,1);
assert.equal(down.travelTime,1);

const passage=SP.getPassageProfile(st,lower,upper);
assert.equal(passage.edgeKind,'structure');
assert.equal(passage.structureId,'stairA');
assert.equal(passage.clearanceWidth,.8);
assert.equal(passage.clearanceHeight,2);
const feasibility=SP.traversalFeasibility(st,zhen,lower,upper);
assert.equal(feasibility.modes.walk.feasible,true,'first stair proof must use existing walk feasibility');
assert.equal(feasibility.modes.kneelCrawl.feasible,false,'stair proof must not silently create crawl traversal semantics');

const flatCost=SP.traversalEdgeCost(st,upper,upperEast,zhen,'walk','walk');
const upCost=SP.traversalEdgeCost(st,lower,upper,zhen,'walk','walk');
const downCost=SP.traversalEdgeCost(st,upper,lower,zhen,'walk','walk');
assert.ok(upCost>downCost,`expected stair up cost > down cost, got ${upCost} <= ${downCost}`);
assert.ok(downCost>=flatCost,`expected stair down cost >= flat cost, got ${downCost} < ${flatCost}`);

zhen.position={...lower};
zhou.offMap=false;zhou.position={...upper};
zhou.action={locomotionStep:{mode:'walk',to:{...lower},toKey:SP.nodeKey(st,lower),ticksRemaining:1}};
const crowd=C.getCrowdingProfile(st,zhen,lower,upper,'walk');
assert.equal(crowd.widthKnown,true,'Structure clearanceWidth must feed existing Crowding');
assert.equal(crowd.passageWidth,.8);
assert.equal(crowd.occupants.some(x=>x.agentId===zhou.id&&x.direction==='opposite'),true,'up/down movement must compare XYZ direction');
assert.ok(crowd.delayTicks>=1,'narrow opposite stair traffic should naturally add discrete movement delay');
assert.ok(C.edgeMoveTicks(st,zhen,lower,upper,'walk')>1,'Crowding may increase stair execution time without a stair-specific fixed tick rule');

const noStairAuthored=authoredFixture({withStair:false});
report=A.validateAuthoring(noStairAuthored);
assert.equal(report.ok,true,report.errors.map(x=>x.code+': '+x.path).join(' | '));
const noStair=W.createInitialStateFromAuthoring(noStairAuthored,20260922);
const noStairActor=noStair.agents.zhen;
noStairActor.position={...SP.normalizeNode(noStair,{x:8,y:4,z:0},'floor')};
const noStairGoal=SP.normalizeNode(noStair,{x:8,y:4,z:1},'floor');
const blocked=SP.planRoute(noStair,noStairActor,noStairGoal,{mode:'walk',objective:'pathDistance'});
assert.equal(blocked.path.length,0,'same XY on another Z must remain unreachable without an explicit Structure');
assert.equal(blocked.pathDistance,Infinity);

console.log('vertical structure stair traversal regression: ok');
