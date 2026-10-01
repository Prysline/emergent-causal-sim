import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,S=globalThis.SimSleepSlotConflict,V=globalThis.SimValidator;
assert.equal(E.VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(S.VERSION,'11.44.0-sleep-slot-conflict');

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
assert.equal(A.validateAuthoring(authored).ok,true);
E.configureResetStateSource('sleep-slot-conflict-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));

const quiet=a=>{Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:90,social:8});a.action=null;a.activeIntent=null;a.offMap=false;};
const placeNear=(st,a,slotId)=>{
  const slot=SP.getSlot(st,slotId),node=SP.bestSlotApproachNode?.(st,slot,a,{mode:'walk',objective:'traversalCost'})||SP.slotApproachNodes?.(st,slot,a,'walk')?.[0];
  assert.ok(node,'fixture must have an approach node');
  a.position={...node};a.posture={kind:'standing',slotId:null,furnitureId:null};return slot;
};
const occupy=(st,a,slotId,{sleeping=false}={})=>{
  const slot=SP.getSlot(st,slotId);a.offMap=false;a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};a.action=null;a.activeIntent=null;
  if(sleeping){a.action={kind:'sleep',phase:'sleeping',sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},sleepTicks:4,started:st.tick,wait:0};E.ensureIntentForAction(st,a);}
  return slot;
};
const bindSleepDecision=(st,a)=>{
  const action=E.buildAction(a,{id:'sleep'});assert.ok(action,'sleep conflict must remain an executable sleep-level plan');
  a.activeIntent={id:'intent:'+a.id+':fixture:sleep',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test',tick:st.tick}};
  action.intentId=a.activeIntent.id;a.action=action;
  E.adoptDecisionEvidence(st,a,action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:E.decisionContributorsForAction(a,'sleep'),utility:88});
  return action;
};
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,label+': '+v.issues.map(x=>x.code+': '+x.message).join(' | '));};
const eventBy=predicate=>E.getState().events.find(predicate)||null;

// A: assigned preferred bed occupied by Human, alternate remains objectively legal.
E.reset(44001);
let st=E.getState(),requester=st.agents.zhen,responder=st.agents.zhou,cat=st.agents.orange;
quiet(requester);quiet(responder);cat.offMap=true;st.minute=180;
placeNear(st,requester,'bed:left');occupy(st,responder,'bed:left');
assert.equal(SP.sleepTargets(st,requester).some(t=>t.id==='bed:left'),false,'occupied preferred Slot must remain outside legal sleepTargets');
assert.equal(SP.sleepTargets(st,requester).some(t=>t.id==='bed:right'),true,'alternate bed should remain legal');
let conflict=S.preferredSleepConflict(st,requester);
assert.equal(conflict?.preferredSlot.id,'bed:left');
assert.equal(conflict?.observation?.observable,true);
assert.equal(conflict.observation.targetId,responder.id);
const action=bindSleepDecision(st,requester),ranked=U.rankSleepTargets(st,requester),kinds=S.resolutionCandidates(st,requester,action,ranked).candidates.map(x=>x.kind);
for(const kind of ['alternate','wait','attention','requestYield','shoo'])assert.ok(kinds.includes(kind),'missing resolution candidate '+kind);
const chosen=S.chooseResolution(st,requester,action,ranked),evidence=requester.conflictResolutionEvidence.at(-1);
assert.ok(chosen&&evidence,'conflict choice must create downstream evidence');
assert.equal(evidence.parentDecisionId,action.decisionId);
assert.equal(evidence.preferredSlot.id,'bed:left');
assert.ok(evidence.associationReasons.some(x=>x.key==='assignedToSelf'));
assert.equal(evidence.observation.targetId,responder.id);
assert.ok(evidence.candidates.length>=5);
const frozenObservedAction=evidence.observation.observedActionKind;responder.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{x:2,y:2},oneShot:true};
assert.equal(evidence.observation.observedActionKind,frozenObservedAction,'later responder state must not backfill prior conflict evidence');
noIssues('assigned + alternate');

