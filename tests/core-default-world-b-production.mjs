// Canonical B house: direct production default, not the A/B test-only fixtures.
import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';
import {legacyResourceWorld} from './helpers/legacy-resource-world.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const A=globalThis.SimWorldAuthoring,I=globalThis.SimWorldInitializer;
const W=globalThis.SimWorld,E=globalThis.SimEngine,F=globalThis.SimFood;
const SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const p=(x,y)=>({x,y,z:0});
const doc=A.DEFAULT_WORLD_AUTHORING;
const objects=doc.entities.objects;
assert.equal(A.VERSION,'world-authoring-v29');
assert.equal(doc.authoringSchema,A.VERSION);
assert.equal(doc.map.width,16);
assert.equal(doc.map.height,10);
assert.equal(Object.keys(doc.map.layers[0].cells).length,112);
assert.equal(Object.keys(doc.map.layers[0].boundaries).length,54);
assert.equal(Object.keys(doc.furniture).length,12,'R2 adds one real storage Furniture, not a legacy Resource Food model');
assert.equal(Object.keys(objects).length,12,'R4-A1 adds the independent one-hand portable basket');
assert.equal(doc.doors.frontDoor.boundary.id,'h:4,9');
assert.equal(doc.doors.bedroomDoor.boundary.id,'h:6,5');
assert.equal(doc.doors.bedroomDoor.state,'open');
assert.deepEqual(doc.exits.frontExit.access,p(4,8));
assert.equal(doc.furniture.counterA.definitionId,'kitchen-counter');
assert.equal(doc.furniture.pantryA.definitionId,'cabinet-tall');
assert.equal(A.resolveFurnitureInstance(doc.furniture.pantryA).objectStorage.capacityCubicMeters,.12,'fixed pantry derives its capacity from canonical Furniture Definition');
assert.equal(objects.basketA.resourceContainer,undefined,'physical basket must not reuse legacy Resource-container semantics');
assert.equal(objects.basketA.objectContainment,true);
assert.equal(objects.basketA.objectStorage.capacityCubicMeters,.024);
assert.equal(objects.basketA.physicalVolumeCubicMeters,.004);
assert.equal(objects.basketSmallA.objectContainment,true);
assert.equal(objects.basketSmallA.objectStorage.capacityCubicMeters,.018);
assert.equal(objects.basketSmallA.physicalVolumeCubicMeters,.003);
assert.equal(objects.basketSmallA.handling.massKg,.6);
assert.equal(objects.basketSmallA.handling.handsRequired,1);
assert.deepEqual(objects.basketSmallA.handling.carryGeometry,{width:.4,height:.25,length:.3});
assert.deepEqual(objects.basketSmallA.position,p(5,8));
assert.equal(doc.furniture.stoveA.definitionId,'gas-stove');
assert.deepEqual(objects.ingredientA1.position,p(11,2));
assert.equal(objects.ingredientA1.supportId,'counterA');
assert.equal(objects.potA.supportId,'stoveA');
assert.equal(objects.potA.cookingEligible,true);
assert.equal(objects.readyMealF0.supportId,'diningTable');
assert.deepEqual(objects.readyMealF0.position,p(11,5));
assert.deepEqual(doc.entities.sources.tap.interactionPorts[0].position,p(10,3));
assert.equal(doc.entities.sources.tap.interactionPorts[0].id,'tap:south');
for(const id of ['zhen','zhou','orange'])assert.ok(doc.residents[id].initial.placement.node);
assert.deepEqual(doc.residents.zhen.initial.placement.node,p(10,4));
assert.deepEqual(doc.residents.zhou.initial.placement.node,p(5,7));
assert.deepEqual(doc.residents.orange.initial.placement.node,p(8,7));
for(const id of ['plateA','plateB']){
  const plate=objects[id];
  assert.equal(plate.name,id==='plateA'?'餐盤 A':'餐盤 B');
  assert.equal(F.isServingPlate(plate),true);
  assert.equal(plate.resourceContainer,undefined);
  assert.equal(plate.contents,undefined);
  assert.equal(plate.supportId,'diningTable');
}
for(const legacyId of ['legacyResourcePlateA','legacyResourcePlateB'])
  assert.equal(objects[legacyId],undefined,'legacy Resource plates must not coexist in production');
