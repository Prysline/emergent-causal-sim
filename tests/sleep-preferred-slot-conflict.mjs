import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,SP=globalThis.SimSpatial,U=globalThis.SimUsage,C=globalThis.SimSleepSlotConflict,V=globalThis.SimValidator;
const noIssues=label=>{const result=V.validateState(E.getState());assert.equal(result.issueCount,0,label+': '+result.issues.map(x=>x.code+': '+x.message).join(' | '));};
const clearAgent=a=>{a.action=null;a.activeIntent=null;a.posture={kind:'standing',slotId:null,furnitureId:null};a.offMap=false;};
const calm=a=>{Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:78,social:8});};
const occupy=(st,a,slotId,{sleeping=false}={})=>{const slot=SP.getSlot(st,slotId);a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};a.action=sleeping?{kind:'sleep',phase:'sleeping',sleepTicks:4,started:Math.max(0,st.tick-4),sleepTarget:{id:slot.id}}:null;a.activeIntent=null;return slot;};
const assign=(st,agentId,slotId)=>{st.usageAssignments=[{id:'fixture-assignment',principal:{kind:'agent',id:agentId},activity:'sleep',target:{kind:'slot',id:slotId}}];};
const placeObserver=(a,slot)=>{a.position={...slot.position};a.posture={kind:'standing',slotId:null,furnitureId:null};};

assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(C.VERSION,'11.44.0-sleep-slot-conflict');

// A: assigned preferred bed stays illegal while conflict reasoning retains the association and alternate candidates.
E.reset(11440);
let st=E.getState(),requester=st.agents.zhen,human=st.agents.zhou,animal=st.agents.orange,left=SP.getSlot(st,'bed:left');
clearAgent(requester);clearAgent(human);clearAgent(animal);calm(requester);assign(st,requester.id,left.id);occupy(st,human,left.id);placeObserver(requester,left);
assert.equal(SP.sleepTargets(st,requester).some(x=>x.id===left.id),false,'occupied preferred Slot must stay out of legal sleepTargets');
assert.equal(SP.sleepTargetAvailability(st,requester,{kind:'slot',id:left.id}).reason,'occupied');
let conflict=C.preferredSleepSlotConflict(st,requester);
assert.equal(conflict.preferredTarget.id,left.id);
assert.ok(conflict.associationReasons.some(x=>x.key==='assignedToSelf'));
assert.deepEqual(conflict.observation,E.observeAgentContext(st,requester,human),'conflict must consume the shared Agent-context observation owner');
let kinds=new Set(C.resolutionCandidates(st,requester,conflict).map(x=>x.kind));
for(const kind of ['useAlternate','waitForSlot','gainAttention','requestYield','driveAwayNonPhysical'])assert.ok(kinds.has(kind),'Human conflict should evaluate '+kind);

// Evidence freezes the decision-time Observation snapshot and links to the parent decision.
requester.activeIntent={id:'intent:zhen:fixture:sleep',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test',tick:st.tick}};
requester.action=E.buildAction(requester,{id:'sleep'});requester.action.intentId=requester.activeIntent.id;
E.adoptDecisionEvidence(st,requester,requester.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:[]});
const oldRand=E.rand;E.rand=()=>0;C.chooseSurface(st,requester,requester.action);E.rand=oldRand;
const evidence=requester.conflictResolutionEvidence.at(-1);
assert.ok(evidence&&evidence.parentDecisionId===requester.action.decisionId);
const frozenObservation=structuredClone(evidence.observation);
human.action={kind:'wander',phase:'move',started:st.tick};human.posture={kind:'standing',slotId:null,furnitureId:null};
assert.deepEqual(evidence.observation,frozenObservation,'later responder state must not backfill old conflict evidence');
requester.action=null;requester.activeIntent=null;human.action=null;

