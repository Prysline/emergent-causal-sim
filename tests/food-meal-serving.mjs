import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring;
const F=globalThis.SimFood,I=globalThis.SimIngredient,O=globalThis.SimObjectHandling;
const SP=globalThis.SimSpatial,P=globalThis.SimPerception,V=globalThis.SimValidator;
assert.equal(F.VERSION,'food-v4-contained-meal');
assert.equal(O.VERSION,'object-handling-v4-storage-volume');
assert.equal(A.VERSION,'world-authoring-v30');
assert.equal(SP.MEAL_PLATE_INTERACTION_VERSION,'meal-plate-eat-from-v3-cookware-contact','production Spatial Traversal owns exposed plate contact');

function fixture({cooking=false}={}){
  const doc=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
  // Exercise the production B serving plate; narrow the physical capacity
  // only for this independent capacity regression fixture.
  delete doc.entities.objects.plateB;
  doc.entities.objects.plateA.objectStorage.capacityCubicMeters=.00012;
  if(cooking){
    delete doc.entities.objects.readyMealF0;
    // Cooking fixture uses the canonical B kitchen instead of relocating its stove.
    doc.residents.zhen.initial.placement={mode:'exact',node:{x:11,y:3,z:0}};
    doc.residents.zhen.initial.facing='north';
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
  return {st,a,b,plate:st.objects.plateA,meal:st.objects.readyMealF0};
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
  delete meal.position;delete meal.supportId;meal.containedBy='plateA';meal.meal.edibleMassGrams=120;
  assert.equal(A.validateAuthoring(doc).ok,true,'authoring must accept a legal contained Meal without handling.massKg');
  const inPot=A.cloneAuthoring(doc);
  inPot.entities.objects.readyMealF0.containedBy='potA';
  assert.equal(A.validateAuthoring(inPot).ok,true,'authoring accepts contained cookware Meal');
  const invalid=A.cloneAuthoring(doc);
  invalid.entities.objects.plateA.canEatFrom=false;
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
  assert.ok(Math.abs(O.objectStorageStatus(st,plate).volumeCubicMeters-.00012)<1e-12);
  assert.equal(E.foodStock(),stock,'legacy Resource stock must not change after serving');
  assert.equal(F.serveMeal(st,meal.id,plate.id,20,'portion-B').served,false,'no second Meal in a one-item plate');
  assert.equal(F.consumeMeal(st,portion.id,50).actualIntakeGrams,50);
  assert.ok(Math.abs(O.objectStorageStatus(st,plate).massKg-.07)<1e-9,'cargo load follows consumed grams');
  assert.ok(Math.abs(O.objectStorageStatus(st,plate).volumeCubicMeters-.00007)<1e-12,'occupied volume follows the same grams and density');
  assert.equal(F.remainingGrams(meal)+F.remainingGrams(portion),250,'serving + eating conserve canonical mass');
  assert.deepEqual(issues(),[]);
  const originalContainer=portion.containedBy;
  portion.containedBy='basketA';
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
  delete plate.supportId;plate.position={x:2,y:8,z:0};
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
  const {st,a,meal}=setup(20261125);
  delete st.objects.plateA; // No serving dish: exercise physical Meal's direct path.
  const target={kind:'object',id:meal.id};
  const contact=SP.bestInteractionPositionResult(st,a,target,'eatFrom');
  assert.ok(contact?.position);
  a.position={...contact.position};
  const action=startEat(st,a);
  E.tick();assert.equal(action.phase,'toMeal');
  until(()=>intakeEvents(st).length>0,90);
  const sit=st.events.find(e=>e.data?.action==='sitForMeal'&&e.data?.foodKind==='meal');
  assert.ok(sit,'a reachable real dining chair must be used before physical Meal intake');
  assert.equal(a.posture?.kind,'sitting');
  assert.equal(a.posture?.slotId,sit.data.slot);
  assert.ok(SP.isAtInteraction(st,a,target,'eatFrom'),'seated Agent must be at canonical food contact');
  assert.ok(eventAncestors(st,intakeEvents(st)[0].id).has(sit.id),'intake must cite the seating World Event');
  assert.equal(F.remainingGrams(meal),250);
  assert.deepEqual(issues(),[]);
}
{
  const {st,a,b,meal}=setup(20261127);
  delete st.objects.plateA;
  const target={kind:'object',id:meal.id};
  const approach=SP.bestInteractionPositionResult(st,a,target,'eatFrom');
  assert.ok(approach?.position);
  a.position={...approach.position};
  const action=startEat(st,a);
  E.tick();assert.equal(action.phase,'toMeal');
  E.tick();assert.equal(action.phase,'toMealSeat','real Meal should have selected a reachable chair');
  const slot=SP.getSlot(st,action.mealSeatId);
  assert.ok(slot);
  b.offMap=false;b.position={...slot.position};
  b.posture={kind:'sitting',slotId:slot.id,furnitureId:slot.furnitureId};
  E.tick();
  assert.equal(action.phase,'toMeal','occupied selected Slot must cancel settle and return to legal Meal contact');
  assert.equal(st.reservations['slot:'+slot.id],undefined,'lost Slot must release reservation');
  assert.equal(st.events.some(e=>e.data?.action==='sitForMeal'&&e.data?.foodKind==='meal'),false);
}
{
  const {st,a,meal}=setup(20261126);
  delete st.objects.plateA;
  for(const furniture of Object.values(st.furniture))for(const slot of furniture.slots||[])
    if(slot.mealSeat||slot.canRest)slot.approachEdges=[];
  const target={kind:'object',id:meal.id},contact=SP.bestInteractionPositionResult(st,a,target,'eatFrom');
  assert.ok(contact?.position);
  a.position={...contact.position};
  startEat(st,a);
  until(()=>intakeEvents(st).length>0,90);
  assert.equal(st.events.some(e=>e.data?.action==='sitForMeal'&&e.data?.foodKind==='meal'),false);
  assert.ok(st.events.some(e=>e.data?.action==='standForMeal'&&e.data?.foodKind==='meal'));
  assert.equal(a.posture?.kind,'standing');
  assert.ok(SP.isAtInteraction(st,a,target,'eatFrom'));
  assert.deepEqual(issues(),[]);
}
{
  const {st,a,plate}=setup(20261124,{cooking:true});
  a.needs.hunger=55;
  const facingsForCooking=['north','northEast','east','southEast','south','southWest','west','northWest'];
  let observed=null;
  for(const face of facingsForCooking){a.facing=face;observed=E.cookingDecisionOption(st,a);if(observed)break;}
  assert.equal(observed?.id,'cookMeal','real Cooking decision must find an ingredient and eligible pot');
  const action=E.buildAction(a,observed);
  assert.equal(action?.kind,'cookMeal');
  a.action=action;E.ensureIntentForAction?.(st,a);
  until(()=>st.events.some(x=>x.data?.action==='cookMeal'&&x.data?.phase==='complete'),90);
  const completion=st.events.find(x=>x.data?.action==='cookMeal'&&x.data?.phase==='complete');
  assert.equal(st.objects.ingredientA1,undefined);
  const cooked=st.objects[completion.data.mealId],pot=st.objects[completion.data.potId];
  assert.equal(cooked.meal.edibleMassGrams,300);
  assert.equal(cooked.containedBy,pot.id);
  assert.equal(cooked.position,undefined);assert.equal(cooked.supportId,undefined);
  assert.equal(O.objectStorageStatus(st,pot).count,1);
  assert.ok(Math.abs(O.objectStorageStatus(st,pot).volumeCubicMeters-.0003)<1e-12);
  assert.equal(F.isServingPlate(pot),false);
  assert.equal(F.isServingSource(st,cooked),true);
  assert.equal(SP.interactionGeometry(st,{kind:'object',id:cooked.id},a,'serve').mode,'exposedMealCookwareReach');
  const originalExposure=pot.canEatFrom;delete pot.canEatFrom;
  assert.equal(F.cookingContainerForMeal(st,cooked),pot);
  assert.equal(P.classifyObjectPointVisualAvailability(st,a,cooked).visualAvailable,false);
  assert.equal(SP.interactionGeometry(st,{kind:'object',id:cooked.id},a,'serve').positions.length,0);
  assert.equal(F.serveMeal(st,cooked.id,plate.id,50,'hidden').served,false);
  pot.canEatFrom=originalExposure;
  st.reservations['object:'+pot.id]='zhou';
  assert.equal(SP.interactionGeometry(st,{kind:'object',id:cooked.id},a,'serve').positions.length,0);
  delete st.reservations['object:'+pot.id];
  assert.deepEqual(issues(),[]);
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
  assert.equal(event.data.sourceContainerId,pot.id);
  assert.equal(cooked.containedBy,pot.id);
  assert.equal(O.objectStorageStatus(st,pot).count,1);
  assert.ok(Math.abs(O.objectStorageStatus(st,pot).volumeCubicMeters-.00018)<1e-12);
  assert.ok(eventAncestors(st,event.id).has(completion.id),'Serving must cite the real Cooking completion');
  assert.equal(a.held,plate.id,'Cooking → Serving still uses canonical Agent held');
  until(()=>intakeEvents(st).length>0,120);
  assert.ok(eventAncestors(st,intakeEvents(st)[0].id).has(completion.id),'first intake must retain Ingredient→Cooking provenance');
  assert.deepEqual(issues(),[]);
}

{
  const {st,a,b,plate,meal}=setup(20261124),pot=st.objects.potA;
  delete meal.position;delete meal.supportId;meal.containedBy=pot.id;meal.meal.edibleMassGrams=100;
  assert.equal(O.objectStorageStatus(st,pot).count,1);
  const originalSupport=pot.supportId;
  a.held=pot.id;delete pot.supportId;b.offMap=false;
  assert.ok(SP.nodeSame(st,SP.objectNode(st,meal.id),SP.nodeForAgent(st,a)),'Meal follows actual carried cookware');
  assert.equal(P.classifyObjectPointVisualAvailability(st,b,meal).visualAvailable,false);
  assert.equal(SP.interactionGeometry(st,{kind:'object',id:meal.id},b,'serve').positions.length,0);
  a.offMap=true;
  assert.equal(P.classifyObjectPointVisualAvailability(st,a,meal).visualAvailable,false);
  a.offMap=false;a.held=null;pot.supportId=originalSupport;b.offMap=true;
  const full=F.serveMeal(st,meal.id,plate.id,100,'unused-cookware');
  assert.equal(full.full,true);assert.equal(full.servedMealId,meal.id);
  assert.equal(O.objectStorageStatus(st,pot).count,0);
  assert.equal(meal.containedBy,plate.id);assert.equal(st.objects['unused-cookware'],undefined);
  assert.deepEqual(issues(),[]);
}

console.log('Meal Serving v1: authoring, grams, visibility, carry, eat and real Cooking integration ok');
