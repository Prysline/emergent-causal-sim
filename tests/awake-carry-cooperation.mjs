import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,SC=globalThis.SimSleepConflict,AC=globalThis.SimAgentCarry,V=globalThis.SimValidator;
const APP_VERSION='11.50.1-prone-transition-burden';
const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('awake-carry-cooperation-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,label+': '+v.issues.map(x=>x.code+': '+x.message).join(' | '));};
const placeAtSlot=(st,a,slotId)=>{const slot=SP.getSlot(st,slotId);a.offMap=false;a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};a.action=null;a.activeIntent=null;return slot;};
const nearSlot=(st,a,slotId)=>{const slot=SP.getSlot(st,slotId),node=SP.slotApproachNodes?.(st,slot,a,'walk')?.[0]||slot.position;a.offMap=false;a.position={...node};a.posture={kind:'standing',slotId:null,furnitureId:null};a.action=null;a.activeIntent=null;return slot;};
const conflictFor=(st,a)=>SC.selfSleepAssociations(st,a).find(x=>x.slot.id==='bed:left');
const issueCarryBid=(st,requester,responder,candidate)=>{const bidId=E.addEvent('carry cooperation request','normal',[],{actor:requester.id,target:responder.id,action:'carryCooperationRequest',socialBid:true,bidKind:'carryCooperation',interactionKind:'carryCooperation',expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:true,conflictContext:'sleepSlotConflict',slot:'bed:left',targetPlacement:structuredClone(candidate.targetPlacement)});st.causes[bidId].data.bidId=bidId;requester.activeIntent=E.createAwaitResponseIntent(st,requester,E.bidEvent(st,bidId),{context:'sleepSlotConflict',preferredSlotId:'bed:left'});return bidId;};

// Awake Human: consent evidence is requester-visible and target-specific, but it must not bypass hidden execution-time physical truth.
E.reset(14711);
let st=E.getState(),requester=st.agents.zhen,responder=st.agents.zhou,cat=st.agents.orange;cat.offMap=true;
assert.equal(st.version,APP_VERSION);nearSlot(st,requester,'bed:left');placeAtSlot(st,responder,'bed:left');responder.needs.sleepNeed=10;
let conflict=conflictFor(st,requester);assert.ok(conflict);let evaluation=SC.conflictCandidates(st,requester,conflict);
assert.equal(evaluation.candidates.some(x=>x.kind==='carryOccupant'),false,'awake occupant must not become carry candidate before cooperation');
const requestCandidate=evaluation.candidates.find(x=>x.kind==='requestCarryCooperation');assert.ok(requestCandidate,'awake occupant should expose target-specific cooperation request candidate when requester-time attemptability allows it');
assert.equal(requestCandidate.targetAgent,responder.id);assert.equal(requestCandidate.targetPlacement?.kind,'floor','first awake cooperation proposal should be a concrete neutral floor placement');
const observation=evaluation.observation;assert.equal(AC.candidateAttemptability(st,requester,observation).ok,false,'attemptability without cooperation evidence must reject awake target');
assert.equal(AC.candidateAttemptability(st,requester,observation,{cooperationEvidence:{accepted:true}}).ok,true,'explicit responder cooperation evidence may satisfy awake requester-time attemptability');

const bidId=issueCarryBid(st,requester,responder,requestCandidate);
SC.processSleepConflictResponses(st);
const accepted=st.events.find(e=>e.data?.action==='acceptCarryCooperation'&&e.data?.responseToBid===bidId);assert.ok(accepted,'awake responder should own the cooperation response event');
assert.equal(accepted.data.responseKind,'accepted');assert.equal(accepted.data.perceivedByTarget,true);assert.equal(Object.keys(st.agentCarries||{}).length,0,'accept must not directly establish carry');assert.equal(requester.activeIntent?.kind,'awaitResponse','responder must not directly clear requester-private wait');
SC.consumeRequesterResponses(st);assert.equal(requester.activeIntent,null,'requester may settle its own wait only after observing response provenance');
conflict=conflictFor(st,requester);evaluation=SC.conflictCandidates(st,requester,conflict);
const cooperative=evaluation.candidates.find(x=>x.kind==='carryOccupant');assert.ok(cooperative,'matching accepted cooperation should enable awake carry candidate on re-deliberation');assert.equal(cooperative.cooperative,true);assert.equal(cooperative.cooperationEvidence.bidId,bidId);assert.equal(cooperative.cooperationEvidence.responseEventId,accepted.id);assert.deepEqual(cooperative.targetPlacement,requestCandidate.targetPlacement);
const humanExecution=AC.canEstablishCarry(st,requester,responder,{cooperative:true});assert.equal(humanExecution.ok,false,'accepted cooperation must not override execution-time physical truth');assert.equal(humanExecution.reason,'mass-capacity-exceeded','default Human target is intentionally too heavy for twoArmCarry');
assert.equal(E.buildAction(requester,{id:'carryAgent',targetAgent:responder.id,targetPlacement:cooperative.targetPlacement,cooperative:true}),null,'canonical Action construction must reject physically impossible Human carry despite valid cooperation evidence');assert.equal(Object.keys(st.agentCarries||{}).length,0);noIssues('matching Human cooperation with execution rejection');

