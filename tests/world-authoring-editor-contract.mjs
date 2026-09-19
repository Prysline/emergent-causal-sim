import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world-authoring-v1.js','world-initializer.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}
const A=globalThis.SimWorldAuthoring,I=globalThis.SimWorldInitializer;
const clone=value=>JSON.parse(JSON.stringify(value));

assert.equal(A.VERSION,'world-authoring-v2');
assert.equal(A.validateAuthoring(A.DEFAULT_WORLD_AUTHORING).ok,true,'default canonical authoring must validate');

const layered=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
layered.map.layers.push({z:1,cells:{'2,2':{terrain:'floor',material:'wood'}}});
let report=A.validateAuthoring(layered);
assert.equal(report.ok,true,report.errors.map(issue=>issue.code+': '+issue.path).join(' | '));

layered.compatibility={passageConstraints:{'1,1>2,1':{clearanceWidth:.9}}};
const exported=A.serializeAuthoring(layered);
const imported=A.parseAuthoringJSON(exported);
assert.equal(A.semanticFingerprint(imported),A.semanticFingerprint(layered),'export → import must preserve authoring semantics');
assert.deepEqual(imported.compatibility,layered.compatibility,'low-level compatibility namespace must survive round-trip');
assert.deepEqual(imported.map.layers.map(layer=>layer.z),[0,1],'canonical serialization must preserve ordered Z identity');
assert.equal(imported.authoringSchema,'world-authoring-v2');
const topology=A.deriveHorizontalTopology(imported,{z:0});
assert.equal(topology.cells['0,6'].structuralOpen,true,'opening must derive structural openness without persisted walkability');
assert.equal(topology.cells['0,6'].open,false,'blocking front door must close the opening in derived topology');
assert.ok(!exported.includes('"componentId"')&&!exported.includes('"adjacent"'),'derived topology must not serialize into world truth');

assert.throws(
  ()=>I.createInitialState(imported,{seed:1,version:'test'}),
  /requires exactly one z=0 layer/,
  'current runtime adapter must loud-fail multi-layer authoring'
);

{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  invalid.map.layers.push({z:0,cells:{}});
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_layer_z_duplicate'));
}
{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  invalid.map.layers[0].cells['1,1'].walkable=true;
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_derived_cell_field'&&issue.path.includes('walkable')));
}
{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  invalid.furniture.chairNW.footprint[0]={x:99,y:2,z:0};
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_position_out_of_bounds'));
}
{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  invalid.entities.containers.basket.position={x:3,y:2,z:9};
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_position_layer_missing'));
}
{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  invalid.furniture.diningTable.footprint=invalid.furniture.diningTable.footprint.map(p=>({...p,x:p.x+1}));
  invalid.furniture.diningTable.displayAt={...invalid.furniture.diningTable.displayAt,x:invalid.furniture.diningTable.displayAt.x+1};
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_support_position_mismatch'&&issue.supportId==='diningTable'));
}
{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  delete invalid.residents.zhen.initial.placement.node.z;
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_position_coordinate_invalid'));
}

const editorHtml=fs.readFileSync(new URL('../editor.html',import.meta.url),'utf8');
for(const forbidden of ['src/world-initializer.js','src/world.js','src/spatial.js','src/engine.js','src/state-validator.js']){
  assert.ok(!editorHtml.includes(forbidden),`Editor entry must not load runtime owner: ${forbidden}`);
}
assert.ok(editorHtml.includes('WORLD AUTHORING · world-authoring-v2'));
assert.ok(editorHtml.includes('src/world-authoring-v1.js'));
assert.ok(editorHtml.includes('src/editor-ui.js'));
assert.ok(editorHtml.includes('shared geometry compiler'));

const editorUi=fs.readFileSync(new URL('../src/editor-ui.js',import.meta.url),'utf8');
for(const forbidden of ['SimEngine','SimSpatial','createInitialState','PassageProfile','passageConstraints']){
  assert.ok(!editorUi.includes(forbidden),`Editor UI must not consume runtime traversal truth: ${forbidden}`);
}
assert.ok(editorUi.includes('deriveHorizontalTopology'),'Editor preview must use the shared authoring-side topology derivation');
for(const ephemeral of ['currentZ','selectedTool','selectedFurnitureId','baselineFingerprint']){
  assert.ok(editorUi.includes(ephemeral),`Expected Editor ephemeral state: ${ephemeral}`);
}
assert.ok(!exported.includes('"currentZ"'));
assert.ok(!exported.includes('"selectedTool"'));
assert.ok(!exported.includes('"dirty"'));

console.log('world authoring editor contract: ok');