import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';
import {legacyResourceWorld} from './helpers/legacy-resource-world.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring;
const I=globalThis.SimIngredient,F=globalThis.SimFood,C=globalThis.SimFoodCooking;
const K=globalThis.SimFoodCookwareEligibility,O=globalThis.SimObjectHandling;
const V=globalThis.SimValidator;
assert.equal(K.VERSION,'food-cookware-eligibility-v1');
assert.equal(C.VERSION,'food-cooking-v4-contained-output');
assert.equal(A.VERSION,'world-authoring-v30');

const doc=legacyResourceWorld(A);
doc.furniture.stoveA={id:'stoveA',definitionId:'gas-stove',origin:{x:3,y:4,z:0},orientation:'south'};
function addPot(id,capacityCubicMeters,qualified=true){
  doc.entities.objects[id]={
    id,name:'容器'+id,icon:'🍲',portable:true,cookingEligible:qualified,
    objectContainment:true,objectStorage:{capacityCubicMeters},
    handling:{carryGeometry:{width:.35,height:.25,length:.35},handsRequired:1,massKg:.8},
    position:{x:3,y:4,z:0},supportId:'stoveA'
  };
}
addPot('potA',.0002);addPot('potB',.0006);addPot('potC',.0006,false);
doc.entities.objects.ingredientA1=I.createIngredientObject({id:'ingredientA1',typeId:'A',position:{x:3,y:4,z:0},supportId:'stoveA'});
delete doc.entities.objects.readyMealF0;
doc.residents.zhen.initial.placement={mode:'exact',node:{x:3,y:3,z:0}};
doc.residents.zhen.initial.facing='south';
assert.equal(A.validateAuthoring(doc).ok,true,A.validateAuthoring(doc).errors.map(x=>x.code).join(','));
assert.equal(A.parseAuthoringJSON(A.serializeAuthoring(doc)).entities.objects.potB.cookingEligible,true);
function invalid(mutate,code){
  const changed=A.cloneAuthoring(doc);mutate(changed);
  assert.ok(A.validateAuthoring(changed).errors.some(x=>x.code===code),code+' authoring must reject');
}
invalid(d=>{d.entities.objects.potA.cookingEligible='true';},'food_cookware_eligibility_type');
invalid(d=>{d.entities.objects.potA.cookingPot=true;},'food_cookware_legacy_flag');
invalid(d=>{d.entities.objects.potA.resourceContainer=true;d.entities.objects.potA.cookingEligible=true;},'food_cookware_resource_conflict');
E.configureResetStateSource('cookware-eligibility-fixture',seed=>W.createInitialStateFromAuthoring(doc,seed));
function setup(seed){
  E.reset(seed);
  const st=E.getState(),a=st.agents.zhen;
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  Object.assign(a.needs,{hunger:55,thirst:0,fatigue:0,sleepNeed:0,social:0});
  a.action=null;a.activeIntent=null;
  return {st,a};
}
let {st,a}=setup(20261121);
assert.equal(O.objectStorageLegality(st,'potA','ingredientA1'),false);
assert.equal(O.objectStorageLegality(st,'potB','ingredientA1'),true);
assert.equal(C.eligible(st,'ingredientA1','stoveA')?.pot.id,'potB');
assert.equal(C.eligible(st,'ingredientA1','stoveA',{potId:'potA'}),null);
let choice=E.cookingDecisionOption(st,a);
assert.equal(choice?.potId,'potB','undersized first pot must not hide legal pot');
a.facing='north';
assert.equal(E.cookingDecisionOption(st,a),null,'World facts must not grant visual knowledge');
a.facing='south';
st.reservations['object:potB']='zhou';
assert.equal(E.cookingDecisionOption(st,a),null,'reserved qualified pot must not be chosen');
delete st.reservations['object:potB'];
choice=E.cookingDecisionOption(st,a);assert.equal(choice?.potId,'potB');
assert.equal(E.buildAction(a,{...choice,potId:'potA'}),null,'Action builder must reject switched potId');
const action=E.buildAction(a,choice);
assert.equal(action?.potId,'potB');
a.action=action;E.ensureIntentForAction?.(st,a);
for(let t=0;t<85;t++){
  E.tick();
  if(st.events.some(e=>e.data?.action==='cookMeal'&&e.data?.phase==='complete'))break;
}
const loads=st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='loadPot');
const completes=st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='complete');
assert.equal(loads.length,1);
assert.equal(completes.length,1);
assert.deepEqual(completes[0].causeIds,[loads[0].id]);
assert.equal(loads[0].data.potId,'potB');
assert.equal(completes[0].data.potId,'potB');
assert.equal(st.causes[completes[0].id],completes[0]);
assert.equal(st.objects.ingredientA1,undefined);
const cooked=st.objects[completes[0].data.mealId];
const cookedStorage=O.objectStorageStatus(st,'potB');
assert.equal(cookedStorage.count,1,'the selected cookware retains exactly one cooked Meal');
assert.equal(cookedStorage.items[0].id,cooked.id,'the stored child is the canonical output, not the retired Ingredient');
assert.ok(F.validMeal(cooked));
assert.equal(cooked.containedBy,'potB');
assert.equal(cooked.position,undefined);
assert.equal(cooked.supportId,undefined);
assert.equal(cooked.meal.edibleMassGrams,300);
assert.ok(Math.abs(cookedStorage.massKg-.3)<1e-9);
assert.ok(Math.abs(cookedStorage.volumeCubicMeters-.0003)<1e-12);
assert.equal(F.exposedMealContainer(st,cooked),null,'cooking eligibility alone must not expose the cooked Meal');
assert.equal(F.isServingSource(st,cooked),false);
assert.equal(O.objectStorageStatus(st,'potA').count,0);
assert.equal(O.objectStorageStatus(st,'potC').count,0);
assert.equal(V.validateState(st).issueCount,0);
({st,a}=setup(20261122));
st.objects.potC.cookingEligible=true; // second valid alternative must not replace pinned potB
choice=E.cookingDecisionOption(st,a);assert.equal(choice?.potId,'potB');
a.action=E.buildAction(a,choice);E.ensureIntentForAction?.(st,a);
E.tick();
st.objects.potB.cookingEligible=false;
assert.equal(C.eligible(st,'ingredientA1','stoveA',{potId:'potB'}),null);
assert.equal(C.eligible(st,'ingredientA1','stoveA')?.pot.id,'potC','an alternative remains genuinely legal');
E.tick();
assert.equal(a.action,null,'runtime must abort, not switch to an available pot');
assert.ok(st.objects.ingredientA1,'aborted Action must not consume the Ingredient');
assert.equal(st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='complete').length,0);
assert.equal(V.validateState(st).issueCount,0);
st.objects.potA.cookingEligible='invalid';
assert.ok(V.validateState(st).issues.some(x=>x.code==='food_cookware_eligibility_type'));
console.log('Cookware v1 production: schema/validator, capacity, observation, reservation, pinned Action, Event provenance: ok');
