import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const I=globalThis.SimIngredient,A=globalThis.SimWorldAuthoring;
const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial;
const O=globalThis.SimObjectHandling,R=globalThis.SimResources,V=globalThis.SimValidator,F=globalThis.SimFood;
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-10,message+': expected '+b+', got '+a);

assert.equal(I.VERSION,'food-ingredient-v1');
assert.equal(A.VERSION,'world-authoring-v24');
assert.equal(F.VERSION,'food-v2-meal-serving','Meal owner must advance only for the approved serving contract');
assert.ok(Object.isFrozen(I.TYPES)&&Object.isFrozen(I.TYPES.A),'Type defaults must be immutable');
assert.deepEqual(Object.keys(I.TYPES),['A'],'F1-A only introduces the approved first abstract Type');
for(const input of [
  {id:'x',typeId:'missing',position:{x:3,y:2}},
  {id:'x',typeId:'A',massGrams:0,position:{x:3,y:2}},
  {id:'x',typeId:'A',massGrams:3.5,position:{x:3,y:2}},
  {id:'x',typeId:'A',densityKgPerM3:0,position:{x:3,y:2}},
  {id:'x',typeId:'A',densityKgPerM3:Infinity,position:{x:3,y:2}},
  {id:'x',typeId:'A',position:{x:3,y:2},containedBy:'basket'},
])assert.throws(()=>I.createIngredientObject(input),'invalid Ingredient type/quantity/placement must fail explicitly');

const base=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING),objects=base.entities.objects;
const first=I.createIngredientObject({id:'ingredientA1',typeId:'A',position:{x:3,y:2,z:0}});
const second=I.createIngredientObject({id:'ingredientA2',typeId:'A',massGrams:400,densityKgPerM3:800,position:{x:3,y:2,z:0}});
const third=I.createIngredientObject({id:'ingredientA3',typeId:'A',position:{x:3,y:2,z:0}});
objects[first.id]=first;objects[second.id]=second;objects[third.id]=third;
assert.equal(first.handling.massKg,.3);
assert.equal(second.handling.massKg,.4);
assert.equal(first.ingredient.densityKgPerM3,1000);
assert.equal(second.ingredient.densityKgPerM3,800);
assert.equal(I.massGrams(first),300);assert.equal(I.massGrams(second),400);
close(I.volumeCubicMeters(first),.0003,'derived first volume');
close(I.volumeCubicMeters(second),.0005,'derived density override volume');
assert.equal(first.ingredient.massGrams,undefined,'no writable duplicate Ingredient grams');
assert.equal(first.ingredient.massKg,undefined,'no writable duplicate Ingredient kilograms');
assert.equal(first.massGrams,undefined,'no top-level duplicate Ingredient mass');
const basket=objects.basket;
basket.objectContainment=true;
basket.objectStorage={maxItems:2,maxMassKg:.8};
assert.equal(A.validateAuthoring(base).ok,true);
const roundTrip=A.parseAuthoringJSON(A.serializeAuthoring(base));
assert.deepEqual(roundTrip.entities.objects.ingredientA2,second,'authoring round-trip preserves concrete mass and density');
assert.equal(roundTrip.authoringSchema,'world-authoring-v24');

function authoredReject(mutate,code){
  const doc=A.cloneAuthoring(base);mutate(doc);
  const report=A.validateAuthoring(doc);
  assert.ok(report.errors.some(issue=>issue.code===code),code+' must be an explicit authoring error: '+report.errors.map(x=>x.code).join(', '));
}
authoredReject(d=>{d.entities.objects.ingredientA1.ingredient.typeId='unknown';},'food_ingredient_invalid');
authoredReject(d=>{d.entities.objects.ingredientA1.ingredient.massGrams=300;},'food_ingredient_invalid');
authoredReject(d=>{d.entities.objects.ingredientA1.ingredient.densityKgPerM3=-2;},'food_ingredient_invalid');
authoredReject(d=>{d.entities.objects.ingredientA1.handling.massKg=0;},'food_ingredient_invalid');
authoredReject(d=>{d.entities.objects.ingredientA1.handling.massKg=.3005;},'food_ingredient_invalid');
authoredReject(d=>{d.entities.objects.ingredientA1.contents={food:300};},'food_ingredient_invalid');
authoredReject(d=>{d.entities.objects.ingredientA1.meal={edibleMassGrams:300,standardServingMassGrams:300};},'food_ingredient_invalid');
authoredReject(d=>{d.entities.objects.basket.objectStorage.maxMassKg=.5;for(const id of ['ingredientA1','ingredientA2']){d.entities.objects[id].containedBy='basket';delete d.entities.objects[id].position;}},'authoring_object_storage_capacity_exceeded');

