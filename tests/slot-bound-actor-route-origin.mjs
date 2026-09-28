import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js','systems/relationship/state.js','systems/physical.js','systems/locomotion.js','crowding-runtime-v1200.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/appraisal/human-social-response.js','systems/relationship/runtime.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js','systems/social/human-response.js','systems/memory/deliberation.js','systems/memory/social-outcome.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js','validation/rules/human-social-response.js','validation/rules/memory-deliberation.js','validation/rules/social-outcome-memory.js','validation/rules/relationship.js','validation/rules/physical-profile.js','validation/rules/locomotion-execution.js','validation/manifest.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial;
const reportedWorld=JSON.parse(fs.readFileSync(new URL('./fixtures/slot-bound-actor-route-origin.world.json',import.meta.url),'utf8'));
E.configureResetStateSource('reported-slot-bound-actor-route-origin',seed=>W.createInitialStateFromAuthoring(reportedWorld,seed));

function bindToSlot(st,a,slotId,posture='lying'){
  const slot=SP.getSlot(st,slotId);assert.ok(slot,slotId+' must exist');
  a.position={...slot.position};
  a.posture={kind:posture,slotId:slot.id,furnitureId:slot.furnitureId};
  a.locomotion={mode:null,phase:'idle'};
  a.action=null;a.activeIntent=null;a.offMap=false;
  return slot;
}
function quiet(a,{hunger=8,thirst=8,fatigue=8,sleepNeed=8,social=8,groomingNeed=0}={}){
  Object.assign(a.needs,{hunger,thirst,fatigue,sleepNeed,social});
  if(a.kind==='cat')a.needs.groomingNeed=groomingNeed;
  a.action=null;a.activeIntent=null;a.offMap=false;
}
const eventBy=(st,pred)=>st.events.find(pred);

// Reported reproduction: Seed 20260911, orange resting in pet-bed-small-1 while mealTray has food.
E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,tray=st.containers.mealTray;
  st.agents.zhen.offMap=true;st.agents.zhou.offMap=true;
  const slot=bindToSlot(st,cat,'pet-bed-small-1:bed','lying');
  quiet(cat,{hunger:95,thirst:5,fatigue:5,sleepNeed:5,social:5,groomingNeed:0});
  tray.contents.food=68;

  const egress=SP.slotEgressNodes(st,slot,cat,'walk');
  assert.ok(egress.length>0,'reported pet bed must expose at least one legal egress');

  const result=SP.bestInteractionPositionResult(st,cat,{kind:'object',id:'mealTray'},'eatFrom');
  assert.ok(result&&Number.isFinite(result.traversalCost),'slot-bound Cat must rank the reachable mealTray through a legal egress');

  const route=SP.planRoute(st,cat,result.position,{mode:'auto',objective:'traversalCost'});
  assert.ok(Number.isFinite(route.traversalCost)&&route.path.length>0,'slot-bound planRoute must be finite when an egress reaches the goal');
  assert.ok(egress.some(node=>SP.nodeSame(st,node,route.path[0])),'slot-bound route path must start at a legal Slot egress, never the Slot anchor');
  assert.equal(E.canSatisfyHunger(cat),true,'reported Cat must expose an executable hunger plan');
  assert.ok(E.buildAction(cat,{id:'eat'}),'Action factory must agree with hunger feasibility');

  const expectedEgress=SP.bestSlotEgressNode(st,slot,cat,result.position,{mode:'auto',objective:'traversalCost'});
  assert.ok(expectedEgress,'target-aware egress winner must exist');

  cat.action={kind:'eat',phase:'toDirectFood',foodSource:'mealTray',container:null,slotId:null,started:st.tick,wait:0};
  E.tick();
  assert.equal(cat.posture.slotId,null,'eat execution must leave the pet-bed Slot');
  assert.equal(cat.posture.kind,'standing');
  assert.ok(SP.nodeSame(st,cat.position,expectedEgress),'execution must use the same target-compatible egress assumed by routing');

  const beforeFood=tray.contents.food;
  for(let i=0;i<50&&tray.contents.food===beforeFood;i++)E.tick();
  assert.ok(tray.contents.food<beforeFood,'reported Cat must eventually reach mealTray and consume food');
}

// Full chooser/Intent parity: the reported state must not cycle eat -> null -> eat while a valid route exists.
E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,tray=st.containers.mealTray;
  st.agents.zhen.offMap=true;st.agents.zhou.offMap=true;
  bindToSlot(st,cat,'pet-bed-small-1:bed','lying');
  quiet(cat,{hunger:95,thirst:5,fatigue:5,sleepNeed:5,social:5,groomingNeed:0});
  tray.contents.food=68;
  const beforeFood=tray.contents.food;
  for(let i=0;i<60&&tray.contents.food===beforeFood;i++)E.tick();
  assert.ok(tray.contents.food<beforeFood,'autonomous Seed 20260911 Cat must complete an eating plan from the pet bed');
  const eatPlans=st.events.filter(e=>e.data?.actor==='orange'&&e.data?.phase==='plan'&&e.data?.action==='eat');
  assert.equal(eatPlans.length,1,'reachable food must not produce repeated provisional eat plans before the first consumption');
}

