import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','engine.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/physical-profile.js'
]);

const APP_VERSION='11.40.0-usage-preference-sleep';
const RESOURCES_VERSION='11.39.0-carried-contents-loss';
const PHYSICAL_VERSION='11.37.0-carried-container-feasibility';
const PASSAGE_VERSION='11.39.1-surface-boundary-transition';
const ROUTE_VERSION='11.38.0-carried-handling-risk';
const A=globalThis.SimWorldAuthoring;
const C=globalThis.SimEmbodimentCapabilities;
const E=globalThis.SimEngine;
const W=globalThis.SimWorld;
const R=globalThis.SimResources;
const SP=globalThis.SimSpatial;
const P=globalThis.SimPhysical;
const V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const coords=path=>path.map(node=>[node.x,node.y]);

assert.equal(A.VERSION,'world-authoring-v11');
assert.equal(C.VERSION,'embodiment-capabilities-v4');
assert.equal(R.VERSION,RESOURCES_VERSION);
assert.equal(P.VERSION,PHYSICAL_VERSION);
assert.equal(SP.PASSAGE_PROFILE_VERSION,PASSAGE_VERSION);
assert.equal(SP.ROUTE_SEMANTICS_VERSION,ROUTE_VERSION);

const expectedHandling={
  plateA:{carryGeometry:{width:.30,height:.05,length:.30},handsRequired:1},
  plateB:{carryGeometry:{width:.30,height:.05,length:.30},handsRequired:1},
  basket:{carryGeometry:{width:.55,height:.30,length:.40},handsRequired:2},
  waterBucket:{carryGeometry:{width:.32,height:.35,length:.32},handsRequired:1},
  cupA:{carryGeometry:{width:.10,height:.12,length:.10},handsRequired:1},
  cupB:{carryGeometry:{width:.10,height:.12,length:.10},handsRequired:1},
  alcoholBottle:{carryGeometry:{width:.10,height:.30,length:.10},handsRequired:1}
};
for(const [id,handling] of Object.entries(expectedHandling)){const actual=A.DEFAULT_WORLD_AUTHORING.entities.containers[id].handling;assert.deepEqual({carryGeometry:actual.carryGeometry,handsRequired:actual.handsRequired},handling,id+' must preserve the Slice A carried calibration');assert.ok(['open','covered','sealed'].includes(actual.containment),id+' must expose Slice B containment');assert.deepEqual(Object.keys(actual.contentRetention||{}).sort(),['impact','oscillation','tilt'],id+' must expose Slice B contentRetention dimensions');}

{
  const invalid=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
  delete invalid.entities.containers.basket.handling;
  const report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_container_handling_missing'));
}

E.reset(11710);
let st=E.getState(),human=st.agents.zhen;
assert.equal(st.version,APP_VERSION);
assert.equal(human.physical.manipulation.handCapacity,2);
assert.equal(Object.hasOwn(human,'carrying'),false,'Agent.held remains the only held relation');

const bodyWalk=P.getMovementEnvelope(human,'walk');
const noHeldWalk=P.getEffectiveTraversalEnvelope(st,human,'walk');
assert.equal(noHeldWalk.clearanceWidth,bodyWalk.clearanceWidth);
assert.equal(noHeldWalk.clearanceHeight,bodyWalk.clearanceHeight);
assert.equal(noHeldWalk.clearanceLength,bodyWalk.clearanceLength);

human.held='basket';
const basketWalk=P.getEffectiveTraversalEnvelope(st,human,'walk');
assert.equal(basketWalk.clearanceWidth,.55);
assert.equal(basketWalk.carriedContainerId,'basket');
assert.equal(R.availableSupportHands(st,human),0);
assert.equal(P.locomotionModeHandsFeasible(st,human,'walk'),true);
assert.equal(P.locomotionModeHandsFeasible(st,human,'kneelCrawl'),false);

human.held='cupA';
assert.equal(R.availableSupportHands(st,human),1);
assert.equal(P.locomotionModeHandsFeasible(st,human,'kneelCrawl'),true);
assert.equal(P.surfaceManeuverHandsFeasible(st,human,'climb'),true);

{
  const bucket=st.containers.waterBucket,basket=st.containers.basket;
  bucket.contents={water:0};const emptyBucketLoad=R.containerLoad(st,bucket);
  bucket.contents={water:100};const fullBucketLoad=R.containerLoad(st,bucket);
  assert.ok(fullBucketLoad>emptyBucketLoad,'contents must increase carried load');
  basket.contents={food:10};const lightBasketLoad=R.containerLoad(st,basket),lightEnvelope=P.getEffectiveTraversalEnvelope(st,{...human,held:'basket'},'walk');
  basket.contents={food:40};const heavyBasketLoad=R.containerLoad(st,basket),heavyEnvelope=P.getEffectiveTraversalEnvelope(st,{...human,held:'basket'},'walk');
  assert.ok(heavyBasketLoad>lightBasketLoad,'more contents must increase load');
  assert.deepEqual(
    [heavyEnvelope.clearanceWidth,heavyEnvelope.clearanceHeight,heavyEnvelope.clearanceLength],
    [lightEnvelope.clearanceWidth,lightEnvelope.clearanceHeight,lightEnvelope.clearanceLength],
    'contents load must not rewrite carried geometry'
  );
}

