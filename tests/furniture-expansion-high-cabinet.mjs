import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['furniture-definitions.js','horizontal-geometry.js','world-authoring.js','embodiment-capabilities.js','editor-authoring-mutations.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}

const D=globalThis.SimFurnitureDefinitions;
const A=globalThis.SimWorldAuthoring;
const M=globalThis.SimEditorAuthoringMutations;
const clone=value=>JSON.parse(JSON.stringify(value));

assert.equal(D.VERSION,'furniture-definitions-v12');

const definition=D.getDefinition('cabinet-tall');
assert.ok(definition,'Furniture Catalog must expose cabinet-tall');
assert.equal(definition.name,'高櫃');
assert.equal(definition.kind,'cabinet');
assert.deepEqual(definition.footprint,[{x:0,y:0,z:0}]);
assert.deepEqual(definition.slots,[],'high cabinet must not invent activity Slots');
assert.equal(definition.spatial.surface,undefined,'high cabinet must not retain legacy explicit spatial.surface truth');
assert.deepEqual(definition.spatial.solids,[
  {key:'body',bounds:{x:.05,y:.05,z:0,width:.90,depth:.90,height:1.90},faces:{top:{supportsBodyOccupancy:true,surfaceLabel:'高櫃頂面'}}}
]);

const resolved=D.resolveInstance({
  id:'cabinet-tall-1',
  definitionId:'cabinet-tall',
  origin:{x:3,y:4,z:0},
  orientation:'south'
});
assert.deepEqual(resolved.footprint,[{x:3,y:4,z:0}]);
assert.deepEqual(resolved.slots,[]);
assert.equal(resolved.spatial.surface,undefined,'legacy singular Surface remains absent during derived-Surface migration');
assert.equal(resolved.spatial.surfaces.length,1);
assert.deepEqual(resolved.spatial.surfaces[0],{
  id:'cabinet-tall-1:body',
  label:'高櫃頂面',
  sourceSolidKey:'body',
  face:'top',
  supportRegion:{x:3.05,y:4.05,width:.90,depth:.90},
  topElevation:1.90,
  cells:[{x:3,y:4,z:0}]
});
assert.deepEqual(resolved.spatial.solids[0],{
  key:'body',
  layerZ:0,
  bounds:{x:3.05,y:4.05,z:0,width:.90,depth:.90,height:1.90}
});

const floorGeometry=D.analyzeFloorTile(resolved.spatial.solids,3,4,0);
assert.equal(floorGeometry.blocked,false,'metric geometry may retain narrow edge strips without pretending the whole tile is a boolean blocker');
assert.equal(floorGeometry.regionCount,1);
assert.equal(D.envelopeFitsTile(resolved.spatial.solids,3,4,0,1.65,.45),false,'default Human walk envelope must not fit around the high cabinet');
assert.equal(D.envelopeFitsTile(resolved.spatial.solids,3,4,0,.32,.18),false,'default Cat walk envelope must not fit around the high cabinet');

const doc=clone(A.DEFAULT_WORLD_AUTHORING);
const result=M.createFurnitureFromDefinition(doc,{definitionId:'cabinet-tall',target:{x:3,y:4,z:0}});
assert.equal(result.ok,true,result.issues.map(issue=>issue.code).join(','));
assert.equal(result.meta.newId,'cabinet-tall-1');
assert.deepEqual(result.candidate.furniture['cabinet-tall-1'],{
  id:'cabinet-tall-1',
  definitionId:'cabinet-tall',
  origin:{x:3,y:4,z:0},
  orientation:'south'
});
assert.equal(Object.hasOwn(result.candidate.furniture['cabinet-tall-1'],'footprint'),false,'compact Furniture Instance must not copy Definition geometry');
assert.equal(Object.hasOwn(result.candidate.furniture['cabinet-tall-1'],'slots'),false,'compact Furniture Instance must not copy Definition activity data');

console.log('Furniture expansion high cabinet: ok');