// B: habit alone can form a preferred conflict without becoming hard ownership.
E.reset(44002);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;cat=st.agents.orange;quiet(requester);quiet(responder);cat.offMap=true;st.usageAssignments=[];
E.consolidateUsageHabit(st,requester,'sleep',{kind:'slot',id:'bed:left'},{usedTick:st.tick,sourceMemoryId:'memory:habit-only'});
placeNear(st,requester,'bed:left');occupy(st,responder,'bed:left');
conflict=S.preferredSleepConflict(st,requester);
assert.ok(conflict?.associationReasons.some(x=>x.kind==='habit'),'habit-only conflict must remain available');
assert.equal(conflict.associationReasons.some(x=>x.kind==='assignment'),false);
noIssues('habit only');

// C: sleeping Animal allows generic attention but never Human-only yield shortcuts.
E.reset(44003);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;cat=st.agents.orange;quiet(requester);quiet(responder);quiet(cat);responder.offMap=true;st.minute=180;
placeNear(st,requester,'bed:left');occupy(st,cat,'bed:left',{sleeping:true});
conflict=S.preferredSleepConflict(st,requester);
assert.equal(conflict?.observation?.observedAgentKind,'animal');
assert.equal(conflict?.observation?.observedActionKind,'sleep');
let animalCandidates=S.resolutionCandidates(st,requester,bindSleepDecision(st,requester),U.rankSleepTargets(st,requester)).candidates;
assert.ok(animalCandidates.some(x=>x.kind==='attention'));
assert.equal(animalCandidates.some(x=>['requestYield','shoo'].includes(x.kind)),false,'Animal occupant must not receive Human-only yield/shoo candidates');
const beforeSlot=cat.posture.slotId;
S.beginResolution(st,requester,requester.action,{kind:'attention',targetAgent:cat.id,conflict,evidenceId:null});
assert.equal(cat.posture.slotId,beforeSlot,'attention/wake attempt must not itself release the occupied Slot');
assert.equal(eventBy(e=>['acceptSleepSlotYield','sleepSlotYieldCompleted'].includes(e.data?.action)),null,'wake/attention must not imply acceptance or release');
noIssues('sleeping animal attention');

// D: requester emits a request without mutating responder; responder later acts from its own Intent.
E.reset(44004);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;cat=st.agents.orange;quiet(requester);quiet(responder);cat.offMap=true;st.minute=180;responder.traits.social=1;
placeNear(st,requester,'bed:left');occupy(st,responder,'bed:left');
const requestAction=bindSleepDecision(st,requester);conflict=S.preferredSleepConflict(st,requester);
const responderPosition=structuredClone(responder.position),responderPosture=structuredClone(responder.posture);
S.beginResolution(st,requester,requestAction,{kind:'requestYield',targetAgent:responder.id,conflict,evidenceId:null});
const bid=eventBy(e=>e.data?.action==='sleepSlotYieldRequest');
assert.ok(bid?.data?.socialBid,'yield request must be an observable bid');
assert.deepEqual(responder.position,responderPosition,'requester must not directly move responder');
assert.deepEqual(responder.posture,responderPosture,'requester must not directly rewrite responder posture');
assert.equal(requester.activeIntent?.kind,'awaitResponse');
E.tick();st=E.getState();responder=st.agents.zhou;
const understood=eventBy(e=>e.data?.action==='sleepSlotRequestUnderstood'&&e.data?.responseToBid===bid.id);
const accepted=eventBy(e=>e.data?.action==='acceptSleepSlotYield'&&e.data?.responseToBid===bid.id);
assert.ok(understood,'responder-local processing must be separately observable');
assert.ok(accepted,'high-willingness idle Human fixture should accept from responder-local decision');
assert.equal(accepted.data.actor,responder.id);
assert.ok(responder.activeIntent?.kind==='respondSleepSlotRequest'||responder.pendingSleepSlotYield===null,'accepted response must originate from responder-local Intent/Action state');
noIssues('human responder agency');