E.configureResetStateSource('ingredient-f1a-fixture',seed=>W.createInitialStateFromAuthoring(roundTrip,seed));
E.reset(20261120);
const st=E.getState(),resident=st.agents.zhen,carrier=st.objects.basket,initialLegacyStock=E.foodStock();
for(const agent of Object.values(st.agents))if(agent.id!==resident.id)agent.offMap=true;
const contact=SP.interactionGeometry(st,{kind:'object',id:'basket'},resident,'receive');
assert.ok(contact.positions.length,'fixture must provide reachable generic receive geometry');
resident.position={...contact.positions[0]};resident.posture={kind:'standing',slotId:null,furnitureId:null};
function place(id){
  resident.held=id;delete st.objects[id].position;
  assert.equal(E.containHeldObject(resident,'basket'),true,'generic Engine contains Ingredient without Food-specific transfer');
  assert.equal(resident.held,null);assert.equal(st.objects[id].containedBy,'basket');
  assert.equal(st.objects[id].position,undefined);
}
place('ingredientA1');place('ingredientA2');
const cargo=O.objectStorageStatus(st,'basket');
assert.equal(cargo.count,2);close(cargo.massKg,.7,'two concrete masses sum exactly once');
close(R.containerLoad(st,'basket'),1.5,'basket emptyLoad plus derived Ingredient cargo');
assert.equal(R.fillRatio(st,'basket'),0,'resource inventory remains independent');
assert.equal(E.foodStock(),initialLegacyStock,'Ingredient cannot add to legacy Resource stock');
assert.equal(V.validateState(st).issueCount,0,'real production validator must accept legal stored Ingredients');
resident.held='ingredientA3';delete st.objects.ingredientA3.position;
assert.equal(E.containHeldObject(resident,'basket'),false,'maxItems must block third unit');
st.objects.ingredientA3.position={x:3,y:2,z:0};resident.held=null;
resident.held='basket';
for(const point of [{x:3,y:3,z:0},{x:2,y:3,z:0},{x:3,y:2,z:0}]){
  resident.position={...point};
  for(const id of ['ingredientA1','ingredientA2']){
    assert.ok(SP.same(SP.objectPosition(st,id),point),'Ingredient follows carried basket via canonical containedBy');
    assert.ok(SP.nodeSame(st,SP.objectNode(st,id),SP.objectNode(st,'basket')));
  }
  close(R.effectiveCarryLoad(st,resident),1.5,'held basket weight includes ingredients');
}
assert.ok(SP.releaseHeldObjectNearby(st,resident),'generic Object release should handle basket');
assert.equal(resident.held,null);
const access=SP.interactionGeometry(st,{kind:'object',id:'ingredientA1'},resident,'pickup');
assert.equal(access.mode,'objectContainerReach');
resident.position={...access.positions[0]};
if(access.witnesses?.[0]?.requiredPosture)resident.posture={kind:access.witnesses[0].requiredPosture,slotId:null,furnitureId:null};
assert.equal(E.takeContainedObject(resident,'ingredientA1'),true,'generic pickup recovers one canonical Ingredient Object');
assert.equal(st.objects.ingredientA1.containedBy,undefined);
assert.equal(resident.held,'ingredientA1');
assert.equal(O.objectStorageStatus(st,'basket').count,1);
close(R.containerLoad(st,'basket'),1.2,'remaining Ingredient mass remains in basket');
assert.equal(I.massGrams(st.objects.ingredientA1),300);
const final=V.validateState(st);assert.equal(final.issueCount,0,final.issues.map(x=>x.code).join(', '));
st.objects.ingredientA2.ingredient.densityKgPerM3=0;
assert.ok(V.validateState(st).issues.some(x=>x.code==='food_ingredient_invalid'),'runtime must reject invalid Ingredient density');
console.log('Food F1-A Ingredient Object production regression: ok');
