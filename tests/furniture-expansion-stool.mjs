import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['furniture-definitions.js','embodiment-capabilities.js','world-authoring.js','editor-authoring-mutations.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}

const D=globalThis.SimFurnitureDefinitions;
const C=globalThis.SimEmbodimentCapabilities;
const A=globalThis.SimWorldAuthoring;
const M=globalThis.SimEditorAuthoringMutations;
const clone=value=>JSON.parse(JSON.stringify(value));

assert.equal(D.VERSION,'furniture-definitions-v10');

const definition=D.getDefinition('stool-basic');
assert.ok(definition,'Furniture Catalog must expose stool-basic');
assert.equal(definition.name,'矮凳');
assert.equal(definition.kind,'stool');
assert.equal(definition.orientationSemantics,'frame');
assert.deepEqual(definition.footprint,[{x:0,y:0,z:0}]);
assert.equal(definition.spatial.surface,undefined,'stool seat must remain a Slot target, not a traversable Surface');
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

assert.deepEqual(definition.spatial.solids,[
  {key:'seat',bounds:{x:.28,y:.28,z:.45,width:.44,depth:.44,height:.04}},
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
assert.equal(resolved.spatial.surface,undefined);

const human=C.defaultPhysicalProfile('human');
const cat=C.defaultPhysicalProfile('cat');
const humanSitting=C.getPoseEnvelopeForKind('human',human.bodyGeometry,'sitting');
const catSitting=C.getPoseEnvelopeForKind('cat',cat.bodyGeometry,'sitting');
assert.deepEqual(humanSitting,{height:.9075000000000001,width:.45,length:.594});
assert.equal(C.poseEnvelopeFitsUsableSpace(humanSitting,seat.usableSpace),true,'default Human sitting PoseEnvelope must fit stool seat');
assert.equal(C.poseEnvelopeFitsUsableSpace(catSitting,seat.usableSpace),true,'default Cat sitting PoseEnvelope must fit the same stool seat');
assert.equal(seat.allowKinds,undefined,'stool must not use species allowKinds as a proxy for physical size; PoseEnvelope owns static fit');

assert.equal(D.envelopeFitsTile(resolved.spatial.solids,3,4,0,1.65,.45),false,'default Human walk envelope must not fit through or around the low stool within one tile');
assert.equal(D.envelopeFitsTile(resolved.spatial.solids,3,4,0,.32,.18),true,'default Cat walk envelope must fit under/around the low stool geometry');

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
