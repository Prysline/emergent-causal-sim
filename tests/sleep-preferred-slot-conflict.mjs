import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,V=globalThis.SimValidator;
const CURRENT='11.44.0-sleep-slot-conflict';
assert.equal(E.DELIBERATION_SCHEMA_VERSION,CURRENT);
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,CURRENT);
assert.equal(E.USAGE_PREFERENCE_VERSION,CURRENT);
assert.equal(E.MEMORY_SCHEMA_VERSION,'11.42.0-usage-preference-sleep');

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
assert.equal(A.validateAuthoring(authored).ok,true);
E.configureResetStateSource('sleep-slot-conflict-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));

const noIssues=label=>{const result=V.validateState(E.getState());assert.equal(result.issueCount,0,`${label}: ${result.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const occupy=(st,agent,slotId,{actionKind='rest'}={})=>{const slot=SP.getSlot(st,slotId);agent.offMap=false;agent.position={...slot.position};agent.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};agent.action=actionKind==='sleep'?{kind:'sleep',phase:'sleeping',sleepTicks:3,started:st.tick,wait:0}:{kind:actionKind,phase:'resting',started:st.tick,wait:0};E.reconcileIntents(st);return slot;};
const clearOccupancy=agent=>{agent.posture={kind:'standing',slotId:null,furnitureId:null};agent.action=null;agent.activeIntent=null;};

E.reset(44001);
let st=E.getState(),a=st.agents.zhen,human=st.agents.zhou,animal=st.agents.orange,left=SP.getSlot(st,'bed:left');
a.position={x:left.position.x,y:left.position.y+1};a.offMap=false;clearOccupancy(a);clearOccupancy(animal);occupy(st,human,'bed:left');
assert.equal(st.version,CURRENT);
assert.equal(SP.sleepTargetAvailability(st,a,'bed:left').reason,'agentOccupied');
assert.equal(SP.sleepTargets(st,a).some(t=>t.id==='bed:left'),false,'occupied preferred Slot must stay outside legal sleepTargets');
assert.ok(U.sleepAssociationTargets(st,a).some(x=>x.target.id==='bed:left'&&x.reasons.some(r=>r.key==='assignedToSelf')));
let conflict=E.sleepPreferredSlotConflict(st,a);
assert.equal(conflict.target.id,'bed:left');assert.equal(conflict.observation.observedAgentKind,'human');
let legal=U.rankSleepTargets(st,a),action=E.buildAction(a,{id:'sleep'});a.action=action;E.ensureIntentForAction(st,a);E.adoptDecisionEvidence(st,a,action,{source:{type:'test',intentKind:'sleep'},contributors:[]});
let resolution=E.chooseSleepConflictResolution(st,a,action,legal);
for(const kind of ['alternate','wait','attention','requestYield','driveAway'])assert.ok(resolution.candidates.some(c=>c.kind===kind),`Human+alternate must expose ${kind}`);
const frozen=structuredClone(resolution.evidence.observation);human.action={kind:'wander',phase:'move',started:st.tick};human.posture={kind:'standing',slotId:null,furnitureId:null};
assert.deepEqual(resolution.evidence.observation,frozen,'Conflict Resolution Evidence must keep the decision-time observation snapshot');
assert.equal(resolution.evidence.parentDecisionId,action.decisionId);
assert.equal(E.currentConflictResolutionEvidence(a).id,resolution.evidence.id);
noIssues('assigned + alternate');

st.usageAssignments=[];a.usageHabits={'sleep|slot:bed:left':{activity:'sleep',target:{kind:'slot',id:'bed:left'},strength:.8,lastUsedTick:st.tick,useCount:4,lastSourceMemoryId:'memory:habit'}};
occupy(st,human,'bed:left');conflict=E.sleepPreferredSlotConflict(st,a);
assert.ok(conflict?.reasons.some(r=>r.kind==='habit'&&r.key==='habitualForSelf'),'habit-only preference must create conflict reasoning without assignment');

clearOccupancy(human);occupy(st,animal,'bed:left',{actionKind:'sleep'});a.position={x:left.position.x,y:left.position.y+1};
action=E.buildAction(a,{id:'sleep'});a.action=action;E.ensureIntentForAction(st,a);E.adoptDecisionEvidence(st,a,action,{source:{type:'test',intentKind:'sleep'},contributors:[]});
resolution=E.chooseSleepConflictResolution(st,a,action,U.rankSleepTargets(st,a));
assert.equal(resolution.conflict.observation.observedAgentKind,'animal');
assert.ok(resolution.candidates.some(c=>c.kind==='attention'));
assert.equal(resolution.candidates.some(c=>['requestYield','driveAway'].includes(c.kind)),false,'Animal occupant must not receive Human-only request/drive-away candidates');

occupy(st,human,'bed:right');assert.equal(SP.sleepTargets(st,a).length,0,'fixture must have no legal alternate');
assert.ok(E.baseUtilityForAction(a,'sleep')>0,'no-alternate preferred conflict must preserve sleep deliberation instead of collapsing to no plan');
resolution=E.chooseSleepConflictResolution(st,a,action,[]);
assert.ok(resolution.candidates.some(c=>c.kind==='wait'));assert.ok(resolution.candidates.some(c=>c.kind==='attention'));

clearOccupancy(animal);clearOccupancy(human);occupy(st,human,'bed:left');a.position={x:left.position.x,y:left.position.y+1};
const responderBefore={position:structuredClone(human.position),posture:structuredClone(human.posture),action:structuredClone(human.action),intent:structuredClone(human.activeIntent)};
a.action={kind:'sleep',phase:'conflictInteract',started:st.tick,wait:0,conflictPreferredSlotId:'bed:left',conflictInteractionKind:'requestYield',conflictTargetAgent:human.id,conflictStimulus:{kind:'sound',intensity:22}};
E.stepSleepPreferredSlotConflict(st,a,a.action);
assert.deepEqual(human.position,responderBefore.position);assert.deepEqual(human.posture,responderBefore.posture);assert.deepEqual(human.action,responderBefore.action);assert.deepEqual(human.activeIntent,responderBefore.intent);
const request=st.events.find(e=>e.data?.action==='sleepSlotRequest'&&e.data?.target===human.id);assert.ok(request);
for(const key of ['accepted','refused','rejected','ignored','intentionalIgnore'])assert.equal(Object.hasOwn(request.data,key),false,'request event must not invent responder outcome');
assert.equal(a.action.phase,'conflictWait');assert.equal(a.action.conflictWaitSource,'requestResponse');

st.tick+=E.MIN_INTENT_HOLD_TICKS+1;a.needs.thirst=100;a.needs.sleepNeed=65;a.action={kind:'sleep',phase:'conflictWait',started:st.tick-3,wait:0,conflictPreferredSlotId:'bed:left',conflictWaitUntilTick:st.tick+3,conflictWaitSource:'occupancy'};
a.activeIntent={id:'intent:zhen:conflict-wait',kind:'sleep',createdTick:st.tick-3,lifecycle:'actionBound',source:{type:'deliberation',tick:st.tick-3}};a.action.intentId=a.activeIntent.id;
assert.equal(E.reconsiderationSnapshot(st,a).ok,true,'occupancy conflict wait must participate in soft reconsideration');
assert.equal(E.applySoftReconsideration(st,a),true,'higher-priority need must be able to interrupt occupancy wait');
assert.notEqual(a.action?.kind,'sleep');

const source=fs.readFileSync(new URL('../src/systems/intent/sleep-slot-conflict.js',import.meta.url),'utf8');
assert.doesNotMatch(source,/\.roomAt\s*\(/,'conflict consumer must not duplicate Room observability rules');
assert.doesNotMatch(source,/\.manhattan\s*\(/,'conflict consumer must not duplicate distance observability rules');
assert.match(source,/observeAgentContext\(/,'conflict consumer must share the canonical Agent-context observation owner');
noIssues('final');
console.log('Sleep preferred Slot conflict regression: ok');
