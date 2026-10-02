import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,V=globalThis.SimValidator;

assert.equal(A.VERSION,'world-authoring-v11');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.MEMORY_SCHEMA_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
authored.claimEligibility=[{id:'sleep-right-claimable',activity:'sleep',target:{kind:'slot',id:'bed:right'}}];
assert.equal(A.validateAuthoring(authored).ok,true);

const duplicate=A.cloneAuthoring(authored);
duplicate.usageAssignments.push({...duplicate.usageAssignments[0],id:'duplicate-assignment'});
assert.ok(A.validateAuthoring(duplicate).errors.some(x=>x.code==='authoring_usage_assignment_duplicate'),'exact duplicate assignment must be rejected');
const missing=A.cloneAuthoring(authored);
missing.claimEligibility=[{id:'missing-slot',activity:'sleep',target:{kind:'slot',id:'missing:slot'}}];
assert.ok(A.validateAuthoring(missing).errors.some(x=>x.code==='authoring_usage_target_missing'),'claim eligibility must reject missing Slot references');

let st=W.createInitialStateFromAuthoring(authored,4040),a=st.agents.zhen,b=st.agents.zhou;
const target=(id,score)=>{const slot=SP.getSlot(st,id);return {kind:'slot',id,position:{...slot.position},slotPosition:{...slot.position},quality:1,posture:'lying',score};};
let ranked=U.rankSleepTargets(st,a,[target('bed:left',7),target('bed:right',2)]);
assert.equal(ranked[0].id,'bed:left','assignment should beat a small objective disadvantage');
assert.ok(ranked[0].preferenceDelta>0);
ranked=U.rankSleepTargets(st,a,[target('bed:left',30),target('bed:right',0)]);
assert.equal(ranked[0].id,'bed:right','bounded preference must not beat a huge objective disadvantage');
ranked=U.rankSleepTargets(st,a,[target('bed:right',4),target('bed:left',4)]);
assert.equal(ranked[0].id,'bed:left','stable canonical target identity must settle a full tie deterministically');

const left=SP.getSlot(st,'bed:left');
b.position={...left.position};b.posture={kind:'lying',slotId:left.id,furnitureId:left.furnitureId};
assert.equal(SP.sleepTargets(st,a).some(x=>x.id==='bed:left'),false,'occupied assigned bed must stay physically unavailable');
assert.ok(U.associationReasons(st,a,'sleep',{kind:'slot',id:'bed:left'}).some(x=>x.key==='assignedToSelf'),'association reason must remain queryable after occupancy removes the legal candidate');
b.posture={kind:'standing',slotId:null,furnitureId:null};

