import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage;

assert.equal(A.VERSION,'world-authoring-v11');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.MEMORY_SCHEMA_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');

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

console.log('Usage preference sleep regression: ok');


const V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const occupySlot=(agent,slot,{action=null}={})=>{agent.offMap=false;agent.position={...slot.position};agent.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};agent.action=action;agent.activeIntent=null;};
const clearActor=a=>{a.action=null;a.activeIntent=null;a.offMap=false;a.posture={kind:'standing',slotId:null,furnitureId:null};};

// Preferred fixed Slot conflict keeps objective legality and private association separate.
E.reset(5040);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;
st.usageAssignments=[{id:'zhen-left-conflict',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
const conflictLeft=SP.getSlot(st,'bed:left');
occupySlot(b,conflictLeft);
const observerApproach=SP.slotApproachNodes(st,conflictLeft,a,'walk')[0];assert.ok(observerApproach,'conflict fixture requires a legal approach node');a.position={...observerApproach};
assert.equal(SP.sleepTargets(st,a).some(x=>x.id===conflictLeft.id),false,'occupied preferred Slot must remain objectively illegal');
let conflict=E.sleepPreferredSlotConflictDecision(st,a);
assert.ok(conflict,'occupied self-associated Slot must create a separate conflict decision');
assert.equal(conflict.conflict.preferredSlot.id,conflictLeft.id);
assert.deepEqual(conflict.conflict.observation,E.observeAgentContext(st,a,b),'conflict reasoning must consume the shared Agent-context observation owner');
assert.ok(conflict.conflict.associationReasons.some(x=>x.key==='assignedToSelf'));
const conflictKinds=new Set(conflict.candidates.map(x=>x.kind));
for(const kind of ['useAlternate','wait','gainAttention','requestYield','assertYield'])assert.ok(conflictKinds.has(kind),`Human conflict should evaluate ${kind}`);
assert.equal(conflictKinds.has('carryOccupant'),false,'first version must not invent Agent relocation');

// Conflict Resolution Evidence freezes the decision-time observation instead of following future responder state.
a.activeIntent={id:'intent:zhen:conflict-evidence',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test',tick:st.tick}};
a.action=E.buildAction(a,{id:'sleep'});a.action.intentId=a.activeIntent.id;
E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:[]});
const ce=E.captureConflictResolutionEvidence(st,a,a.action,{preferredSlot:conflict.conflict.preferredSlot,associationReasons:conflict.conflict.associationReasons,observation:conflict.conflict.observation,candidates:conflict.candidates,selected:conflict.selected});
assert.ok(ce);const frozenObservation=structuredClone(ce.observation);
b.action={kind:'wander',phase:'move',started:st.tick,wait:0};b.posture={kind:'standing',slotId:null,furnitureId:null};
assert.deepEqual(ce.observation,frozenObservation,'future responder changes must not backfill prior conflict evidence');
assert.deepEqual(Object.keys(ce.observation).sort(),['observable','observedActionKind','observedAgentKind','observedPosture','observedTick','targetId'].sort(),'evidence must not capture the full Agent object');
noIssues('conflict evidence snapshot');

// Habit alone is enough to create a preferred-slot conflict reason.
E.reset(5041);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;
assert.equal((st.usageAssignments||[]).length,0);
E.addEvent('habit proof','normal',[],{actor:a.id,action:'sleep',phase:'start',slot:'bed:left',furniture:'bed',position:E.positionRef(a.position)});
E.addEvent('habit proof 2','normal',[],{actor:a.id,action:'sleep',phase:'start',slot:'bed:left',furniture:'bed',position:E.positionRef(a.position)});
occupySlot(b,SP.getSlot(st,'bed:left'));a.position={...SP.slotApproachNodes(st,SP.getSlot(st,'bed:left'),a,'walk')[0]};
conflict=E.sleepPreferredSlotConflictDecision(st,a);
assert.ok(conflict?.conflict.associationReasons.some(x=>x.kind==='habit'&&x.key==='habitualForSelf'),'habit-only association should feed conflict reasoning without becoming occupancy truth');
noIssues('habit-only conflict');

// Sleeping Animal uses generic attention but never gets the Human yield shortcuts.
E.reset(5042);st=E.getState();a=st.agents.zhen;const cat=st.agents.orange;st.agents.zhou.offMap=true;
st.usageAssignments=[{id:'zhen-left-animal',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
const animalSlot=SP.getSlot(st,'bed:left');occupySlot(cat,animalSlot,{action:{kind:'sleep',phase:'sleeping',sleepTicks:1,sleepTarget:{kind:'slot',id:animalSlot.id,position:{...animalSlot.position}},started:st.tick,wait:0}});
a.position={...SP.slotApproachNodes(st,animalSlot,a,'walk')[0]};
conflict=E.sleepPreferredSlotConflictDecision(st,a);assert.ok(conflict);
assert.equal(conflict.conflict.observation.observedAgentKind,'animal');assert.equal(conflict.conflict.observation.observedActionKind,'sleep');assert.equal(conflict.conflict.observation.observedPosture,'lying');
const animalKinds=new Set(conflict.candidates.map(x=>x.kind));assert.ok(animalKinds.has('gainAttention'));assert.equal(animalKinds.has('requestYield'),false);assert.equal(animalKinds.has('assertYield'),false);
noIssues('sleeping animal conflict');

// No alternate legal sleep target still leaves sleep motivation available for conflict deliberation.
E.reset(5043);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;const other=st.agents.orange;
st.usageAssignments=[{id:'zhen-left-no-alt',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
const noAltLeft=SP.getSlot(st,'bed:left');occupySlot(b,noAltLeft);a.position={...SP.slotApproachNodes(st,noAltLeft,a,'walk')[0]};other.offMap=true;
for(const t of SP.sleepTargets(st,a))st.reservations[`slot:${t.id}`]=b.id;
a.needs.sleepNeed=95;st.minute=180;
assert.equal(SP.sleepTargets(st,a).length,0,'fixture must remove every legal alternate without making the preferred occupied Slot legal');
assert.ok(E.baseUtilityForAction(a,'sleep')>0,'no-alternate conflict must not disappear before deliberation');
conflict=E.sleepPreferredSlotConflictDecision(st,a);assert.ok(conflict);assert.ok(conflict.candidates.some(x=>['wait','gainAttention','requestYield','assertYield','abandon'].includes(x.kind)));
clearActor(a);a.needs.sleepNeed=95;a.position={...SP.slotApproachNodes(st,noAltLeft,a,'walk')[0]};
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(st.events.some(e=>e.data?.action==='abort'&&e.data?.actionKind==='sleep'),false,'no-alternate conflict must not collapse to generic no-sleep-position abort');
noIssues('no alternate conflict');

// Human responder owns understood/accept/refuse and actual leaving; requester never moves the responder directly.
E.reset(5044);st=E.getState();const requester=st.agents.zhen,responder=st.agents.zhou;st.agents.orange.offMap=true;
const yieldSlot=SP.getSlot(st,'bed:left');occupySlot(responder,yieldSlot);requester.position={...SP.slotApproachNodes(st,yieldSlot,requester,'walk')[0]};
Object.assign(responder.needs,{sleepNeed:20,hunger:15,thirst:15,fatigue:15,social:15});const beforeResponder={position:structuredClone(responder.position),posture:structuredClone(responder.posture)};
const bidId=E.addEvent('sleep slot request','normal',[],{actor:requester.id,target:responder.id,action:'sleepSlotYieldRequest',preferredSlot:yieldSlot.id,interactionPurpose:'requestSleepSlotYield',socialBid:true,bidKind:'sleepSlotYieldRequest',interactionKind:'sleepSlotYield',expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:true,position:E.positionRef(requester.position)});
st.causes[bidId].data.bidId=bidId;E.addObservedBid(st,responder,st.causes[bidId],st.tick);
assert.deepEqual(responder.position,beforeResponder.position);assert.deepEqual(responder.posture,beforeResponder.posture,'request creation must not remotely move responder');
E.tick();st=E.getState();
const understood=st.events.find(e=>e.data?.action==='sleepSlotRequestUnderstood'&&e.data?.responseToBid===bidId),accepted=st.events.find(e=>e.data?.action==='acceptSleepSlotYield'&&e.data?.responseToBid===bidId);
assert.ok(understood&&accepted,'idle low-sleep-need Human should locally understand and accept in the first-version fixture');assert.notEqual(understood.id,accepted.id);
assert.equal(st.agents.zhou.activeIntent?.source?.type,'sleepConflict','accepted yield must bind a responder-local Intent');
for(let i=0;i<12&&!st.events.some(e=>e.data?.action==='sleepSlotYieldCompleted'&&e.data?.acceptedEventId===accepted.id);i++)E.tick();
st=E.getState();const completed=st.events.find(e=>e.data?.action==='sleepSlotYieldCompleted'&&e.data?.acceptedEventId===accepted.id);
assert.ok(completed,'actual departure must be a later observable consequence of responder-local action');assert.notEqual(completed.id,accepted.id);assert.notEqual(SP.slotOccupant(st,yieldSlot.id)?.id,'zhou');
noIssues('human responder accept agency');

E.reset(5045);st=E.getState();const requester2=st.agents.zhen,responder2=st.agents.zhou;st.agents.orange.offMap=true;const refusalSlot=SP.getSlot(st,'bed:left');occupySlot(responder2,refusalSlot);requester2.position={...SP.slotApproachNodes(st,refusalSlot,requester2,'walk')[0]};responder2.needs.sleepNeed=90;
const refuseBid=E.addEvent('sleep slot request refusal fixture','normal',[],{actor:requester2.id,target:responder2.id,action:'sleepSlotYieldRequest',preferredSlot:refusalSlot.id,interactionPurpose:'requestSleepSlotYield',socialBid:true,bidKind:'sleepSlotYieldRequest',interactionKind:'sleepSlotYield',expectsResponse:true,bidFrom:requester2.id,bidTo:responder2.id,perceivedByTarget:true,position:E.positionRef(requester2.position)});
st.causes[refuseBid].data.bidId=refuseBid;E.addObservedBid(st,responder2,st.causes[refuseBid],st.tick);E.tick();st=E.getState();
assert.ok(st.events.some(e=>e.data?.action==='sleepSlotRequestUnderstood'&&e.data?.responseToBid===refuseBid));assert.ok(st.events.some(e=>e.data?.action==='declineSleepSlotYield'&&e.data?.responseToBid===refuseBid));assert.equal(SP.slotOccupant(st,refusalSlot.id)?.id,'zhou');assert.equal(st.events.some(e=>e.data?.action==='sleepSlotYieldCompleted'&&e.data?.responseToBid===refuseBid),false);
noIssues('human responder refusal agency');

// Conflict wait remains a sleep-specific lifecycle but is interruptible by emergency needs.
E.reset(5046);st=E.getState();a=st.agents.zhen;st.agents.orange.offMap=true;st.agents.zhou.offMap=true;Object.assign(a.needs,{hunger:10,thirst:99,fatigue:20,sleepNeed:90,social:10});
a.activeIntent={id:'intent:zhen:conflict-wait',kind:'sleep',createdTick:Math.max(0,st.tick-3),lifecycle:'actionBound',source:{type:'test',tick:st.tick}};
a.action={kind:'sleep',phase:'conflictWait',started:Math.max(0,st.tick-3),wait:0,intentId:a.activeIntent.id,conflictWaitUntil:st.tick+10,preferredSlotId:'bed:left'};
E.tick();st=E.getState();a=st.agents.zhen;
assert.notEqual(a.action?.phase,'conflictWait','higher-priority emergency must interrupt sleep conflict waiting');
assert.ok(st.events.some(e=>e.data?.action==='intentPreempt'&&e.data?.priorIntentKind==='sleep'),'interruption must use the existing Intent preemption lifecycle');
noIssues('conflict wait preemption');

console.log('Sleep preferred Slot conflict regression: ok');
