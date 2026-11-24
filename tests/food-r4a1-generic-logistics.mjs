// R4-A1: real R3 physical Ingredient IDs through ordinary Object container lifecycle.
import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const A=globalThis.SimWorldAuthoring,W=globalThis.SimWorld,E=globalThis.SimEngine;
const O=globalThis.SimObjectHandling,R=globalThis.SimResources;
const S=globalThis.SimObjectStorageVolume,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
assert.equal(A.VERSION,'world-authoring-v29');
const doc=A.DEFAULT_WORLD_AUTHORING;
const large=doc.entities.objects.basketA,small=doc.entities.objects.basketSmallA;
assert.ok(large&&small&&large!==small);
assert.equal(large.objectStorage.capacityCubicMeters,.024);
assert.equal(small.objectStorage.capacityCubicMeters,.018);
assert.equal(large.handling.handsRequired,2);
assert.equal(small.handling.handsRequired,1);
assert.equal(small.handling.massKg,.6);
assert.deepEqual(small.handling.carryGeometry,{width:.4,height:.25,length:.3});
assert.equal(A.validateAuthoring(doc).ok,true);
assert.equal(A.parseAuthoringJSON(A.serializeAuthoring(doc)).entities.objects.basketSmallA.objectStorage.capacityCubicMeters,.018);

