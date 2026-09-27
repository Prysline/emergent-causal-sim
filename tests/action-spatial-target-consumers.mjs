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
const reportedWorld=JSON.parse(fs.readFileSync(new URL('./fixtures/action-spatial-target-consumers.world.json',import.meta.url),'utf8'));
E.configureResetStateSource('reported-world-action-spatial-target-consumers',seed=>W.createInitialStateFromAuthoring(reportedWorld,seed));
const calm=(a,{social=8,thirst=8}={})=>{Object.assign(a.needs,{hunger:8,thirst,fatigue:8,sleepNeed:8,social});a.action=null;a.activeIntent=null;a.offMap=false;};
function bindToSlot(st,a,slotId,posture='sitting'){
  const slot=SP.getSlot(st,slotId);assert.ok(slot,slotId+' must exist');
  a.position={...slot.position};a.posture={kind:posture,slotId:slot.id,furnitureId:slot.furnitureId};a.action=null;a.activeIntent=null;a.offMap=false;
  return slot;
}
function addHuman(st,id,name,position){
  const a=structuredClone(st.agents.zhou);a.id=id;a.name=name;a.position={...position};a.posture={kind:'standing',slotId:null,furnitureId:null};a.action=null;a.activeIntent=null;a.offMap=false;a.episodicMemories=[];a.relationships={};a.observedSocialBids=[];st.agents[id]=a;return a;
}
function eventByAction(st,action){return st.events.find(e=>e.data?.action===action);}

// The fixture is the user-reported World Authoring scene. Its original v10 catalog pin was advanced to v11 only; furniture/resident geometry is unchanged.
assert.equal(reportedWorld.furniture.chairNW.origin.x,3);
assert.equal(reportedWorld.furniture.chairNE.origin.x,6);
assert.equal(reportedWorld.furniture.chairNW.orientation,'east');
assert.equal(reportedWorld.furniture.chairNE.orientation,'west');

// All four differently oriented dining chairs resolve to reachable approach nodes.
E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen;
  for(const id of ['chairNW:seat','chairNE:seat','chairSW:seat','chairSE:seat']){
    const slot=SP.getSlot(st,id),approach=SP.bestSlotApproachNode(st,slot,human,{mode:'walk',objective:'traversalCost'});
    assert.ok(approach,id+' must have a reachable approach');
    assert.ok(SP.slotApproachNodes(st,slot,human,'walk').some(node=>SP.nodeSame(st,node,approach)),id+' winner must come from canonical slot approach nodes');
    assert.ok(Number.isFinite(SP.traversalCost(st,human,approach)),id+' approach must be route-reachable');
  }
}

// Human meal seating must route to an outside Slot approach and settle instead of routing into the chair anchor.
E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  human.needs.hunger=60;human.action={kind:'eat',phase:'prepare',started:st.tick,wait:0};
  for(let i=0;i<45&&human.action;i++)E.tick();
  const sit=eventByAction(st,'sitForMeal'),stand=eventByAction(st,'standForMeal');
  assert.ok(sit,'reachable dining-chair approaches must produce sitForMeal');
  assert.equal(stand,undefined,'standForMeal is only valid when no legal seat approach exists');
  assert.ok(['chairNW:seat','chairNE:seat','chairSW:seat','chairSE:seat'].includes(sit.data.slot));
}

// Negative control: if every meal/rest Slot has no legal approach edge, standing to eat remains valid fallback.
E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,plate=st.containers.plateB;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  for(const furniture of Object.values(st.furniture))for(const slot of furniture.slots||[])if(slot.mealSeat||slot.canRest)slot.approachEdges=[];
  delete plate.supportId;plate.position={...human.position};plate.contents={food:6};human.held=plate.id;
  human.action={kind:'eat',phase:'chooseSeat',container:plate.id,started:st.tick,wait:0};
  E.tick();E.tick();
  assert.ok(eventByAction(st,'standForMeal'),'no legal Slot approach must fall back to standForMeal');
  assert.equal(eventByAction(st,'sitForMeal'),undefined);
}

// Core fallback target selection must rank the target's social Interaction Geometry, not the target Slot anchor.
E.reset(20260911);
{
  const st=E.getState(),actor=st.agents.zhen,target=st.agents.zhou;st.agents.orange.offMap=true;calm(actor,{social:80});calm(target);
  bindToSlot(st,target,'chairNE:seat','sitting');
  addHuman(st,'mei','小梅',{x:2,y:6});
  const targetReach=SP.bestInteractionPositionResult(st,actor,{kind:'agent',id:target.id},'social');
  assert.ok(targetReach&&Number.isFinite(targetReach.traversalCost),'slot-bound Human must expose reachable social geometry');
  const action=E.buildAction(actor,{id:'talk'});
  assert.equal(action?.targetAgent,target.id,'core nearest Human must prefer the nearer reachable slot-bound target');
}