for(const tile of Object.values(st.map.tiles||{})){
  tile.walkable=false;tile.terrain='wall';tile.furnitureIds=[];tile.surface={contents:{}};
}
for(const [x,y] of [[1,3],[2,3],[3,3],[4,3],[5,3],[1,4],[2,4],[3,4],[4,4],[5,4]]){
  const tile=st.map.tiles[`${x},${y}`];tile.walkable=true;tile.terrain='floor';tile.furnitureIds=[];
}
st.furniture={};st.sources={};st.map.passageConstraints={};
st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
human.position=floor(st,1,3);human.posture={kind:'standing',slotId:null,furnitureId:null};
const goal=floor(st,5,3);
for(const x of [1,2,3,4]){
  const from=floor(st,x,3),to=floor(st,x+1,3);
  st.map.passageConstraints[SP.passageConstraintKey(st,from,to)]={clearanceWidth:.50,clearanceHeight:2};
}

human.held=null;
const direct=SP.planRoute(st,human,goal,{mode:'walk',objective:'pathDistance'});
assert.equal(direct.pathDistance,4);
assert.ok(direct.path.every(node=>node.y===3),'body-only Human should use the direct 0.50m corridor');

human.held='basket';
const basketRoute=SP.planRoute(st,human,goal,{mode:'walk',objective:'pathDistance'});
assert.equal(basketRoute.pathDistance,6);
assert.ok(basketRoute.path.some(node=>node.y===4),'0.55m carried basket must force the open detour');

human.held='cupA';
const cupRoute=SP.planRoute(st,human,goal,{mode:'walk',objective:'pathDistance'});
assert.equal(cupRoute.pathDistance,4);
assert.ok(cupRoute.path.every(node=>node.y===3),'small cup must preserve the direct route');

const first=floor(st,1,3),second=floor(st,2,3);
st.map.passageConstraints[SP.passageConstraintKey(st,first,second)]={clearanceWidth:1,clearanceHeight:.95};
human.position=first;

human.held=null;
let feasibility=SP.traversalFeasibility(st,human,first,second);
assert.equal(feasibility.modes.kneelCrawl.feasible,true,'no-held crawl must preserve baseline feasibility');

human.held='basket';
feasibility=SP.traversalFeasibility(st,human,first,second);
assert.equal(feasibility.modes.kneelCrawl.feasible,false);
assert.ok(feasibility.modes.kneelCrawl.failedAxes.includes('hands'),'two-hand basket crawl failure must identify hand demand');

human.held='cupA';
feasibility=SP.traversalFeasibility(st,human,first,second);
assert.equal(feasibility.modes.kneelCrawl.feasible,true,'one-hand cup leaves one support hand');

human.held=null;
assert.ok(P.surfaceManeuverScaleCandidates(human,{verticalDelta:.74,horizontalGap:.61},st).some(candidate=>candidate.kind==='climbUp'));
human.held='basket';
assert.equal(P.surfaceManeuverScaleCandidates(human,{verticalDelta:.74,horizontalGap:.61},st).length,0,'two-hand basket must filter the climb-only maneuver');
human.held='cupA';
assert.ok(P.surfaceManeuverScaleCandidates(human,{verticalDelta:.74,horizontalGap:.61},st).some(candidate=>candidate.kind==='climbUp'),'one-hand cup must keep climb feasible');

E.reset(11711);
const validationState=E.getState(),validationHuman=validationState.agents.zhen;
validationState.containers.threeHand={id:'threeHand',name:'Three-hand probe',portable:true,capacity:1,emptyLoad:0,contents:{},position:{...validationHuman.position},handling:{carryGeometry:{width:.2,height:.2,length:.2},handsRequired:3}};
assert.equal(R.canHoldContainer(validationState,validationHuman,'threeHand'),false);
validationHuman.held='threeHand';
assert.equal(P.locomotionModeHandsFeasible(validationState,validationHuman,'walk'),false,'total hand demand must reject an over-capacity held Container even when walk needs no support hand');
let validation=V.validateState(validationState);
assert.ok(validation.issues.some(issue=>issue.code==='physical_held_container_hand_capacity_exceeded'));
validationHuman.held=null;delete validationState.containers.threeHand;
validation=V.validateState(validationState);
assert.equal(validation.issueCount,0,validation.issues.map(issue=>issue.code+': '+issue.message).join(' | '));

console.log('carried container physical feasibility regression: ok');
