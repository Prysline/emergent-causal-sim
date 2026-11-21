import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring;
const I=globalThis.SimIngredient,F=globalThis.SimFood,C=globalThis.SimFoodCooking;
const SP=globalThis.SimSpatial,P=globalThis.SimPerception,V=globalThis.SimValidator,D=globalThis.SimFurnitureDefinitions;
assert.equal(C.VERSION,'food-cooking-v1-cookware-eligibility');
assert.equal(I.VERSION,'food-ingredient-v1');
assert.equal(F.VERSION,'food-v1-f0');
assert.equal(D.VERSION,'furniture-definitions-v14-kitchen');
assert.equal(A.VERSION,'world-authoring-v23','current Cooking authoring schema is the explicitly advanced v23');
assert.equal(E.COOKING_VERSION,C.VERSION);
assert.ok(E.EMERGENCY_PREEMPTIBLE.has('cookMeal'));
assert.equal(D.getDefinition('gas-stove').cookingStation,true);
assert.equal(D.getDefinition('kitchen-counter').supportsObjects,true);

const doc=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
doc.furniture.stoveA={id:'stoveA',definitionId:'gas-stove',origin:{x:3,y:4,z:0},orientation:'south'};
doc.furniture.counterA={id:'counterA',definitionId:'kitchen-counter',origin:{x:3,y:5,z:0},orientation:'south'};
doc.entities.objects.potA={
  id:'potA',name:'料理鍋',icon:'🍲',cookingEligible:true,portable:true,
  objectContainment:true,objectStorage:{maxItems:1,maxMassKg:.6},
  handling:{carryGeometry:{width:.35,height:.25,length:.35},handsRequired:1,massKg:.8},
  position:{x:3,y:4,z:0},supportId:'stoveA'
};
doc.entities.objects.ingredientA1=I.createIngredientObject({id:'ingredientA1',typeId:'A',position:{x:3,y:4,z:0},supportId:'stoveA'});
delete doc.entities.objects.readyMealF0;
doc.residents.zhen.initial.placement={mode:'exact',node:{x:3,y:3,z:0}};
doc.residents.zhen.initial.facing='south';
const report=A.validateAuthoring(doc);
assert.equal(report.ok,true,report.errors.map(e=>e.code+':'+e.message).join(' | '));
assert.equal(A.parseAuthoringJSON(A.serializeAuthoring(doc)).furniture.stoveA.definitionId,'gas-stove');
const fx=W.createInitialStateFromAuthoring(doc,20261120);
assert.equal(fx.furniture.stoveA.cookingStation,true);
assert.equal(fx.furniture.counterA.supportsObjects,true);

E.configureResetStateSource('cooking-f1b1-fixture',seed=>W.createInitialStateFromAuthoring(doc,seed));
function setup(seed=20261120){
  E.reset(seed);
  const st=E.getState(),a=st.agents.zhen;
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  Object.assign(a.needs,{hunger:55,thirst:0,fatigue:0,sleepNeed:0,social:0});
  a.action=null;a.activeIntent=null;
  return {st,a,input:st.objects.ingredientA1};
}
let {st,a,input}=setup();
assert.equal(C.eligible(st,input.id,'stoveA')?.inputMassGrams,300);
assert.equal(C.eligible(st,input.id,'stoveA')?.location,'exposed');
assert.equal(C.eligible(st,input.id,'counterA'),null,'countertop is not a stove');
const contact=SP.bestInteractionPositionResult(st,a,{kind:'furniture',id:'stoveA'},'default');
assert.ok(Number.isFinite(contact?.traversalCost),'stove must have legal interaction geometry');
const visible=P.classifyObjectPointVisualAvailability(st,a,input);
assert.equal(visible.visualAvailable,true,'Cooking ingredient must be actually observed');
const option=E.cookingDecisionOption(st,a);
assert.equal(option?.id,'cookMeal','real decision option provider should discover observed station, pot and ingredient');
assert.equal(option.ingredientId,input.id);
assert.equal(option.observed.observedTick,st.tick);
assert.ok(option.decisionContributors.some(c=>c.kind==='observation'));
assert.equal(E.buildAction(a,{...option,observed:{...option.observed,observedTick:st.tick-1}}),null,'stale observation cannot establish Action');
a.facing='north';
assert.equal(E.cookingDecisionOption(st,a),null,'world material must not imply remote Agent knowledge');
a.facing='south';

