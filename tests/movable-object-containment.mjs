import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const A=globalThis.SimWorldAuthoring,E=globalThis.SimEngine,W=globalThis.SimWorld;
const SP=globalThis.SimSpatial,O=globalThis.SimObjectHandling,R=globalThis.SimResources,V=globalThis.SimValidator;
const S=globalThis.SimObjectStorageVolume;
assert.equal(A.VERSION,'world-authoring-v29');
assert.equal(O.VERSION,'object-handling-v4-storage-volume');
assert.equal(S.VERSION,'object-storage-volume-v1');

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
for(const [id,massKg,volume] of [['cargoA',.5,.009],['cargoB',.75,.01],['cargoC',.6,.008]]){
  authored.entities.objects[id]={
    id,name:id,icon:'📦',portable:true,position:{x:13,y:3,z:0},
    handling:{carryGeometry:{width:.15,height:.1,length:.15},handsRequired:1,massKg},
    physicalVolumeCubicMeters:volume
  };
}
assert.equal(A.validateAuthoring(authored).ok,true,A.validateAuthoring(authored).errors.map(i=>i.code).join(', '));
assert.deepEqual(A.parseAuthoringJSON(A.serializeAuthoring(authored)).entities.objects.basketA.objectStorage,authored.entities.objects.basketA.objectStorage);
assert.equal(S.physicalVolumeCubicMeters(authored.entities.objects.cargoA),.009);
assert.equal(S.physicalVolumeCubicMeters(authored.entities.objects.ingredientA1),.0003);
assert.equal(S.physicalVolumeCubicMeters(authored.entities.objects.readyMealF0),.0003);

function invalid(mutate,code){
  const doc=A.cloneAuthoring(authored);mutate(doc);
  const report=A.validateAuthoring(doc);
  assert.ok(report.errors.some(item=>item.code===code),code+': '+report.errors.map(i=>i.code).join(','));
}
invalid(doc=>{doc.entities.objects.cargoA.containedBy='basketA';},'authoring_contained_object_position_conflict');
invalid(doc=>{doc.entities.objects.cargoA.containedBy='missing';delete doc.entities.objects.cargoA.position;},'authoring_object_container_missing');
invalid(doc=>{doc.entities.objects.cargoA.containedBy='waterBucket';delete doc.entities.objects.cargoA.position;},'authoring_object_container_capability_missing');
invalid(doc=>{doc.entities.objects.basketA.containedBy='basketA';delete doc.entities.objects.basketA.position;},'authoring_object_container_self');
invalid(doc=>{doc.entities.objects.cargoA.containedBy='basketA';delete doc.entities.objects.cargoA.position;delete doc.entities.objects.cargoA.handling.massKg;},'authoring_object_cargo_mass_invalid');
invalid(doc=>{doc.entities.objects.cargoA.containedBy='basketA';delete doc.entities.objects.cargoA.position;delete doc.entities.objects.cargoA.physicalVolumeCubicMeters;},'authoring_object_physical_volume_missing');
invalid(doc=>{for(const id of ['cargoA','cargoB','cargoC']){doc.entities.objects[id].containedBy='basketA';delete doc.entities.objects[id].position;}},'authoring_object_storage_capacity_exceeded');
invalid(doc=>{doc.entities.objects.basketA.objectStorage.capacityCubicMeters=0;},'authoring_object_storage_capacity_invalid');
invalid(doc=>{doc.entities.objects.basketA.objectStorage.maxMassKg=3;},'authoring_object_storage_capacity_invalid');
invalid(doc=>{doc.entities.objects.basketA.objectContainment=false;},'authoring_object_storage_capability_missing');
invalid(doc=>{doc.entities.objects.cargoA.physicalVolumeCubicMeters=Infinity;},'authoring_object_physical_volume_invalid');
invalid(doc=>{doc.entities.objects.cargoA.physicalVolumeCubicMeters=.13;doc.entities.objects.cargoA.containedBy='pantryA';delete doc.entities.objects.cargoA.position;},'authoring_object_storage_capacity_exceeded');

