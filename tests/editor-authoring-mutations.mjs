import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world-authoring.js','editor-authoring-mutations.js','world-initializer.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}
const A=globalThis.SimWorldAuthoring;
const M=globalThis.SimEditorAuthoringMutations;
const I=globalThis.SimWorldInitializer;
const clone=value=>JSON.parse(JSON.stringify(value));
const fp=value=>A.semanticFingerprint(value);

assert.equal(A.VERSION,'world-authoring-v2');

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
  assert.deepEqual(result.meta.preview.footprint,moved.furniture.diningTable.footprint,'move preview footprint must come from the same translated candidate');
  assert.ok(result.meta.preview.followerPositions.some(item=>item.id==='mealTray'&&item.position.x===4&&item.position.y===4),'move preview must expose explicit support followers from the same mutation');
  for(const id of ['mealTray','plateA','plateB','cupA','cupB','alcoholBottle','syntheticPort']){
    assert.equal(moved.entities.containers[id].supportId,'diningTable');
  }
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
  assert.deepEqual(result.candidate.furniture.chairNW.slots[0].position,{x:3,y:4,z:0});
  const analysis=I.analyzeInitialPlacements(result.candidate);
  assert.deepEqual(analysis.hardErrors,[]);
  assert.deepEqual(analysis.resolvedPlacements.zhen.position,{x:3,y:4,z:0});
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const before=clone(doc.residents.zhen.initial.placement.node);
  const result=M.moveFurniture(doc,{furnitureId:'sofa',target:{x:8,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.deepEqual(result.candidate.residents.zhen.initial.placement.node,before,'exact resident must not follow furniture');
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
  const result=M.moveObject(doc,{entityType:'source',entityId:'tap',target:{x:7,y:5,z:0}});
  assert.equal(result.ok,true);
  assert.deepEqual(result.candidate.entities.sources.tap.position,{x:7,y:5,z:0});
  assert.deepEqual(result.candidate.entities.sources.tap.interactionPorts[0].position,{x:6,y:5,z:0});
  assert.equal(result.candidate.entities.sources.tap.supportId,undefined,'Source must not gain a supportId contract');
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
  let doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'chairNW:seat'}};
  doc.residents.zhen.initial.posture={kind:'sitting',slotId:'chairNW:seat',furnitureId:'chairNW'};
  let result=M.duplicateFurniture(doc,{sourceId:'chairNW',target:{x:3,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.equal(result.meta.newId,'chairNW-copy');
  assert.equal(result.candidate.furniture['chairNW-copy'].slots[0].id,'chairNW-copy:seat');
  assert.equal(result.candidate.residents.zhen.initial.placement.anchor.id,'chairNW:seat','duplicate must not retarget external resident reference');
  doc=result.candidate;
  result=M.duplicateFurniture(doc,{sourceId:'chairNW',target:{x:3,y:5,z:0}});
  assert.equal(result.ok,true);
  assert.equal(result.meta.newId,'chairNW-copy-2');
  assert.equal(result.candidate.furniture['chairNW-copy-2'].slots[0].id,'chairNW-copy-2:seat');
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.furniture.chairNE.slots[0].id='legacy-seat-id';
  doc.furniture.sofa.slots[0].id='chairNE-copy:slot-1';
  const result=M.duplicateFurniture(doc,{sourceId:'chairNE',target:{x:8,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.equal(result.meta.newId,'chairNE-copy');
  assert.equal(result.candidate.furniture['chairNE-copy'].slots[0].id,'chairNE-copy:slot-1-2','non-prefixed slot IDs and global collisions must resolve deterministically');
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const result=M.duplicateFurniture(doc,{sourceId:'diningTable',target:{x:3,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.entities.containers.mealTray.supportId,'diningTable','duplicate must not copy or retarget external supported objects');
  assert.equal(result.candidate.entities.containers.mealTray.position.x,5);
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
  let result=M.moveResidentExact(doc,{residentId:'zhen',target:{x:8,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.deepEqual(result.candidate.residents.zhen.initial.placement.node,{x:8,y:4,z:0});
  assert.equal(result.candidate.residents.zhen.initial.posture.kind,'standing');
  const analysis=I.analyzeInitialPlacements(result.candidate);
  assert.deepEqual(analysis.hardErrors,[]);
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'chairNW:seat'}};
  doc.residents.zhen.initial.posture={kind:'sitting',slotId:'chairNW:seat',furnitureId:'chairNW'};
  const before=fp(doc);
  let result=M.moveResidentExact(doc,{residentId:'zhen',target:{x:8,y:4,z:0}});
  assert.equal(result.ok,false);
  assert.equal(result.issues[0].code,'resident_move_requires_exact');
  assert.equal(fp(doc),before);
  result=M.convertResidentToExactStanding(doc,{residentId:'zhen',target:{x:8,y:4,z:0}});
  assert.equal(result.ok,true);
  assert.deepEqual(result.candidate.residents.zhen.initial.placement,{mode:'exact',node:{x:8,y:4,z:0}});
  assert.deepEqual(result.candidate.residents.zhen.initial.posture,{kind:'standing'});
  assert.deepEqual(I.analyzeInitialPlacements(result.candidate).hardErrors,[]);
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.residents.zhen.initial.placement={mode:'exact',node:{x:4,y:2,z:0}};
  doc.residents.zhen.initial.posture={kind:'sitting',slotId:'chairNW:seat',furnitureId:'chairNW'};
  const before=fp(doc);
  const result=M.moveResidentExact(doc,{residentId:'zhen',target:{x:8,y:4,z:0}});
  assert.equal(result.ok,false);
  assert.equal(result.issues[0].code,'resident_move_bound');
  assert.equal(fp(doc),before,'bound exact Resident generic move must be atomic rejection');
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const result=M.rebindResidentToSlot(doc,{residentId:'zhen',slotId:'sofa:left',postureKind:'sitting'});
  assert.equal(result.ok,true);
  assert.deepEqual(result.candidate.residents.zhen.initial.placement,{mode:'anchor',anchor:{kind:'furnitureSlot',id:'sofa:left'}});
  assert.deepEqual(result.candidate.residents.zhen.initial.posture,{kind:'sitting',slotId:'sofa:left',furnitureId:'sofa'});
  assert.deepEqual(I.analyzeInitialPlacements(result.candidate).hardErrors,[]);
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const before=fp(doc);
  const result=M.moveFurniture(doc,{furnitureId:'diningTable',target:{x:11,y:7,z:0}});
  assert.equal(result.ok,false);
  assert.equal(fp(doc),before,'failed geometry mutation must leave semantic fingerprint unchanged');
  assert.ok(result.issues.some(x=>x.code==='authoring_position_out_of_bounds'));
  assert.deepEqual(result.meta.preview.footprint,[{x:11,y:7,z:0},{x:12,y:7,z:0},{x:11,y:8,z:0},{x:12,y:8,z:0}],'invalid candidate must still expose the projected full footprint for drag preview');
  assert.ok(result.meta.preview.followerPositions.length>0,'invalid candidate preview must retain follower projection without mutating source authoring');
}

console.log('editor authoring mutations: ok');
