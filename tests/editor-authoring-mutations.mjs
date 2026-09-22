import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['furniture-definitions.js','world-authoring.js','embodiment-capabilities.js','editor-authoring-mutations.js','world-initializer.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}
const A=globalThis.SimWorldAuthoring;
const C=globalThis.SimEmbodimentCapabilities;
const M=globalThis.SimEditorAuthoringMutations;
const I=globalThis.SimWorldInitializer;
const clone=value=>JSON.parse(JSON.stringify(value));
const fp=value=>A.semanticFingerprint(value);

assert.equal(A.VERSION,'world-authoring-v5');
assert.equal(C.VERSION,'embodiment-capabilities-v1');

{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const before=fp(doc);
  let result=M.setCellTerrain(doc,{x:2,y:2,z:0,terrain:null});
  assert.equal(result.ok,true);
  assert.equal(doc.map.layers[0].cells['2,2'].terrain,'floor','Cell terrain mutation must not modify the source document');
  assert.equal(result.candidate.map.layers[0].cells['2,2'],undefined);
  result=M.setCellTerrain(result.candidate,{x:2,y:2,z:0,terrain:'floor'});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.map.layers[0].cells['2,2'].terrain,'floor');
  const invalidTerrain=M.setCellTerrain(doc,{x:2,y:2,z:0,terrain:'wall'});
  assert.equal(invalidTerrain.ok,false);
  assert.equal(invalidTerrain.issues[0].code,'cell_terrain_value_invalid');
  assert.equal(fp(doc),before,'rejected Cell terrain mutation must leave source authoring unchanged');
}

{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const before=fp(doc);
  let result=M.setBoundary(doc,{z:0,boundaryId:'v:3,3',kind:'wall'});
  assert.equal(result.ok,true,result.issues.map(x=>x.code).join(','));
  assert.equal(doc.map.layers[0].boundaries['v:3,3'],undefined,'Boundary mutation must not modify the source document');
  assert.equal(result.candidate.map.layers[0].boundaries['v:3,3'].kind,'wall');
  result=M.setBoundary(result.candidate,{z:0,boundaryId:'v:3,3',kind:'opening'});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.map.layers[0].boundaries['v:3,3'].kind,'opening');
  result=M.setBoundary(result.candidate,{z:0,boundaryId:'v:3,3',kind:null});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.map.layers[0].boundaries['v:3,3'],undefined);
  const blocked=M.setBoundary(doc,{z:0,boundaryId:'v:1,6',kind:'wall'});
  assert.equal(blocked.ok,false,'Door/Exit-owned opening must not silently become a wall');
  assert.ok(blocked.issues.some(x=>x.code==='authoring_door_boundary_not_opening'||x.code==='authoring_exit_boundary_not_opening'));
  assert.equal(fp(doc),before,'rejected Boundary mutation must leave source authoring unchanged');
}

{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const before=fp(doc);
  let result=M.setDoorState(doc,{doorId:'frontDoor',state:'closed'});
  assert.equal(result.ok,true,result.issues.map(x=>x.code).join(','));
  assert.equal(doc.doors.frontDoor.state,'open','Door state mutation must not modify the source document');
  assert.equal(result.candidate.doors.frontDoor.state,'closed');
  assert.equal(result.meta.operation,'setDoorState');
  result=M.setDoorState(result.candidate,{doorId:'frontDoor',state:'open'});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.doors.frontDoor.state,'open');
  assert.equal(fp(doc),before,'Door state mutation must preserve source fingerprint');
}

{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const before=fp(doc);
  let result=M.setCellMaterial(doc,{x:1,y:1,z:0,material:'stone'});
  assert.equal(result.ok,true,result.issues.map(x=>x.code).join(','));
  assert.equal(doc.map.layers[0].cells['1,1'].material,'wood','material mutation must not change the source document');
  assert.equal(result.candidate.map.layers[0].cells['1,1'].material,'stone');
  assert.equal(result.meta.operation,'setCellMaterial');
  assert.equal(fp(doc),before,'successful material mutation must still leave the input fingerprint unchanged');
  result=M.setCellMaterial(result.candidate,{x:1,y:1,z:0,material:'   '});
  assert.equal(result.ok,true);
  assert.equal(Object.hasOwn(result.candidate.map.layers[0].cells['1,1'],'material'),false,'blank material must remove only the material field');
  const invalid=M.setCellMaterial(doc,{x:99,y:99,z:0,material:'stone'});
  assert.equal(invalid.ok,false);
  assert.equal(invalid.issues[0].code,'cell_material_cell_missing');
  assert.equal(fp(doc),before,'rejected material mutation must leave the input fingerprint unchanged');
}

