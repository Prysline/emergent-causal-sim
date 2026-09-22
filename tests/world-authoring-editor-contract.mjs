import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['furniture-definitions.js','world-authoring.js','embodiment-capabilities.js','world-initializer.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}
const D=globalThis.SimFurnitureDefinitions,A=globalThis.SimWorldAuthoring,I=globalThis.SimWorldInitializer;
const clone=value=>JSON.parse(JSON.stringify(value));

assert.equal(D.VERSION,'furniture-definitions-v3');
assert.equal(A.VERSION,'world-authoring-v5');
assert.equal(A.validateAuthoring(A.DEFAULT_WORLD_AUTHORING).ok,true,'default canonical authoring must validate');

const layered=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
layered.map.layers.push({z:1,cells:{'2,2':{terrain:'floor',material:'wood'}},boundaries:{}});
let report=A.validateAuthoring(layered);
assert.equal(report.ok,true,report.errors.map(issue=>issue.code+': '+issue.path).join(' | '));

layered.compatibility={passageConstraints:{'1,1>2,1':{clearanceWidth:.9}}};
const exported=A.serializeAuthoring(layered);
const imported=A.parseAuthoringJSON(exported);
assert.equal(A.semanticFingerprint(imported),A.semanticFingerprint(layered),'export → import must preserve authoring semantics');
assert.deepEqual(imported.compatibility,layered.compatibility);
assert.deepEqual(imported.map.layers.map(layer=>layer.z),[0,1]);
assert.equal(imported.authoringSchema,'world-authoring-v5');
assert.equal(imported.furnitureCatalogVersion,'furniture-definitions-v3');
assert.deepEqual(imported.furniture.chairNW,{id:'chairNW',definitionId:'chair-basic',origin:{x:4,y:2,z:0},name:'餐椅 A'});
assert.ok(!exported.includes('"footprint"')&&!exported.includes('"slots"')&&!exported.includes('"restQuality"'),'resolved furniture truth must not serialize into compact v4 instances');

const topology=A.deriveHorizontalTopology(imported,{z:0});
assert.equal(topology.cells['1,6'].structuralOpen,true);
assert.equal(topology.cells['1,6'].open,true,'open Door must leave its authored floor access connected');
assert.equal(A.boundaryPassable(imported,0,'v:1,6'),true,'open Door must keep the opening passable');
assert.ok(!exported.includes('"componentId"')&&!exported.includes('"adjacent"'));

const layeredCompatibility=I.analyzeRuntimeCompatibility(imported);
assert.equal(layeredCompatibility.ok,true,layeredCompatibility.hardErrors.map(issue=>issue.code+': '+issue.message).join(' | '));
const layeredRuntime=I.createInitialState(imported,{seed:1,version:'test'});
assert.deepEqual(layeredRuntime.map.zLevels,[0,1]);
assert.equal(layeredRuntime.map.tiles['2,2,1'].terrain,'floor');
assert.equal(layeredRuntime.furniture.chairNW.slots[0].id,'chairNW:seat');
assert.equal(layeredRuntime.furniture.chairNW.slots[0].restQuality,.48);
assert.equal(layeredRuntime.furniture.frontDoor,undefined,'Door must not compile as Furniture');
assert.equal(layeredRuntime.doors.frontDoor.state,'open');
assert.equal(layeredRuntime.exits.frontExit.kind,'offMap');

{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  invalid.furnitureCatalogVersion='furniture-definitions-v999';
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_furniture_catalog_unsupported'));
  assert.throws(()=>A.parseAuthoringJSON(JSON.stringify(invalid)),error=>error.code==='furniture_catalog_unsupported');
}
{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  invalid.furniture.chairNW.definitionId='missing-definition';
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_furniture_definition_missing'));
}
{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  invalid.furniture.chairNW.canRest=true;
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_furniture_instance_field_unsupported'&&issue.path.endsWith('.canRest')));
}
{
  const invalid=clone(A.DEFAULT_WORLD_AUTHORING);
  invalid.furniture.diningTable.origin={x:11,y:7,z:0};
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
  invalid.furniture.diningTable.origin={x:6,y:2,z:0};
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
for(const forbidden of ['src/world.js','src/spatial.js','src/engine.js','src/validation/registry.js'])assert.ok(!editorHtml.includes(forbidden),`Editor entry must not load runtime owner: ${forbidden}`);
const definitionScript=editorHtml.indexOf('src/furniture-definitions.js');
const authoringScript=editorHtml.indexOf('src/world-authoring.js');
const capabilityScript=editorHtml.indexOf('src/embodiment-capabilities.js');
const initializerScript=editorHtml.indexOf('src/world-initializer.js');
const previewBridgeScript=editorHtml.indexOf('src/editor-preview-bridge.js');
const mutationScript=editorHtml.indexOf('src/editor-authoring-mutations.js');
const editorScript=editorHtml.indexOf('src/editor-ui.js');
assert.ok(definitionScript>=0&&authoringScript>definitionScript&&capabilityScript>authoringScript&&initializerScript>capabilityScript&&previewBridgeScript>initializerScript&&mutationScript>previewBridgeScript&&editorScript>mutationScript,'Editor load order must be Furniture Definitions → authoring → shared capabilities → compatibility initializer → preview bridge → mutation owner → UI');
assert.ok(editorHtml.includes('世界建構 · world-authoring-v5'));
assert.ok(editorHtml.includes('id="furnitureCatalog"'),'Editor-2 must expose the system Furniture Catalog as the new-instance source');
assert.ok(editorHtml.includes('id="sceneList"'));
assert.ok(!editorHtml.includes('id="furnitureSelect"'));

const editorUi=fs.readFileSync(new URL('../src/editor-ui.js',import.meta.url),'utf8');
for(const forbidden of ['SimEngine','SimSpatial','createInitialState','PassageProfile','passageConstraints'])assert.ok(!editorUi.includes(forbidden),`Editor UI must not consume runtime traversal truth: ${forbidden}`);
assert.ok(editorUi.includes('A.resolveFurnitureInstance'),'Editor UI must resolve compact instances through the shared Definition owner');
assert.ok(editorUi.includes('A.listFurnitureDefinitions()'),'Furniture Catalog UI must consume the shared pure Definition owner');
assert.ok(editorUi.includes('M.createFurnitureFromDefinition(authored,{definitionId:operation.definitionId,target})'),'new furniture must delegate to the canonical Definition → Instance mutation');
assert.ok(editorUi.includes('deriveHorizontalTopology'));
assert.ok(editorUi.includes('sceneEntries'));
assert.ok(editorUi.includes('residentPosition'));
assert.ok(editorUi.includes('SimEditorAuthoringMutations'));
assert.ok(editorUi.includes('M.setCellMaterial(authored'),'Cell material edits must delegate to the mutation owner');
assert.ok(editorUi.includes('M.setCellTerrain(authored'),'Cell terrain edits must delegate to the mutation owner');
assert.ok(editorUi.includes('M.setBoundary(authored'),'wall/opening edits must delegate to the boundary mutation owner');
assert.ok(editorUi.includes('M.setDoorState(authored'),'Door state edits must delegate to the Door mutation owner');
assert.ok(editorUi.includes('boundaryIdForCellEdge'),'Editor must derive stable grid-line boundary ids from selected Cell edges');
assert.ok(editorUi.includes('pendingOperation'));
assert.ok(editorUi.includes('DRAG_THRESHOLD_PX'));
for(const eventName of ['pointerdown','pointermove','pointerup','pointercancel'])assert.ok(editorUi.includes(eventName));
assert.ok(editorUi.includes('SimEditorPreviewBridge'));
assert.ok(editorUi.includes('P.storePreview(authored)'));
assert.ok(editorUi.includes('allowPreviewNavigation'));
assert.ok(editorUi.includes('P.getRestorePreview?.()'));
assert.ok(editorUi.includes('>複製家具<'),'duplicateFurniture must remain presented as duplication');
assert.ok(!editorUi.includes('新增同型家具'));
assert.ok(editorUi.includes('data-editor-action="move-resident"'));
assert.ok(editorUi.includes('M.listResidentFreePostures(authored,operation.residentId)'));
assert.ok(editorUi.includes('M.listResidentSlotPostures(authored,operation.residentId,operation.slotId)'));
assert.ok(editorUi.includes("M.moveFurniture(authored,{furnitureId:dragState.furnitureId,target})"));
assert.ok(editorUi.includes("M.moveFurniture(authored,{furnitureId:completed.furnitureId,target:completed.target})"));
assert.ok(!editorUi.includes('function moveFurniture('));
for(const ephemeral of ['currentZ','selectedTool','selectedFurnitureId','selection','pendingOperation','baselineFingerprint'])assert.ok(editorUi.includes(ephemeral));

assert.ok(!exported.includes('"currentZ"'));
assert.ok(!exported.includes('"selectedTool"'));
assert.ok(!exported.includes('"dirty"'));
assert.ok(!exported.includes('"pendingOperation"'));
assert.ok(!exported.includes('"dragState"'));

console.log('world authoring editor contract: ok');