// Intent availability / Memory target evaluation must keep slot-bound social targets eligible with finite canonical access metrics.
E.reset(20260911);
{
  const st=E.getState(),actor=st.agents.zhen,target=st.agents.zhou;st.agents.orange.offMap=true;calm(actor,{social:96});calm(target);
  bindToSlot(st,target,'chairNE:seat','sitting');
  const candidate=E.candidateIntents(st,actor).find(c=>c.intentKind==='socialize');
  assert.equal(candidate?.targetAgent,target.id,'slot-bound Human must remain a socialize candidate');
  assert.ok(Number.isFinite(candidate?.traversalCost),'social candidate must use finite Interaction Geometry traversal cost');
  const evaluation=E.targetEvaluations(st,actor,'socialize',E.utilityForIntent(st,actor,'socialize')).find(x=>x.targetAgent===target.id);
  assert.ok(evaluation&&Number.isFinite(evaluation.pathDistance)&&Number.isFinite(evaluation.traversalCost)&&Number.isFinite(evaluation.travelTime),'Memory target evaluation must route to the social interaction position');
  assert.equal(E.intentStillValid(st,actor,{kind:'socialize'}),true,'hard-replan validity must not reject a reachable slot-bound Human');
}

// A slot-bound pettable animal must remain discoverable before the pet Action reaches execution.
E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;st.agents.zhou.offMap=true;calm(human,{social:70});calm(cat,{social:60});
  bindToSlot(st,cat,'sofa:left','lying');
  const reach=SP.bestInteractionPositionResult(st,human,{kind:'agent',id:cat.id},'social');
  assert.ok(reach&&Number.isFinite(reach.traversalCost));
  assert.equal(E.nearestPettableAnimal(human)?.id,cat.id,'core pet target discovery must use slot approach/contact geometry');
  assert.equal(E.candidateIntents(st,human).find(c=>c.intentKind==='interactWithAnimal')?.targetAgent,cat.id,'Intent target selection must retain the slot-bound animal');
}

// An animal seeking contact must likewise discover a Human who is sitting in a Slot.
E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,human=st.agents.zhou;st.agents.zhen.offMap=true;calm(cat,{social:90});calm(human);
  bindToSlot(st,human,'chairNE:seat','sitting');
  const candidate=E.candidateIntents(st,cat).find(c=>c.intentKind==='seekSocialContact');
  assert.equal(candidate?.targetAgent,human.id,'seekHuman target discovery must use the Human social interaction position');
  assert.equal(E.intentStillValid(st,cat,{kind:'seekSocialContact'}),true,'hard-replan validity must retain the reachable slot-bound Human');
}

// Cat drink target selection must consume the canonical traversalCost attached to the resolved interaction winner.
// This focused consumer test overrides only the richer-result cost so the ordering differs deterministically
// without inventing another world-geometry fixture.
function prepareDrinkChoice(){
  E.reset(20260911);const st=E.getState(),cat=st.agents.orange,near=st.containers.cupA,far=st.containers.cupB;
  st.agents.zhen.offMap=true;st.agents.zhou.offMap=true;calm(cat,{social:8,thirst:85});cat.position={x:2,y:5};cat.posture={kind:'standing',slotId:null,furnitureId:null};
  st.containers.waterBucket.contents.water=0;
  for(const c of [near,far]){delete c.supportId;c.contents={water:18};c.canDrinkFrom=true;}
  near.position={x:4,y:5};far.position={x:10,y:6};
  const original=SP.bestInteractionPositionResult;
  const baseNear=original(st,cat,{kind:'object',id:near.id},'drinkFrom'),baseFar=original(st,cat,{kind:'object',id:far.id},'drinkFrom');
  assert.ok(baseNear&&baseFar,'both drink targets must expose canonical Interaction Geometry');
  SP.bestInteractionPositionResult=function(stArg,aArg,target,affordance='default'){
    const result=original.call(this,stArg,aArg,target,affordance);if(!result)return result;
    if(affordance==='drinkFrom'&&target?.kind==='object'&&target.id===near.id)return {...result,traversalCost:50};
    if(affordance==='drinkFrom'&&target?.kind==='object'&&target.id===far.id)return {...result,traversalCost:5};
    return result;
  };
  return {st,cat,far,restore:()=>{SP.bestInteractionPositionResult=original;}};
}
{
  const {st,cat,far,restore}=prepareDrinkChoice();
  try{
    st.tick=10;cat.action={kind:'wander',phase:'move',targetTile:{x:3,y:6},started:0,wait:0};cat.activeIntent={id:'intent:orange:0:explore:test',kind:'explore',createdTick:0,lifecycle:'actionBound',source:{type:'test'}};cat.action.intentId=cat.activeIntent.id;
    assert.equal(E.applySoftReconsideration(st,cat),true,'drinkWater should challenge low-commitment wander');
    assert.equal(cat.action?.kind,'drinkWater');assert.equal(cat.action?.targetObject,far.id,'soft reconsideration must choose by interaction traversalCost, not pathDistance');
  } finally {restore();}
}
{
  const {st,cat,far,restore}=prepareDrinkChoice();
  try{
    cat.activeIntent={id:'intent:orange:0:drinkWater:test',kind:'drinkWater',createdTick:0,lifecycle:'open',source:{type:'test'}};cat.action=null;
    assert.equal(E.planOpenIntent(st,cat),true);
    assert.equal(cat.action?.targetObject,far.id,'hard replanning must choose by interaction traversalCost, not pathDistance');
  } finally {restore();}
}

console.log('Action spatial-target consumer correctness regression: ok');
