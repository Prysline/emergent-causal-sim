import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world-authoring.js','world-initializer.js']){
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

const layeredCompatibility=I.analyzeRuntimeCompatibility(imported);
assert.equal(layeredCompatibility.ok,true,layeredCompatibility.hardErrors.map(issue=>issue.code+': '+issue.message).join(' | '));
const layeredRuntime=I.createInitialState(imported,{seed:1,version:'test'});
assert.deepEqual(layeredRuntime.map.zLevels,[0,1],'Slice E runtime compiler must preserve authored layer identity');
assert.equal(layeredRuntime.map.tiles['2,2,1'].terrain,'floor','non-zero authored layer must compile into a distinct runtime tile key');

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
for(const forbidden of ['src/world.js','src/spatial.js','src/engine.js','src/state-validator.js']){
  assert.ok(!editorHtml.includes(forbidden),`Editor entry must not load runtime owner: ${forbidden}`);
}
const authoringScript=editorHtml.indexOf('src/world-authoring.js');
const initializerScript=editorHtml.indexOf('src/world-initializer.js');
const previewBridgeScript=editorHtml.indexOf('src/editor-preview-bridge.js');
const mutationScript=editorHtml.indexOf('src/editor-authoring-mutations.js');
const editorScript=editorHtml.indexOf('src/editor-ui.js');
assert.ok(authoringScript>=0&&initializerScript>authoringScript&&previewBridgeScript>initializerScript&&mutationScript>previewBridgeScript&&editorScript>mutationScript,'D.1C Editor load order must be authoring → compatibility initializer → preview bridge → pure mutation owner → UI');
assert.ok(editorHtml.includes('WORLD AUTHORING · world-authoring-v2'));
assert.ok(editorHtml.includes('src/world-authoring.js'));
assert.ok(editorHtml.includes('src/world-initializer.js'));
assert.ok(editorHtml.includes('src/editor-preview-bridge.js'));
assert.ok(editorHtml.includes('id="testWorld"'));
assert.ok(editorHtml.includes('data-tool="select"'),'Editor must expose a neutral select/browse tool so placement modes can be exited without authoring terrain');
assert.ok(editorHtml.includes('開口／門洞'),'doorway terrain must be labeled as an opening, not conflated with exit capability');
assert.ok(editorHtml.includes('src/editor-ui.js'));
assert.ok(editorHtml.includes('terrain: "doorway"'),'Editor must expose doorway terrain semantics without requiring internal compiler terminology in visible copy');
assert.ok(editorHtml.includes('id="sceneList"'),'Editor must expose one scene-list surface for furniture, objects and residents');
assert.ok(!editorHtml.includes('id="furnitureSelect"'),'D.1A replaces the furniture-only dropdown with the shared scene list');

const editorUi=fs.readFileSync(new URL('../src/editor-ui.js',import.meta.url),'utf8');
for(const forbidden of ['SimEngine','SimSpatial','createInitialState','PassageProfile','passageConstraints']){
  assert.ok(!editorUi.includes(forbidden),`Editor UI must not consume runtime traversal truth: ${forbidden}`);
}
assert.ok(editorUi.includes('deriveHorizontalTopology'),'Editor preview must use the shared authoring-side topology derivation');
assert.ok(editorUi.includes('sceneEntries'),'Editor must derive the scene list from canonical authoring data rather than persist a second scene registry');
assert.ok(editorUi.includes('residentPosition'),'Editor scene selection must resolve exact and furnitureSlot-anchored resident positions from authoring truth');
assert.ok(!editorUi.includes('entity-dot'),'generic untyped entity dots must not remain after D.1A');
assert.ok(editorUi.includes('SimEditorAuthoringMutations'),'Editor UI must delegate entity lifecycle semantics to the pure mutation owner');
assert.ok(editorUi.includes('pendingOperation'),'D.1B1 must keep pending mutation intent separate from generic scene selection');
assert.ok(editorUi.includes('DRAG_THRESHOLD_PX'),'D.1B2 must distinguish click selection from desktop drag with an explicit movement threshold');
for(const eventName of ['pointerdown','pointermove','pointerup','pointercancel'])assert.ok(editorUi.includes(eventName),`D.1B2 must use Pointer Events for furniture drag: ${eventName}`);
assert.ok(editorUi.includes('dragState'),'D.1B2 drag preview state must remain explicit ephemeral Editor state');
assert.ok(editorUi.includes('SimEditorPreviewBridge'),'D.1C launch must delegate browser-session handoff to the explicit preview bridge');
assert.ok(editorUi.includes('P.storePreview(authored)'),'D.1C must preflight/store the same canonical Editor document before navigation');
assert.ok(editorUi.includes('allowPreviewNavigation'),'D.1C preview navigation must bypass only the intentional dirty-document unload guard');
assert.ok(editorUi.includes('P.getRestorePreview?.()'),'Preview return must restore only through the explicit handoff query path');
assert.ok(editorUi.includes("clean:false,message:'已從 Editor Preview 恢復工作稿"),'restored Preview snapshot must remain an unsaved Editor working document');
assert.ok(editorUi.includes("active?'select':'furniture'"),'Furniture placement action must toggle back to neutral select mode');
assert.ok(editorUi.includes("chair:'餐椅'"),'Furniture instance presentation must expose the shared chair type independently from A/B/C/D instance names');
assert.ok(editorUi.includes('>複製家具<'),'duplicateFurniture must be presented as duplication, not as catalog-style furniture creation');
assert.ok(!editorUi.includes('新增同型家具'),'clone-existing-instance UI must not be mislabeled as furniture-library creation');
assert.ok(editorUi.includes('移動自由位置'),'Resident UI must describe the exact-only move in user language');
assert.ok(editorUi.includes('解除家具綁定並移動（站立）'),'Resident UI must describe the explicit detach + standing conversion');
assert.ok(editorUi.includes('取消目前操作'),'pendingOperation may remain an internal key, but visible cancellation copy must be localized');
assert.ok(!editorUi.includes('取消 pending operation'),'internal pendingOperation terminology must not leak into the primary Editor UI');
assert.ok(editorUi.includes("M.moveFurniture(authored,{furnitureId:dragState.furnitureId,target})"),'drag preview must delegate to the canonical Furniture mutation owner');
assert.ok(editorUi.includes("M.moveFurniture(authored,{furnitureId:completed.furnitureId,target:completed.target})"),'drag drop commit must delegate to the canonical Furniture mutation owner');
assert.ok(!editorUi.includes('function moveFurniture('),'Editor UI must not retain a second Furniture movement implementation');
for(const ephemeral of ['currentZ','selectedTool','selectedFurnitureId','selection','pendingOperation','baselineFingerprint']){
  assert.ok(editorUi.includes(ephemeral),`Expected Editor ephemeral state: ${ephemeral}`);
}
assert.ok(!exported.includes('"currentZ"'));
assert.ok(!exported.includes('"selectedTool"'));
assert.ok(!exported.includes('"dirty"'));
assert.ok(!exported.includes('"pendingOperation"'));
assert.ok(!exported.includes('"dragState"'));

console.log('world authoring editor contract: ok');