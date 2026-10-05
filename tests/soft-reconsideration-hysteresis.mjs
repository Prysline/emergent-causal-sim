import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','systems/action/state.js','systems/intent/state.js','systems/social/state.js','engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js','validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js']);

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const eventsByAction=action=>E.getState().events.filter(e=>e.data?.action===action);
function bind(a,actionKind,intentKind,{phase='move',createdTick=0,source={type:'test',tick:0},...extra}={}){
  a.action={kind:actionKind,phase,started:createdTick,wait:0,...extra};
  a.activeIntent={id:`intent:${a.id}:${createdTick}:${intentKind}`,kind:intentKind,createdTick,lifecycle:'actionBound',source};
  a.action.intentId=a.activeIntent.id;
  return a.activeIntent.id;
}
function quietHuman(a){
  a.needs.hunger=0;a.needs.thirst=0;a.needs.fatigue=0;a.needs.sleepNeed=0;a.needs.social=0;
  a.traits.social=0;a.traits.animalAffinity=0;a.traits.alcoholLike=0;a.status.intoxication=0;
}
function probeCandidateWork(fn){
  const baseUtility=E.baseUtilityForAction,pathDistance=SP.pathDistance,calls={baseUtility:0,pathDistance:0};
  E.baseUtilityForAction=function(...args){calls.baseUtility++;return baseUtility.apply(this,args);};
  SP.pathDistance=function(...args){calls.pathDistance++;return pathDistance.apply(this,args);};
  try{return {result:fn(),...calls};}
  finally{E.baseUtilityForAction=baseUtility;SP.pathDistance=pathDistance;}
}
function assertIneligibleApplySkipsCandidateWork(label,expectedReason,setup){
  E.reset(7000+label.length);const st=E.getState();st.tick=4;const human=st.agents.zhen;quietHuman(human);setup(st,human);
  const diagnostic=E.reconsiderationSnapshot(st,human);
  assert.equal(diagnostic.ok,false,label+' diagnostic eligibility');
  assert.equal(diagnostic.reason,expectedReason,label+' diagnostic reason');
  assert.ok(Object.prototype.hasOwnProperty.call(diagnostic,'currentUtility'),label+' public snapshot keeps currentUtility');
  assert.ok(Object.prototype.hasOwnProperty.call(diagnostic,'commitmentCost'),label+' public snapshot keeps commitmentCost');
  assert.ok(Object.prototype.hasOwnProperty.call(diagnostic,'switchThreshold'),label+' public snapshot keeps switchThreshold');
  assert.ok(Object.prototype.hasOwnProperty.call(diagnostic,'bestChallenger'),label+' public snapshot keeps bestChallenger');
  const probe=probeCandidateWork(()=>E.applySoftReconsideration(st,human));
  assert.equal(probe.result,false,label+' apply path remains blocked');
  assert.equal(probe.baseUtility,0,label+' apply path must not build candidate utilities');
  assert.equal(probe.pathDistance,0,label+' apply path must not execute candidate path queries');
}

E.reset(20260911);
let st=E.getState();
assert.equal(st.version,'11.47.0-social-bid-carry-cooperation');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.47.0-social-bid-carry-cooperation');
assert.equal(E.SOFT_SWITCH_MARGIN,14);
assert.equal(E.MIN_INTENT_HOLD_TICKS,2);
noIssues('reset');

// Ineligible apply paths must stop before full snapshot/candidate construction, while the public diagnostic snapshot stays complete.
assertIneligibleApplySkipsCandidateWork('no intent','no-intent',(st,human)=>{human.action=null;human.activeIntent=null;});
assertIneligibleApplySkipsCandidateWork('protected action','protected-action',(st,human)=>{bind(human,'eat','satisfyHunger',{createdTick:0,phase:'prepare'});});
assertIneligibleApplySkipsCandidateWork('minimum hold','minimum-hold',(st,human)=>{st.tick=7;bind(human,'wander','explore',{createdTick:7,targetTile:{x:2,y:6},oneShot:true});});
assertIneligibleApplySkipsCandidateWork('emergency intent','emergency-intent',(st,human)=>{bind(human,'wander','explore',{createdTick:0,source:{type:'emergency',tick:0},targetTile:{x:2,y:6},oneShot:true});});
{
  const emergencyChoice=E.emergencyChoice;
  E.emergencyChoice=()=>({id:'eat',score:999});
  try{
    assertIneligibleApplySkipsCandidateWork('emergency priority','emergency-priority',(st,human)=>{bind(human,'wander','explore',{createdTick:0,targetTile:{x:2,y:6},oneShot:true});});
  } finally {
    E.emergencyChoice=emergencyChoice;
  }
}
noIssues('ineligible apply short-circuit');

// Small deterministic utility differences do not overturn an existing plan.
E.reset(1);st=E.getState();st.tick=2;
let human=st.agents.zhen;quietHuman(human);bind(human,'wander','explore',{createdTick:0,targetTile:{x:2,y:6},oneShot:true});
let snap=E.reconsiderationSnapshot(st,human);
assert.equal(snap.ok,true);
assert.equal(snap.currentUtility,10);
assert.ok(snap.bestChallenger);
assert.ok(snap.bestChallenger.utility<=snap.switchThreshold,'challenger should stay below hysteresis threshold');
assert.equal(E.applySoftReconsideration(st,human),false);
assert.equal(eventsByAction('intentReconsider').length,0);
noIssues('margin blocks weak challenger');

// A clearly stronger ordinary need can replace a low-commitment action before emergency thresholds.
E.reset(2);st=E.getState();st.tick=2;human=st.agents.zhen;quietHuman(human);human.needs.hunger=80;
const oldIntentId=bind(human,'wander','explore',{createdTick:0,targetTile:{x:2,y:6},oneShot:true});
st.reservations['test:soft-owned']=human.id;human.held='cupB';delete st.containers.cupB.supportId;
snap=E.reconsiderationSnapshot(st,human);
assert.equal(snap.bestChallenger?.intentKind,'satisfyHunger');
assert.ok(snap.bestChallenger.utility>snap.switchThreshold);
assert.equal(E.applySoftReconsideration(st,human),true);
assert.equal(human.activeIntent?.kind,'satisfyHunger');
assert.equal(human.activeIntent?.source?.type,'softReconsideration');
assert.equal(human.activeIntent?.source?.priorIntentId,oldIntentId);
assert.equal(human.action?.intentId,human.activeIntent?.id);
assert.equal(st.reservations['test:soft-owned'],undefined);
assert.equal(human.held,null);
assert.equal(st.containers.cupB.supportId,'surfaceLow');
assert.equal(eventsByAction('intentReconsider').length,1);
noIssues('strong challenger preempts ordinary intent');

// High commitment should still protect an existing ordinary plan.
E.reset(3);st=E.getState();st.tick=2;human=st.agents.zhen;quietHuman(human);human.needs.hunger=80;
bind(human,'drink','satisfyThirst',{createdTick:0,phase:'consume',target:'cupA',targetTile:{x:1,y:2}});
snap=E.reconsiderationSnapshot(st,human);
assert.equal(snap.ok,true);
assert.ok(snap.commitmentCost>0);
assert.ok(snap.bestChallenger);
assert.ok(snap.bestChallenger.utility<=snap.switchThreshold,'commitment cost should keep the challenger below the threshold');
assert.equal(E.applySoftReconsideration(st,human),false);
assert.equal(eventsByAction('intentReconsider').length,0);
noIssues('commitment cost blocks preemption');

console.log('v11.47.0 soft reconsideration + hysteresis regression: ok');