// B: habit-only preference can create a conflict without an assignment.
E.reset(11441);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;left=SP.getSlot(st,'bed:left');
st.usageAssignments=[];st.usageClaims=[];clearAgent(requester);clearAgent(human);calm(requester);placeObserver(requester,left);
E.addEvent('habit proof','normal',[],{actor:requester.id,action:'sleep',phase:'start',slot:left.id,furniture:left.furnitureId,position:E.positionRef(requester.position)});
assert.ok(E.usageHabit(st,requester,'sleep',{kind:'slot',id:left.id})?.effectiveStrength>0);
occupy(st,human,left.id);placeObserver(requester,left);
conflict=C.preferredSleepSlotConflict(st,requester);
assert.ok(conflict?.associationReasons.some(x=>x.kind==='habit'&&x.key==='habitualForSelf'),'habit alone must remain a valid preference association');

// C: sleeping Animal allows generic attention but never gets Human request/drive shortcuts.
E.reset(11442);st=E.getState();requester=st.agents.zhen;animal=st.agents.orange;left=SP.getSlot(st,'bed:left');
clearAgent(requester);clearAgent(animal);calm(requester);assign(st,requester.id,left.id);occupy(st,animal,left.id,{sleeping:true});placeObserver(requester,left);
conflict=C.preferredSleepSlotConflict(st,requester);
assert.equal(conflict.observation.observedAgentKind,'animal');
assert.equal(conflict.observation.observedActionKind,'sleep');
kinds=new Set(C.resolutionCandidates(st,requester,conflict).map(x=>x.kind));
assert.ok(kinds.has('gainAttention'));
assert.equal(kinds.has('requestYield'),false);
assert.equal(kinds.has('driveAwayNonPhysical'),false);

// D: Human responder creates its own private response Intent/Action; acceptance and leaving remain separate events.
E.reset(11443);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;left=SP.getSlot(st,'bed:left');
clearAgent(requester);clearAgent(human);calm(requester);calm(human);human.needs.sleepNeed=8;human.traits.social=1;occupy(st,human,left.id);placeObserver(requester,left);
const bidId=E.addEvent('yield request','normal',[],{actor:requester.id,target:human.id,action:'sleepSlotYieldRequest',socialBid:true,bidKind:'sleepSlotYield',interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:requester.id,bidTo:human.id,perceivedByTarget:true,preferredSlot:left.id});
st.causes[bidId].data.bidId=bidId;E.addObservedBid(st,human,st.causes[bidId],st.tick);
assert.equal(C.responseEvaluation(st,human,st.causes[bidId]).response,'accept');
C.promoteResponses(st);
assert.equal(human.action?.kind,'sleepSlotResponse');
assert.equal(human.activeIntent?.kind,'respondSleepSlotConflict');
assert.equal(requester.position.x,left.position.x,'requester must not be moved while responder decides');
C.resolveResponses(st);
const accepted=st.events.find(e=>e.data?.action==='sleepSlotYieldAccepted'&&e.data?.responseToBid===bidId);
const leftEvent=st.events.find(e=>e.data?.action==='leaveSleepSlot'&&e.causeIds?.includes(accepted?.id));
assert.ok(accepted&&leftEvent,'acceptance and actual leaving must be distinct causal events');
assert.equal(human.posture.kind,'standing');
assert.equal(SP.slotOccupant(st,left.id,requester.id),null);

// Refuse and delay are responder-local outcomes too.
const oldRelationship=E.relationshipSignal,oldAffect=E.affectResponseSignal;
E.relationshipSignal=()=>-1;E.affectResponseSignal=()=>-1;human.traits.social=0;
assert.equal(C.responseEvaluation(st,human,st.causes[bidId]).response,'refuse');
E.relationshipSignal=()=>0;E.affectResponseSignal=()=>0;
assert.equal(C.responseEvaluation(st,human,st.causes[bidId]).response,'delay');
E.relationshipSignal=oldRelationship;E.affectResponseSignal=oldAffect;