E.configureResetStateSource('r4a1-real-ingredient-supply',seed=>W.createInitialStateFromAuthoring(doc,seed));
let serial=0;
function events(st,kind){return st.events.filter(e=>e.data?.action===kind).reverse();}
function valid(st,label){const issues=V.validateState(st).issues;assert.deepEqual(issues,[],label+': '+issues.map(i=>i.code).join(','));}
function until(predicate,label,max=360){
  for(let i=0;i<max;i++){if(predicate())return;E.tick();}
  assert.fail(label+' not reached in '+max+' real Engine ticks');
}
function supply(carrierId='basketSmallA',limit=3){
  E.reset(20261124+(serial++));
  const st=E.getState(),a=st.agents.zhen,carrier=st.objects[carrierId];
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0});
  a.position={...carrier.position};a.action=null;a.activeIntent=null;
  a.action=E.buildAction(a,{id:'externalSupply',mode:'physicalIngredient',
    sourceId:'externalIngredientSupplyA',carrierId,unitLimit:limit});
  assert.equal(a.action?.mode,'physicalIngredient','R3 must accept the selected ordinary carrier, not only basketA');
  E.ensureIntentForAction(st,a);
  until(()=>!a.action,'R3 return');
  const items=O.containedObjects(st,carrierId);
  assert.equal(items.length,limit);
  assert.ok(items.every(item=>item.id.startsWith('ingredient:offmap:externalIngredientSupplyA:')));
  assert.equal(new Set(items.map(x=>x.id)).size,limit);
  valid(st,'R3 return');
  return {st,a,carrier,ids:items.map(item=>item.id).sort()};
}
function begin(a,sourceId,destinationId){
  assert.equal(a.action,null);
  a.action=E.buildAction(a,{id:'transferContainedObjects',sourceId,destinationId});
  assert.equal(a.action?.kind,'transferContainedObjects');
  E.ensureIntentForAction(E.getState(),a);
}
{
  const {st,a,carrier,ids}=supply('basketSmallA',3);
  assert.ok(Math.abs(R.effectiveCarryLoad(st,{held:carrier.id})-1.5)<1e-12);
  const original={...a.position};a.position={x:1,y:2,z:0};
  assert.equal(E.inspectContainedObjects(a,carrier.id),null,'remote World contents are not an Agent observation');
  a.position=original;
  begin(a,carrier.id,'pantryA');
  until(()=>a.action?.phase==='transferHeld','one-hand unloading phase');
  assert.equal(a.held,carrier.id);
  assert.equal(O.availableSupportHands(st,a),1);
  assert.equal(globalThis.SimPhysical.getEffectiveTraversalEnvelope(st,a,'walk').carriedObjectId,carrier.id);
  assert.ok(SP.objectPosition(st,ids[0]));
  until(()=>!a.action,'small basket unload to fixed pantry');
  assert.equal(a.held,null);
  assert.deepEqual(O.containedObjects(st,'pantryA').filter(o=>ids.includes(o.id)).map(o=>o.id).sort(),ids);
  assert.equal(O.containedObjects(st,carrier.id).length,0);
  assert.equal(events(st,'objectContainerTransfer').length,3);
  assert.ok(events(st,'objectContainerTransfer').every(e=>e.data.method==='oneHandHeldSource'));
  assert.equal(events(st,'takeContainerCargo').length,0,'one-hand path must not invent a second held Object');
  const acquired=events(st,'physicalIngredientAcquired');
  for(const e of events(st,'objectContainerTransfer'))
    assert.ok(e.causeIds.includes(acquired.find(x=>x.data.ingredientId===e.data.objectId)?.id),'transfer should cite actual R3 acquisition');
  assert.equal(Object.keys(st.objects).filter(id=>ids.includes(id)).length,3);
  valid(st,'single hand unload with canonical events');
}
{
  const {st,a,carrier,ids}=supply('basketSmallA',2);
  begin(a,carrier.id,'basketA');
  until(()=>!a.action,'small basket unload into large basket');
  assert.deepEqual(O.containedObjects(st,'basketA').map(x=>x.id).sort(),ids);
  assert.equal(O.containedObjects(st,carrier.id).length,0);
  valid(st,'basket to basket');
}
{
  const {st,a,carrier,ids}=supply('basketA',2);
  begin(a,carrier.id,'pantryA');
  until(()=>a.action?.phase==='placeSource','two-hand carrier arrival');
  assert.equal(a.held,carrier.id);
  assert.equal(O.availableSupportHands(st,a),0);
  const inspection=E.inspectContainedObjects(a,carrier.id);
  assert.ok(inspection?.objectIds.includes(ids[0]));
  assert.equal(E.transferContainedObject(a,ids[0],'pantryA',inspection),null,
    'two occupied hands must not silently transfer a child');
  assert.equal(st.objects[ids[0]].containedBy,carrier.id);
  until(()=>!a.action,'placed two-hand carrier unload');
  assert.equal(events(st,'releaseCargoCarrier').length,1);
  assert.equal(events(st,'takeContainerCargo').length,2);
  assert.deepEqual(O.containedObjects(st,'pantryA').filter(x=>ids.includes(x.id)).map(x=>x.id).sort(),ids);
  assert.ok(events(st,'objectContainerTransfer').every(e=>e.data.method==='placedSourcePickup'));
  for(const pickup of events(st,'takeContainerCargo'))
    assert.ok(pickup.causeIds.includes(events(st,'physicalIngredientAcquired').find(e=>e.data.ingredientId===pickup.data.objectId)?.id),
      'two-handed pickup must cite the actual R3 Ingredient acquisition');
  valid(st,'two-hand release, take, place');
}
{
  const {st,a,carrier,ids}=supply('basketSmallA',2);
  st.objects.basketA.objectStorage.capacityCubicMeters=.0001;
  begin(a,carrier.id,'basketA');
  until(()=>!a.action,'full destination abort');
  assert.deepEqual(O.containedObjects(st,carrier.id).map(x=>x.id).sort(),ids);
  assert.equal(O.containedObjects(st,'basketA').length,0);
  assert.equal(events(st,'objectContainerTransfer').length,0);
  valid(st,'volume failure leaves cargo unchanged');
}
{
  const {st,a,carrier,ids}=supply('basketSmallA',1);
  st.reservations['furniture:pantryA']='zhou';
  begin(a,carrier.id,'pantryA');
  until(()=>!a.action,'destination reservation abort');
  assert.deepEqual(O.containedObjects(st,carrier.id).map(x=>x.id),ids);
  assert.equal(events(st,'objectContainerTransfer').length,0);
  delete st.reservations['furniture:pantryA'];
  valid(st,'reservation failure leaves cargo unchanged');
}
{
  const {st,a,carrier,ids}=supply('basketSmallA',3);
  begin(a,carrier.id,'pantryA');
  until(()=>events(st,'objectContainerTransfer').length===1,'first transfer');
  st.reservations['furniture:pantryA']='zhou';
  until(()=>!a.action,'interrupted partial unload');
  assert.equal(O.containedObjects(st,'pantryA').filter(x=>ids.includes(x.id)).length,1);
  assert.equal(O.containedObjects(st,carrier.id).filter(x=>ids.includes(x.id)).length,2);
  assert.equal(events(st,'objectContainerTransfer').length,1,'a committed item must never replay');
  delete st.reservations['furniture:pantryA'];
  valid(st,'partial interruption preserves all Object identities');
}
{
  const {st,a,carrier,ids}=supply('basketSmallA',1);
  a.held=carrier.id;
  const observation=E.inspectContainedObjects(a,carrier.id);
  assert.ok(observation?.objectIds.includes(ids[0]));
  assert.equal(E.transferContainedObject(a,ids[0],'pantryA',observation),null,'remote target must not be reachable');
  const contact=SP.interactionGeometry(st,{kind:'furniture',id:'pantryA'},a,'default').positions[0];
  assert.ok(contact);
  a.position={...contact};
  st.objects[ids[0]].handling.handsRequired=2;
  const local=E.inspectContainedObjects(a,carrier.id);
  assert.equal(E.transferContainedObject(a,ids[0],'pantryA',local),null,'child needing two hands cannot be unloaded with one free hand');
  assert.equal(st.objects[ids[0]].containedBy,carrier.id);
}
console.log('R4-A1 R3 dynamic cargo, single/two hand, volume, reservation, interruption and Engine events: ok');