const claimAuth=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
claimAuth.claimEligibility=[{id:'left-claimable',activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('usage-claim-fixture',seed=>W.createInitialStateFromAuthoring(claimAuth,seed));
E.reset(4041);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;
assert.equal(U.agentClaimDecision(st,a,'sleep',{kind:'slot',id:'bed:right'}).reason,'worldIneligible','missing World eligibility must default to not claimable');
assert.equal(U.acquireUsageClaimForSuccessfulUse(st,a,'sleep',{kind:'slot',id:'bed:left'},{successfulUse:false}),null,'claim acquisition must require successful use');
const claim=U.acquireUsageClaimForSuccessfulUse(st,a,'sleep',{kind:'slot',id:'bed:left'},{successfulUse:true,sourceEventId:'e-proof'});
assert.ok(claim,'eligible successful use should create a World claim');
assert.equal(U.acquireUsageClaimForSuccessfulUse(st,b,'sleep',{kind:'slot',id:'bed:left'},{successfulUse:true}),null,'one Slot cannot gain a second primary claimant');
a.offMap=true;
assert.equal(U.activeClaims(st,'sleep').length,1,'temporary offMap must not release a Runtime Claim');

E.reset(4042);st=E.getState();a=st.agents.zhen;
const sleepUtilityBefore=E.baseUtilityForAction(a,'sleep');
st.usageAssignments.push({id:'extra-right',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:right'}});
assert.equal(E.baseUtilityForAction(a,'sleep'),sleepUtilityBefore,'target preference must not feed back into action-level sleep utility');
st.usageAssignments.pop();
assert.equal(E.usageHabit(st,a,'sleep',{kind:'slot',id:'bed:left'}),null);
const ev1=E.addEvent('usage proof','normal',[],{actor:a.id,action:'sleep',phase:'start',slot:'bed:left',furniture:'bed',position:E.positionRef(a.position)});
const h1=E.usageHabit(st,a,'sleep',{kind:'slot',id:'bed:left'});
assert.ok(h1?.strength>0,'actor sleep-start memory must consolidate a private Usage Habit');
assert.equal(h1.lastSourceMemoryId,`memory:zhen:${ev1}`);
const usageMemory=a.episodicMemories.find(m=>m.sourceEventId===ev1);
assert.equal(usageMemory?.observed?.slotId,'bed:left','sleep usage memory must retain the observed Slot identity');
assert.equal(usageMemory?.observed?.furnitureId,'bed','sleep usage memory must retain the observed Furniture identity');
E.addEvent('usage proof 2','normal',[],{actor:a.id,action:'sleep',phase:'start',slot:'bed:left',furniture:'bed',position:E.positionRef(a.position)});
const h2=E.usageHabit(st,a,'sleep',{kind:'slot',id:'bed:left'});
assert.ok(h2.strength>h1.strength&&h2.strength<1,'repeated use must strengthen habit with saturation headroom');
const fresh=h2.effectiveStrength;st.tick+=E.USAGE_HABIT_HALF_LIFE.sleep;
assert.ok(E.effectiveUsageHabitStrength(st,a,'sleep',{kind:'slot',id:'bed:left'})<fresh,'Usage Habit must decay lazily over time');

st=E.getState();a=st.agents.zhen;
a.activeIntent={id:'intent:zhen:proof:sleep',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test',tick:st.tick}};
a.action=E.buildAction(a,{id:'sleep'});a.action.intentId=a.activeIntent.id;
E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:[]});
const td1=E.captureTargetSelectionEvidence(st,a,a.action,{activity:'sleep',selectedTarget:{kind:'slot',id:'bed:left'},objectiveScore:4,preferenceDelta:2,effectiveScore:2,contributors:[{kind:'assignment'}]});
const td2=E.captureTargetSelectionEvidence(st,a,a.action,{activity:'sleep',selectedTarget:{kind:'slot',id:'bed:right'},objectiveScore:3,preferenceDelta:1,effectiveScore:2,contributors:[],priorTargetDecisionId:td1.id});
assert.equal(td2.parentDecisionId,a.action.decisionId);
assert.equal(td2.priorTargetDecisionId,td1.id);
assert.equal(td1.selectedTarget.id,'bed:left','reselection must not rewrite the prior target evidence snapshot');
assert.equal(E.currentTargetSelectionEvidence(a).id,td2.id);

const pet={id:'petProof',kind:'pet-bed',name:'大型寵物床',slots:[{id:'petProof:bed',furnitureId:'petProof',canSleep:true,canRest:true,position:{x:2,y:2},usableSpace:{width:1,length:2},sleepQuality:.8,restQuality:.5,approachEdges:['north','east','south','west']}]};
st.furniture.petProof=pet;
const petSlot=SP.getSlot(st,'petProof:bed');
assert.equal(SP.slotPoseFits(petSlot,a,'lying'),true,'fixture pet bed must be physically valid for Human');
const petEval=U.evaluateSleepTarget(st,a,{kind:'slot',id:'petProof:bed',position:{x:2,y:1},slotPosition:{x:2,y:2},quality:.8,posture:'lying',score:0});
assert.ok(petEval.preferenceContributors.some(x=>x.kind==='speciesActivity'&&x.delta<0),'Human pet-bed preference must be a negative soft contributor');
assert.ok(Number.isFinite(petEval.effectiveScore),'species preference must not turn a physically valid target into impossible');


// Preferred fixed-Slot conflict: association truth remains separate from legal sleepTargets(),
// occupant-specific options consume the shared Agent-context observation owner, and evidence freezes decision-time facts.
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,label+': '+v.issues.map(x=>x.code+': '+x.message).join(' | '));};
function placeInSlot(st,agent,slot,{sleeping=false}={}){agent.offMap=false;agent.position={...slot.position};agent.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};agent.action=sleeping?{kind:'sleep',phase:'sleeping',sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},sleepTicks:3,started:st.tick,wait:0}:null;agent.activeIntent=null;E.reconcileIntents(st);}
function armSleepDecision(st,agent){agent.needs.sleepNeed=90;agent.needs.hunger=8;agent.needs.thirst=8;agent.needs.fatigue=20;agent.action=E.buildAction(agent,{id:'sleep'});E.ensureIntentForAction(st,agent);E.adoptDecisionEvidence(st,agent,agent.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:[],utility:E.baseUtilityForAction(agent,'sleep')});return agent.action;}
function putObserverNear(st,agent,slot){const node=SP.slotApproachNodes(st,slot,agent,'walk')[0];assert.ok(node,'fixture requires an observable legal Slot approach node');agent.offMap=false;agent.position={...node};agent.posture={kind:'standing',slotId:null,furnitureId:null};}

