import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring;
const F=globalThis.SimFood,I=globalThis.SimIngredient,O=globalThis.SimObjectHandling;
const SP=globalThis.SimSpatial,P=globalThis.SimPerception,V=globalThis.SimValidator;
assert.equal(F.VERSION,'food-v2-meal-serving');
assert.equal(O.VERSION,'object-handling-v3-meal-mass-projection');
assert.equal(A.VERSION,'world-authoring-v24');
assert.equal(SP.MEAL_PLATE_INTERACTION_VERSION,'meal-plate-eat-from-v1','production Spatial Traversal owns exposed plate contact');

function fixture({cooking=false}={}){
  const doc=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
  doc.entities.objects.mealPlate={
    id:'mealPlate',name:'可盛餐餐盤',icon:'🍽️',portable:true,canEatFrom:true,
    objectContainment:true,objectStorage:{maxItems:1,maxMassKg:.12},
    handling:{carryGeometry:{width:.30,height:.05,length:.30},handsRequired:1,massKg:.3},
    position:{x:5,y:2,z:0},supportId:'diningTable',
    interactions:{pickup:{mode:'supportReach'},eatFrom:{mode:'supportReach'}}
  };
  if(cooking){
    delete doc.entities.objects.readyMealF0;
    doc.furniture.stoveA={id:'stoveA',definitionId:'gas-stove',origin:{x:3,y:4,z:0},orientation:'south'};
    doc.entities.objects.potA={
      id:'potA',name:'料理鍋',icon:'🍲',cookingEligible:true,portable:true,
      objectContainment:true,objectStorage:{maxItems:1,maxMassKg:.6},
      handling:{carryGeometry:{width:.35,height:.25,length:.35},handsRequired:1,massKg:.8},
      position:{x:3,y:4,z:0},supportId:'stoveA'
    };
    doc.entities.objects.ingredientA1=I.createIngredientObject({id:'ingredientA1',typeId:'A',position:{x:3,y:4,z:0},supportId:'stoveA'});
    doc.residents.zhen.initial.placement={mode:'exact',node:{x:3,y:3,z:0}};
    doc.residents.zhen.initial.facing='south';
  }
  const result=A.validateAuthoring(doc);
  assert.equal(result.ok,true,'Serving fixture must pass current authoring: '+result.errors.map(x=>x.code).join(', '));
  return doc;
}
let currentDoc=fixture();
E.configureResetStateSource('meal-serving-v1-fixture',seed=>W.createInitialStateFromAuthoring(currentDoc,seed));
function setup(seed=20261121,{cooking=false}={}){
  currentDoc=fixture({cooking});
  E.reset(seed);
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou;
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  for(const person of [a,b]){
    Object.assign(person.needs,{hunger:80,thirst:0,fatigue:0,sleepNeed:0,social:0});
    person.action=null;person.activeIntent=null;
  }
  return {st,a,b,plate:st.objects.mealPlate,meal:st.objects.readyMealF0};
}
const issues=()=>V.validateState(E.getState()).issues.map(x=>x.code);
function startEat(st,a){
  const action=E.buildAction(a,{id:'eat'});
  assert.equal(action?.phase,'prepare','existing eat Action must be available');
  a.action=action;E.ensureIntentForAction?.(st,a);
  return action;
}
function until(condition,max=100){
  for(let n=0;n<max;n++){E.tick();if(condition())return n+1;}
  assert.fail('production tick did not reach expected serving lifecycle within '+max+' ticks');
}
function servingEvents(st){return st.events.filter(x=>x.data?.phase==='serveMeal'&&x.data?.foodKind==='meal');}
function intakeEvents(st){return st.events.filter(x=>x.data?.phase==='intake'&&x.data?.foodKind==='meal');}
function eventAncestors(st,id,visited=new Set()){
  if(!id||visited.has(id))return visited;
  visited.add(id);
  for(const causeId of st.causes[id]?.causeIds||[])eventAncestors(st,causeId,visited);
  return visited;
}
{
  const doc=fixture(),meal=doc.entities.objects.readyMealF0;
  delete meal.position;delete meal.supportId;meal.containedBy='mealPlate';meal.meal.edibleMassGrams=120;
  assert.equal(A.validateAuthoring(doc).ok,true,'authoring must accept a legal contained Meal without handling.massKg');
  const invalid=A.cloneAuthoring(doc);
  invalid.entities.objects.mealPlate.canEatFrom=false;
  assert.ok(A.validateAuthoring(invalid).errors.some(x=>x.code==='food_meal_plate_invalid'),'closed plate must fail Food authoring');
}
{
  const {st,meal,plate}=setup(20261121),stock=E.foodStock();
  assert.throws(()=>F.serveMeal(st,meal.id,plate.id,0,'zero'),/positive integer/);
  assert.equal(F.serveMeal(st,meal.id,plate.id,120,meal.id).served,false,'conflicting portion identity must fail atomically');
  assert.equal(F.remainingGrams(meal),300);
  const served=F.serveMeal(st,meal.id,plate.id,120,'portion-A');
  assert.equal(served.served,true);
  assert.equal(served.actualGrams,120);
  assert.equal(served.remainingSourceGrams,180);
  const portion=st.objects['portion-A'];
  assert.equal(portion.containedBy,plate.id);
  assert.equal(portion.position,undefined);
  assert.equal(portion.supportId,undefined);
  assert.equal(F.remainingGrams(portion),120);
  assert.equal(F.remainingGrams(meal),180);
  assert.equal(O.objectStorageStatus(st,plate).count,1);
  assert.equal(O.objectStorageStatus(st,plate).massKg,.12);
  assert.equal(E.foodStock(),stock,'legacy Resource stock must not change after serving');
  assert.equal(F.serveMeal(st,meal.id,plate.id,20,'portion-B').served,false,'no second Meal in a one-item plate');
  assert.equal(F.consumeMeal(st,portion.id,50).actualIntakeGrams,50);
  assert.ok(Math.abs(O.objectStorageStatus(st,plate).massKg-.07)<1e-9,'cargo load follows consumed grams');
  assert.equal(F.remainingGrams(meal)+F.remainingGrams(portion),250,'serving + eating conserve canonical mass');
  assert.deepEqual(issues(),[]);
  const originalContainer=portion.containedBy;
  portion.containedBy='basket';
  assert.equal(F.servingPlateForMeal(st,portion),null);
  assert.equal(P.classifyObjectPointVisualAvailability(st,st.agents.zhen,portion).visualAvailable,false);
  assert.equal(SP.interactionGeometry(st,{kind:'object',id:portion.id},st.agents.zhen,'eatFrom').positions.length,0);
  assert.ok(issues().includes('food_meal_plate_invalid'),'ordinary cargo containment cannot become exposed Meal');
  portion.containedBy=originalContainer;
  assert.deepEqual(issues(),[]);
}
{
  const {st,meal,plate,a,b}=setup(20261122);
  meal.meal.edibleMassGrams=100;
  const served=F.serveMeal(st,meal.id,plate.id,100,'unused');
  assert.equal(served.full,true,'full transfer must preserve the original Meal identity');
  assert.equal(served.servedMealId,meal.id);
  assert.equal(st.objects.unused,undefined);
  assert.equal(O.objectStorageStatus(st,plate).massKg,.1);
  assert.equal(SP.objectLocationState(st,meal.id),'contained');
  assert.deepEqual(issues(),[]);
  // A plate carried by someone else must not expose remote Meal pickup or eating.
  a.held=plate.id;delete plate.supportId;
  b.offMap=false;
  assert.equal(P.classifyObjectPointVisualAvailability(st,b,meal).visualAvailable,false);
  assert.equal(SP.interactionGeometry(st,{kind:'object',id:meal.id},b,'eatFrom').positions.length,0);
  assert.equal(SP.isAtInteraction(st,a,{kind:'object',id:meal.id},'eatFrom'),true,'owner may eat from a held plate');
  a.held=null;a.offMap=true;plate.supportId='diningTable';
  assert.equal(SP.interactionGeometry(st,{kind:'object',id:meal.id},b,'eatFrom').mode,'exposedMealPlateReach','the effective production traversal owner must delegate Food plate eatFrom');
  const approach=SP.bestInteractionPositionResult(st,b,{kind:'object',id:meal.id},'eatFrom');
  assert.ok(Number.isFinite(approach?.traversalCost));
  b.position={...approach.position};
  assert.equal(E.canSatisfyHunger(b),true,'another resident can choose an exposed plated Meal');
  const action=startEat(st,b);
  E.tick();assert.equal(action.phase,'toMeal','existing eat Action must directly consume a placed Meal');
  until(()=>intakeEvents(st).length>=1,12);
  assert.equal(intakeEvents(st)[0].data.intakeGrams,50);
  assert.equal(F.remainingGrams(meal),50);
  assert.deepEqual(issues(),[]);
}
{
  // A reachable but unobserved plate is World truth, not this Agent's serving knowledge.
  const {st,a,meal,plate}=setup(20261127);
  delete plate.supportId;plate.position={x:10,y:6,z:0};
  const sourceContact=SP.bestInteractionPositionResult(st,a,{kind:'object',id:meal.id},'eatFrom');
  assert.ok(sourceContact?.position);
  a.position={...sourceContact.position};
  const route=SP.bestInteractionPositionResult(st,a,{kind:'object',id:plate.id},'pickup');
  assert.ok(Number.isFinite(route?.traversalCost),'unobserved plate is still physically reachable');
  assert.equal(SP.isAtInteraction(st,a,{kind:'object',id:plate.id},'pickup'),false);
  const facings=['north','northEast','east','southEast','south','southWest','west','northWest'];
  assert.ok(facings.some(face=>{
    a.facing=face;
    return P.classifyObjectPointVisualAvailability(st,a,plate).visualAvailable===false;
  }),'a canonical visual blind orientation must exist');
  const action=startEat(st,a);
  E.tick();
  assert.equal(action.phase,'toMeal','World plate existence alone must not trigger serving');
  assert.equal(servingEvents(st).length,0);
  assert.deepEqual(issues(),[]);
}
{
  const {st,a,meal,plate}=setup(20261123);
  const mealContacts=SP.interactionGeometry(st,{kind:'object',id:meal.id},a,'eatFrom').positions;
  const plateContacts=SP.interactionGeometry(st,{kind:'object',id:plate.id},a,'pickup').positions;
  const common=mealContacts.find(x=>plateContacts.some(y=>SP.nodeSame(st,x,y)));
  assert.ok(common,'fixture must put the actor at real shared contact with Meal and serving plate');
  a.position={...common};
  assert.equal(SP.isAtInteraction(st,a,{kind:'object',id:plate.id},'pickup'),true);
  const action=startEat(st,a);
  E.tick();
  assert.equal(action.phase,'toMealDish','real eat prepare must opt into physical plate serving');
  until(()=>servingEvents(st).length===1,50);
  const event=servingEvents(st)[0],portion=st.objects[event.data.mealId];
  assert.equal(event.data.servedGrams,120);
  assert.equal(event.data.remainingSourceGrams,180);
  assert.equal(F.remainingGrams(meal),180);
  assert.equal(F.remainingGrams(portion),120);
  assert.equal(portion.containedBy,plate.id);
  assert.equal(a.held,plate.id,'plate remains physically carried immediately after transfer');
  assert.ok(st.causes[event.id]===event);
  assert.deepEqual(issues(),[]);
  until(()=>a.action===null,110);
  assert.equal(a.held,null,'nearby placement releases the real plate');
  assert.equal(SP.objectLocationState(st,plate.id)==='supported'||SP.objectLocationState(st,plate.id)==='free',true);
  assert.equal(st.objects[portion.id],undefined,'plated portion retires after actual intake');
  assert.equal(F.remainingGrams(meal),180,'unserved original food is preserved');
  assert.deepEqual(intakeEvents(st).map(x=>x.data.intakeGrams).reverse(),[50,50,20]);
  assert.equal(intakeEvents(st).reduce((sum,x)=>sum+x.data.intakeGrams,0),120);
  assert.equal(E.foodStock(),E.foodStock(),'legacy stock projection remains separate');
  assert.ok(st.events.some(x=>x.data?.phase==='placeMealDish'&&x.data?.mealId===portion.id));
  for(const intake of intakeEvents(st))assert.ok(eventAncestors(st,intake.id).has(event.id),'intake must cite serving ancestry');
  assert.deepEqual(issues(),[]);
}
{
  const {st,a,plate}=setup(20261124,{cooking:true});
  a.needs.hunger=55;
  const observed=E.cookingDecisionOption(st,a);
  assert.equal(observed?.id,'cookMeal','real Cooking decision must find an ingredient and eligible pot');
  const action=E.buildAction(a,observed);
  assert.equal(action?.kind,'cookMeal');
  a.action=action;E.ensureIntentForAction?.(st,a);
  until(()=>st.events.some(x=>x.data?.action==='cookMeal'&&x.data?.phase==='complete'),90);
  const completion=st.events.find(x=>x.data?.action==='cookMeal'&&x.data?.phase==='complete');
  assert.equal(st.objects.ingredientA1,undefined);
  assert.equal(st.objects[completion.data.mealId].meal.edibleMassGrams,300);
  a.needs.hunger=80;
  const facings=['north','northEast','east','southEast','south','southWest','west','northWest'];
  const observedPlate=facings.some(face=>{
    a.facing=face;
    return P.classifyObjectPointVisualAvailability(st,a,plate).visualAvailable===true
      || SP.isAtInteraction(st,a,{kind:'object',id:plate.id},'pickup');
  });
  assert.equal(observedPlate,true,'cooked serving fixture must provide actual observed plate evidence');
  const eat=startEat(st,a);
  E.tick();assert.equal(eat.phase,'toMealDish','cooked Meal must enter physical serving path');
  until(()=>servingEvents(st).length===1,80);
  const event=servingEvents(st)[0];
  assert.equal(event.data.servedGrams,120);
  assert.equal(event.data.remainingSourceGrams,180);
  assert.ok(eventAncestors(st,event.id).has(completion.id),'Serving must cite the real Cooking completion');
  assert.equal(a.held,plate.id,'Cooking → Serving still uses canonical Agent held');
  until(()=>intakeEvents(st).length>0,120);
  assert.ok(eventAncestors(st,intakeEvents(st)[0].id).has(completion.id),'first intake must retain Ingredient→Cooking provenance');
  assert.deepEqual(issues(),[]);
}

console.log('Meal Serving v1: authoring, grams, visibility, carry, eat and real Cooking integration ok');