// No legal egress: food may exist globally, but hunger must not expose an impossible Action or flicker-loop candidate.
E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,slot=bindToSlot(st,st.agents.orange,'pet-bed-small-1:bed','lying');
  st.agents.zhen.offMap=true;st.agents.zhou.offMap=true;
  quiet(cat,{hunger:95,thirst:5,fatigue:5,sleepNeed:5,social:5,groomingNeed:0});
  st.containers.mealTray.contents.food=68;
  const exits=SP.slotEgressNodes(st,slot,cat,'walk');
  assert.ok(exits.length>0,'negative fixture must begin with legal egress nodes');
  exits.forEach((node,i)=>{
    const blocker=structuredClone(st.agents.zhen);
    blocker.id='egressBlocker'+i;blocker.name='出口阻擋 '+i;blocker.offMap=false;blocker.position={...node};
    blocker.posture={kind:'standing',slotId:null,furnitureId:null};blocker.action=null;blocker.activeIntent=null;
    st.agents[blocker.id]=blocker;
  });
  assert.deepEqual(SP.routeOriginsForAgent(st,cat,'walk'),[]);
  assert.equal(SP.bestInteractionPositionResult(st,cat,{kind:'object',id:'mealTray'},'eatFrom'),null);
  assert.equal(E.canSatisfyHunger(cat),false,'global food existence must not count as an executable hunger plan without any egress');
  assert.equal(E.buildAction(cat,{id:'eat'}),null,'Action factory must reject the same impossible hunger plan');
  assert.equal(E.candidateIntents(st,cat).some(c=>c.intentKind==='satisfyHunger'),false,'Intent deliberation must use the same hunger feasibility');
  assert.equal(E.intentStillValid(st,cat,{kind:'satisfyHunger'}),false,'hard replanning must not reopen an impossible hunger intent');
  E.tick();
  assert.equal(st.thoughts.orange.options.some(o=>o.id==='eat'),false,'core chooser must not advertise impossible eat');
  assert.equal(eventBy(st,e=>e.data?.actor==='orange'&&e.data?.phase==='plan'&&e.data?.action==='eat'),undefined);
}

// Drink target ranking uses the same slot-aware origin.
E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange;
  st.agents.zhen.offMap=true;st.agents.zhou.offMap=true;
  bindToSlot(st,cat,'pet-bed-small-1:bed','lying');
  quiet(cat,{hunger:5,thirst:95,fatigue:5,sleepNeed:5,social:5,groomingNeed:0});
  assert.equal(E.canDrinkResource(cat,'water'),true);
  st.containers.cupB.contents={};
  assert.equal(E.buildAction(cat,{id:'drinkWater',targetObject:'cupB'}),null,'explicit Cat drink target must itself be executable, not merely rely on another reachable source');
  const result=SP.bestInteractionPositionResult(st,cat,{kind:'object',id:'waterBucket'},'drinkFrom');
  assert.ok(result&&Number.isFinite(result.traversalCost));
  const action=E.buildAction(cat,{id:'drinkWater'});
  assert.equal(action?.kind,'drinkWater');
  const before=st.containers.waterBucket.contents.water;
  cat.action=action;
  for(let i=0;i<50&&st.containers.waterBucket.contents.water===before;i++)E.tick();
  assert.ok(st.containers.waterBucket.contents.water<before,'slot-bound Cat must leave its Slot and drink from a reachable source');
}

// Both actor and social target may be Slot-bound: actor-origin and target-contact geometry must compose.
E.reset(20260911);
{
  const st=E.getState(),actor=st.agents.zhen,target=st.agents.zhou;
  st.agents.orange.offMap=true;
  bindToSlot(st,actor,'chairNW:seat','sitting');
  bindToSlot(st,target,'chairNE:seat','sitting');
  quiet(actor,{social:95});quiet(target,{social:30});
  const result=SP.bestInteractionPositionResult(st,actor,{kind:'agent',id:target.id},'social');
  assert.ok(result&&Number.isFinite(result.traversalCost),'slot-bound actor must rank a slot-bound social target');
  const candidate=E.candidateIntents(st,actor).find(c=>c.intentKind==='socialize');
  assert.equal(candidate?.targetAgent,target.id);
}

// Generic moveToExact consumers (wander/rest/sleep/exit) must execute through the same target-aware egress used by Route.
E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  const slot=bindToSlot(st,human,'chairNW:seat','sitting');
  quiet(human,{hunger:5,thirst:5,fatigue:5,sleepNeed:5,social:5});
  const egress=SP.slotEgressNodes(st,slot,human,'walk');
  assert.ok(egress.length>1,'fixture needs multiple legal egress candidates');
  let target=null,expected=null;
  for(const tile of Object.values(st.map.tiles||{})){
    const goal=SP.normalizeNode(st,tile,'floor');
    if(!goal||!SP.nodeWalkable(st,goal,human))continue;
    const best=SP.bestSlotEgressNode(st,slot,human,goal,{mode:'auto',objective:'traversalCost'});
    if(best&&!SP.nodeSame(st,best,egress[0])){target=goal;expected=best;break;}
  }
  assert.ok(target&&expected,'fixture must expose a target whose best egress is not the first listed egress');
  human.action={kind:'wander',phase:'move',targetTile:{...target},oneShot:true,started:st.tick,wait:0};
  E.tick();
  assert.equal(human.posture.slotId,null,'generic moveToExact execution must leave the Slot');
  assert.ok(SP.nodeSame(st,human.position,expected),'generic moveToExact execution must choose the same target-aware egress as Route');
}

