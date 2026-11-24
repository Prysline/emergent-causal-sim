import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';
import {legacyResourceWorld} from './helpers/legacy-resource-world.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring;
const I=globalThis.SimIngredient,F=globalThis.SimFood,C=globalThis.SimFoodCooking;
const SP=globalThis.SimSpatial,P=globalThis.SimPerception,V=globalThis.SimValidator,D=globalThis.SimFurnitureDefinitions;
assert.equal(C.VERSION,'food-cooking-v3-object-storage-volume');
assert.equal(I.VERSION,'food-ingredient-v1');
assert.equal(F.VERSION,'food-v3-meal-volume');
assert.equal(D.VERSION,'furniture-definitions-v15-storage-volume');
assert.equal(A.VERSION,'world-authoring-v29','current Cooking authoring schema is the explicitly advanced v23');
assert.equal(E.COOKING_VERSION,C.VERSION);
assert.ok(E.EMERGENCY_PREEMPTIBLE.has('cookMeal'));
assert.equal(D.getDefinition('gas-stove').cookingStation,true);
assert.equal(D.getDefinition('kitchen-counter').supportsObjects,true);

const doc=legacyResourceWorld(A);
doc.furniture.stoveA={id:'stoveA',definitionId:'gas-stove',origin:{x:3,y:4,z:0},orientation:'south'};
doc.furniture.counterA={id:'counterA',definitionId:'kitchen-counter',origin:{x:3,y:5,z:0},orientation:'south'};
doc.entities.objects.potA={
  id:'potA',name:'料理鍋',icon:'🍲',cookingEligible:true,portable:true,
  objectContainment:true,objectStorage:{capacityCubicMeters:.0006},
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
// Real decision and tick regression for legal crawling postures without canonical sight samples.
for(const posture of ['kneeling','prone']){
  const fixture=setup(20261120),actor=fixture.a,world=fixture.st,ingredient=fixture.input;
  const standingOption=E.cookingDecisionOption(world,actor);
  assert.equal(standingOption?.id,'cookMeal');
  actor.posture={kind:posture,slotId:null,furnitureId:null};
  assert.equal(P.lacksVisualPoseEnvelopeForSupportedLocomotion(actor),true);
  assert.throws(()=>P.classifyObjectPointVisualAvailability(world,actor,ingredient),new RegExp('do not support posture '+posture));
  assert.equal(E.cookingDecisionOption(world,actor),null,'no Cooking option without visual evidence');
  assert.equal(E.buildAction(actor,standingOption),null,'direct Action cannot bypass posture guard');
  const beforeObjects=JSON.stringify(world.objects),beforeTick=world.tick;
  E.tick();
  assert.equal(world.tick,beforeTick+1,'real Engine tick continues for '+posture);
  assert.ok(!world.thoughts[actor.id]?.options?.some(x=>x.id==='cookMeal'));
  assert.equal(JSON.stringify(world.objects),beforeObjects,'no World Object mutation');
  assert.equal(world.events.filter(e=>e.data?.action==='cookMeal').length,0,'no fabricated Cooking World Event');
  assert.equal(V.validateState(world).issueCount,0);
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


 // Countertop pickup is an autonomous Cooking action, not an initializer-staged stove Ingredient.
doc.entities.objects.ingredientA1.position={x:3,y:5,z:0};
doc.entities.objects.ingredientA1.supportId='counterA';
doc.residents.zhen.initial.placement={mode:'exact',node:{x:4,y:5,z:0}};
assert.equal(A.validateAuthoring(doc).ok,true,'countertop input must pass canonical World Authoring');
const possibleFacings=['north','northEast','east','southEast','south','southWest','west','northWest'];
function counterSetup(seed){
  const {st,a,input}=setup(seed);
  let option=null;
  for(const face of possibleFacings){a.facing=face;option=E.cookingDecisionOption(st,a);if(option)break;}
  return {st,a,input,option};
}
{
  const {st,a,input,option}=counterSetup(20261123);
  assert.equal(input.supportId,'counterA');
  assert.equal(C.eligible(st,input.id,'stoveA')?.sourceId,'counterA','Kitchen counter is a valid generic supported source');
  assert.equal(C.eligible(st,input.id,'counterA'),null,'Counter itself is not a cooking station');
  assert.equal(option?.observed?.sourceId,'counterA','Actual observation must carry canonical source identity');
  assert.equal(E.buildAction(a,{...option,observed:{...option.observed,sourceId:'stoveA'}}),null,'Forged support observation must fail');
  const action=E.buildAction(a,option);
  assert.equal(action?.sourceId,'counterA');
  assert.equal(action?.potId,'potA');
  a.action=action;E.ensureIntentForAction?.(st,a);
  E.tick();
  assert.equal(st.reservations['object:ingredientA1'],a.id);
  assert.equal(st.reservations['object:potA'],a.id);
  assert.equal(st.reservations['furniture:stoveA'],a.id);
  const competitor=st.agents.zhou;
  competitor.offMap=false;competitor.position={...a.position};competitor.facing=a.facing;
  assert.equal(E.cookingDecisionOption(st,competitor),null,'Two agents cannot choose same reserved batch');
  competitor.offMap=true;
  for(let t=0;t<110&&!st.events.some(e=>e.data?.action==='cookMeal'&&e.data?.phase==='complete');t++)E.tick();
  const pickups=st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='pickupIngredient');
  const loads=st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='loadPot');
  const completes=st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='complete');
  assert.equal(pickups.length,1,'One physical pickup must produce one canonical World Event');
  assert.equal(pickups[0].data.sourceId,'counterA');
  assert.equal(st.causes[pickups[0].id],pickups[0]);
  assert.equal(loads.length,1);
  assert.deepEqual(loads[0].causeIds,[pickups[0].id]);
  assert.equal(completes.length,1);
  assert.deepEqual(completes[0].causeIds,[loads[0].id]);
  assert.equal(st.objects.ingredientA1,undefined,'Original physical Ingredient must be retired once');
  const cooked=st.objects[completes[0].data.mealId];
  assert.ok(F.validMeal(cooked));
  assert.equal(cooked.meal.edibleMassGrams,300);
  assert.equal(cooked.supportId,'stoveA');
  assert.equal(st.causes[completes[0].id],completes[0]);
  assert.equal(V.validateState(st).issueCount,0);
  const eat=E.buildAction(a,{id:'eat'});
  assert.equal(eat?.kind,'eat');
  a.action=eat;E.ensureIntentForAction?.(st,a);
  for(let t=0;t<35&&!st.events.some(e=>e.data?.action==='eat'&&e.data?.foodKind==='meal'&&e.data?.phase==='intake');t++)E.tick();
  assert.ok(st.events.some(e=>e.data?.action==='eat'&&e.data?.foodKind==='meal'&&e.data?.phase==='intake'),'Existing F0 eat must consume cooked Meal');
  assert.equal(V.validateState(st).issueCount,0);
}
{
  const {st,a,input,option}=counterSetup(20261124);
  assert.ok(option);
  a.action=E.buildAction(a,option);E.ensureIntentForAction?.(st,a);
  E.tick();
  input.position={x:5,y:2,z:0};input.supportId='diningTable';
  assert.equal(C.eligible(st,input.id,'stoveA')?.sourceId,'diningTable','Another generic supported source remains physically legal');
  E.tick();
  assert.equal(a.action,null,'Changing a source mid-action must abort, not silently switch');
  assert.ok(st.objects.ingredientA1,'Abort must preserve Ingredient material');
  assert.equal(st.events.filter(e=>e.data?.action==='cookMeal'&&e.data?.phase==='complete').length,0);
  assert.equal(V.validateState(st).issueCount,0);
}
console.log('Food autonomous counter acquisition, source pin, reservation, pickup→load→complete and F0 eat: ok');
