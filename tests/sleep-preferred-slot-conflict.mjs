import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial,U=globalThis.SimUsage,V=globalThis.SimValidator;
const VERSION='11.44.0-sleep-slot-conflict';
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const occupy=(st,a,slotId,{sleeping=false}={})=>{const slot=SP.getSlot(st,slotId);a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};a.action=sleeping?{kind:'sleep',phase:'sleeping',sleepTicks:0,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0}:null;a.activeIntent=null;return slot;};
const armRequester=(st,a)=>{a.position={x:7,y:4,z:0};Object.assign(a.needs,{sleepNeed:95,fatigue:70,hunger:10,thirst:10});a.action=E.buildAction(a,{id:'sleep'});E.ensureIntentForAction(st,a);E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:E.decisionContributorsForAction(a,'sleep')});return a.action;};

assert.equal(E.VERSION,VERSION);
assert.equal(E.DELIBERATION_SCHEMA_VERSION,VERSION);
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,VERSION);

// A: assigned preferred Slot remains objectively occupied while Deliberation can compare resolutions.
E.reset(44001);let st=E.getState(),a=st.agents.zhen,h=st.agents.zhou;
st.usageAssignments.push({id:'proof-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:'bed:left'}});
occupy(st,h,'bed:left');armRequester(st,a);
assert.equal(SP.sleepTargets(st,a).some(x=>x.id==='bed:left'),false);
const conflicts=E.preferredSleepSlotConflicts(st,a);assert.equal(conflicts.length,1);assert.equal(conflicts[0].preferredSlot.id,'bed:left');assert.equal(conflicts[0].observation.observedAgentKind,'human');
const objective=U.rankSleepTargets(st,a,SP.sleepTargets(st,a));const oldRand=E.rand;E.rand=()=>0;E.beginSleepSlotConflict(st,a,a.action,objective);E.rand=oldRand;
const evidence=E.currentConflictResolutionEvidence(a);assert.ok(evidence);assert.ok(evidence.candidates.some(c=>c.id==='alternate'));assert.ok(evidence.candidates.some(c=>c.id==='wait'));assert.ok(evidence.candidates.some(c=>c.id==='requestYield'));
const frozen=structuredClone(evidence.observation);h.posture={kind:'standing',slotId:null,furnitureId:null};h.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{x:2,y:2}};assert.deepEqual(evidence.observation,frozen,'Conflict Resolution Evidence must freeze the decision-time observation snapshot');

// B: habit-only association remains sufficient to form a preferred conflict.
E.reset(44002);st=E.getState();a=st.agents.zhen;h=st.agents.zhou;
a.usageHabits??={};a.usageHabits[E.usageHabitKey('sleep',{kind:'slot',id:'bed:left'})]={activity:'sleep',target:{kind:'slot',id:'bed:left'},strength:.8,lastUsedTick:st.tick,useCount:4,lastSourceMemoryId:'memory:proof'};
occupy(st,h,'bed:left');a.position={x:7,y:4,z:0};
const habitual=E.preferredSleepSlotConflicts(st,a);assert.equal(habitual.length,1);assert.ok(habitual[0].associationReasons.some(r=>r.key==='habitualForSelf'));

// C: sleeping Animal exposes only generic attention/wait/alternate-style handling, never Human shortcuts.
E.reset(44003);st=E.getState();a=st.agents.zhen;const cat=st.agents.orange;
st.usageAssignments.push({id:'proof-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:'bed:left'}});
occupy(st,cat,'bed:left',{sleeping:true});armRequester(st,a);E.rand=()=>0;E.beginSleepSlotConflict(st,a,a.action,U.rankSleepTargets(st,a,SP.sleepTargets(st,a)));E.rand=oldRand;
const animalEvidence=E.currentConflictResolutionEvidence(a);assert.equal(animalEvidence.observation.observedAgentKind,'animal');assert.equal(animalEvidence.observation.observedActionKind,'sleep');assert.ok(animalEvidence.candidates.some(c=>c.id==='attention'));assert.equal(animalEvidence.candidates.some(c=>c.id==='requestYield'||c.id==='driveAway'),false);

// D: Human request never moves the responder; responder acceptance and actual Slot release are separate responder-local steps.
E.reset(44004);st=E.getState();a=st.agents.zhen;h=st.agents.zhou;const blocker=st.agents.orange;
st.usageAssignments.push({id:'proof-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:'bed:left'}});
occupy(st,h,'bed:left');occupy(st,blocker,'bed:right',{sleeping:true});armRequester(st,a);
const beforePos=structuredClone(h.position),beforePosture=structuredClone(h.posture);E.rand=()=>0;E.beginSleepSlotConflict(st,a,a.action,U.rankSleepTargets(st,a,SP.sleepTargets(st,a)));E.rand=oldRand;
assert.equal(a.action.phase,'conflictAwaitResponse');assert.deepEqual(h.position,beforePos);assert.deepEqual(h.posture,beforePosture,'requester request must not directly modify responder posture');
const bid=st.causes[a.action.conflictBidId];assert.ok(bid?.data?.socialBid);assert.equal(bid.data.bidKind,'sleepSlotYield');
E.rand=()=>0;E.tick();E.rand=oldRand;st=E.getState();a=st.agents.zhen;h=st.agents.zhou;
const accepted=st.events.find(e=>e.data?.action==='sleepSlotYieldAccepted'&&e.data?.responseToBid===bid.id);assert.ok(accepted,'Human responder should be able to accept from its own responder-local decision');assert.equal(h.posture.slotId,'bed:left','acceptance is not the same fact as actually releasing the Slot');
E.tick();st=E.getState();h=st.agents.zhou;assert.equal(h.posture.slotId,null);assert.ok(st.events.find(e=>e.data?.action==='sleepSlotYieldCompleted'&&e.data?.responseToBid===bid.id));

// E: no alternate keeps sleep motivation alive through conflict reasoning; no-response is not rejection.
E.reset(44005);st=E.getState();a=st.agents.zhen;h=st.agents.zhou;const other=st.agents.orange;
st.usageAssignments.push({id:'proof-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:'bed:left'}});
occupy(st,h,'bed:left');occupy(st,other,'bed:right',{sleeping:true});a.position={x:7,y:4,z:0};Object.assign(a.needs,{sleepNeed:95,fatigue:70});
assert.equal(SP.sleepTargets(st,a).length,0);assert.equal(E.hasPreferredSleepSlotConflict(st,a),true);assert.ok(E.baseUtilityForAction(a,'sleep')>0,'preferred occupancy conflict must not collapse into no sleep candidate');
armRequester(st,a);E.rand=()=>0;E.beginSleepSlotConflict(st,a,a.action,[]);E.rand=oldRand;assert.equal(a.action.phase,'conflictAwaitResponse');
h.action={kind:'eat',phase:'prepare',started:st.tick,wait:0};a.action.conflictWaitUntil=st.tick;E.stepSleepSlotConflict(st,a,a.action);
const timeout=st.events.find(e=>e.data?.action==='sleepSlotConflictWaitEnded');assert.ok(timeout);assert.equal(timeout.data.outcome,'noResponse');for(const key of ['ignored','intentionalIgnore','rejected','rejectedBy'])assert.equal(Object.hasOwn(timeout.data,key),false);

// Conflict waiting remains interruptible by a higher-priority emergency need.
E.reset(44006);st=E.getState();a=st.agents.zhen;st.usageAssignments.push({id:'proof-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:'bed:left'}});occupy(st,st.agents.zhou,'bed:left');a.position={x:7,y:4,z:0};Object.assign(a.needs,{sleepNeed:90,thirst:99,hunger:10});a.action={kind:'sleep',phase:'conflictWait',started:st.tick,wait:0,conflictWaitUntil:st.tick+3,preferredSleepSlot:{kind:'slot',id:'bed:left'}};a.activeIntent={id:'intent:zhen:proof:sleep',kind:'sleep',createdTick:Math.max(0,st.tick-3),lifecycle:'actionBound',source:{type:'test'}};a.action.intentId=a.activeIntent.id;
E.tick();assert.equal(E.getState().agents.zhen.activeIntent?.kind,'drinkWater','higher-priority emergency need must be able to interrupt occupancy wait');

noIssues('sleep preferred Slot conflict');
console.log('Sleep preferred Slot conflict regression: ok');
