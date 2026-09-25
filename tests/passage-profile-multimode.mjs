import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js',
  'systems/physical.js','spatial-passage.js','engine.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/physical-profile.js'
]);

const APP_VERSION='11.29.0-horizontal-geometry-foundation';
const PHYSICAL_VERSION='11.17.0-passage-profile-multimode';
const PASSAGE_VERSION='11.29.0-horizontal-connection-passage';
const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial,P=globalThis.SimPhysical,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

function resetFixture({height=2,edgeWidth=null}={}){
  E.reset(11700);
  const st=E.getState(),human=st.agents.zhen;
  for(const tile of Object.values(st.map.tiles||{})){
    tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];tile.surface={contents:{}};
  }
  for(const [x,y] of [[1,1],[2,1],[3,1]]){
    const tile=st.map.tiles[`${x},${y}`];tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];
  }
  human.position=floor(st,1,1);human.action=null;human.posture={kind:'standing',slotId:null,furnitureId:null};
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  const water=st.containers.waterBucket;
  water.supportId=null;water.position=floor(st,3,1);
  st.furniture={
    testPassageCover:{
      id:'testPassageCover',name:'測試通道上蓋',
      footprint:[{x:2,y:1}],displayAt:{x:2,y:1},slots:[],
      spatial:{solids:[{key:'roof',layerZ:0,bounds:{x:2,y:1,z:height,width:1,depth:1,height:.05}}]}
    }
  };
  st.map.passageConstraints={};
  const start=floor(st,1,1),mid=floor(st,2,1),goal=floor(st,3,1);
  if(edgeWidth!=null)st.map.passageConstraints[SP.passageConstraintKey(st,start,mid)]={clearanceWidth:edgeWidth};
  return {st,human,water,start,mid,goal};
}

E.reset(11700);
let st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
assert.equal(st.version,APP_VERSION);
assert.equal(W.PHYSICAL_SCHEMA_VERSION,PHYSICAL_VERSION);
assert.equal(SP.PASSAGE_PROFILE_VERSION,PASSAGE_VERSION);
assert.deepEqual(P.supportedLocomotionModes(human),['walk','kneelCrawl','proneCrawl']);
assert.deepEqual(P.supportedLocomotionModes(cat),['walk']);

// Production dining table: the same edge contains both a high side opening and a low tabletop-under option.
const tableLeft=floor(st,5,2),tableRight=floor(st,6,2);
let tablePassage=SP.getPassageProfile(st,tableLeft,tableRight);
assert.equal(tablePassage.edgeKind,'horizontal');
assert.ok(tablePassage.options.length>=2);
const lowTableOption=tablePassage.options.find(option=>option.clearanceHeight===.72);
const highTableOption=tablePassage.options.find(option=>option.clearanceHeight===null);
assert.ok(lowTableOption,'tabletop bottom must derive an actual positioned 0.72m option');
assert.ok(highTableOption,'metric geometry must preserve the high-clearance side gap rather than applying .72m to the whole edge');
assert.ok(lowTableOption.interval.start>=.6&&lowTableOption.interval.end<=1);
assert.ok(highTableOption.clearanceWidth>.45,'the production table leaves a walk-width side opening on this edge');
let tableHuman=SP.traversalFeasibility(st,human,tableLeft,tableRight);
assert.equal(tableHuman.modes.walk.feasible,true,'Human walk may use the real side opening rather than being globally blocked by tabletop height');
assert.equal(tableHuman.modes.walk.effectiveOption.clearanceHeight,null);
assert.ok(tableHuman.modes.walk.effectiveClearanceWidth>.45);
assert.equal(SP.traversalFeasibility(st,cat,tableLeft,tableRight).modes.walk.feasible,true);

