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
assert.equal(st.version,'11.29.1-slot-interaction-egress');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.12.4-soft-reconsideration');
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
assert.equal(human.action?.kind,'eat');
assert.equal(human.action?.intentId,human.activeIntent?.id);
assert.equal(human.held,null,'soft switch must clean unexpected held containers');
assert.equal(st.reservations['test:soft-owned'],undefined,'soft switch must release prior reservations');
const reconsider=eventsByAction('intentReconsider')[0];
assert.ok(reconsider);
assert.equal(reconsider.data.priorIntentKind,'explore');
assert.equal(reconsider.data.intentKind,'satisfyHunger');
assert.ok(reconsider.data.challengerUtility>reconsider.data.switchThreshold);
assert.equal(reconsider.data.switchThreshold,reconsider.data.currentUtility+reconsider.data.switchMargin+reconsider.data.commitmentCost);
noIssues('strong soft challenger switches cleanly');

// Newly formed Intents get a minimum hold window instead of immediately oscillating.
E.reset(3);st=E.getState();st.tick=7;human=st.agents.zhen;quietHuman(human);human.needs.hunger=80;
bind(human,'wander','explore',{createdTick:7,targetTile:{x:2,y:6},oneShot:true});
snap=E.reconsiderationSnapshot(st,human);
assert.equal(snap.ok,false);
assert.equal(snap.reason,'minimum-hold');
assert.equal(snap.holdRemaining,2);
assert.equal(E.applySoftReconsideration(st,human),false);
noIssues('minimum intent hold');

// Derived commitment raises the switch threshold; it is not persisted as another state truth.
E.reset(4);st=E.getState();st.tick=3;human=st.agents.zhen;quietHuman(human);human.needs.fatigue=50;human.needs.thirst=50;
bind(human,'rest','recoverFatigue',{createdTick:0,phase:'resting',restTicks:3});
snap=E.reconsiderationSnapshot(st,human);
assert.equal(snap.commitmentCost,12);
assert.equal(snap.bestChallenger?.intentKind,'drinkWater');
assert.ok(snap.bestChallenger.utility>snap.currentUtility+snap.switchMargin,'without commitment the challenger would be enough');
assert.ok(snap.bestChallenger.utility<=snap.switchThreshold,'derived commitment should keep the current resting plan');
assert.equal(E.applySoftReconsideration(st,human),false);
assert.equal(Object.prototype.hasOwnProperty.call(human,'commitmentCost'),false);
assert.equal(Object.prototype.hasOwnProperty.call(human.activeIntent,'commitmentCost'),false);
noIssues('derived commitment hysteresis');

// A locally observed Social Bid may challenge a low-value plan without becoming shared psychology.
E.reset(5);st=E.getState();st.tick=2;human=st.agents.zhou;quietHuman(human);human.traits.animalAffinity=.8;
const cat=st.agents.orange;
const bidId=E.addEvent('橘子發出一次測試用社交邀請。','good',[],{actor:'orange',target:'zhou',action:'seekHuman',socialBid:true,bidKind:'animalAffection',bidFrom:'orange',bidTo:'zhou',perceivedByTarget:true});
st.causes[bidId].data.bidId=bidId;human.observedSocialBids=[{bidId,observedTick:1,expiresTick:6}];
bind(human,'wander','explore',{createdTick:0,targetTile:{x:2,y:6},oneShot:true});
assert.equal(E.applySoftReconsideration(st,human),true);
assert.equal(human.activeIntent?.kind,'respondSocialBid');
assert.equal(human.activeIntent?.source?.type,'socialBid');
assert.equal(human.activeIntent?.source?.bidId,bidId);
assert.equal(human.action?.kind,'petAnimal');
assert.equal(human.action?.targetAgent,cat.id);
assert.equal(cat.activeIntent,null,'responder reconsideration must not write requester-private state');
noIssues('observed bid challenger stays local');

// Requester-private waiting may end early because of its own stronger need, without cancelling responder state.
E.reset(6);st=E.getState();st.tick=3;
const requester=st.agents.orange,responder=st.agents.zhou;
const waitBidId=E.addEvent('橘子發出一次測試用社交邀請。','good',[],{actor:'orange',target:'zhou',action:'seekHuman',socialBid:true,bidKind:'animalAffection',bidFrom:'orange',bidTo:'zhou',perceivedByTarget:true});
st.causes[waitBidId].data.bidId=waitBidId;
requester.activeIntent={id:`intent:orange:0:awaitResponse:${waitBidId}`,kind:'awaitResponse',createdTick:0,lifecycle:'open',source:{type:'socialBid',bidId:waitBidId},patienceUntilTick:10};
requester.needs.thirst=72;
responder.activeIntent={id:`intent:zhou:0:respondSocialBid:${waitBidId}`,kind:'respondSocialBid',createdTick:0,lifecycle:'actionBound',source:{type:'socialBid',bidId:waitBidId,observedTick:0}};
responder.action={kind:'petAnimal',phase:'move',started:0,wait:0,targetAgent:'orange',intentId:responder.activeIntent.id};
const responderIntentId=responder.activeIntent.id;
assert.equal(E.applySoftReconsideration(st,requester),true);
assert.equal(requester.activeIntent?.kind,'drinkWater');
assert.equal(responder.activeIntent?.id,responderIntentId,'requester private reconsideration must not remotely cancel responder Intent');
assert.equal(eventsByAction('socialWaitEnded').length,0,'soft reconsideration is not a patience timeout');
noIssues('private waiting can reconsider independently');

// Protected workflows remain outside ordinary score-based preemption.
E.reset(7);st=E.getState();st.tick=4;human=st.agents.zhen;quietHuman(human);human.needs.thirst=90;
bind(human,'eat','satisfyHunger',{createdTick:0,phase:'prepare'});
snap=E.reconsiderationSnapshot(st,human);
assert.equal(snap.ok,false);
assert.equal(snap.reason,'protected-action');
assert.equal(E.applySoftReconsideration(st,human),false);
assert.equal(human.action?.kind,'eat');
noIssues('protected workflow');

// Integration: no persisted utility/commitment mirrors and no rapid soft-switch ping-pong.
E.reset(77);
const lastSwitchTick=new Map();
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const e of st.events.filter(e=>e.data?.action==='intentReconsider')){
    const tick=e.data?.tick;
    if(!Number.isInteger(tick))continue;
    const prev=lastSwitchTick.get(e.data.actor);
    if(prev!=null)assert.ok(tick-prev>=E.MIN_INTENT_HOLD_TICKS,`${e.data.actor} soft-switched again before hold window elapsed`);
    lastSwitchTick.set(e.data.actor,tick);
  }
  for(const a of Object.values(st.agents)){
    assert.equal(Object.prototype.hasOwnProperty.call(a,'commitmentCost'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(a,'currentUtility'),false);
    if(a.activeIntent){
      assert.equal(Object.prototype.hasOwnProperty.call(a.activeIntent,'commitmentCost'),false);
      assert.equal(Object.prototype.hasOwnProperty.call(a.activeIntent,'currentUtility'),false);
    }
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.12.4 soft reconsideration + hysteresis regression: ok');