// Slot-to-Slot target ranking must also use actor egress origins.
E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  bindToSlot(st,human,'chairNW:seat','sitting');
  quiet(human,{fatigue:70,sleepNeed:90});
  const bed=SP.getSlot(st,'bed:left');
  assert.ok(bed);
  assert.ok(SP.bestSlotApproachNode(st,bed,human,{mode:'walk',objective:'traversalCost'}),'slot-bound actor must be able to rank another reachable Slot');
  assert.ok(Number.isFinite(SP.traversalCost(st,human,st.exits.frontExit.access)),'ordinary exit ranking must use the same slot-aware route origin');
}

// Human drink feasibility must require an executable vessel/source plan, not only global water existence.
E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen;
  quiet(human,{hunger:5,thirst:95,fatigue:5,sleepNeed:5,social:5});
  for(const c of Object.values(st.containers))if(c.canDrinkFrom)c.portable=false;
  assert.ok(st.sources.tap.infinite,'fixture must retain a global water source');
  assert.equal(E.canDrinkResource(human,'water'),false,'global water without a usable drinking vessel is not an executable Human drink plan');
  assert.equal(E.candidateIntents(st,human).some(c=>c.intentKind==='drinkWater'),false);
  assert.equal(E.buildAction(human,{id:'drinkWater'}),null);
}


// Human drink feasibility must reuse an already-held drinking vessel instead of rejecting an executable plan.
E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cup=st.containers.cupB;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  quiet(human,{hunger:5,thirst:95,fatigue:5,sleepNeed:5,social:5});
  for(const c of Object.values(st.containers))if(c.canDrinkFrom){c.portable=false;c.contents={};}
  cup.portable=true;cup.canDrinkFrom=true;cup.contents={water:8};
  human.held=cup.id;delete cup.supportId;
  assert.equal(E.canDrinkResource(human,'water'),true,'a self-held usable vessel is already an executable Human drink plan');
  const before=cup.contents.water,action=E.buildAction(human,{id:'drinkWater'});
  assert.equal(action?.kind,'drinkWater');
  human.action=action;
  E.tick();
  assert.equal(human.action?.container,cup.id,'self-held vessel must be the selected Human drink container');
  assert.equal(human.action?.phase,'take','self-held vessel must skip route/pickup and enter the idempotent take phase');
  E.tick();
  assert.equal(human.held,cup.id,'idempotent take must preserve the already-held vessel');
  assert.equal(human.action?.phase,'drink','a sufficiently filled self-held vessel must advance directly to drink');
  E.tick();
  assert.ok(cup.contents.water<before,'Human must drink directly from the already-held vessel without routing back to pick it up');
}

// A partially filled vessel cannot count itself as the refill source used to justify a drink plan.
E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cup=st.containers.cupB;
  quiet(human,{hunger:5,thirst:95,fatigue:5,sleepNeed:5,social:5});
  for(const source of Object.values(st.sources))if(source.resource==='water'){source.infinite=false;source.amount=0;}
  for(const c of Object.values(st.containers)){
    if(c.canDrinkFrom){c.portable=false;c.contents={};}
    else if(c.contents?.water)delete c.contents.water;
  }
  cup.portable=true;cup.canDrinkFrom=true;cup.contents={water:2};
  assert.equal(E.canDrinkResource(human,'water'),false,'the chosen vessel itself must be excluded from its refill-source feasibility');
  assert.equal(E.buildAction(human,{id:'drinkWater'}),null,'Action construction must reject the same non-executable partial-vessel plan');
}

// If a direct food source disappears after the action has already claimed it, the action must abort explicitly
// instead of silently finishing and allowing the same unmet need to look like a successful completion.
E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,tray=st.containers.mealTray;
  st.agents.zhen.offMap=true;st.agents.zhou.offMap=true;
  quiet(cat,{hunger:95,thirst:5,fatigue:5,sleepNeed:5,social:5,groomingNeed:0});
  tray.contents.food=68;
  cat.action={kind:'eat',phase:'eatingDirect',foodSource:'mealTray',container:null,slotId:null,started:st.tick,wait:0};
  st.reservations['object:mealTray']=cat.id;
  tray.contents.food=0;
  E.tick();
  assert.equal(cat.action,null,'lost direct-food source must terminate the stale eat action');
  assert.equal(st.reservations['object:mealTray'],undefined,'lost direct-food source must release its reservation');
  assert.ok(eventBy(st,e=>e.data?.actor==='orange'&&e.data?.action==='abort'&&e.data?.actionKind==='eat'),'lost direct-food source must emit an explicit eat abort event');
}

console.log('Slot-bound actor route-origin / need-feasibility regression: ok');