// A: full-width 2m-high cover. Every current Human mode fits one real option.
let fixture=resetFixture({height:2});
let result=SP.traversalFeasibility(fixture.st,fixture.human,fixture.start,fixture.mid);
assert.equal(result.edgeValid,true);assert.equal(result.edgeOpen,true);
assert.equal(result.passage.options.length,1);
assert.deepEqual(result.passage.options[0].interval,{start:0,end:1});
assert.equal(result.passage.options[0].clearanceWidth,1);
assert.equal(result.passage.options[0].clearanceHeight,2);
assert.equal(result.modes.walk.feasible,true);
assert.equal(result.modes.kneelCrawl.feasible,true);
assert.equal(result.modes.proneCrawl.feasible,true);
assert.equal('bestMode' in result,false,'Physical feasibility must not choose a preferred locomotion mode');
assert.equal('recommendedMode' in result,false,'Physical feasibility must not recommend a locomotion mode');
assert.equal(SP.astar(fixture.st,fixture.start,fixture.goal,fixture.human.id).length,3,'normal single passage must remain reachable by walk-only A*');
assert.equal(fixture.human.posture.kind,'standing','feasibility/path queries must not mutate posture');

// B: low passage. Crawl modes are physically known, but current A* must not auto-select them.
fixture=resetFixture({height:.95});
result=SP.traversalFeasibility(fixture.st,fixture.human,fixture.start,fixture.mid);
assert.equal(result.modes.walk.feasible,false);assert.ok(result.modes.walk.failedAxes.includes('nodeFit'));
assert.equal(result.modes.kneelCrawl.feasible,true);
assert.equal(result.modes.proneCrawl.feasible,true);
assert.deepEqual(SP.astar(fixture.st,fixture.start,fixture.goal,fixture.human.id),[],'walk-only A* must not silently switch to crawl');
assert.equal(SP.pathCost(fixture.st,fixture.human,fixture.goal),Infinity);
assert.equal(fixture.human.posture.kind,'standing');
assert.deepEqual(fixture.water.position,fixture.goal);

// C: lower passage. Only prone crawl fits.
fixture=resetFixture({height:.70});
result=SP.traversalFeasibility(fixture.st,fixture.human,fixture.start,fixture.mid);
assert.equal(result.modes.walk.feasible,false);
assert.equal(result.modes.kneelCrawl.feasible,false);
assert.equal(result.modes.proneCrawl.feasible,true);
assert.deepEqual(SP.astar(fixture.st,fixture.start,fixture.goal,fixture.human.id),[]);

// D: height is ample, but an explicit edge constraint is too narrow for every Human mode.
fixture=resetFixture({height:2,edgeWidth:.44});
result=SP.traversalFeasibility(fixture.st,fixture.human,fixture.start,fixture.mid);
assert.equal(result.passage.options.length,1);
assert.ok(Math.abs(result.passage.options[0].clearanceWidth-.44)<1e-9);
assert.ok(Math.abs(result.passage.options[0].interval.start-.28)<1e-9&&Math.abs(result.passage.options[0].interval.end-.72)<1e-9);
assert.equal(result.passage.options[0].constrainedBy.explicitEdge,true);
for(const mode of ['walk','kneelCrawl','proneCrawl']){
  assert.equal(result.modes[mode].feasible,false,`${mode} should fail the width-only fixture`);
  assert.ok(result.modes[mode].failedAxes.includes('width'),`${mode} must report width failure`);
}
assert.deepEqual(SP.astar(fixture.st,fixture.start,fixture.goal,fixture.human.id),[]);

let validation=V.validateState(fixture.st);
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\n'));
const edgeKey=SP.passageConstraintKey(fixture.st,fixture.start,fixture.mid);
fixture.st.map.passageConstraints[edgeKey].clearanceWidth=0;
validation=V.validateState(fixture.st);
assert.ok(validation.issues.some(x=>x.code==='spatial_passage_width_invalid'&&x.edgeKey===edgeKey),'validator must reject invalid explicit passage width');
fixture.st.map.passageConstraints[edgeKey].clearanceWidth=.44;
fixture.st.furniture.testPassageCover.spatial.solids[0].bounds.height=-1;
validation=V.validateState(fixture.st);
assert.ok(validation.issues.some(x=>x.code==='spatial_furniture_solid_bounds_invalid'&&x.furnitureId==='testPassageCover'),'validator must reject invalid runtime solid bounds');

console.log('v11.28.0 positioned Passage options + multi-mode feasibility contract passed');
