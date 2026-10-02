import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,C=globalThis.SimSleepConflict,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const sleepSlotRecord=(st,id)=>Object.values(st.furniture||{}).flatMap(f=>f.slots||[]).find(s=>s.id===id);
function quiet(a,{sleepNeed=88,thirst=8,hunger=8,fatigue=20,social=8}={}){Object.assign(a.needs,{sleepNeed,thirst,hunger,fatigue,social});a.action=null;a.activeIntent=null;a.offMap=false;}
function occupy(st,occupant,slotId,{sleeping=false}={}){
  const slot=SP.getSlot(st,slotId);occupant.offMap=false;occupant.position={...slot.position};occupant.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  occupant.action=sleeping?{kind:'sleep',phase:'sleeping',started:st.tick,wait:0,sleepTicks:2,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}}}:null;
  occupant.activeIntent=null;if(occupant.action)E.ensureIntentForAction(st,occupant);return slot;
}
function near(st,a,slot){a.position={x:slot.position.x,y:Math.max(0,slot.position.y-1),z:slot.position.z||0};a.posture={kind:'standing',slotId:null,furnitureId:null};}
function option(options,resolution){return options.find(x=>x.resolution===resolution)||null;}
function latest(action){return E.getState().events.find(e=>e.data?.action===action)||null;}

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-left-sleep',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('sleep-conflict-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));

// A + D: assigned preferred Slot remains illegal, conflict candidates coexist with alternate sleep,
// and the responder owns the accept/refuse + actual-leave sequence.
E.reset(44001);
let st=E.getState(),requester=st.agents.zhen,responder=st.agents.zhou,animal=st.agents.orange;
quiet(requester);quiet(responder,{sleepNeed:8});animal.offMap=true;
const left=occupy(st,responder,'bed:left');near(st,requester,left);
assert.equal(SP.sleepTargets(st,requester).some(x=>x.id==='bed:left'),false,'occupied preferred Slot must remain outside legal sleepTargets');
assert.ok(SP.sleepTargets(st,requester).some(x=>x.id==='bed:right'),'fixture must keep an alternate legal sleep target');
assert.equal(SP.sleepSlotAvailability(st,'bed:left',requester.id).reason,'occupied');
assert.equal(SP.sleepSlotAvailability(st,'bed:left',requester.id).occupantId,responder.id);
let conflicts=C.preferredSleepConflicts(st,requester),opts=C.sleepConflictDecisionOptions(st,requester);
assert.equal(conflicts.length,1);assert.ok(conflicts[0].associationReasons.some(x=>x.key==='assignedToSelf'));
assert.ok(option(opts,'wait'));assert.ok(option(opts,'attention'));assert.ok(option(opts,'requestYield'));assert.ok(option(opts,'driveAway'));
const request=option(opts,'requestYield'),action=E.buildAction(requester,request);
requester.action=action;requester.activeIntent=E.createIntent(st,requester,action);action.intentId=requester.activeIntent.id;
E.adoptDecisionEvidence(st,requester,action,{source:{type:'test',intentKind:'sleep'},contributors:request.decisionContributors,utility:request.score});
action.phase='interact';
const beforeResponder={position:structuredClone(responder.position),posture:structuredClone(responder.posture),action:responder.action,activeIntent:responder.activeIntent};
C.stepAction(st,requester,action,{moveToInteraction:()=>true,finishAction:a=>{a.action=null;},standUp:()=>true});
const bid=latest('sleepSlotYieldRequest');
assert.ok(bid?.data?.socialBid);assert.equal(bid.data.perceivedByTarget,true);
assert.deepEqual(responder.position,beforeResponder.position,'requester must not move responder');
assert.deepEqual(responder.posture,beforeResponder.posture,'requester must not change responder posture');
assert.equal(responder.action,beforeResponder.action);assert.equal(responder.activeIntent,beforeResponder.activeIntent);
const evidence=requester.conflictResolutionEvidence.at(-1);
assert.equal(evidence.parentDecisionId,requester.decisionEvidence.id);
assert.equal(evidence.preferredSlot.id,'bed:left');assert.equal(evidence.selectedResolution,'requestYield');
assert.equal(evidence.observation.targetId,responder.id);assert.equal(evidence.observation.observedPosture,'lying');
responder.posture.kind='sitting';
assert.equal(evidence.observation.observedPosture,'lying','Conflict Resolution Evidence observation must remain a frozen decision-time snapshot');
responder.posture={kind:'lying',slotId:'bed:left',furnitureId:left.furnitureId};
E.tick();st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;
const accept=st.events.find(e=>e.data?.action==='acceptSleepSlotYield'&&e.data?.responseToBid===bid.id);
assert.ok(accept,'Human responder should create its own explicit response event');
assert.equal(responder.posture.slotId,'bed:left','accepting must not make the Slot free in the same response step');
E.tick();st=E.getState();responder=st.agents.zhou;
assert.ok(st.events.find(e=>e.data?.action==='leaveSleepSlot'&&e.data?.responseToBid===bid.id),'accepted responder should later execute its own leave action');
assert.notEqual(responder.posture.slotId,'bed:left');noIssues('assigned + responder agency');

