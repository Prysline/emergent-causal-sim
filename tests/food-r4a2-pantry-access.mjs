// R4-A2: live production Cooking provider, Engine ticks and one canonical Object lifecycle.
import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const A=globalThis.SimWorldAuthoring,W=globalThis.SimWorld,E=globalThis.SimEngine;
const SP=globalThis.SimSpatial,C=globalThis.SimFoodCooking,O=globalThis.SimObjectHandling,V=globalThis.SimValidator,F=globalThis.SimFood;
const ID='ingredientA1',PANTRY='pantryA',STATION='stoveA';
const facings=['north','northEast','east','southEast','south','southWest','west','northWest'];
let doc;
function fixture({empty=false}={}){
  const authored=JSON.parse(JSON.stringify(A.DEFAULT_WORLD_AUTHORING));
  delete authored.entities.objects.readyMealF0;
  const item=authored.entities.objects[ID];assert.ok(item);
  delete item.position;delete item.supportId;item.containedBy=PANTRY;
  if(empty)delete authored.entities.objects[ID];
  const report=A.validateAuthoring(authored);
  assert.equal(report.ok,true,JSON.stringify(report.errors));
  return authored;
}
E.configureResetStateSource('r4a2-pantry-access',seed=>W.createInitialStateFromAuthoring(doc,seed));
function reset(options={}){
  doc=fixture(options);E.reset(20261125);
  const st=E.getState(),a=st.agents.zhen;
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  Object.assign(a.needs,{hunger:72,thirst:0,fatigue:0,sleepNeed:0,social:0});
  a.action=null;a.activeIntent=null;
  return {st,a};
}
const choiceFor=(st,a)=>E.pantryCookingDecisionOption(st,a);
const events=(st,kind)=>st.events.filter(e=>e.data?.action===kind);
const cooked=(st,id=ID)=>events(st,'cookMeal').filter(e=>e.data.phase==='complete'&&e.data.ingredientId===id);
const valid=(st)=>assert.deepEqual(V.validateState(st).issues,[],'runtime validation');
function localChoice(st,a){
  for(const position of SP.interactionPositions(st,{kind:'furniture',id:PANTRY},a,'default')){
    a.position={...position};
    for(const facing of facings){
      a.facing=facing;
      const option=choiceFor(st,a);
      if(option?.storageSourceId===PANTRY&&option.observed.storageContact)return option;
    }
  }
  assert.fail('fixture lacks an actual pantry/observed cooking equipment witness');
}
function start(st,a,option){
  a.action=E.buildAction(a,option);assert.ok(a.action);E.ensureIntentForAction(st,a);
}
function until(predicate,label,limit=240){
  for(let t=0;t<limit;t++){if(predicate())return;E.tick();}
  assert.fail(label+' not reached in '+limit+' real Engine ticks');
}
function ancestors(st,id,seen=new Set()){
  if(!id||seen.has(id))return seen;
  seen.add(id);for(const cause of st.causes[id]?.causeIds||[])ancestors(st,cause,seen);
  return seen;
}
{
  const {st,a}=reset();
  assert.equal(C.eligible(st,ID,STATION),null);
  assert.equal(O.containedObjects(st,PANTRY).some(o=>o.id===ID),true);
  const option=localChoice(st,a);
  assert.equal(option.id,'cookMeal');assert.equal(option.ingredientId,undefined,'no pre-inspection item claim');
  assert.equal(E.buildAction(a,{...option,ingredientId:ID}),null,'forged hidden child ID');
  assert.equal(E.buildAction(a,{...option,observed:{...option.observed,observedTick:st.tick-1}}),null,'stale evidence');
  start(st,a,option);
  const intentId=a.activeIntent.id;
  let held=false,staged=false;
  until(()=>{
    const item=st.objects[ID];
    if(a.held===ID){held=true;assert.ok(item&&!item.containedBy&&!item.supportId);}
    if(item?.supportId&&item.supportId!==STATION){
      staged=true;assert.equal(item.containedBy,undefined);assert.equal(item.supportId,option.sourceId);
      assert.equal(st.furniture[item.supportId]?.supportsObjects,true);
    }
    if(a.action?.kind==='cookMeal')assert.equal(a.activeIntent?.id,intentId,'same Intent');
    return cooked(st).length>0;
  },'pantry to cooked meal');
  assert.equal(held,true);assert.equal(staged,true);assert.equal(cooked(st).length,1);assert.equal(st.objects[ID],undefined);
  assert.ok(F.validMeal(st.objects[cooked(st)[0].data.mealId]));
  const pickup=events(st,'takeContainerCargo').find(e=>e.data.objectId===ID&&e.data.from===PANTRY);
  const placement=events(st,'objectSupportPlacement').find(e=>e.data.objectId===ID);
  assert.ok(pickup&&placement);assert.equal(placement.data.supportId,option.sourceId);
  const chain=ancestors(st,cooked(st)[0].id);assert.ok(chain.has(pickup.id)&&chain.has(placement.id));
  assert.equal(st.causes[cooked(st)[0].id],cooked(st)[0]);valid(st);
}
{
  const {st,a}=reset({empty:true});
  for(const position of SP.interactionPositions(st,{kind:'furniture',id:PANTRY},a,'default')){
    a.position={...position};
    for(const facing of facings){a.facing=facing;assert.notEqual(choiceFor(st,a)?.storageSourceId,PANTRY);}
  }
  assert.equal(events(st,'takeContainerCargo').length,0);
}
{
  const {st,a}=reset();const option=localChoice(st,a);
  st.objects[option.potId].objectStorage.capacityCubicMeters=.0001;
  assert.equal(E.buildAction(a,option),null,'known local ingredient cannot fit the pinned pot');
  assert.equal(st.objects[ID].containedBy,PANTRY);assert.equal(a.held,null);assert.equal(cooked(st).length,0);valid(st);
}
{
  const {st,a}=reset();const option=localChoice(st,a);
  st.reservations['object:'+ID]='zhou';
  assert.equal(E.buildAction(a,option),null,'reserved child cannot be extracted');
  assert.equal(st.objects[ID].containedBy,PANTRY);assert.equal(a.held,null);
  delete st.reservations['object:'+ID];valid(st);
}
{
  const {st,a}=reset();const option=localChoice(st,a);
  start(st,a,option);until(()=>a.held===ID,'real pantry pickup');
  const before=JSON.stringify(st.objects[ID]);
  assert.equal(SP.releaseHeldObjectOnSupport(st,a,'not-a-furniture'),null);
  assert.equal(a.held,ID);assert.equal(JSON.stringify(st.objects[ID]),before);
  st.reservations['furniture:'+option.sourceId]='zhou';
  assert.equal(SP.releaseHeldObjectOnSupport(st,a,option.sourceId),null,'competing support reservation');
  assert.equal(JSON.stringify(st.objects[ID]),before);
  until(()=>!a.action,'interrupted carry');
  assert.ok(st.objects[ID]);assert.equal(cooked(st).length,0);assert.equal(a.held,null);
  assert.equal(Object.keys(st.objects).filter(id=>id===ID).length,1);
  delete st.reservations['furniture:'+option.sourceId];valid(st);
}
{
  const {st,a}=reset();localChoice(st,a);
  until(()=>a.action?.kind==='cookMeal'&&a.action.storageSourceId===PANTRY,'autonomous Cooking preparation',40);
  until(()=>cooked(st).length===1,'autonomous completion');valid(st);
}
// Select an actual remote pantry view using canonical geometry and Perception.
function remoteChoice(st,a){
  const P=globalThis.SimPerception,target={kind:'furniture',id:PANTRY};
  const pantry=st.furniture[PANTRY],pot=st.objects.potA;
  const anchor=pantry.displayAt;
  for(let radius=1;radius<=4;radius++){
    for(let y=anchor.y-radius;y<=anchor.y+radius;y++)for(let x=anchor.x-radius;x<=anchor.x+radius;x++){
      if(Math.max(Math.abs(x-anchor.x),Math.abs(y-anchor.y))!==radius)continue;
      const node=SP.normalizeNode(st,{x,y,z:anchor.z||0},'floor');
      if(!node||!SP.nodeWalkable(st,node,a)||!SP.floorNodeFitsMode(st,node,a,'walk'))continue;
      a.position={...node};
      if(SP.isAtInteraction(st,a,target,'default')||!E.inspectContainedObjects||E.inspectContainedObjects(a,PANTRY)!==null)continue;
      const potPos=SP.objectPosition(st,pot.id);
      if(!potPos||(potPos.x===x&&potPos.y===y))continue;
      const center=P.deriveFurnitureSightSamples(pantry).targetSamples[0].position;
      if(center.x===x&&center.y===y)continue;
      for(const facing of facings){
        a.facing=facing;
        if(!P.classifyFurnitureVisualSensoryAvailability(st,a,pantry)?.visualAvailable||
          !P.classifyObjectPointVisualAvailability(st,a,pot)?.visualAvailable)continue;
        const option=choiceFor(st,a);
        if(option?.storageSourceId===PANTRY&&option.observed.storageContact===false)return option;
      }
    }
  }
  assert.fail('B fixture must contain an actual remote visible pantry/cookware witness');
}
{
  const {st,a}=reset();const option=remoteChoice(st,a);
  const item=st.objects[ID],origin={...a.position};
  assert.equal(E.inspectContainedObjects(a,PANTRY),null);
  assert.equal(E.stagingIngredientEligible(st,a,item,PANTRY,option.stationId,option.potId,option.sourceId),false);
  delete st.objects[ID];
  assert.deepEqual(choiceFor(st,a),option,'unknown remote contents cannot change the decision or evidence');
  st.objects[ID]=item;
  start(st,a,option);
  until(()=>a.held===ID,'remote inspection then actual pickup');
  assert.ok(!SP.nodeSame(st,origin,SP.nodeForAgent(st,a)),'the actor really approached storage');
  assert.ok(SP.isAtInteraction(st,a,{kind:'furniture',id:PANTRY},'default'),'actual contact at extraction');
  until(()=>cooked(st).length===1,'remote pantry cooking completion');valid(st);
}
{
  const {st,a}=reset();const option=localChoice(st,a);
  const manipulation=a.physical.manipulation,old=manipulation.handCapacity;
  manipulation.handCapacity=0;
  assert.equal(choiceFor(st,a),null,'zero manipulation capacity cannot start a pantry plan');
  assert.equal(E.buildAction(a,option),null);
  manipulation.handCapacity=old;valid(st);
}
// Cost boundary: even with a previously viable known source/support, no
// eligible cookware means no speculative Spatial route search for this provider.
{
  const {st,a}=reset();const option=localChoice(st,a);
  const pot=st.objects[option.potId];pot.cookingEligible=false;
  const originals={planRoute:SP.planRoute,bestInteractionPositionResult:SP.bestInteractionPositionResult,bestCandidateNodeResult:SP.bestCandidateNodeResult};
  const calls={planRoute:0,bestInteractionPositionResult:0,bestCandidateNodeResult:0};
  try{
    for(const key of Object.keys(originals))SP[key]=function(...args){calls[key]++;return originals[key].apply(this,args);};
    assert.equal(choiceFor(st,a),null,'no eligible cookware, no pantry plan');
    assert.deepEqual(calls,{planRoute:0,bestInteractionPositionResult:0,bestCandidateNodeResult:0},'impossible Cooking must not search routes');
  }finally{
    Object.assign(SP,originals);pot.cookingEligible=true;
  }
  assert.deepEqual(choiceFor(st,a),option,'fresh decision must recover with cookware restored');valid(st);
}
// Actual R3 acquisition -> R4-A1 transfer -> R4-A2 Cooking. No fabricated ingredient or transfer event.
{
  const {st,a}=reset({empty:true});
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0});
  a.position={...st.objects.basketSmallA.position};
  start(st,a,{id:'externalSupply',mode:'physicalIngredient',sourceId:'externalIngredientSupplyA',carrierId:'basketSmallA',unitLimit:1});
  until(()=>!a.action,'actual R3 supply return',360);
  const child=O.containedObjects(st,'basketSmallA')[0];assert.ok(child?.id.startsWith('ingredient:offmap:'));
  start(st,a,{id:'transferContainedObjects',sourceId:'basketSmallA',destinationId:PANTRY});
  until(()=>!a.action,'actual R4-A1 unload',360);
  assert.equal(st.objects[child.id].containedBy,PANTRY);
  const acquired=events(st,'physicalIngredientAcquired').find(e=>e.data.ingredientId===child.id);
  const transfer=events(st,'objectContainerTransfer').find(e=>e.data.objectId===child.id&&e.data.to===PANTRY);
  assert.ok(acquired&&transfer);
  Object.assign(a.needs,{hunger:65,thirst:0,fatigue:0,sleepNeed:0,social:0});
  const option=localChoice(st,a);start(st,a,option);
  until(()=>cooked(st,child.id).length===1,'actual acquired Ingredient Cooking');
  const chain=ancestors(st,cooked(st,child.id)[0].id);
  assert.ok(chain.has(acquired.id)&&chain.has(transfer.id),'actual acquisition and transfer ancestry');
  assert.equal(st.objects[child.id],undefined);valid(st);
}
console.log('R4-A2 real pantry pickup, targeted staging, Cooking and R3/R4-A1 provenance: ok');