assert.equal(Object.values(objects).some(o=>o.resourceContainer===true&&o.servingDish===true),false);
for(const id of ['legacyResourceMealTray','legacyResourceFoodPantry','legacyResourceBasket'])assert.equal(objects[id],undefined,'legacy Food Resource Object must be absent');
assert.equal(Object.values(objects).some(o=>o.contents?.food>0||o.restock?.resource==='food'||(o.transportResources||[]).includes('food')),false,'B cannot own legacy Resource-food inventory or replenishment policy');
assert.equal(doc.resourceResponsibilityAssignments.some(relation=>relation.scope?.resource==='food'),false,'B must not hold legacy Food restock responsibility');
assert.equal(objects.readyMealF0.meal.edibleMassGrams,300);
assert.equal(objects.ingredientA1.ingredient.typeId,'A');
{
  const pureLegacy=legacyResourceWorld(A,{includeMeal:false});
  assert.equal(pureLegacy.entities.objects.readyMealF0,undefined,'pure Legacy fixture cannot include a physical Meal');
  for(const id of ['legacyResourceMealTray','legacyResourceFoodPantry','legacyResourceBasket'])assert.ok(pureLegacy.entities.objects[id],id+' is retained in isolated Legacy fixture');
  assert.equal(A.validateAuthoring(pureLegacy).ok,true);
}
assert.equal(A.validateAuthoring(doc).ok,true);
const roundtrip=A.parseAuthoringJSON(A.serializeAuthoring(doc));
assert.equal(A.semanticFingerprint(roundtrip),A.semanticFingerprint(doc));
const placements=I.analyzeInitialPlacements(doc);
assert.equal(placements.ok,true,JSON.stringify(placements.hardErrors));
assert.deepEqual(placements.diagnostics,[]);
for(const id of ['zhen','zhou','orange']){
  for(const kind of ['exit','food','water','sleep'])
    assert.equal(placements.reachabilityByResident[id].targets[kind].reachable,true,
      id+' cannot reach '+kind);
}
const initial=W.createInitialStateFromAuthoring(doc,20261121);
assert.equal(initial.map.width,16);
assert.equal(Object.values(initial.map.tiles).filter(t=>t.terrain==='floor').length,112);
assert.equal(F.isServingPlate(initial.objects.plateA),true);
assert.equal(SP.recomputeRooms(initial) instanceof Object,true);
assert.equal(Object.keys(SP.recomputeRooms(initial)).length,1);
initial.doors.bedroomDoor.state='closed';
assert.equal(Object.keys(SP.recomputeRooms(initial)).length,2);
// The full Validator references Engine current state through its memory providers;
// validate only after the Engine reset source and runtime have been initialized.

// Real production B Engine: a visibly reachable plate triggers the existing
// eat Action -> physical serve -> nearby placement -> incremental intake.
const servingDoc=A.cloneAuthoring(doc);
delete servingDoc.entities.objects.plateB;
servingDoc.entities.objects.readyMealF0.meal.edibleMassGrams=600;
assert.equal(A.validateAuthoring(servingDoc).ok,true);
E.configureResetStateSource('canonical-b-serving-integration',
  seed=>W.createInitialStateFromAuthoring(servingDoc,seed));
E.reset(20261126);
const st=E.getState(),a=st.agents.zhen,source=st.objects.readyMealF0,plate=st.objects.plateA;
assert.equal(V.validateState(st).issueCount,0,'full canonical validation requires an initialized Engine');
for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
Object.assign(a.needs,{hunger:80,thirst:0,fatigue:0,sleepNeed:0,social:0});
a.action=null;a.activeIntent=null;
const mealContacts=SP.interactionGeometry(st,{kind:'object',id:source.id},a,'eatFrom').positions;
const plateContacts=SP.interactionGeometry(st,{kind:'object',id:plate.id},a,'pickup').positions;
const contact=mealContacts.find(x=>plateContacts.some(y=>SP.nodeSame(st,x,y)));
assert.ok(contact,'canonical B table must provide a legal shared Meal/plate contact');
a.position={...contact};
assert.equal(SP.isAtInteraction(st,a,{kind:'object',id:plate.id},'pickup'),true);
const action=E.buildAction(a,{id:'eat'});
assert.equal(action?.phase,'prepare');
a.action=action;E.ensureIntentForAction?.(st,a);
E.tick();
assert.equal(action.phase,'toMealDish','real Food v2 eat must select a legal ordinary serving plate');
function until(predicate,max){
  for(let i=0;i<max;i++){E.tick();if(predicate())return;}
  assert.fail('canonical B runtime did not complete the expected phase in '+max+' ticks');
}
const servingEvents=()=>st.events.filter(e=>e.data?.foodKind==='meal'&&e.data?.phase==='serveMeal');
const intakeEvents=()=>st.events.filter(e=>e.data?.foodKind==='meal'&&e.data?.phase==='intake');
until(()=>servingEvents().length===1,70);
const event=servingEvents()[0],portion=st.objects[event.data.mealId];
assert.equal(event.data.to,plate.id,'Serving Event must reference the real carried plate Object');
assert.equal(event.data.servedGrams,300);
assert.equal(event.data.remainingSourceGrams,300);
assert.equal(portion.containedBy,plate.id);
assert.equal(st.objects.readyMealF0.meal.edibleMassGrams,300);
assert.equal(a.held,plate.id);
assert.equal(st.causes[event.id],event);
until(()=>a.action===null,130);
assert.equal(a.held,null);
assert.ok(st.events.some(e=>e.data?.phase==='placeMealDish'&&e.data?.mealId===portion.id));
assert.equal(st.objects[portion.id],undefined);
assert.equal(intakeEvents().reduce((sum,e)=>sum+e.data.intakeGrams,0),300);
function ancestors(id,seen=new Set()){
  if(!id||seen.has(id))return seen;
  seen.add(id);
  for(const cause of st.causes[id]?.causeIds||[])ancestors(cause,seen);
  return seen;
}
for(const eventOfIntake of intakeEvents())assert.ok(ancestors(eventOfIntake.id).has(event.id));
assert.equal(V.validateState(st).issueCount,0);
console.log('Core Default World B canonical scene & physical Meal Serving regression: ok');
