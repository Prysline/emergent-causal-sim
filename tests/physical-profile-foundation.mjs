import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js',
  'systems/physical.js','engine.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/physical-profile.js'
]);

const APP_VERSION='11.43.0-attention-observation';
const PHYSICAL_VERSION='11.37.0-carried-container-feasibility';
const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial,C=globalThis.SimEmbodimentCapabilities,P=globalThis.SimPhysical,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

E.reset(11700);
const st=E.getState(),zhen=st.agents.zhen,zhou=st.agents.zhou,orange=st.agents.orange;
assert.equal(st.version,APP_VERSION);
assert.equal(W.PHYSICAL_SCHEMA_VERSION,PHYSICAL_VERSION);
assert.equal(P.VERSION,PHYSICAL_VERSION);
assert.equal(C.VERSION,'embodiment-capabilities-v4');
assert.equal(W.PHYSICAL_DEFAULT_PROFILES,C.DEFAULT_PHYSICAL_PROFILES,'runtime Physical defaults must reference the shared capability owner');
assert.equal(W.defaultPhysicalProfile('unknown-kind'),null,'unknown kinds must not silently inherit Human physical geometry');

for(const a of [zhen,zhou,orange]){
  assert.ok(a.physical,'every current Agent must own authoritative physical state');
  assert.ok(a.physical.mass>0&&a.physical.volume>0);
  assert.ok(a.physical.bodyGeometry.height>0&&a.physical.bodyGeometry.width>0&&a.physical.bodyGeometry.length>0);
  assert.equal(a.physical.locomotionCapabilities.walk,true);
  assert.equal(Object.prototype.hasOwnProperty.call(a.physical.locomotionCapabilities,'standing'),false,'posture standing must not remain a locomotion mode alias');
  assert.equal(Object.prototype.hasOwnProperty.call(a.physical,'movementEnvelope'),false,'MovementEnvelope must remain derived');
  const envelope=P.getMovementEnvelope(a,'walk');
  assert.ok(envelope&&envelope.clearanceHeight>0&&envelope.clearanceWidth>0&&envelope.clearanceLength>0);
  assert.equal(envelope.sourceMode,'walk');
  assert.equal(P.requiredClearance(a,'walk'),envelope.clearanceHeight);
}
assert.deepEqual(P.supportedLocomotionModes(zhen),['walk','kneelCrawl','proneCrawl'],'Human first Slice 2 profile must expose the agreed modes');
assert.deepEqual(P.supportedLocomotionModes(orange),['walk'],'Cat Slice 2 must not inherit Human crawl mode names');

assert.equal(P.requiredClearance(zhen,'walk'),1.65,'default Human walk clearance must preserve v11.11 standing behavior');
assert.equal(P.requiredClearance(orange,'walk'),.32,'default Cat walk clearance must preserve v11.11 standing behavior');

assert.deepEqual(P.getPoseEnvelope(zhen,'standing'),{height:1.65,width:.45,length:.30},'standing static body geometry must be distinct from MovementEnvelope');
const humanSupport=P.getSupportFootprint(zhen,'standing'),catSupport=P.getSupportFootprint(orange,'standing');
assert.ok(Math.abs(humanSupport.width-.27)<1e-9&&Math.abs(humanSupport.length-.24)<1e-9,'Human standing support footprint must fit ordinary chair-scale support without using shoulder width');
assert.ok(Math.abs(catSupport.width-.18)<1e-9&&Math.abs(catSupport.length-.36)<1e-9,'Cat quadruped support footprint must derive from Cat body geometry');
assert.ok(Math.abs(P.getSurfaceManeuverCapability(zhen,'step').maxUpHeight-.495)<1e-9);
assert.ok(Math.abs(P.getSurfaceManeuverCapability(zhen,'climb').maxUpHeight-.99)<1e-9);
assert.ok(Math.abs(P.getSurfaceManeuverCapability(orange,'jump').maxUpHeight-.96)<1e-9);

const humanChair=P.surfaceManeuverScaleCandidates(zhen,{verticalDelta:.47,horizontalGap:.30}).map(x=>x.kind);
assert.ok(humanChair.includes('stepUp')&&humanChair.includes('climbUp'),'default Human chair-scale transition may expose multiple maneuver candidates');
const humanTable=P.surfaceManeuverScaleCandidates(zhen,{verticalDelta:.74,horizontalGap:.61}).map(x=>x.kind);
assert.deepEqual(humanTable,['climbUp'],'default Human table-scale calibration must require climb by scale');
const catTable=P.surfaceManeuverScaleCandidates(orange,{verticalDelta:.74,horizontalGap:.61}).map(x=>x.kind);
assert.deepEqual(catTable,['jumpUp'],'default Cat table-scale calibration must use jump rather than Human maneuver ratios');
assert.deepEqual(P.surfaceManeuverScaleCandidates(zhen,{verticalDelta:1.90,horizontalGap:.05}),[],'default Human must not gain cabinet-top reachability from scale alone');
assert.deepEqual(P.surfaceManeuverScaleCandidates(orange,{verticalDelta:1.90,horizontalGap:.05}),[],'default Cat must not gain cabinet-top reachability from scale alone');

