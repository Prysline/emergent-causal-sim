import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial,U=globalThis.SimUsage,V=globalThis.SimValidator;

assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.42.0-usage-preference-sleep');

function quiet(a,{sleepNeed=90,hunger=8,thirst=8,fatigue=30,social=8}={}){
  Object.assign(a.needs,{sleepNeed,hunger,thirst,fatigue,social});
  a.action=null;a.activeIntent=null;a.offMap=false;
}
function occupy(agent,slot,{sleeping=false}={}){
  agent.offMap=false;
  agent.position={...slot.position};
  agent.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  agent.action=sleeping?{kind:'sleep',phase:'sleeping',sleepTicks:2,started:0,wait:0}:null;
}
function assignment(st,agentId,slotId){
  st.usageAssignments=[{id:'fixture-assignment',principal:{kind:'agent',id:agentId},activity:'sleep',target:{kind:'slot',id:slotId}}];
}

E.reset(11440);
let st=E.getState(),a=st.agents.zhen,human=st.agents.zhou,animal=st.agents.orange;
let left=SP.getSlot(st,'bed:left'),right=SP.getSlot(st,'bed:right');
quiet(a);quiet(human,{sleepNeed:8});quiet(animal,{sleepNeed:8});
assignment(st,a.id,left.id);
occupy(human,left);
assert.equal(SP.sleepTargets(st,a).some(t=>t.id===left.id),false,'occupied preferred Slot must stay outside legal sleepTargets');
assert.equal(SP.sleepTargets(st,a).some(t=>t.id===right.id),true,'alternate legal sleep target must remain canonical');
let conflict=E.preferredSleepSlotConflicts(st,a)[0];
assert.equal(conflict?.preferredSlot.id,left.id);
assert.ok(conflict.associationReasons.some(x=>x.key==='assignedToSelf'));
let candidates=E.sleepConflictResolutionCandidates(st,a,conflict);
assert.ok(candidates.some(x=>x.kind==='alternateSleep'));
assert.ok(candidates.some(x=>x.kind==='waitForSlot'));
if(conflict.observation.observable){
  assert.ok(candidates.some(x=>x.kind==='gainAttention'));
  assert.ok(candidates.some(x=>x.kind==='requestYield'));
  assert.ok(candidates.some(x=>x.kind==='nonphysicalDisplace'));
}

E.reset(11441);
st=E.getState();a=st.agents.zhen;human=st.agents.zhou;left=SP.getSlot(st,'bed:left');
quiet(a);quiet(human,{sleepNeed:8});
const proof=E.addEvent('habit proof','normal',[],{actor:a.id,action:'sleep',phase:'start',slot:left.id,furniture:left.furnitureId,position:E.positionRef(a.position)});
assert.ok(E.usageHabit(st,a,'sleep',{kind:'slot',id:left.id})?.lastSourceMemoryId===`memory:${a.id}:${proof}`);
occupy(human,left);
conflict=E.preferredSleepSlotConflicts(st,a)[0];
assert.ok(conflict?.associationReasons.some(x=>x.key==='habitualForSelf'),'habit-only preferred Slot must create conflict reasoning');

E.reset(11442);
st=E.getState();a=st.agents.zhen;animal=st.agents.orange;left=SP.getSlot(st,'bed:left');
quiet(a);quiet(animal,{sleepNeed:8});
assignment(st,a.id,left.id);
occupy(animal,left,{sleeping:true});
conflict=E.preferredSleepSlotConflicts(st,a)[0];
candidates=E.sleepConflictResolutionCandidates(st,a,conflict);
assert.ok(candidates.some(x=>x.kind==='waitForSlot'));
if(conflict.observation.observable){
  assert.equal(conflict.observation.observedAgentKind,'animal');
  assert.ok(candidates.some(x=>x.kind==='gainAttention'));
  assert.equal(candidates.some(x=>x.kind==='requestYield'),false,'Animal occupant must not receive Human-only yield request');
  assert.equal(candidates.some(x=>x.kind==='nonphysicalDisplace'),false,'Animal occupant must not receive Human-only nonphysical-displace request');
  const beforeAction=animal.action,beforePosture=structuredClone(animal.posture);
  const attention=E.performAttentionInteraction(a,animal,{stimulus:{kind:'sound',intensity:0}});
  assert.equal(attention.performed,true);
  assert.equal(attention.wake?.woke,false,'zero-intensity attention fixture must not imply wake/acceptance');
  assert.equal(animal.action,beforeAction,'attention must not replace responder action');
  assert.deepEqual(animal.posture,beforePosture,'attention without wake must not move responder');
}

