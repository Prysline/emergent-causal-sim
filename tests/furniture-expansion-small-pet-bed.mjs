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

assert.equal(D.VERSION,'furniture-definitions-v12');
assert.equal(A.FURNITURE_CATALOG_VERSION,D.VERSION);

const definition=D.getDefinition('pet-bed-small');
assert.ok(definition,'Furniture Catalog must expose pet-bed-small');
assert.equal(definition.name,'小型寵物床');
assert.equal(definition.kind,'pet-bed');
assert.equal(definition.orientationSemantics,'frame');
assert.deepEqual(definition.footprint,[{x:0,y:0,z:0}]);
assert.equal(definition.spatial.surface,undefined,'pet bed must remain Slot-based, not a traversable Surface');
assert.equal(definition.slots.length,1);

const slot=definition.slots[0];
assert.deepEqual(slot,{
  key:'bed',
  label:'休息位',
  offset:{x:0,y:0,z:0},
  approachEdges:['north','east','south','west'],
  canRest:true,
  canSleep:true,
  usableSpace:{width:.55,length:.65},
  activitySuitability:{rest:.30,sleep:.75}
});
assert.equal(slot.allowKinds,undefined,'pet bed must not use cat-only allowKinds');

assert.deepEqual(definition.spatial.solids,[
  {key:'cushion',bounds:{x:.15,y:.10,z:0,width:.70,depth:.80,height:.12}}
]);

const humanProfile=C.defaultPhysicalProfile('human');
const catProfile=C.defaultPhysicalProfile('cat');
const humanSitting=C.getPoseEnvelopeForKind('human',humanProfile.bodyGeometry,'sitting');
const humanLying=C.getPoseEnvelopeForKind('human',humanProfile.bodyGeometry,'lying');
const catSitting=C.getPoseEnvelopeForKind('cat',catProfile.bodyGeometry,'sitting');
const catLying=C.getPoseEnvelopeForKind('cat',catProfile.bodyGeometry,'lying');

assert.equal(C.poseEnvelopeFitsUsableSpace(humanSitting,slot.usableSpace),true,'default Human sitting must fit the small pet bed rest space');
assert.equal(C.poseEnvelopeFitsUsableSpace(humanLying,slot.usableSpace),false,'default Human lying must not fit the small pet bed sleep space');
assert.equal(C.poseEnvelopeFitsUsableSpace(catSitting,slot.usableSpace),true,'default Cat sitting must fit the small pet bed');
assert.equal(C.poseEnvelopeFitsUsableSpace(catLying,slot.usableSpace),true,'default Cat lying must fit the small pet bed');

const authored=clone(A.DEFAULT_WORLD_AUTHORING);
authored.furniture.petBedProof={id:'petBedProof',definitionId:'pet-bed-small',origin:{x:3,y:4,z:0},orientation:'south'};
const st=compile(authored);
const human=st.agents.zhen,cat=st.agents.orange,petBed=SP.getSlot(st,'petBedProof:bed');
assert.ok(petBed,'runtime compiler must resolve a stable pet-bed Slot');
assert.equal(petBed.allowKinds,undefined);
assert.equal(petBed.restQuality,.30);
assert.equal(petBed.sleepQuality,.75);

assert.equal(SP.slotAllows(petBed,human),true);
assert.equal(SP.slotAllows(petBed,cat),true);
assert.equal(SP.slotPoseFits(petBed,human,'sitting'),true);
assert.equal(SP.slotPoseFits(petBed,human,'lying'),false);
assert.equal(SP.slotPoseFits(petBed,cat,'sitting'),true);
assert.equal(SP.slotPoseFits(petBed,cat,'lying'),true);

assert.ok(SP.restTargets(st,human).some(target=>target.id==='petBedProof:bed'&&target.posture==='sitting'),'Human may rest sitting when physically fit; pet-bed semantics must not hard-ban Human');
assert.ok(SP.restTargets(st,cat).some(target=>target.id==='petBedProof:bed'&&target.posture==='sitting'),'Cat may rest sitting on the same Slot');
assert.equal(SP.sleepTargets(st,human).some(target=>target.id==='petBedProof:bed'),false,'Human sleep must be rejected by lying PoseEnvelope fit, not species restriction');
assert.ok(SP.sleepTargets(st,cat).some(target=>target.id==='petBedProof:bed'&&target.posture==='lying'),'Cat sleep must remain a legal generic sleep target');

const doc=clone(A.DEFAULT_WORLD_AUTHORING);
const result=M.createFurnitureFromDefinition(doc,{definitionId:'pet-bed-small',target:{x:3,y:4,z:0}});
assert.equal(result.ok,true,result.issues.map(issue=>issue.code).join(','));
assert.equal(result.meta.newId,'pet-bed-small-1');
assert.deepEqual(result.candidate.furniture['pet-bed-small-1'],{
  id:'pet-bed-small-1',
  definitionId:'pet-bed-small',
  origin:{x:3,y:4,z:0},
  orientation:'south'
});
assert.equal(Object.hasOwn(result.candidate.furniture['pet-bed-small-1'],'spatial'),false);
assert.equal(Object.hasOwn(result.candidate.furniture['pet-bed-small-1'],'slots'),false);

console.log('Furniture expansion small pet bed: ok');