// B: habit alone can create the preferred conflict; it is a contributor, not a legal-target override.
E.reset(44002);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;animal=st.agents.orange;
st.usageAssignments=[];quiet(requester);quiet(responder,{sleepNeed:8});animal.offMap=true;
E.addEvent('habit proof','normal',[],{actor:requester.id,action:'sleep',phase:'start',slot:'bed:left',furniture:'bed',position:E.positionRef(requester.position)});
assert.ok(E.usageHabit(st,requester,'sleep',{kind:'slot',id:'bed:left'})?.effectiveStrength>0);
const habitLeft=occupy(st,responder,'bed:left');near(st,requester,habitLeft);
conflicts=C.preferredSleepConflicts(st,requester);
assert.ok(conflicts[0]?.associationReasons.some(x=>x.key==='habitualForSelf'),'habit-only preferred Slot should remain conflict-relevant');
assert.equal(SP.sleepTargets(st,requester).some(x=>x.id==='bed:left'),false);noIssues('habit only');

// C: sleeping Animal permits generic attention but not Human-only yield/drive-away candidates.
E.reset(44003);st=E.getState();requester=st.agents.zhen;animal=st.agents.orange;responder=st.agents.zhou;
quiet(requester);responder.offMap=true;quiet(animal,{sleepNeed:70});const animalLeft=occupy(st,animal,'bed:left',{sleeping:true});near(st,requester,animalLeft);
opts=C.sleepConflictDecisionOptions(st,requester);
assert.ok(option(opts,'wait'));assert.ok(option(opts,'attention'));assert.equal(option(opts,'requestYield'),null);assert.equal(option(opts,'driveAway'),null);
const attention=option(opts,'attention'),attentionAction=E.buildAction(requester,attention);requester.action=attentionAction;requester.activeIntent=E.createIntent(st,requester,attentionAction);attentionAction.intentId=requester.activeIntent.id;E.adoptDecisionEvidence(st,requester,attentionAction,{source:{type:'test',intentKind:'sleep'},contributors:attention.decisionContributors,utility:attention.score});attentionAction.phase='interact';
C.stepAction(st,requester,attentionAction,{moveToInteraction:()=>true,finishAction:a=>{a.action=null;},standUp:()=>true});
assert.ok(latest('attentionStimulus'));assert.equal(st.events.some(e=>['sleepSlotYieldRequest','sleepSlotDriveAway'].includes(e.data?.action)),false);noIssues('sleeping animal');