// E: no alternate still keeps sleep as a deliberation candidate and evaluates conflict resolutions instead of losing context.
E.reset(11444);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;left=SP.getSlot(st,'bed:left');const right=SP.getSlot(st,'bed:right');
clearAgent(requester);clearAgent(human);clearAgent(animal);calm(requester);assign(st,requester.id,left.id);occupy(st,human,left.id);occupy(st,animal,right.id);placeObserver(requester,left);
assert.equal(SP.sleepTargets(st,requester).length,0,'fixture must have no legal alternate sleep target');
assert.ok(E.baseUtilityForAction(requester,'sleep')>0,'preferred occupancy conflict must preserve the sleep deliberation candidate');
conflict=C.preferredSleepSlotConflict(st,requester);kinds=new Set(C.resolutionCandidates(st,requester,conflict).map(x=>x.kind));
for(const kind of ['waitForSlot','gainAttention','requestYield','deferSleep'])assert.ok(kinds.has(kind),'no-alternate conflict should still evaluate '+kind);

// No-response is not refusal/ignore; timeout returns to Deliberation with private context.
const timeoutBidId=E.addEvent('unanswered yield request','normal',[],{actor:requester.id,target:human.id,action:'sleepSlotYieldRequest',socialBid:true,bidKind:'sleepSlotYield',interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:requester.id,bidTo:human.id,perceivedByTarget:true,preferredSlot:left.id});
st.causes[timeoutBidId].data.bidId=timeoutBidId;
requester.activeIntent={id:'intent:zhen:no-response:sleep',kind:'sleep',createdTick:Math.max(0,st.tick-5),lifecycle:'actionBound',source:{type:'test',tick:0}};
requester.action={kind:'sleep',phase:'conflictAwaitResponse',started:Math.max(0,st.tick-5),intentId:requester.activeIntent.id,preferredSleepSlotId:left.id,conflictRequestBidId:timeoutBidId,conflictResponseUntilTick:st.tick};
C.stepConflict(st,requester,requester.action);
const waitEnd=st.events.find(e=>e.data?.action==='sleepSlotRequestWaitEnded');
assert.ok(waitEnd);
assert.equal(waitEnd.data.rejected,undefined);assert.equal(waitEnd.data.ignored,undefined);assert.equal(waitEnd.data.intentionalIgnore,undefined);
assert.equal(requester.action.phase,'chooseSurface');

// Conflict waiting is softly reconsiderable; actual sleeping remains protected by a different phase.
requester.action={kind:'sleep',phase:'conflictWait',started:Math.max(0,st.tick-5),intentId:requester.activeIntent.id,preferredSleepSlotId:left.id,conflictWaitUntilTick:st.tick+3};
requester.needs.hunger=90;requester.needs.sleepNeed=60;
let snap=E.reconsiderationSnapshot(st,requester);
assert.equal(snap.ok,true);assert.equal(snap.commitmentCost,2);assert.equal(snap.bestChallenger?.intentKind,'satisfyHunger');
requester.action.phase='sleeping';snap=E.reconsiderationSnapshot(st,requester);assert.equal(snap.ok,false);assert.equal(snap.reason,'protected-action');

// Emergency needs must also preempt conflict waiting instead of being blocked by the protected sleep action.
requester.action={kind:'sleep',phase:'conflictWait',started:Math.max(0,st.tick-5),intentId:requester.activeIntent.id,preferredSleepSlotId:left.id,conflictWaitUntilTick:st.tick+3};
requester.needs.hunger=96;requester.needs.sleepNeed=60;
E.tick();
assert.equal(requester.activeIntent?.kind,'satisfyHunger','emergency hunger must preempt sleep conflict waiting');
assert.equal(requester.action?.kind,'eat','emergency hunger must replace the conflict-wait sleep action');

assert.equal(globalThis.SimPerception,undefined,'first version must not introduce a full Perception subsystem');
requester.action=null;requester.activeIntent=null;noIssues('sleep preferred Slot conflict');
console.log('Sleep preferred Slot conflict regression: ok');
