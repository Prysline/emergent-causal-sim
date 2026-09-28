import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadInitialStateProfile([
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','editor-authoring-mutations.js'
]);

const D=globalThis.SimFurnitureDefinitions;
const C=globalThis.SimEmbodimentCapabilities;
const A=globalThis.SimWorldAuthoring;
const I=globalThis.SimWorldInitializer;
const W=globalThis.SimWorld;
const SP=globalThis.SimSpatial;
const M=globalThis.SimEditorAuthoringMutations;
const clone=value=>JSON.parse(JSON.stringify(value));
const compile=authoring=>{
  const st=I.createInitialState(authoring,{seed:20260927,version:'test'});
  W.runInitialStateInitializers(st,{seed:20260927});
  return st;
};

assert.equal(D.VERSION,'furniture-definitions-v11');
assert.equal(A.FURNITURE_CATALOG_VERSION,D.VERSION);

const definition=D.getDefinition('stool-basic');
assert.ok(definition,'Furniture Catalog must expose stool-basic');
assert.equal(definition.name,'矮凳');
assert.equal(definition.kind,'stool');
assert.equal(definition.orientationSemantics,'frame');
assert.deepEqual(definition.footprint,[{x:0,y:0,z:0}]);
assert.equal(definition.spatial.surface,undefined,'stool must not retain legacy explicit spatial.surface truth');
assert.equal(definition.slots.length,1);

const seat=definition.slots[0];
assert.deepEqual(seat,{
  key:'seat',
  label:'座位',
  offset:{x:0,y:0,z:0},
  approachEdges:['north','east','south','west'],
  canRest:true,
  usableSpace:{width:.50,length:.65},
  activitySuitability:{rest:.40}
});
assert.equal(seat.allowKinds,undefined,'stool must not use species allowKinds as a proxy for physical size');

assert.deepEqual(definition.spatial.solids,[
  {key:'seat',bounds:{x:.28,y:.28,z:.45,width:.44,depth:.44,height:.04},faces:{top:{supportsBodyOccupancy:true,surfaceLabel:'矮凳座面'}}},
  {key:'legNW',bounds:{x:.30,y:.30,z:0,width:.04,depth:.04,height:.45}},
  {key:'legNE',bounds:{x:.66,y:.30,z:0,width:.04,depth:.04,height:.45}},
  {key:'legSW',bounds:{x:.30,y:.66,z:0,width:.04,depth:.04,height:.45}},
  {key:'legSE',bounds:{x:.66,y:.66,z:0,width:.04,depth:.04,height:.45}}
]);

const resolved=D.resolveInstance({
  id:'stool-basic-1',
  definitionId:'stool-basic',
  origin:{x:3,y:4,z:0},
  orientation:'south'
});
assert.deepEqual(resolved.footprint,[{x:3,y:4,z:0}]);
assert.deepEqual(resolved.slots[0].approachEdges,['north','east','south','west']);
assert.equal(resolved.slots[0].restQuality,.40);
assert.equal(resolved.spatial.surface,undefined,'legacy singular Surface remains absent during derived-Surface migration');
assert.equal(resolved.spatial.surfaces.length,1);
assert.deepEqual(resolved.spatial.surfaces[0],{
  id:'stool-basic-1:seat',
  label:'矮凳座面',
  sourceSolidKey:'seat',
  face:'top',
  supportRegion:{x:3.28,y:4.28,width:.44,depth:.44},
  topElevation:.49,
  cells:[{x:3,y:4,z:0}]
});

const humanProfile=C.defaultPhysicalProfile('human');
const catProfile=C.defaultPhysicalProfile('cat');
const humanSitting=C.getPoseEnvelopeForKind('human',humanProfile.bodyGeometry,'sitting');
const catSitting=C.getPoseEnvelopeForKind('cat',catProfile.bodyGeometry,'sitting');
const approx=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-12,`${label}: expected ${expected}, got ${actual}`);
approx(humanSitting.height,.9075,'Human sitting height');
approx(humanSitting.width,.45,'Human sitting width');
approx(humanSitting.length,.594,'Human sitting length');
approx(catSitting.height,.45,'Cat sitting height');
approx(catSitting.width,.18,'Cat sitting width');
approx(catSitting.length,.288,'Cat sitting length');
assert.equal(C.poseEnvelopeFitsUsableSpace(humanSitting,seat.usableSpace),true,'default Human sitting PoseEnvelope must fit stool seat');
assert.equal(C.poseEnvelopeFitsUsableSpace(catSitting,seat.usableSpace),true,'default Cat sitting PoseEnvelope must fit the same stool seat');

assert.equal(D.envelopeFitsTile(resolved.spatial.solids,3,4,0,1.65,.45),false,'default Human walk envelope must not fit through or around the low stool within one tile');
assert.equal(D.envelopeFitsTile(resolved.spatial.solids,3,4,0,.32,.18),true,'default Cat walk envelope must fit under/around the low stool geometry');

const authored=clone(A.DEFAULT_WORLD_AUTHORING);
authored.furniture.stoolProof={id:'stoolProof',definitionId:'stool-basic',origin:{x:3,y:4,z:0},orientation:'south'};
const st=compile(authored);
const human=st.agents.zhen,cat=st.agents.orange,stoolSlot=SP.getSlot(st,'stoolProof:seat');
assert.ok(stoolSlot,'runtime compiler must resolve a stable stool Slot');
assert.equal(stoolSlot.allowKinds,undefined);
assert.equal(SP.slotAllows(stoolSlot,human),true);
assert.equal(SP.slotAllows(stoolSlot,cat),true,'Cat must not be rejected by a species whitelist');
assert.equal(SP.slotPoseFits(stoolSlot,human,'sitting'),true);
assert.equal(SP.slotPoseFits(stoolSlot,cat,'sitting'),true);
assert.equal(SP.nodeWalkable(st,{x:3,y:4,z:0},human),false,'Human walk MovementEnvelope must treat the stool tile as unavailable');
assert.equal(SP.nodeWalkable(st,{x:3,y:4,z:0},cat),true,'Cat walk MovementEnvelope must retain low-furniture under/around access');
assert.ok(SP.restTargets(st,human).some(target=>target.id==='stoolProof:seat'&&target.posture==='sitting'),'Human must receive the stool as a generic rest Slot candidate');
assert.ok(SP.restTargets(st,cat).some(target=>target.id==='stoolProof:seat'&&target.posture==='sitting'),'Cat must receive the same stool candidate when PoseEnvelope fits');

const doc=clone(A.DEFAULT_WORLD_AUTHORING);
const result=M.createFurnitureFromDefinition(doc,{definitionId:'stool-basic',target:{x:3,y:4,z:0}});
assert.equal(result.ok,true,result.issues.map(issue=>issue.code).join(','));
assert.equal(result.meta.newId,'stool-basic-1');
assert.deepEqual(result.candidate.furniture['stool-basic-1'],{
  id:'stool-basic-1',
  definitionId:'stool-basic',
  origin:{x:3,y:4,z:0},
  orientation:'south'
});
assert.equal(Object.hasOwn(result.candidate.furniture['stool-basic-1'],'spatial'),false);
assert.equal(Object.hasOwn(result.candidate.furniture['stool-basic-1'],'slots'),false);

console.log('Furniture expansion stool: ok');
