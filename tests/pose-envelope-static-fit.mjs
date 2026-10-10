import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js',
  'spatial.js','spatial-traversal.js','systems/physical.js','engine.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/physical-profile.js'
]);

const A=globalThis.SimWorldAuthoring;
const I=globalThis.SimWorldInitializer;
const E=globalThis.SimEngine;
const SP=globalThis.SimSpatial;
const P=globalThis.SimPhysical;
const V=globalThis.SimValidator;
const C=globalThis.SimEmbodimentCapabilities;

const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-9,`${message}: expected ${expected}, got ${actual}`);

E.reset(20260927);
let st=E.getState();
const human=st.agents.zhen;
const cat=st.agents.orange;

assert.equal(C.VERSION,'embodiment-capabilities-v5');
assert.equal(P.VERSION,'11.45.0-agent-carry-relocate');
assert.equal(st.version,globalThis.SimRelease.VERSION);

const humanStanding=P.getPoseEnvelope(human,'standing');
near(humanStanding.height,1.65,'Human standing height');
near(humanStanding.width,.45,'Human standing width');
near(humanStanding.length,.30,'Human standing length');
const humanSupport=P.getSupportFootprint(human,'standing'),catSupport=P.getSupportFootprint(cat,'standing');
near(humanSupport.width,.27,'Human standing support width');
near(humanSupport.length,.24,'Human standing support length');
near(catSupport.width,.18,'Cat standing support width');
near(catSupport.length,.36,'Cat standing support length');

const humanSitting=P.getPoseEnvelope(human,'sitting');
near(humanSitting.height,.9075,'Human sitting height');
near(humanSitting.width,.45,'Human sitting width');
near(humanSitting.length,.594,'Human sitting length');

const humanLying=P.getPoseEnvelope(human,'lying');
near(humanLying.height,.30,'Human lying height');
near(humanLying.width,.45,'Human lying width');
near(humanLying.length,1.65,'Human lying length');

const catSitting=P.getPoseEnvelope(cat,'sitting');
near(catSitting.height,.45,'Cat sitting height');
near(catSitting.width,.18,'Cat sitting width');
near(catSitting.length,.288,'Cat sitting length');

const catLying=P.getPoseEnvelope(cat,'lying');
near(catLying.height,.16,'Cat lying height');
near(catLying.width,.225,'Cat lying width');
near(catLying.length,.45,'Cat lying length');

const oldHumanHeight=human.physical.bodyGeometry.height;
human.physical.bodyGeometry.height=2;
near(P.getPoseEnvelope(human,'lying').length,2,'PoseEnvelope must derive from current individual bodyGeometry');
assert.equal(Object.prototype.hasOwnProperty.call(human.physical,'poseEnvelope'),false,'PoseEnvelope must not be persisted');
human.physical.bodyGeometry.height=oldHumanHeight;

const chair=SP.getSlot(st,'chairNW:seat');
const sofa=SP.getSlot(st,'sofa:left');
const bed=SP.getSlot(st,'bed:left');

assert.deepEqual(chair.usableSpace,{width:.50,length:.65});
assert.deepEqual(sofa.usableSpace,{width:.90,length:.70});
assert.deepEqual(bed.usableSpace,{width:.70,length:2.00});
assert.equal(SP.slotPoseFits(chair,human,'sitting'),true,'default Human sitting must fit dining chair');
assert.equal(SP.slotPoseFits(sofa,human,'sitting'),true,'default Human sitting must fit sofa slot');
assert.equal(SP.slotPoseFits(sofa,human,'lying'),false,'default Human lying must not fit a single sofa slot');
assert.equal(SP.slotPoseFits(bed,human,'lying'),true,'default Human lying must fit double-bed slot');
assert.equal(SP.slotPoseFits(sofa,cat,'lying'),true,'default Cat lying must fit sofa slot');
assert.equal(SP.slotPoseFits(bed,cat,'lying'),true,'default Cat lying must fit double-bed slot');
assert.equal(chair.allowKinds.includes('cat'),false,'chair kind restriction remains independent of physical fit');
assert.equal(SP.slotPoseFits(chair,cat,'sitting'),true,'Cat sitting physically fits chair even though allowKinds still rejects Cat');
assert.equal(SP.restTargets(st,cat).some(target=>target.id==='chairNW:seat'),false,'fit must not override allowKinds');

human.physical.bodyGeometry.height=2.1;
assert.equal(SP.slotPoseFits(bed,human,'lying'),false,'enlarged Human lying must not fit the same bed slot');
human.physical.bodyGeometry.height=oldHumanHeight;

st.agents.zhou.position={...bed.position};
st.agents.zhou.posture={kind:'lying',slotId:bed.id,furnitureId:bed.furnitureId};
assert.equal(SP.sleepTargets(st,human).some(target=>target.id===bed.id),false,'occupied slot must remain unavailable after fit succeeds');
st.agents.zhou.posture={kind:'standing',slotId:null,furnitureId:null};

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'sofa:left'}};
authored.residents.zhen.initial.posture={kind:'lying',slotId:'sofa:left'};
let report=I.analyzeInitialPlacements(authored);
assert.equal(report.ok,false,'Initializer must reject a Human lying in one sofa slot');
assert.ok(report.hardErrors.some(issue=>issue.code==='initial_anchor_pose_fit_mismatch'&&issue.residentId==='zhen'));

const catBed=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
catBed.residents.orange.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'bed:left'}};
catBed.residents.orange.initial.posture={kind:'lying',slotId:'bed:left'};
report=I.analyzeInitialPlacements(catBed);
assert.equal(report.ok,true,report.hardErrors.map(issue=>issue.message).join('\n'));

E.reset(20260927);
st=E.getState();
const settling=st.agents.zhen;
for(const other of Object.values(st.agents))other.offMap=other.id!==settling.id;
const selected=SP.sleepTargets(st,settling).find(target=>target.id==='bed:left');
assert.ok(selected,'default Human must initially select bed:left as a legal sleep target');
settling.position={...selected.position};
settling.action={kind:'sleep',phase:'settle',sleepTarget:{...selected},sleepTicks:0,started:st.tick,wait:0};
settling.physical.bodyGeometry.height=2.1;
E.tick();
assert.notEqual(settling.posture.slotId,'bed:left','settle must recheck current bodyGeometry instead of using stale selection eligibility');
assert.notEqual(settling.action?.phase,'sleeping','invalidated fit must not enter sleeping phase');

E.reset(20260927);
st=E.getState();
const invalid=st.agents.zhen;
const sofaSlot=SP.getSlot(st,'sofa:left');
invalid.position={...sofaSlot.position};
invalid.posture={kind:'lying',slotId:sofaSlot.id,furnitureId:sofaSlot.furnitureId};
let validation=V.validateState(st);
assert.ok(validation.issues.some(issue=>issue.code==='slot_pose_fit_invalid'&&issue.agentId==='zhen'),'Validator must reject an existing slot-bound pose that does not fit');

invalid.posture={kind:'standing',slotId:null,furnitureId:null};
invalid.physical.poseEnvelope={height:1,width:1,length:1};
validation=V.validateState(st);
assert.ok(validation.issues.some(issue=>issue.code==='physical_derived_pose_envelope_persisted'&&issue.agentId==='zhen'),'Validator must reject persistent PoseEnvelope mirrors');

console.log('PoseEnvelope static-fit contract: ok');
