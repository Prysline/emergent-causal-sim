import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js',
  'systems/physical.js','spatial-passage.js','engine.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/physical-profile.js'
]);

const APP_VERSION='11.27.2-room-value-legacy-removal';
const PHYSICAL_VERSION='11.17.0-passage-profile-multimode';
const PASSAGE_VERSION='11.26.0-vertical-structure-passage';
const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial,P=globalThis.SimPhysical,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

function resetFixture({height=2,width=.8,edgeWidth=null}={}){
  E.reset(11700);
  const st=E.getState(),human=st.agents.zhen;
  for(const tile of Object.values(st.map.tiles||{})){
    tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];
  }
  for(const [x,y] of [[1,1],[2,1],[3,1]]){
    const tile=st.map.tiles[`${x},${y}`];tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];
  }
  human.position=floor(st,1,1);human.action=null;human.posture={kind:'standing',slotId:null,furnitureId:null};
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  const water=st.containers.waterBucket;
  water.supportId=null;water.position=floor(st,3,1);
  st.furniture.testPassageCover={
    id:'testPassageCover',name:'測試通道上蓋',
    footprint:[{x:2,y:1}],displayAt:{x:2,y:1},slots:[],
    spatial:{floor:{mode:'under'},under:{clearance:height,clearanceWidth:width,cover:'overhead'}}
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

const tableFrom=floor(st,4,2),tableUnder=floor(st,5,2);
let tablePassage=SP.getPassageProfile(st,tableFrom,tableUnder);
assert.equal(tablePassage.clearanceHeight,.72,'existing dining-table under-clearance must project into PassageProfile height');
assert.equal(tablePassage.clearanceWidth,null,'unspecified passage width must remain unconstrained rather than inventing a tile scale');
let tableHuman=SP.traversalFeasibility(st,human,tableFrom,tableUnder);
assert.equal(tableHuman.modes.walk.feasible,false);
assert.deepEqual(tableHuman.modes.walk.failedAxes,['height']);
assert.equal(tableHuman.modes.kneelCrawl.feasible,false,'0.72 m remains below the first kneel-crawl approximation');
assert.equal(tableHuman.modes.proneCrawl.feasible,true,'prone crawl can be physically feasible even while A* remains walk-only');
assert.equal(SP.traversalFeasibility(st,cat,tableFrom,tableUnder).modes.walk.feasible,true,'Cat walk parity under the dining table must remain');

// A: normal passage. Walk itself is physically feasible, so current walk-only A* can reach the water side.
let fixture=resetFixture({height:2,width:.8});
let result=SP.traversalFeasibility(fixture.st,fixture.human,fixture.start,fixture.mid);
assert.equal(result.edgeValid,true);assert.equal(result.edgeOpen,true);
assert.equal(result.passage.clearanceHeight,2);assert.equal(result.passage.clearanceWidth,.8);
assert.equal(result.modes.walk.feasible,true);
assert.equal(result.modes.kneelCrawl.feasible,true);
assert.equal(result.modes.proneCrawl.feasible,true);
assert.equal('bestMode' in result,false,'Physical feasibility must not choose a preferred locomotion mode');
assert.equal('recommendedMode' in result,false,'Physical feasibility must not recommend a locomotion mode');
assert.equal(SP.astar(fixture.st,fixture.start,fixture.goal,fixture.human.id).length,3,'normal single passage must remain reachable by walk-only A*');
assert.equal(fixture.human.posture.kind,'standing','feasibility/path queries must not mutate posture');

// B: low passage. Crawl modes are physically known, but current A* must not auto-select them.
fixture=resetFixture({height:.95,width:.8});
result=SP.traversalFeasibility(fixture.st,fixture.human,fixture.start,fixture.mid);
assert.equal(result.modes.walk.feasible,false);assert.deepEqual(result.modes.walk.failedAxes,['height']);
assert.equal(result.modes.kneelCrawl.feasible,true);
assert.equal(result.modes.proneCrawl.feasible,true);
assert.deepEqual(SP.astar(fixture.st,fixture.start,fixture.goal,fixture.human.id),[],'walk-only A* must not silently switch to crawl in Slice 2');
assert.equal(SP.pathCost(fixture.st,fixture.human,fixture.goal),Infinity,'water across crawl-only passage must remain unreachable until locomotion execution exists');
assert.equal(fixture.human.posture.kind,'standing','failed walk routing must not silently change posture');
assert.deepEqual(fixture.water.position,fixture.goal,'water fixture must remain on the opposite side of the unique passage');

// C: lower passage. Only prone crawl fits.
fixture=resetFixture({height:.70,width:.8});
result=SP.traversalFeasibility(fixture.st,fixture.human,fixture.start,fixture.mid);
assert.equal(result.modes.walk.feasible,false);assert.deepEqual(result.modes.walk.failedAxes,['height']);
assert.equal(result.modes.kneelCrawl.feasible,false);assert.deepEqual(result.modes.kneelCrawl.failedAxes,['height']);
assert.equal(result.modes.proneCrawl.feasible,true);
assert.deepEqual(SP.astar(fixture.st,fixture.start,fixture.goal,fixture.human.id),[]);

// D: height is ample, but an explicit edge constraint is too narrow for every Human mode.
fixture=resetFixture({height:2,width:null,edgeWidth:.44});
result=SP.traversalFeasibility(fixture.st,fixture.human,fixture.start,fixture.mid);
assert.equal(result.passage.clearanceHeight,2);
assert.equal(result.passage.clearanceWidth,.44);
assert.equal(result.passage.constrainedBy.explicitEdge,true,'PassageProfile must support authoritative edge-local constraints');
for(const mode of ['walk','kneelCrawl','proneCrawl']){
  assert.equal(result.modes[mode].feasible,false,`${mode} should fail the width-only fixture`);
  assert.deepEqual(result.modes[mode].failedAxes,['width'],`${mode} must report width, not generic height failure`);
}
assert.deepEqual(SP.astar(fixture.st,fixture.start,fixture.goal,fixture.human.id),[],'width-blocked unique passage must be unreachable to walk-only A*');

let validation=V.validateState(fixture.st);
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\n'));
const edgeKey=SP.passageConstraintKey(fixture.st,fixture.start,fixture.mid);
fixture.st.map.passageConstraints[edgeKey].clearanceWidth=0;
validation=V.validateState(fixture.st);
assert.ok(validation.issues.some(x=>x.code==='spatial_passage_width_invalid'&&x.edgeKey===edgeKey),'validator must reject invalid explicit passage width');
fixture.st.map.passageConstraints[edgeKey].clearanceWidth=.44;
fixture.st.furniture.testPassageCover.spatial.under.clearance=-1;
validation=V.validateState(fixture.st);
assert.ok(validation.issues.some(x=>x.code==='spatial_passage_height_invalid'&&x.furnitureId==='testPassageCover'),'validator must reject invalid overhead passage height');

console.log('v11.17.0 Passage Profile + multi-mode traversal feasibility contract passed');