const chosen=E.cookingDecisionOption(st,a);
const action=E.buildAction(a,chosen);
assert.equal(action?.kind,'cookMeal');
assert.equal(action?.phase,'toStation');
a.action=action;E.ensureIntentForAction?.(st,a);
E.tick();
const competitor=st.agents.zhou;
competitor.offMap=false;competitor.position={...a.position};competitor.facing='south';competitor.action=null;competitor.activeIntent=null;
assert.equal(E.cookingDecisionOption(st,competitor),null,'reserved Ingredient/pot must not produce a competing Cooking option');
competitor.offMap=true;
assert.equal(C.complete(st,a,{...action,progressTicks:4},E.addEvent).completed,false,'premature completion is not a legal standalone transaction');
let finished=false;
for(let t=0;t<70;t++){
  E.tick();
  if(st.events.some(e=>e.data?.action==='cookMeal'&&e.data?.phase==='complete')){finished=true;break;}
}
assert.equal(finished,true,'real Engine tick loop must finish Cooking Action');
assert.equal(a.action,null);
assert.equal(st.objects.ingredientA1,undefined,'whole Ingredient retired exactly once');
assert.equal(globalThis.SimObjectHandling.objectStorageStatus(st,'potA').count,0,'Cooking leaves no phantom ingredient inside pot');
const events=st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='complete');
assert.equal(events.length,1,'one and only one canonical transformation Event');
const loads=st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='loadPot');
assert.equal(loads.length,1,'one physical put-in-pot world event before transformation');
assert.deepEqual(events[0].causeIds,[loads[0].id],'canonical material transform must cite pot-loading event');
const event=events[0],meal=st.objects[event.data.mealId];
assert.ok(meal&&F.validMeal(meal),'Cooking must yield a legal F0 Meal Object');
assert.equal(event.data.recipeId,C.RECIPE_ID);
assert.equal(event.data.inputMassGrams,300);
assert.equal(event.data.mealMassGrams,300);
assert.equal(event.data.processOutflowMassGrams,0);
assert.equal(event.data.inputMassGrams,event.data.mealMassGrams+event.data.processOutflowMassGrams);
assert.equal(meal.producedByEventId,event.id);
assert.equal(st.causes[event.id],event);
assert.ok(event.data.entities.includes('object:ingredientA1'));
assert.ok(event.data.entities.includes('object:'+meal.id));
assert.equal(meal.supportId,'stoveA','Meal remains at same cooking station; no teleport to dining table');
assert.ok(SP.same(SP.objectPosition(st,meal.id),SP.objectPosition(st,'potA')));
assert.equal(meal.contents,undefined,'no legacy resource food created');
assert.ok(Number.isFinite(SP.bestInteractionPositionResult(st,a,{kind:'object',id:meal.id},'eatFrom')?.traversalCost));
assert.equal(V.validateState(st).issueCount,0,'production validator must accept completed Meal state');
const mealChoice=E.buildAction(a,{id:'eat'});
assert.equal(mealChoice?.kind,'eat','existing eat Action must consume cooked Meal via F0');
a.action=mealChoice;E.ensureIntentForAction?.(st,a);
let eaten=false;
for(let t=0;t<35;t++){
  E.tick();
  if(st.events.some(e=>e.data?.action==='eat'&&e.data?.foodKind==='meal'&&e.data?.phase==='intake')){eaten=true;break;}
}
assert.equal(eaten,true,'the same existing Meal intake consumer must eat cooked food');
assert.ok(st.events.some(e=>e.data?.action==='eat'&&e.data?.foodKind==='meal'&&e.data?.intakeGrams===50));

// Interruption/invalidated ingredients never create a replacement Meal.
({st,a,input}=setup(20261121));
const initial=E.cookingDecisionOption(st,a);assert.ok(initial);
a.action=E.buildAction(a,initial);E.ensureIntentForAction?.(st,a);
E.tick();
assert.equal(globalThis.SimObjectHandling.objectStorageStatus(st,'potA').count,0,'pot disappearance scenario must precede loading');
assert.ok(st.objects.ingredientA1,'progress before completion cannot debit an Ingredient');
delete st.objects.potA;
E.tick();
assert.ok(st.objects.ingredientA1,'pot loss must preserve source Ingredient');
assert.equal(st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='complete').length,0);
assert.equal(Object.values(st.objects).filter(o=>F.hasMeal(o)).length,0);
assert.equal(V.validateState(st).issueCount,0);
console.log('Food F1-B1 Cooking production action, material balance, observation and F0 intake: ok');