// E: no alternate keeps sleep motive alive and exposes conflict-resolution candidates instead of aborting at target query.
E.reset(44005);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;cat=st.agents.orange;quiet(requester);quiet(responder);quiet(cat);st.minute=180;
placeNear(st,requester,'bed:left');occupy(st,responder,'bed:left');occupy(st,cat,'bed:right');
assert.equal(SP.sleepTargets(st,requester).length,0);
assert.ok(E.baseUtilityForAction(requester,'sleep')>0,'preferred occupied Slot must keep sleep-level deliberation alive');
const noAltAction=bindSleepDecision(st,requester),noAlt=S.resolutionCandidates(st,requester,noAltAction,[]);
assert.equal(noAlt.candidates.some(x=>x.kind==='alternate'),false);
for(const kind of ['wait','attention','requestYield'])assert.ok(noAlt.candidates.some(x=>x.kind===kind),'no-alternate conflict should still deliberate '+kind);
noIssues('no alternate');

// Occupancy wait is not social awaitResponse and can be preempted by a higher-priority emergency need.
E.reset(44006);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;cat=st.agents.orange;quiet(requester);quiet(responder);cat.offMap=true;st.minute=180;
placeNear(st,requester,'bed:left');occupy(st,responder,'bed:left');
const waitAction=bindSleepDecision(st,requester);conflict=S.preferredSleepConflict(st,requester);
S.beginResolution(st,requester,waitAction,{kind:'wait',conflict,evidenceId:null});
assert.equal(requester.action,null);
assert.equal(requester.activeIntent?.source?.type,'sleepSlotOccupancyWait');
assert.notEqual(requester.activeIntent?.kind,'awaitResponse');
requester.needs.thirst=95;E.tick();st=E.getState();requester=st.agents.zhen;
assert.equal(requester.activeIntent?.source?.type==='sleepSlotOccupancyWait',false,'higher-priority emergency must interrupt occupancy wait');
assert.ok(requester.action?.kind==='drinkWater'||requester.activeIntent?.kind==='drinkWater','emergency thirst should preempt the wait with a water plan');
noIssues('occupancy wait preemption');

// A non-perceived request times out as no-response, never as refusal/intentional ignore.
// Move the requester outside shared Agent-context observation range before emitting the request.
// The direct resolution fixture intentionally bypasses candidate discovery so perception failure is deterministic.
E.reset(44007);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;cat=st.agents.orange;quiet(requester);quiet(responder);cat.offMap=true;st.minute=180;
occupy(st,responder,'bed:left');requester.position={x:1,y:1};requester.posture={kind:'standing',slotId:null,furnitureId:null};
const sleepingRequestAction=bindSleepDecision(st,requester);conflict={slot:SP.getSlot(st,'bed:left'),preferredSlot:{kind:'slot',id:'bed:left'}};
S.beginResolution(st,requester,sleepingRequestAction,{kind:'requestYield',targetAgent:responder.id,conflict,evidenceId:null});
const sleepingBid=eventBy(e=>e.data?.action==='sleepSlotYieldRequest');
assert.ok(sleepingBid);
assert.equal(sleepingBid.data.perceivedByTarget,false,'out-of-range request must remain unperceived');
for(let i=0;i<(E.REQUESTER_PATIENCE_TICKS||3)+2&&requester.activeIntent?.kind==='awaitResponse';i++)E.tick();
const waitEnded=eventBy(e=>e.data?.action==='socialWaitEnded'&&e.data?.bidId===sleepingBid.id);
assert.ok(waitEnded,'no-response must use the existing requester-private wait timeout');
assert.equal(E.getState().events.some(e=>e.data?.responseToBid===sleepingBid.id&&['declineSleepSlotYield','intentionalIgnore','ignored'].includes(e.data?.action)),false,'no-response must not be rewritten as refusal or intentional ignore');
noIssues('no response boundary');

console.log('Sleep preferred Slot conflict regression: ok');