// A: assigned bed + Human occupant + alternate. Occupied preferred Slot stays illegal, while resolution candidates remain deliberable.
E.reset(44001);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;let orange=st.agents.orange;let leftConflict=SP.getSlot(st,'bed:left'),rightConflict=SP.getSlot(st,'bed:right');
st.usageAssignments=[{id:'conflict-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:leftConflict.id}}];putObserverNear(st,a,leftConflict);placeInSlot(st,b,leftConflict);orange.offMap=true;
let legal=U.rankSleepTargets(st,a);assert.equal(legal.some(x=>x.id===leftConflict.id),false);assert.ok(legal.some(x=>x.id===rightConflict.id),'alternate bed must remain a legal canonical target');
assert.equal(SP.sleepTargetAvailability(st,a,{kind:'slot',id:leftConflict.id}).reason,'occupied','Spatial must own the objective preferred-Slot exclusion reason');
assert.ok(U.associationReasons(st,a,'sleep',{kind:'slot',id:leftConflict.id}).some(r=>r.key==='assignedToSelf'),'Usage association reasons must remain queryable independently of legality');
let conflict=E.preferredSleepConflictFor(st,a),resolution=E.sleepConflictResolutionCandidates(st,a,conflict,legal);
assert.equal(conflict.slot.id,leftConflict.id);assert.ok(conflict.association.reasons.some(x=>x.key==='assignedToSelf'));
for(const kind of ['alternateSleepTarget','waitForPreferredSlot','gainOccupantAttention','requestYield','nonphysicalShoo','deferSleepConflict'])assert.ok(resolution.some(x=>x.kind===kind),'Human conflict should expose '+kind);
assert.equal(st.perception,undefined,'sleep conflict must not invent a full Perception registry');noIssues('assigned + alternate');

// B: habit alone can establish preference pressure without becoming assignment or occupancy truth.
E.reset(44002);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;leftConflict=SP.getSlot(st,'bed:left');st.usageAssignments=[];st.usageClaims=[];putObserverNear(st,a,leftConflict);
E.addEvent('habit proof','normal',[],{actor:a.id,action:'sleep',phase:'start',slot:leftConflict.id,furniture:leftConflict.furnitureId,position:E.positionRef(a.position)});
placeInSlot(st,b,leftConflict);conflict=E.preferredSleepConflictFor(st,a);assert.ok(conflict?.association?.reasons.some(x=>x.key==='habitualForSelf'),'habit-only preferred Slot must form a conflict association');assert.equal(conflict.association.reasons.some(x=>x.kind==='assignment'),false);noIssues('habit-only conflict');

// C: sleeping Animal occupant exposes attention but never Human-only request/shoo shortcuts; evidence keeps the pre-wake snapshot frozen.
E.reset(44003);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;orange=st.agents.orange;leftConflict=SP.getSlot(st,'bed:left');rightConflict=SP.getSlot(st,'bed:right');
st.usageAssignments=[{id:'animal-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:leftConflict.id}}];putObserverNear(st,a,leftConflict);placeInSlot(st,orange,leftConflict,{sleeping:true});placeInSlot(st,b,rightConflict);
legal=U.rankSleepTargets(st,a);assert.equal(legal.length,0);conflict=E.preferredSleepConflictFor(st,a);assert.equal(conflict.observation.observedAgentKind,'animal');assert.equal(conflict.observation.observedActionKind,'sleep');
resolution=E.sleepConflictResolutionCandidates(st,a,conflict,legal);assert.ok(resolution.some(x=>x.kind==='gainOccupantAttention'));assert.equal(resolution.some(x=>x.kind==='requestYield'||x.kind==='nonphysicalShoo'),false);
let action=armSleepDecision(st,a),step=E.resolvePreferredSleepConflictStep(st,a,action,legal);assert.equal(step.handled,true);assert.equal(step.selected.kind,'gainOccupantAttention');
let frozen=E.currentConflictResolutionEvidence(a);assert.equal(frozen.observation.observedActionKind,'sleep');orange.action=null;orange.activeIntent=null;orange.posture={kind:'standing',slotId:null,furnitureId:null};assert.equal(frozen.observation.observedActionKind,'sleep','later World change must not backfill conflict evidence');
assert.equal(st.events.some(e=>['requestSleepSlotYield','nonphysicalSleepSlotShoo'].includes(e.data?.action)),false,'Animal conflict must not use Human-only request/shoo');noIssues('sleeping animal conflict');

// D: Human request is an observable bid. Requester does not move the responder; responder-local acceptance is distinct from actual Slot release.
E.reset(44004);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;orange=st.agents.orange;leftConflict=SP.getSlot(st,'bed:left');rightConflict=SP.getSlot(st,'bed:right');
st.usageAssignments=[{id:'human-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:leftConflict.id}}];putObserverNear(st,a,leftConflict);placeInSlot(st,b,leftConflict);placeInSlot(st,orange,rightConflict);
legal=U.rankSleepTargets(st,a);action=armSleepDecision(st,a);step=E.resolvePreferredSleepConflictStep(st,a,action,legal);assert.equal(step.selected.kind,'requestYield');
const yieldBid=st.events.find(e=>e.data?.action==='requestSleepSlotYield');assert.ok(yieldBid?.data?.socialBid);assert.equal(b.posture.slotId,leftConflict.id,'requester must not directly move responder');
const originalRelationshipSignal=E.relationshipSignal,originalAffectResponseSignal=E.affectResponseSignal;E.relationshipSignal=()=>1;E.affectResponseSignal=()=>1;try{E.tick();const understood=st.events.find(e=>e.data?.action==='understandSleepSlotRequest'&&e.data?.responseToBid===yieldBid.id);assert.ok(understood,'perceived Human request must become an explicit responder-local understood fact');const response=st.events.find(e=>e.data?.action==='acceptSleepSlotYield'&&e.data?.responseToBid===yieldBid.id);assert.ok(response,'fixture must lock the responder-local accept path');assert.equal(response.data.sleepSlotResponse,'accept');assert.notEqual(understood.id,response.id,'understood and accepted must remain distinct facts');assert.equal(b.posture.slotId,leftConflict.id,'acceptance must remain distinct from actual Slot release');assert.equal(b.action?.kind,'yieldSleepSlot');const egress=SP.slotApproachNodes(st,leftConflict,b,'walk'),retreat=Object.values(st.map.tiles).find(t=>SP.walkable(st,t)&&SP.occupantsAt(st,t,a.id).length===0&&!egress.some(node=>SP.nodeSame?SP.nodeSame(st,node,t):SP.same(node,t)));assert.ok(retreat,'fixture must let requester step clear of the responder egress before testing voluntary completion');a.position={x:retreat.x,y:retreat.y,z:retreat.z??0};E.tick();const completed=st.events.find(e=>e.data?.action==='completeSleepSlotYield'&&e.data?.responseToBid===yieldBid.id);assert.ok(completed,'accepted yield must complete through a later responder-local Action');assert.equal(b.posture.slotId,null,'only responder-local completion may release the occupied Slot');}finally{E.relationshipSignal=originalRelationshipSignal;E.affectResponseSignal=originalAffectResponseSignal;}noIssues('Human responder agency');

// No response stays a non-response: a busy Human is not silently labelled ignored/rejected/intentionalIgnore.
E.reset(44005);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;orange=st.agents.orange;leftConflict=SP.getSlot(st,'bed:left');rightConflict=SP.getSlot(st,'bed:right');
st.usageAssignments=[{id:'busy-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:leftConflict.id}}];putObserverNear(st,a,leftConflict);placeInSlot(st,b,leftConflict);b.action={kind:'rest',phase:'resting',restTicks:1,targetFatigue:0,restTarget:{kind:'slot',id:leftConflict.id,position:{...leftConflict.position},quality:.5,posture:'lying'},started:st.tick,wait:0};E.reconcileIntents(st);placeInSlot(st,orange,rightConflict);
action=armSleepDecision(st,a);step=E.resolvePreferredSleepConflictStep(st,a,action,U.rankSleepTargets(st,a));const busyBid=st.events.find(e=>e.data?.action==='requestSleepSlotYield');assert.ok(busyBid);E.tick();assert.equal(st.events.some(e=>e.data?.responseToBid===busyBid.id),false);
for(const e of st.events)assert.equal(['ignored','rejected','intentionalIgnore'].includes(e.data?.sleepSlotResponse),false,'no response must not become an inferred refusal');noIssues('no-response distinction');

// E: no legal alternate still keeps sleep deliberation alive; conflict wait can be interrupted by a higher-priority need.
E.reset(44006);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;orange=st.agents.orange;leftConflict=SP.getSlot(st,'bed:left');rightConflict=SP.getSlot(st,'bed:right');
st.usageAssignments=[{id:'no-alt-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:leftConflict.id}}];putObserverNear(st,a,leftConflict);placeInSlot(st,b,leftConflict);placeInSlot(st,orange,rightConflict);a.needs.sleepNeed=90;
assert.equal(SP.sleepTargets(st,a).length,0);assert.ok(E.baseUtilityForAction(a,'sleep')>0,'preferred occupied conflict must keep sleep eligible even with no legal target');
conflict=E.preferredSleepConflictFor(st,a);resolution=E.sleepConflictResolutionCandidates(st,a,conflict,[]);assert.ok(resolution.some(x=>x.kind==='deferSleepConflict'),'no-alternate conflict must still compare temporary defer as a resolution candidate');
action=armSleepDecision(st,a);step=E.resolvePreferredSleepConflictStep(st,a,action,[]);assert.equal(action.phase,'conflictWait');assert.ok(['waitForPreferredSlot','gainOccupantAttention','requestYield','nonphysicalShoo'].includes(step.selected.kind));
a.activeIntent.createdTick=st.tick-3;a.needs.hunger=100;E.tick();assert.equal(a.activeIntent?.source?.type,'emergency','emergency owner must interrupt occupancy wait rather than soft reconsideration');assert.equal(a.action?.kind,'eat');assert.ok(st.events.some(e=>e.data?.action==='intentPreempt'&&e.data?.priorActionKind==='sleep'&&e.data?.emergencyNeed==='hunger'));noIssues('conflict wait preemption');

// Shared Agent-context owner is actually consumed by preferred conflict reasoning.
E.reset(44007);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;leftConflict=SP.getSlot(st,'bed:left');st.usageAssignments=[{id:'owner-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:leftConflict.id}}];putObserverNear(st,a,leftConflict);placeInSlot(st,b,leftConflict);
const canonicalObserve=E.observeAgentContext,canonicalAvailability=SP.sleepTargetAvailability,canonicalUsage=globalThis.SimUsage;let observeCalls=0,availabilityCalls=0,associationCalls=0;
E.observeAgentContext=(...args)=>{observeCalls++;return canonicalObserve(...args);};
SP.sleepTargetAvailability=(...args)=>{availabilityCalls++;return canonicalAvailability(...args);};
globalThis.SimUsage=Object.freeze({...canonicalUsage,associationReasons:(...args)=>{associationCalls++;return canonicalUsage.associationReasons(...args);}});
try{conflict=E.preferredSleepConflictFor(st,a);}finally{E.observeAgentContext=canonicalObserve;SP.sleepTargetAvailability=canonicalAvailability;globalThis.SimUsage=canonicalUsage;}
assert.ok(conflict);assert.ok(associationCalls>=1,'Deliberation must consume the canonical Usage association owner');assert.ok(availabilityCalls>=1,'Deliberation must consume Spatial-owned objective availability reasons');assert.equal(observeCalls,1,'conflict reasoning must consume the shared Agent-context observation owner exactly once for the selected occupant');
noIssues('shared conflict owners');

// A new observable occupant-state change must invalidate occupancy wait before its fixed deadline.
E.reset(44008);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;orange=st.agents.orange;leftConflict=SP.getSlot(st,'bed:left');rightConflict=SP.getSlot(st,'bed:right');
st.usageAssignments=[{id:'observation-change-left',principal:{kind:'agent',id:a.id},activity:'sleep',target:{kind:'slot',id:leftConflict.id}}];putObserverNear(st,a,leftConflict);placeInSlot(st,b,leftConflict);placeInSlot(st,orange,rightConflict);
action=armSleepDecision(st,a);step=E.resolvePreferredSleepConflictStep(st,a,action,[]);assert.equal(action.phase,'conflictWait');assert.ok(action.conflictReassessTick>st.tick);
b.action={kind:'sleep',phase:'sleeping',sleepTarget:{kind:'slot',id:leftConflict.id,position:{...leftConflict.position}},sleepTicks:1,started:st.tick,wait:0};b.activeIntent=null;E.reconcileIntents(st);
assert.equal(E.stepPreferredSleepConflictWait(st,a,action),false,'new shared Observation must return occupancy wait to Deliberation before the fixed deadline');assert.equal(action.phase,'chooseSurface');
noIssues('conflict observation invalidation');

console.log('Usage preference sleep regression: ok');
