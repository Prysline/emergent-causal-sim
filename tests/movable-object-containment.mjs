import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const A=globalThis.SimWorldAuthoring,E=globalThis.SimEngine,W=globalThis.SimWorld;
const SP=globalThis.SimSpatial,O=globalThis.SimObjectHandling,R=globalThis.SimResources,V=globalThis.SimValidator;
assert.equal(A.VERSION,'world-authoring-v21');
assert.equal(O.VERSION,'object-handling-v2-movable-containment');

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
const basket=authored.entities.objects.basket;
basket.objectContainment=true;
basket.objectStorage={maxItems:2,maxMassKg:3};
for(const [id,massKg] of [['cargoA',.5],['cargoB',.75],['cargoC',.6]]){
  authored.entities.objects[id]={
    id,name:id,icon:'📦',portable:true,position:{x:3,y:2,z:0},
    handling:{carryGeometry:{width:.15,height:.1,length:.15},handsRequired:1,massKg}
  };
}
assert.equal(A.validateAuthoring(authored).ok,true);
assert.deepEqual(A.parseAuthoringJSON(A.serializeAuthoring(authored)).entities.objects.basket.objectStorage,basket.objectStorage);

function invalid(mutate,code){
  const doc=A.cloneAuthoring(authored);mutate(doc);
  assert.ok(A.validateAuthoring(doc).errors.some(item=>item.code===code),code+' must fail authoring validation');
}
invalid(doc=>{doc.entities.objects.cargoA.containedBy='basket';},'authoring_contained_object_position_conflict');
invalid(doc=>{doc.entities.objects.cargoA.containedBy='missing';delete doc.entities.objects.cargoA.position;},'authoring_object_container_missing');
invalid(doc=>{doc.entities.objects.cargoA.containedBy='plateA';delete doc.entities.objects.cargoA.position;},'authoring_object_container_capability_missing');
invalid(doc=>{doc.entities.objects.basket.containedBy='basket';delete doc.entities.objects.basket.position;},'authoring_object_container_self');
invalid(doc=>{doc.entities.objects.cargoA.containedBy='basket';delete doc.entities.objects.cargoA.position;delete doc.entities.objects.cargoA.handling.massKg;},'authoring_object_cargo_mass_invalid');
invalid(doc=>{doc.entities.objects.cargoA.containedBy='basket';doc.entities.objects.cargoB.containedBy='basket';doc.entities.objects.cargoC.containedBy='basket';for(const id of ['cargoA','cargoB','cargoC'])delete doc.entities.objects[id].position;},'authoring_object_storage_capacity_exceeded');
invalid(doc=>{doc.entities.objects.basket.objectStorage.maxItems=0;},'authoring_object_storage_capacity_invalid');
invalid(doc=>{doc.entities.objects.basket.objectContainment=false;},'authoring_object_storage_capability_missing');

E.configureResetStateSource('movable-containment-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));
E.reset(20261120);
const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou,carrier=st.objects.basket;
for(const agent of Object.values(st.agents))if(agent.id!==a.id)agent.offMap=true;
const pickup=SP.interactionGeometry(st,{kind:'object',id:'basket'},a,'pickup');
assert.ok(pickup.positions.length,'portable carrier must have a legal object pickup interaction position');
a.position={...pickup.positions[0]};a.posture={kind:'standing',slotId:null,furnitureId:null};
function put(id){
  const child=st.objects[id];
  a.held=id;delete child.position;
  assert.equal(E.containHeldObject(a,'basket'),true,'generic containHeldObject must accept Object target');
  assert.equal(a.held,null);
  assert.equal(child.containedBy,'basket');
  assert.equal(child.position,undefined);
  assert.equal(child.supportId,undefined);
}
put('cargoA');put('cargoB');
assert.equal(O.objectStorageStatus(st,'basket').count,2);
assert.equal(O.objectStorageStatus(st,'basket').massKg,1.25);
assert.equal(R.containerLoad(st,'basket'),2.05,'Resource carrier emptyLoad plus canonical contained ordinary Object masses');
assert.equal(R.fillRatio(st,'basket'),0,'Resource fillRatio must not duplicate Object cargo inventory');
for(const id of ['cargoA','cargoB']){
  assert.deepEqual(SP.objectPosition(st,id),SP.objectPosition(st,'basket'));
  assert.ok(SP.nodeSame(st,SP.objectNode(st,id),SP.objectNode(st,'basket')));
}
assert.equal(V.validateState(st).issueCount,0);

a.held='cargoC';delete st.objects.cargoC.position;
assert.equal(E.containHeldObject(a,'basket'),false,'full container must reject further items');
assert.equal(st.objects.cargoC.containedBy,undefined);
st.objects.cargoC.position={x:3,y:2,z:0};a.held=null;

a.held='basket';
const original=SP.objectPosition(st,'basket');
for(const p of [{x:3,y:3,z:0},{x:2,y:3,z:0},{x:3,y:2,z:0}]){
  a.position={...p};
  for(const id of ['cargoA','cargoB']){
    assert.deepEqual(SP.objectPosition(st,id),p,'child effective position must track carried parent');
    assert.ok(SP.nodeSame(st,SP.objectNode(st,id),SP.objectNode(st,'basket')));
  }
  assert.equal(R.effectiveCarryLoad(st,a),2.05);
}
assert.notEqual(original,null);

b.offMap=false;b.position={...a.position};
assert.equal(E.takeContainedObject(b,'cargoA'),false,'cannot retrieve from another Agent held carrier');
b.offMap=true;
const release=SP.releaseHeldObjectNearby(st,a);
assert.ok(release,'carrier must use existing generic nearby-release lifecycle');
assert.equal(a.held,null);
assert.ok(carrier.position,'carrier release must restore ordinary spatial placement');
for(const id of ['cargoA','cargoB'])assert.deepEqual(SP.objectPosition(st,id),SP.objectPosition(st,'basket'));
const containedPickup=SP.interactionGeometry(st,{kind:'object',id:'cargoA'},a,'pickup');
assert.equal(containedPickup.mode,'objectContainerReach');
assert.deepEqual(containedPickup.positions,SP.interactionGeometry(st,{kind:'object',id:'basket'},a,'pickup').positions);
assert.equal(SP.interactionGeometry(st,{kind:'object',id:'cargoA'},a,'read').positions.length,0);
a.position={...containedPickup.positions[0]};
assert.equal(E.takeContainedObject(a,'cargoA'),true,'pickup must consume the original child-side containment relation');
assert.equal(a.held,'cargoA');
assert.equal(st.objects.cargoA.containedBy,undefined);
assert.equal(O.objectStorageStatus(st,'basket').count,1);
assert.equal(R.containerLoad(st,'basket'),1.55);
const final=V.validateState(st);
assert.equal(final.issueCount,0,final.issues.map(item=>item.code).join(', '));

st.objects.cargoB.handling.massKg=-1;
assert.ok(V.validateState(st).issues.some(item=>item.code==='contained_object_storage_invalid'));
st.objects.cargoB.handling.massKg=.75;
console.log('Movable Object containment regression: ok');