{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.entities.containers.syntheticPort={
    id:'syntheticPort',name:'Port follower',portable:true,contents:{},position:{x:5,y:2,z:0},supportId:'diningTable',
    interactionPorts:[{id:'syntheticPort:port',position:{x:5,y:3,z:0}}]
  };
  doc.entities.containers.basket.position={x:5,y:2,z:0};
  const beforeBasket=clone(doc.entities.containers.basket.position);
  const beforeSource=clone(doc.entities.sources.tap.position);
  const result=M.moveFurniture(doc,{furnitureId:'diningTable',target:{x:4,y:4,z:0}});
  assert.equal(result.ok,true,result.issues.map(x=>x.code).join(','));
  const moved=result.candidate;
  assert.deepEqual(moved.furniture.diningTable.origin,{x:4,y:4,z:0});
  assert.deepEqual(result.meta.preview.footprint,A.resolveFurnitureInstance(moved.furniture.diningTable).footprint,'move preview footprint must resolve from the same compact candidate');
  assert.ok(result.meta.preview.followerPositions.some(item=>item.id==='mealTray'&&item.position.x===4&&item.position.y===4));
  for(const id of ['mealTray','plateA','plateB','cupA','cupB','alcoholBottle','syntheticPort'])assert.equal(moved.entities.containers[id].supportId,'diningTable');
  assert.deepEqual(moved.entities.containers.mealTray.position,{x:4,y:4,z:0});
  assert.deepEqual(moved.entities.containers.plateB.position,{x:5,y:5,z:0});
  assert.deepEqual(moved.entities.containers.syntheticPort.interactionPorts[0].position,{x:4,y:5,z:0});
  assert.deepEqual(moved.entities.containers.basket.position,beforeBasket,'same-cell unrelated container must not follow furniture');
  assert.deepEqual(moved.entities.sources.tap.position,beforeSource,'source must not follow furniture');
  assert.deepEqual(doc.entities.containers.mealTray.position,{x:5,y:2,z:0},'source authoring must remain unchanged');
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'chairNW:seat'}};
  doc.residents.zhen.initial.posture={kind:'sitting',slotId:'chairNW:seat',furnitureId:'chairNW'};
  const result=M.moveFurniture(doc,{furnitureId:'chairNW',target:{x:3,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.deepEqual(result.candidate.residents.zhen.initial.placement,doc.residents.zhen.initial.placement,'resident anchor reference must stay stable');
  assert.deepEqual(result.candidate.furniture.chairNW.origin,{x:3,y:4,z:0});
  const analysis=I.analyzeInitialPlacements(result.candidate);
  assert.deepEqual(analysis.hardErrors,[]);
  assert.deepEqual(analysis.resolvedPlacements.zhen.position,{x:3,y:4,z:0});
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const result=M.createFurnitureFromDefinition(doc,{definitionId:'chair-basic',target:{x:3,y:4,z:0}});
  assert.equal(result.ok,true,result.issues.map(x=>x.code).join(','));
  assert.equal(result.meta.newId,'chair-basic-1');
  assert.deepEqual(result.candidate.furniture['chair-basic-1'],{id:'chair-basic-1',definitionId:'chair-basic',origin:{x:3,y:4,z:0}});
  assert.equal(A.resolveFurnitureInstance(result.candidate.furniture['chair-basic-1']).slots[0].id,'chair-basic-1:seat');
}
{
  let doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'chairNW:seat'}};
  doc.residents.zhen.initial.posture={kind:'sitting',slotId:'chairNW:seat',furnitureId:'chairNW'};
  let result=M.duplicateFurniture(doc,{sourceId:'chairNW',target:{x:3,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.equal(result.meta.newId,'chair-basic-1');
  assert.deepEqual(result.candidate.furniture['chair-basic-1'],{id:'chair-basic-1',definitionId:'chair-basic',origin:{x:3,y:4,z:0},name:'餐椅 A'});
  assert.equal(A.resolveFurnitureInstance(result.candidate.furniture['chair-basic-1']).slots[0].id,'chair-basic-1:seat');
  assert.equal(result.candidate.residents.zhen.initial.placement.anchor.id,'chairNW:seat','duplicate must not retarget external resident reference');
  doc=result.candidate;
  result=M.duplicateFurniture(doc,{sourceId:'chairNW',target:{x:3,y:5,z:0}});
  assert.equal(result.ok,true);
  assert.equal(result.meta.newId,'chair-basic-2');
  assert.equal(A.resolveFurnitureInstance(result.candidate.furniture['chair-basic-2']).slots[0].id,'chair-basic-2:seat');
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const result=M.duplicateFurniture(doc,{sourceId:'diningTable',target:{x:3,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.equal(result.meta.newId,'dining-table-1');
  assert.equal(result.candidate.entities.containers.mealTray.supportId,'diningTable','duplicate must not copy or retarget external supported objects');
  assert.equal(result.candidate.entities.containers.mealTray.position.x,5);
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.entities.containers.syntheticPort={id:'syntheticPort',name:'Port object',portable:true,contents:{},position:{x:3,y:3,z:0},interactionPorts:[{id:'syntheticPort:port',position:{x:4,y:3,z:0}}]};
  let result=M.moveObject(doc,{entityType:'container',entityId:'syntheticPort',target:{x:4,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.deepEqual(result.candidate.entities.containers.syntheticPort.interactionPorts[0].position,{x:5,y:4,z:0});
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  let result=M.moveObject(doc,{entityType:'container',entityId:'basket',target:{x:5,y:2,z:0}});
  assert.equal(result.ok,false);
  assert.equal(result.issues[0].code,'support_choice_required');
  assert.deepEqual(result.meta.candidates.map(x=>x.id),['diningTable']);
  result=M.moveObject(doc,{entityType:'container',entityId:'basket',target:{x:5,y:2,z:0},supportChoice:{kind:'floor'}});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.entities.containers.basket.supportId,undefined);
  result=M.moveObject(doc,{entityType:'container',entityId:'basket',target:{x:5,y:2,z:0},supportChoice:{kind:'furniture',furnitureId:'diningTable'}});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.entities.containers.basket.supportId,'diningTable');
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const before=fp(doc);
  let result=M.deleteFurniture(doc,{furnitureId:'diningTable'});
  assert.equal(result.ok,false);
  assert.equal(result.issues[0].code,'furniture_delete_blocked');
  assert.ok(result.meta.blockers.some(x=>x.ownerId==='mealTray'&&x.referenceKind==='supportId'));
  assert.equal(fp(doc),before,'failed delete must not mutate authoring');
  result=M.deleteFurniture(doc,{furnitureId:'chairNE'});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.furniture.chairNE,undefined);
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  assert.deepEqual(M.listResidentFreePostures(doc,'zhen').map(item=>item.kind),['standing','lying','kneeling','prone']);
  assert.deepEqual(M.listResidentFreePostures(doc,'orange').map(item=>item.kind),['standing','lying']);
  let result=M.moveResidentToExact(doc,{residentId:'zhen',target:{x:8,y:4,z:0},postureKind:'kneeling'});
  assert.equal(result.ok,true);
  assert.deepEqual(result.candidate.residents.zhen.initial.placement,{mode:'exact',node:{x:8,y:4,z:0}});
  assert.deepEqual(result.candidate.residents.zhen.initial.posture,{kind:'kneeling'});
  assert.equal(result.meta.detachedBinding,false);
  assert.deepEqual(I.analyzeInitialPlacements(result.candidate).hardErrors,[]);
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'chairNW:seat'}};
  doc.residents.zhen.initial.posture={kind:'sitting',slotId:'chairNW:seat',furnitureId:'chairNW'};
  const result=M.moveResidentToExact(doc,{residentId:'zhen',target:{x:8,y:4,z:0},postureKind:'prone'});
  assert.equal(result.ok,true);
  assert.equal(result.meta.detachedBinding,true);
  assert.equal(result.meta.previousBinding.slotId,'chairNW:seat');
  assert.deepEqual(result.candidate.residents.zhen.initial.placement,{mode:'exact',node:{x:8,y:4,z:0}});
  assert.deepEqual(result.candidate.residents.zhen.initial.posture,{kind:'prone'});
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  assert.deepEqual(M.listResidentSlotPostures(doc,'zhen','sofa:left').map(item=>item.kind),['standing','sitting','lying','kneeling','prone']);
  assert.deepEqual(M.listResidentSlotPostures(doc,'orange','sofa:left').map(item=>item.kind),['standing','sitting','lying']);
  assert.deepEqual(M.listResidentSlotPostures(doc,'orange','chairNW:seat'),[]);
  const result=M.rebindResidentToSlot(doc,{residentId:'zhen',slotId:'sofa:left',postureKind:'sitting'});
  assert.equal(result.ok,true);
  assert.deepEqual(result.candidate.residents.zhen.initial.placement,{mode:'anchor',anchor:{kind:'furnitureSlot',id:'sofa:left'}});
  assert.deepEqual(result.candidate.residents.zhen.initial.posture,{kind:'sitting',slotId:'sofa:left',furnitureId:'sofa'});
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const before=fp(doc);
  const result=M.moveFurniture(doc,{furnitureId:'diningTable',target:{x:11,y:7,z:0}});
  assert.equal(result.ok,false);
  assert.equal(fp(doc),before,'failed geometry mutation must leave semantic fingerprint unchanged');
  assert.ok(result.issues.some(x=>x.code==='authoring_position_out_of_bounds'));
  assert.deepEqual(result.meta.preview.footprint,[{x:11,y:7,z:0},{x:12,y:7,z:0},{x:11,y:8,z:0},{x:12,y:8,z:0}]);
  assert.ok(result.meta.preview.followerPositions.length>0);
}

console.log('editor authoring mutations: ok');