// E: with no alternate legal sleep target, conflict handling remains a live deliberation option instead of disappearing as "no sleep position".
E.reset(44004);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;animal=st.agents.orange;
quiet(requester,{sleepNeed:92});quiet(responder,{sleepNeed:8});animal.offMap=true;sleepSlotRecord(st,'bed:right').canSleep=false;const noAltLeft=occupy(st,responder,'bed:left');near(st,requester,noAltLeft);
assert.equal(SP.sleepTargets(st,requester).length,0);assert.equal(E.baseUtilityForAction(requester,'sleep'),0,'canonical sleep Action stays unavailable without a legal target');
opts=C.sleepConflictDecisionOptions(st,requester);assert.ok(opts.length>=3,'conflict deliberation must remain available without alternate sleep target');
for(const other of Object.values(st.agents))if(other.id!==requester.id)other.offMap=other.id!==responder.id;
E.tick();st=E.getState();
assert.ok(st.thoughts.zhen.options.some(x=>x.id==='sleepConflict'),'initial deliberation must retain conflict resolution candidates');
assert.equal(st.events.some(e=>e.data?.action==='abort'&&e.data?.actionKind==='sleep'),false,'no-alternate conflict must not immediately collapse to sleep abort');noIssues('no alternate');

// No-response remains distinct from refusal, and higher-priority emergency needs may interrupt requester-private response waiting.
E.reset(44005);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;animal=st.agents.orange;
quiet(requester);quiet(responder,{sleepNeed:8,thirst:100});animal.offMap=true;const waitLeft=occupy(st,responder,'bed:left');near(st,requester,waitLeft);
opts=C.sleepConflictDecisionOptions(st,requester);const req=option(opts,'requestYield'),reqAction=E.buildAction(requester,req);requester.action=reqAction;requester.activeIntent=E.createIntent(st,requester,reqAction);reqAction.intentId=requester.activeIntent.id;E.adoptDecisionEvidence(st,requester,reqAction,{source:{type:'test',intentKind:'sleep'},contributors:req.decisionContributors,utility:req.score});reqAction.phase='interact';
C.stepAction(st,requester,reqAction,{moveToInteraction:()=>true,finishAction:a=>{a.action=null;},standUp:()=>true});const pendingBid=latest('sleepSlotYieldRequest');assert.equal(requester.activeIntent?.kind,'awaitSleepConflictResponse');
requester.needs.thirst=100;E.tick();st=E.getState();requester=st.agents.zhen;
assert.notEqual(requester.activeIntent?.kind,'awaitSleepConflictResponse','higher-priority emergency need must be able to interrupt response waiting');
assert.equal(st.events.some(e=>e.data?.action==='refuseSleepSlotYield'&&e.data?.responseToBid===pendingBid.id),false,'lack of response must not be rewritten as refusal');

E.reset(44006);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;animal=st.agents.orange;
quiet(requester);quiet(responder,{sleepNeed:8,thirst:100});animal.offMap=true;const timeoutLeft=occupy(st,responder,'bed:left');near(st,requester,timeoutLeft);
opts=C.sleepConflictDecisionOptions(st,requester);const timeoutReq=option(opts,'requestYield'),timeoutAction=E.buildAction(requester,timeoutReq);requester.action=timeoutAction;requester.activeIntent=E.createIntent(st,requester,timeoutAction);timeoutAction.intentId=requester.activeIntent.id;E.adoptDecisionEvidence(st,requester,timeoutAction,{source:{type:'test',intentKind:'sleep'},contributors:timeoutReq.decisionContributors,utility:timeoutReq.score});timeoutAction.phase='interact';
C.stepAction(st,requester,timeoutAction,{moveToInteraction:()=>true,finishAction:a=>{a.action=null;},standUp:()=>true});const timeoutBid=latest('sleepSlotYieldRequest');
requester.needs.thirst=8;for(let i=0;i<4;i++)E.tick();st=E.getState();
assert.ok(st.events.find(e=>e.data?.action==='sleepConflictResponseWaitEnded'&&e.data?.bidId===timeoutBid.id),'requester-private timeout must be explicit');
assert.equal(st.events.some(e=>e.data?.action==='refuseSleepSlotYield'&&e.data?.responseToBid===timeoutBid.id),false,'timeout/no-response must stay distinct from refusal');
noIssues('no response');

assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.42.0-usage-preference-sleep','Usage Preference generation must not fake-bump');
assert.equal(E.SOCIAL_BID_SCHEMA_VERSION,'11.12.2-social-bid-lifecycle','Social Bid generation must not fake-bump');
console.log('Sleep preferred Slot conflict regression: ok');