E.configureResetStateSource('r2-physical-storage-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));
E.reset(20261123);
let st=E.getState(),a=st.agents.zhen,b=st.agents.zhou;
for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
const receive=SP.interactionGeometry(st,{kind:'object',id:'basketA'},a,'receive');
assert.ok(receive.positions.length,'physical basket must expose a canonical receive geometry');
a.position={...receive.positions[0]};a.posture={kind:'standing',slotId:null,furnitureId:null};
function put(id){
  const child=st.objects[id];a.held=id;delete child.position;
  assert.equal(E.containHeldObject(a,'basketA'),true);
  assert.equal(a.held,null);assert.equal(child.containedBy,'basketA');
  assert.equal(child.position,undefined);assert.equal(child.supportId,undefined);
}
put('cargoA');put('cargoB');
const loaded=O.objectStorageStatus(st,'basketA');
assert.equal(loaded.count,2);
assert.ok(Math.abs(loaded.volumeCubicMeters-.019)<1e-12);
assert.equal(loaded.capacityCubicMeters,.024);
assert.equal(loaded.massKg,1.25);
assert.equal(R.containerLoad(st,'basketA'),0,'ordinary basket must not become a Resource container');
assert.equal(R.fillRatio(st,'basketA'),0,'Resource ratio must remain independent of Object inventory');
assert.equal(V.validateState(st).issueCount,0);
a.held='cargoC';delete st.objects.cargoC.position;
assert.equal(E.containHeldObject(a,'basketA'),false,'third cargo exceeds physical volume even though mass remains legal');
assert.equal(st.objects.cargoC.containedBy,undefined);
st.objects.cargoC.position={x:13,y:3,z:0};a.held=null;

a.held='basketA';
for(const p of [{x:13,y:4,z:0},{x:12,y:4,z:0},{x:13,y:3,z:0}]){
  a.position={...p};
  for(const id of ['cargoA','cargoB']){
    assert.ok(SP.same(SP.objectPosition(st,id),p),'cargo must follow sole parent Object location');
    assert.ok(SP.nodeSame(st,SP.objectNode(st,id),SP.objectNode(st,'basketA')));
  }
  assert.equal(R.effectiveCarryLoad(st,a),2.05,'carrier mass and child mass remain separate from storage volume');
}
b.offMap=false;b.position={...a.position};
assert.equal(E.takeContainedObject(b,'cargoA'),false,'other Agent cannot reach into held basket');
b.offMap=true;
assert.ok(SP.releaseHeldObjectNearby(st,a));
assert.equal(a.held,null);
const pickup=SP.interactionGeometry(st,{kind:'object',id:'cargoA'},a,'pickup');
assert.equal(pickup.mode,'objectContainerReach');
assert.ok(pickup.positions.length);
a.position={...pickup.positions[0]};
if(pickup.witnesses?.[0]?.requiredPosture)a.posture={kind:pickup.witnesses[0].requiredPosture,slotId:null,furnitureId:null};
assert.equal(E.takeContainedObject(a,'cargoA'),true);
assert.equal(a.held,'cargoA');assert.equal(st.objects.cargoA.containedBy,undefined);
assert.ok(Math.abs(O.objectStorageStatus(st,'basketA').volumeCubicMeters-.01)<1e-12);
assert.equal(O.objectStorageStatus(st,'basketA').massKg,.75);
const valid=V.validateState(st);assert.equal(valid.issueCount,0,valid.issues.map(i=>i.code).join(','));
st.objects.cargoB.handling.massKg=-1;
assert.ok(V.validateState(st).issues.some(i=>i.code==='contained_object_storage_invalid'));
st.objects.cargoB.handling.massKg=.75;

E.reset(20261124);
st=E.getState();a=st.agents.zhen;
for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
const pantryContact=SP.interactionGeometry(st,{kind:'furniture',id:'pantryA'},a,'default');
assert.ok(pantryContact.positions.length,'fixed cabinet must have real interaction positions');
a.position={...pantryContact.positions[0]};a.posture={kind:'standing',slotId:null,furnitureId:null};
a.held='cargoA';delete st.objects.cargoA.position;
assert.equal(E.containHeldObject(a,'pantryA'),true,'fixed Furniture must use canonical storage legality');
assert.equal(st.objects.cargoA.containedBy,'pantryA');
assert.ok(Math.abs(O.objectStorageStatus(st,'pantryA').volumeCubicMeters-.009)<1e-12);
st.objects.cargoC.physicalVolumeCubicMeters=.2;
a.held='cargoC';delete st.objects.cargoC.position;
assert.equal(E.containHeldObject(a,'pantryA'),false,'fixed Furniture must reject overflow without mutating child-side truth');
assert.equal(st.objects.cargoC.containedBy,undefined);
st.objects.cargoC.position={x:13,y:3,z:0};a.held=null;
assert.equal(V.validateState(st).issueCount,0);
console.log('R2 Object/Furniture physical-volume containment, carry/load, authoring, runtime, validator: ok');
