// R3: production Engine, ordinary basket and finite off-map Ingredient source.
import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const A=globalThis.SimWorldAuthoring,W=globalThis.SimWorld,E=globalThis.SimEngine;
const I=globalThis.SimIngredient,S=globalThis.SimObjectStorageVolume,V=globalThis.SimValidator;
const SOURCE_ID='externalIngredientSupplyA',CARRIER_ID='basketA';
assert.equal(A.DEFAULT_WORLD_AUTHORING.authoringSchema,A.VERSION);
const doc=A.DEFAULT_WORLD_AUTHORING,origin=doc.offMapIngredientSources[SOURCE_ID];
assert.deepEqual({type:origin.ingredientTypeId,units:origin.availableUnits,exit:origin.exitId},{type:'A',units:10,exit:'frontExit'});
for(const change of [
  d=>{d.offMapIngredientSources[SOURCE_ID].availableUnits=-1;},
  d=>{d.offMapIngredientSources[SOURCE_ID].workTicksPerUnit=0;},
  d=>{d.offMapIngredientSources[SOURCE_ID].ingredientTypeId='missing';},
  d=>{d.offMapIngredientSources[SOURCE_ID].exitId='absent';},
  d=>{d.offMapIngredientSources[SOURCE_ID].contents={food:99};}
]){
  const bad=A.cloneAuthoring(doc);change(bad);
  assert.ok(A.validateAuthoring(bad).errors.some(issue=>issue.code==='offmap_ingredient_source_invalid'),
    'invalid finite physical supply authoring must fail explicitly');
}
const roundtrip=A.parseAuthoringJSON(A.serializeAuthoring(doc));
assert.deepEqual(roundtrip.offMapIngredientSources,doc.offMapIngredientSources);
E.configureResetStateSource('food-r3-physical-supply',seed=>W.createInitialStateFromAuthoring(doc,seed));
let seq=0;
function setup(limit=3){
  E.reset(20261123+(seq++));
  const st=E.getState(),a=st.agents.zhen,carrier=st.objects[CARRIER_ID];
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0});
  a.position={...carrier.position};a.action=null;a.activeIntent=null;
  const action=E.buildAction(a,{id:'externalSupply',mode:'physicalIngredient',sourceId:SOURCE_ID,carrierId:carrier.id,unitLimit:limit});
  assert.equal(action?.mode,'physicalIngredient','existing Action must accept explicit physical supply mode');
  a.action=action;E.ensureIntentForAction?.(st,a);
  return {st,a,carrier,source:st.offMapIngredientSources[SOURCE_ID]};
}
function until(predicate,max=180){
  for(let i=0;i<max;i++){E.tick();if(predicate())return;}
  assert.fail('production physical supply did not reach condition in '+max+' ticks');
}
function events(st,kind){return st.events.filter(e=>e.data.action===kind).reverse();} // canonical events are newest-first; test causality oldest-first
function valid(st,label){const issues=V.validateState(st).issues;assert.deepEqual(issues,[],label+': '+issues.map(x=>x.code).join(','));}
{
  const {st,a,carrier,source}=setup(3);
  const before=Object.keys(st.objects).length;
  until(()=>a.action===null);
  const cargo=Object.values(st.objects).filter(o=>o.containedBy===carrier.id&&I.validIngredient(o));
  assert.equal(cargo.length,3);
  assert.equal(source.availableUnits,7);
  assert.equal(source.nextSerial,4);
  assert.equal(Object.keys(st.objects).length,before+3);
  assert.equal(S.storageStatus(st,carrier.id).count,3);
  assert.ok(S.storageStatus(st,carrier.id).withinCapacity);
  assert.ok(cargo.every(o=>I.massGrams(o)===300));
  assert.equal(a.offMap,false);
  assert.equal(a.held,null,'canonical Action completion releases ordinary basket near the return exit');
  assert.equal(st.supply.totalProduced,0,'physical supply may not mutate legacy Resource accounting');
  assert.equal(carrier.contents,undefined,'ordinary basket has no Resource Food inventory');
  const acquisitions=events(st,'physicalIngredientAcquired'),returns=events(st,'physicalIngredientSupplyReturn');
  assert.equal(acquisitions.length,3);
  assert.equal(returns.length,1);
  assert.ok(acquisitions.every((e,i)=>e.data.ingredientId===cargo[i]?.id));
  for(let i=1;i<acquisitions.length;i++)assert.ok(acquisitions[i].causeIds.includes(acquisitions[i-1].id));
  assert.ok(returns[0].causeIds.includes(acquisitions.at(-1).id));
  assert.equal(st.causes[returns[0].id],returns[0]);
  valid(st,'three returned physical Ingredient Objects');
}
{
  const {st,a,carrier,source}=setup(10);
  carrier.objectStorage.capacityCubicMeters=.0006;
  until(()=>a.action===null);
  assert.equal(Object.values(st.objects).filter(o=>o.containedBy===carrier.id&&I.validIngredient(o)).length,2);
  assert.equal(source.availableUnits,8);
  assert.equal(events(st,'physicalIngredientAcquired').length,2);
  assert.ok(S.storageStatus(st,carrier.id).withinCapacity);
  valid(st,'volume-limited partial return');
}
{
  const {st,a,carrier,source}=setup(5);
  source.availableUnits=1;
  until(()=>a.action===null);
  assert.equal(events(st,'physicalIngredientAcquired').length,1);
  assert.equal(source.availableUnits,0);
  assert.equal(Object.values(st.objects).filter(o=>o.containedBy===carrier.id&&I.validIngredient(o)).length,1);
  valid(st,'depleted finite source');
}
{
  const {st,a,carrier,source}=setup(5);
  until(()=>events(st,'physicalIngredientAcquired').length===1);
  a.needs.fatigue=90;
  until(()=>a.action===null);
  assert.equal(source.availableUnits,9);
  assert.equal(events(st,'physicalIngredientAcquired').length,1,'early return retains only acquired cargo');
  assert.equal(Object.values(st.objects).filter(o=>o.containedBy===carrier.id&&I.validIngredient(o)).length,1);
  valid(st,'interrupted multi-unit trip');
}
{
  const {st,a,source}=setup(2);
  until(()=>events(st,'physicalIngredientAcquired').length===1);
  st.doors.frontDoor.state='closed';a.needs.fatigue=90;
  until(()=>a.action?.phase==='return');
  for(let i=0;i<3;i++)E.tick();
  assert.equal(a.offMap,true,'closed exit cannot teleport physical carrier home');
  assert.equal(source.availableUnits,9);
  st.doors.frontDoor.state='open';
  until(()=>a.action===null);
  assert.equal(a.offMap,false);
  assert.equal(events(st,'physicalIngredientSupplyReturn').length,1);
  valid(st,'delayed legitimate reentry');
}
{
  const {st,a,source}=setup(1);
  const occupied='ingredient:offmap:'+SOURCE_ID+':1';
  st.objects[occupied]=I.createIngredientObject({id:occupied,typeId:'A',position:{x:11,y:2,z:0},supportId:'counterA'});
  const before=Object.keys(st.objects).length;
  assert.throws(()=>until(()=>a.action===null),/Object ID collision/);
  assert.equal(source.availableUnits,10,'collision cannot consume finite stock');
  assert.equal(Object.keys(st.objects).length,before,'collision cannot create phantom cargo');
  assert.equal(events(st,'physicalIngredientAcquired').length,0);
}
{
  const {st,a}=setup(1);
  assert.throws(()=>E.buildAction(a,{id:'externalSupply',mode:'physicalIngredient',sourceId:SOURCE_ID,carrierId:CARRIER_ID,unitLimit:0}),/unitLimit/);
  assert.throws(()=>E.buildAction(a,{id:'externalSupply',mode:'physicalIngredient',sourceId:SOURCE_ID,carrierId:CARRIER_ID,resource:'food'}),/cannot use Resource/);
  assert.equal(E.buildAction(a,{id:'externalSupply',mode:'physicalIngredient',sourceId:'absent',carrierId:CARRIER_ID}),null);
  valid(st,'invalid physical action rejected');
}
console.log('Food R3 off-map physical supply production regression: ok');