const originalHeight=zhen.physical.bodyGeometry.height;
zhen.physical.bodyGeometry.height=1.80;
assert.ok(Math.abs(P.getSurfaceManeuverCapability(zhen,'step').maxUpHeight-.54)<1e-9,'maneuver capability must derive from current individual bodyGeometry');
zhen.physical.bodyGeometry.height=originalHeight;

// Physical feasibility must use an independent full-cell low-roof fixture.
// Production dining-table geometry now has real side free-space, so it is not a canonical whole-cell clearance test.
const lowRoofNode=floor(st,2,4);
st.furniture.testLowRoof={
  id:'testLowRoof',name:'測試低頂空',footprint:[{x:2,y:4,z:0}],displayAt:{x:2,y:4,z:0},slots:[],
  spatial:{solids:[{key:'roof',layerZ:0,bounds:{x:2,y:4,z:.72,width:1,depth:1,height:.05}}]}
};
assert.equal(SP.nodeWalkable(st,lowRoofNode,orange),true,'default Cat walk envelope fits below the synthetic 0.72m full-cell roof');
assert.equal(SP.nodeWalkable(st,lowRoofNode,zhen),false,'default Human walk envelope does not fit below the synthetic 0.72m full-cell roof');

const oldZhenHeight=zhen.physical.bodyGeometry.height;
zhen.physical.bodyGeometry.height=.60;
assert.equal(P.requiredClearance(zhen,'walk'),.60,'clearance must derive from the individual Agent physical profile');
assert.equal(SP.nodeWalkable(st,lowRoofNode,zhen),true,'a Human individual whose walk envelope fits must no longer be blocked by kind-level hardcoding');
zhen.physical.bodyGeometry.height=oldZhenHeight;
assert.equal(SP.nodeWalkable(st,lowRoofNode,zhen),false,'restoring individual geometry restores default feasibility');

zhou.physical.locomotionProfiles.walk={...zhou.physical.locomotionProfiles.walk,clearanceHeight:.68};
assert.equal(P.requiredClearance(zhou,'walk'),.68,'locomotion profile may provide an explicit absolute envelope override');
assert.equal(SP.nodeWalkable(st,lowRoofNode,zhou),true,'Spatial must consume the canonical walk MovementEnvelope override');
delete st.furniture.testLowRoof;

const obs=SP.agentObservation(st,'orange');
assert.equal(obs.requiredClearance,.32,'Spatial observability must report canonical Physical clearance');
assert.equal(obs.movementEnvelope.sourceMode,'walk','Spatial observability must use canonical walk terminology');

let validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\n'));
orange.physical.bodyGeometry.width=0;
validation=V.validateState(st);
assert.ok(validation.issues.some(x=>x.code==='physical_geometry_invalid'&&x.agentId==='orange'),'validator must reject invalid authoritative geometry');
orange.physical.bodyGeometry.width=.18;
orange.physical.movementEnvelope={clearanceHeight:.32};
validation=V.validateState(st);
assert.ok(validation.issues.some(x=>x.code==='physical_derived_envelope_persisted'&&x.agentId==='orange'),'validator must reject persistent derived envelope mirrors');
delete orange.physical.movementEnvelope;
const oldWalk=orange.physical.locomotionCapabilities.walk;
orange.physical.locomotionCapabilities.standing=true;
orange.physical.locomotionProfiles.standing={heightFactor:1,widthFactor:1,lengthFactor:1,speedFactor:1};
validation=V.validateState(st);
assert.ok(validation.issues.some(x=>x.code==='physical_legacy_standing_mode'&&x.agentId==='orange'),'validator must reject the retired standing locomotion mode alias');
delete orange.physical.locomotionCapabilities.standing;
delete orange.physical.locomotionProfiles.standing;
orange.physical.locomotionCapabilities.walk=oldWalk;
assert.equal(V.validateState(st).issueCount,0);

E.reset(11700);
for(let i=0;i<500;i++)E.tick();
validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.slice(0,8).map(x=>x.message).join('\n'));
console.log('Physical Profile + PoseEnvelope foundation contract passed');