// Same responder acceptance is scoped to the exact proposal and cannot be reused for another placement.
const differentPlacement=structuredClone(cooperative.targetPlacement);differentPlacement.position={...differentPlacement.position,x:differentPlacement.position.x+1};
assert.equal(SC.validCarryCooperationEvidence(st,requester,conflict,evaluation.observation,differentPlacement),null,'accepted cooperation must not authorize a different placement');

// Cooperation expires with Social Bid evidence lifetime and must return to ordinary re-deliberation.
st.tick=accepted.tick+E.BID_MEMORY_TICKS+1;conflict=conflictFor(st,requester);evaluation=SC.conflictCandidates(st,requester,conflict);assert.equal(evaluation.candidates.some(x=>x.kind==='carryOccupant'&&x.cooperative===true),false,'stale cooperation must not remain a carry truth');assert.ok(evaluation.candidates.some(x=>x.kind==='requestCarryCooperation'),'expired evidence should return to ordinary target-specific cooperation request reasoning');

// Awake Animal: the same responder contract can produce evidence that hands off to the existing Agent Carry execution when World truth permits it.
E.reset(14712);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;cat=st.agents.orange;responder.offMap=true;nearSlot(st,requester,'bed:left');placeAtSlot(st,cat,'bed:left');cat.needs.sleepNeed=10;
conflict=conflictFor(st,requester);evaluation=SC.conflictCandidates(st,requester,conflict);const animalRequest=evaluation.candidates.find(x=>x.kind==='requestCarryCooperation');assert.ok(animalRequest,'awake Animal should use the same target-specific cooperation request mechanism');
const animalBidId=issueCarryBid(st,requester,cat,animalRequest);SC.processSleepConflictResponses(st);const animalAccepted=st.events.find(e=>e.data?.action==='acceptCarryCooperation'&&e.data?.responseToBid===animalBidId);assert.ok(animalAccepted,'awake Animal should own its cooperation response');assert.equal(animalAccepted.data.responseKind,'accepted');SC.consumeRequesterResponses(st);
conflict=conflictFor(st,requester);evaluation=SC.conflictCandidates(st,requester,conflict);const animalCarry=evaluation.candidates.find(x=>x.kind==='carryOccupant'&&x.cooperative===true);assert.ok(animalCarry,'matching awake Animal cooperation must enable carry candidate');const animalExecution=AC.canEstablishCarry(st,requester,cat,{cooperative:true});assert.equal(animalExecution.ok,true,'World truth should permit default Human carrying default Cat');const action=E.buildAction(requester,{id:'carryAgent',targetAgent:cat.id,targetPlacement:animalCarry.targetPlacement,cooperative:true});assert.ok(action,'physically feasible cooperative candidate must hand off to canonical Agent Carry Action');assert.equal(Object.keys(st.agentCarries||{}).length,0,'building the carry Action still must not establish relation before execution');noIssues('awake Animal cooperative handoff');

// Sleeping path remains independent of Social Bid cooperation.
E.reset(14713);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;cat=st.agents.orange;responder.offMap=true;nearSlot(st,requester,'bed:left');placeAtSlot(st,cat,'bed:left');cat.needs.sleepNeed=80;cat.action={kind:'sleep',phase:'sleeping',sleepTicks:0,sleepTarget:{kind:'slot',id:'bed:left',position:{...cat.position}},started:st.tick,wait:0};E.ensureIntentForAction(st,cat);
conflict=conflictFor(st,requester);evaluation=SC.conflictCandidates(st,requester,conflict);const sleepingCarry=evaluation.candidates.find(x=>x.kind==='carryOccupant');assert.ok(sleepingCarry,'sleeping occupant carry path must remain available without Social Bid cooperation');assert.notEqual(sleepingCarry.cooperative,true);assert.equal(evaluation.candidates.some(x=>x.kind==='requestCarryCooperation'),false,'sleeping path must not be rerouted through carryCooperation');noIssues('sleeping path unchanged');

console.log('awake-carry-cooperation: ok');
