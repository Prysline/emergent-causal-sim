import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';
import {legacyResourceWorld} from './helpers/legacy-resource-world.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring;
const I=globalThis.SimIngredient,F=globalThis.SimFood,C=globalThis.SimFoodCooking;
const O=globalThis.SimObjectHandling,R=globalThis.SimResources,SP=globalThis.SimSpatial;
const P=globalThis.SimPerception,V=globalThis.SimValidator;
assert.equal(C.VERSION,'food-cooking-v2-autonomous-ingredient-acquisition');
assert.equal(I.VERSION,'food-ingredient-v1');
assert.equal(F.VERSION,'food-v2-meal-serving');

const doc=legacyResourceWorld(A);
doc.furniture.stoveA={id:'stoveA',definitionId:'gas-stove',origin:{x:3,y:4,z:0},orientation:'south'};
doc.entities.objects.potA={
  id:'potA',name:'料理鍋',icon:'🍲',portable:true,cookingEligible:true,
  objectContainment:true,objectStorage:{maxItems:1,maxMassKg:.6},
  handling:{carryGeometry:{width:.35,height:.25,length:.35},handsRequired:1,massKg:.8},
  position:{x:3,y:4,z:0},supportId:'stoveA'
};
doc.entities.objects.ingredientA1=I.createIngredientObject({id:'ingredientA1',typeId:'A',containedBy:'potA'});
delete doc.entities.objects.readyMealF0;
const authored=A.validateAuthoring(doc);
assert.equal(authored.ok,true,authored.errors.map(x=>x.code).join(','));
assert.equal(A.parseAuthoringJSON(A.serializeAuthoring(doc)).entities.objects.ingredientA1.containedBy,'potA');

E.configureResetStateSource('food-f1b2-pot-cargo-fixture',seed=>W.createInitialStateFromAuthoring(doc,seed));
E.reset(20261120);
const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou,ingredient=st.objects.ingredientA1,pot=st.objects.potA;
for(const agent of Object.values(st.agents))if(agent.id!==a.id)agent.offMap=true;
assert.equal(O.objectStorageStatus(st,'potA').count,1);
assert.equal(O.objectStorageStatus(st,'potA').massKg,.3);
assert.equal(R.effectiveCarryLoad(st,{held:'potA'}),1.1);
assert.equal(ingredient.supportId,undefined);
assert.equal(ingredient.position,undefined);
assert.equal(ingredient.containedBy,'potA','the only canonical ordinary Object inventory relation');
assert.ok(SP.nodeSame(st,SP.objectNode(st,ingredient.id),SP.objectNode(st,pot.id)));
assert.equal(C.eligible(st,ingredient.id,'stoveA')?.location,'loaded');
assert.equal(P.classifyObjectPointVisualAvailability(st,a,ingredient).visualAvailable,false,
  'contained ingredient must not become automatically visible/known');
assert.equal(E.cookingDecisionOption(st,a),null,
  'another agent cannot independently plan Cooking from an unobserved contained Ingredient');
assert.equal(V.validateState(st).issueCount,0,'loaded pot must be legal canonical World state');

const contact=SP.bestInteractionPositionResult(st,a,{kind:'furniture',id:'stoveA'},'default');
assert.ok(Number.isFinite(contact?.traversalCost));
a.position={...contact.position};
const forged={kind:'cookMeal',phase:'cooking',ingredientId:ingredient.id,potId:pot.id,
  stationId:'stoveA',progressTicks:C.REQUIRED_TICKS,loadEventId:null};
a.action=forged;
for(const id of ['object:'+ingredient.id,'object:'+pot.id,'furniture:stoveA'])st.reservations[id]=a.id;
const before=Object.keys(st.objects).length;
const rejected=C.complete(st,a,forged,()=>{throw new Error('forged completion cannot emit an event');});
assert.deepEqual(rejected,{completed:false,reason:'missing-load-provenance'});
assert.equal(Object.keys(st.objects).length,before);
assert.equal(st.objects.ingredientA1,ingredient);
assert.equal(st.objects.ingredientA1.containedBy,'potA');
a.action=null;st.reservations={};

a.held=pot.id;
b.offMap=false;b.position={...a.position};
assert.ok(SP.same(SP.objectPosition(st,ingredient.id),a.position),
  'canonical child position follows carried Object parent');
assert.equal(E.takeContainedObject(b,ingredient.id),false,
  'second resident cannot take Ingredient from another resident held pot');
assert.equal(P.classifyObjectPointVisualAvailability(st,b,ingredient).visualAvailable,false);
b.offMap=true;
a.held=null;

const pickup=SP.interactionGeometry(st,{kind:'object',id:ingredient.id},a,'pickup');
assert.equal(pickup.mode,'objectContainerReach');
assert.ok(pickup.positions.length>0);
a.position={...pickup.positions[0]};
if(pickup.witnesses?.[0]?.requiredPosture)a.posture={kind:pickup.witnesses[0].requiredPosture,slotId:null,furnitureId:null};
assert.equal(E.takeContainedObject(a,ingredient.id),true,'generic take action can recover pot contents');
assert.equal(a.held,ingredient.id);
assert.equal(ingredient.containedBy,undefined);
assert.equal(O.objectStorageStatus(st,'potA').count,0);
assert.ok(I.validIngredient(ingredient));
const receive=SP.interactionGeometry(st,{kind:'object',id:pot.id},a,'receive');
assert.ok(receive.positions.length);
a.position={...receive.positions[0]};a.posture={kind:'standing',slotId:null,furnitureId:null};
assert.equal(E.containHeldObject(a,pot.id),true,'generic contain action can load pot again');
assert.equal(ingredient.containedBy,'potA');
assert.equal(O.objectStorageStatus(st,'potA').count,1);
const check=V.validateState(st);assert.equal(check.issueCount,0,check.issues.map(x=>x.code).join(','));
console.log('Food F1-B2 pot containment, derived load, observation boundary and failed forged completion: ok');