E.reset(11443);
st=E.getState();a=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;left=SP.getSlot(st,'bed:left');right=SP.getSlot(st,'bed:right');
quiet(a);quiet(human,{sleepNeed:8});quiet(animal,{sleepNeed:8});
assignment(st,a.id,left.id);
occupy(human,left);occupy(animal,right);
assert.equal(SP.sleepTargets(st,a).length,0,'fixture requires no alternate legal sleep target');
assert.ok(E.preferredSleepSlotConflicts(st,a).length>0,'preferred conflict must survive even with zero legal sleepTargets');
assert.ok(E.baseUtilityForAction(a,'sleep')>0,'sleep utility must not disappear merely because preferred Slot is occupied');
a.activeIntent={id:'intent:zhen:conflict',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test'}};
a.action=E.buildAction(a,{id:'sleep'});a.action.intentId=a.activeIntent.id;
E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',intentKind:'sleep'},contributors:[],utility:E.baseUtilityForAction(a,'sleep')});
const snapshot=E.preferredSleepSlotConflicts(st,a)[0];
const ev=E.captureConflictResolutionEvidence(st,a,a.action,{preferredSlot:snapshot.preferredSlot,associationReasons:snapshot.associationReasons,observation:snapshot.observation,candidates:E.sleepConflictResolutionCandidates(st,a,snapshot),selectedResolution:'waitForSlot',contributors:[]});
assert.ok(ev?.parentDecisionId===a.action.decisionId);
const frozenObservation=structuredClone(ev.observation);
human.action={kind:'wander',phase:'move',started:st.tick,wait:0};
human.posture={kind:'standing',slotId:null,furnitureId:null};
assert.deepEqual(ev.observation,frozenObservation,'Conflict Resolution Evidence must freeze decision-time Observation snapshot');

a.action.phase='conflictWait';a.action.conflictPreferredSlot=left.id;a.action.conflictWaitUntil=st.tick+10;
a.activeIntent.createdTick=st.tick-3;
a.needs.sleepNeed=45;a.needs.hunger=100;
const interrupted=E.applySoftReconsideration(st,a);
assert.equal(interrupted,true,'higher-priority need must be able to interrupt occupancy wait');
assert.notEqual(a.action?.kind,'sleep','interrupted occupancy wait must yield to the stronger challenger');

E.reset(11444);
st=E.getState();a=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;left=SP.getSlot(st,'bed:left');
quiet(a);quiet(human,{sleepNeed:8});if(animal)animal.offMap=true;
a.position={x:left.position.x,y:Math.max(0,left.position.y-1)};occupy(human,left);human.action=null;human.activeIntent=null;human.traits.social=1;
const acceptBidId=E.addEvent('yield request fixture','normal',[],{actor:a.id,target:human.id,action:'sleepSlotYieldRequest',slot:left.id,socialBid:true,bidKind:'sleepSlotYieldRequest',interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:a.id,bidTo:human.id,perceivedByTarget:true,position:E.positionRef(a.position)});
st.causes[acceptBidId].data.bidId=acceptBidId;E.addObservedBid(st,human,st.causes[acceptBidId],st.tick);
const requesterPostureBefore=structuredClone(a.posture),responderPostureBefore=structuredClone(human.posture);
E.tick();
const accepted=st.events.find(e=>e.data?.action==='sleepSlotRequestAccepted'&&e.data?.responseToBid===acceptBidId),understood=st.events.find(e=>e.data?.action==='sleepSlotRequestUnderstood'&&e.data?.responseToBid===acceptBidId),completed=st.events.find(e=>e.data?.action==='sleepSlotRequestCompleted'&&e.data?.responseToBid===acceptBidId);
assert.ok(understood,'Human responder must emit an understood outcome from responder-local processing');
assert.ok(accepted,'cooperative Human fixture must be able to accept the request');
assert.deepEqual(a.posture,requesterPostureBefore,'requester must not move itself or directly mutate responder through the request path');
assert.notDeepEqual(human.posture,responderPostureBefore,'accepted responder must leave through its own movement execution');
assert.ok(completed,'completed must be separate from accepted and require actual Slot release');
assert.notEqual(accepted.id,completed.id);
assert.equal(human.posture.slotId===left.id,false,'acceptance completion requires canonical Slot release');

E.reset(11445);
st=E.getState();a=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;left=SP.getSlot(st,'bed:left');quiet(a);quiet(human,{sleepNeed:8});if(animal)animal.offMap=true;occupy(human,left);human.action=null;human.activeIntent=null;human.traits.social=0;
const refuseBidId=E.addEvent('yield request refusal fixture','normal',[],{actor:a.id,target:human.id,action:'sleepSlotYieldRequest',slot:left.id,socialBid:true,bidKind:'sleepSlotYieldRequest',interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:a.id,bidTo:human.id,perceivedByTarget:true,position:E.positionRef(a.position)});st.causes[refuseBidId].data.bidId=refuseBidId;E.addObservedBid(st,human,st.causes[refuseBidId],st.tick);E.tick();
assert.ok(st.events.find(e=>e.data?.action==='sleepSlotRequestRefused'&&e.data?.responseToBid===refuseBidId),'Human responder must be able to refuse');
assert.equal(human.posture.slotId,left.id,'refusal must not release the occupied Slot');

E.reset(11446);
st=E.getState();a=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;left=SP.getSlot(st,'bed:left');quiet(a);quiet(human,{sleepNeed:8});if(animal)animal.offMap=true;occupy(human,left);human.action=null;human.activeIntent=null;human.traits.social=.5;
const delayBidId=E.addEvent('yield request delay fixture','normal',[],{actor:a.id,target:human.id,action:'sleepSlotYieldRequest',slot:left.id,socialBid:true,bidKind:'sleepSlotYieldRequest',interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:a.id,bidTo:human.id,perceivedByTarget:true,position:E.positionRef(a.position)});st.causes[delayBidId].data.bidId=delayBidId;E.addObservedBid(st,human,st.causes[delayBidId],st.tick);E.tick();
assert.ok(st.events.find(e=>e.data?.action==='sleepSlotRequestDelayed'&&e.data?.responseToBid===delayBidId),'Human responder must be able to delay');
assert.equal(human.posture.slotId,left.id,'delay must not imply Slot release');
assert.equal(st.events.some(e=>e.data?.action==='sleepSlotRequestCompleted'&&e.data?.responseToBid===delayBidId),false,'delay must not masquerade as completion');

E.reset(11447);
st=E.getState();a=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;left=SP.getSlot(st,'bed:left');quiet(a);quiet(human,{sleepNeed:8});if(animal)animal.offMap=true;occupy(human,left,{sleeping:true});
const silentBidId=E.addEvent('yield request no-response fixture','normal',[],{actor:a.id,target:human.id,action:'sleepSlotYieldRequest',slot:left.id,socialBid:true,bidKind:'sleepSlotYieldRequest',interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:a.id,bidTo:human.id,perceivedByTarget:true,position:E.positionRef(a.position)});st.causes[silentBidId].data.bidId=silentBidId;E.addObservedBid(st,human,st.causes[silentBidId],st.tick);E.tick();
assert.equal(st.events.some(e=>e.data?.responseToBid===silentBidId&&['sleepSlotRequestUnderstood','sleepSlotRequestAccepted','sleepSlotRequestRefused','sleepSlotRequestDelayed'].includes(e.data?.action)),false,'sleeping responder may produce perceived no-response without inferred refusal');
assert.equal(human.posture.slotId,left.id,'no-response must not release the Slot');

E.reset(11448);
st=E.getState();
assert.equal(V.validateState(st).issueCount,0,'fresh state must remain validator-clean');
for(const agent of Object.values(st.agents))assert.ok(Array.isArray(agent.conflictResolutionEvidence));

console.log('Sleep preferred Slot conflict regression: ok');
