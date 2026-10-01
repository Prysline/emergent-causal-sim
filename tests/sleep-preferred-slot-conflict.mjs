import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,C=globalThis.SimSleepSlotConflict,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const quiet=a=>{Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:90,social:8});a.offMap=false;a.action=null;a.activeIntent=null;};
const occupy=(st,a,slotId,{sleeping=false}={})=>{const slot=SP.getSlot(st,slotId);a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};a.action=sleeping?{kind:'sleep',phase:'sleeping',sleepTicks:0,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0}:null;if(sleeping)E.ensureIntentForAction?.(st,a);return slot;};

assert.equal(W.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.SLEEP_SLOT_CONFLICT_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(typeof SP.slotAvailability,'function');

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('sleep-conflict-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));

E.reset(44001);let st=E.getState(),requester=st.agents.zhen,human=st.agents.zhou,animal=st.agents.orange;quiet(requester);quiet(human);animal.offMap=true;occupy(st,human,'bed:left');requester.position={x:7,y:4};
assert.equal(SP.sleepTargets(st,requester).some(x=>x.id==='bed:left'),false);
assert.equal(SP.sleepTargets(st,requester).some(x=>x.id==='bed:right'),true);
assert.deepEqual(SP.slotAvailability(st,'bed:left',requester.id),{available:false,reason:'occupiedByAgent',occupantId:'zhou'});
let conflict=C.preferredConflict(st,requester);assert.equal(conflict.slot.id,'bed:left');assert.equal(conflict.observation.observable,true);assert.equal(conflict.observation.observedAgentKind,'human');
let candidates=C.resolutionCandidates(st,requester,conflict);for(const kind of ['alternateSleep','waitForSlot','gainAttention','requestYield','nonPhysicalShoo','deferSleep'])assert.ok(candidates.some(c=>c.kind===kind),`missing ${kind}`);
noIssues('assigned + alternate');

E.reset(44002);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;quiet(requester);quiet(human);animal.offMap=true;
E.addEvent('habit proof','normal',[],{actor:requester.id,action:'sleep',phase:'start',slot:'bed:right',furniture:'bed',position:E.positionRef(requester.position)});E.flushDeferredMemoryEvents?.(st);assert.ok(E.usageHabit(st,requester,'sleep',{kind:'slot',id:'bed:right'}));
st.usageAssignments=[];occupy(st,human,'bed:right');requester.position={x:7,y:4};conflict=C.preferredConflict(st,requester);assert.equal(conflict.slot.id,'bed:right');assert.ok(conflict.reasons.some(r=>r.kind==='habit'));assert.equal(conflict.reasons.some(r=>r.kind==='assignment'),false);assert.ok(C.resolutionCandidates(st,requester,conflict).some(c=>c.kind==='alternateSleep'));
noIssues('habit only');

E.reset(44003);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;quiet(requester);human.offMap=true;animal.offMap=false;occupy(st,animal,'bed:left',{sleeping:true});requester.position={x:7,y:4};
conflict=C.preferredConflict(st,requester);assert.equal(conflict.observation.observedAgentKind,'animal');assert.equal(conflict.observation.observedActionKind,'sleep');candidates=C.resolutionCandidates(st,requester,conflict);assert.ok(candidates.some(c=>c.kind==='gainAttention'));assert.equal(candidates.some(c=>c.kind==='requestYield'||c.kind==='nonPhysicalShoo'),false);
const attention=E.performAttentionInteraction(requester,animal,{stimulus:C.ATTENTION_STIMULUS});assert.equal(attention.performed,true);assert.equal(st.causes[attention.eventId].data.requestAccepted,undefined);assert.equal(st.causes[attention.eventId].data.requestUnderstood,undefined);
noIssues('sleeping animal');

E.reset(44004);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;quiet(requester);quiet(human);animal.offMap=true;const left=occupy(st,human,'bed:left');requester.position={x:7,y:4};const before={position:{...human.position},posture:{...human.posture}};
const requestId=E.addEvent('yield request','normal',[],{actor:requester.id,target:human.id,action:'sleepSlotYieldRequest',requestKind:'requestYield',preferredSlot:left.id,expectsResponse:true,perceivedByTarget:true,position:E.positionRef(requester.position)});assert.deepEqual(human.position,before.position);assert.deepEqual(human.posture,before.posture);
const responseId=C.responseForRequest(st,st.causes[requestId]);assert.ok(responseId);const response=st.causes[responseId];assert.equal(response.data.response,'accepted');assert.equal(response.data.responseToRequest,requestId);assert.equal(response.data.requestUnderstood,true,'accepted response must distinguish request understanding from the request event');assert.deepEqual(human.position,before.position,'acceptance itself must not teleport responder');assert.deepEqual(human.posture,before.posture,'acceptance itself must not rewrite responder posture');assert.equal(human.activeIntent?.source?.type,'sleepSlotYieldResponse');assert.equal(human.action?.kind,'wander');
human.position={x:requester.position.x+1,y:requester.position.y};human.posture={kind:'standing',slotId:null,furnitureId:null};C.settleYieldCompletions(st);const completed=st.events.find(e=>e.data?.action==='sleepSlotYieldCompleted'&&e.data?.responseEventId===responseId);assert.ok(completed,'actual Slot release must be a separate completion event');assert.equal(completed.data.responseToRequest,requestId);assert.equal(completed.data.completed,true);
noIssues('human responder agency');

E.reset(44005);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;quiet(requester);quiet(human);animal.offMap=false;occupy(st,human,'bed:left');occupy(st,animal,'bed:right');requester.position={x:7,y:4};assert.equal(SP.sleepTargets(st,requester).length,0);conflict=C.preferredConflict(st,requester);candidates=C.resolutionCandidates(st,requester,conflict);assert.equal(candidates.some(c=>c.kind==='alternateSleep'),false);for(const kind of ['waitForSlot','gainAttention','requestYield','nonPhysicalShoo','deferSleep'])assert.ok(candidates.some(c=>c.kind===kind),`no-alternate missing ${kind}`);
assert.ok(E.listDecisionOptionProviders().some(x=>x.id==='sleep.preferred-slot-conflict'),'conflict provider must be registered so sleep can remain a candidate without legal targets');
noIssues('no alternate');

E.reset(44006);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;quiet(requester);quiet(human);animal.offMap=true;occupy(st,human,'bed:left');human.action={kind:'eat',phase:'prepare',started:st.tick,wait:0};E.ensureIntentForAction?.(st,human);requester.position={x:7,y:4};const noResponseRequest=E.addEvent('busy request','normal',[],{actor:requester.id,target:human.id,action:'sleepSlotYieldRequest',requestKind:'requestYield',preferredSlot:'bed:left',expectsResponse:true,perceivedByTarget:true,position:E.positionRef(requester.position)});assert.equal(C.responseForRequest(st,st.causes[noResponseRequest]),null);assert.equal(st.events.some(e=>e.data?.responseToRequest===noResponseRequest),false);assert.equal(st.causes[noResponseRequest].data.rejected,undefined);assert.equal(st.causes[noResponseRequest].data.intentionalIgnore,undefined);
const unperceivedRequest=E.addEvent('unperceived request','normal',[],{actor:requester.id,target:human.id,action:'sleepSlotYieldRequest',requestKind:'requestYield',preferredSlot:'bed:left',expectsResponse:true,perceivedByTarget:false,position:E.positionRef(requester.position)});assert.equal(C.responseForRequest(st,st.causes[unperceivedRequest]),null);assert.equal(st.events.some(e=>e.data?.responseToRequest===unperceivedRequest),false,'not-perceived request must not fabricate responder understanding');
noIssues('no response distinct');

E.reset(44007);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;quiet(requester);quiet(human);animal.offMap=true;occupy(st,human,'bed:left');requester.position={x:7,y:4};requester.needs.thirst=99;requester.action=E.buildAction(requester,{id:'sleep'});E.ensureIntentForAction(st,requester);requester.action.phase='slotConflict';requester.action.preferredConflictSlot='bed:left';requester.action.conflictMode='waitForSlot';requester.action.conflictWaitUntilTick=st.tick+C.OCCUPANCY_WAIT_TICKS;E.tick();assert.notEqual(requester.action?.phase,'slotConflict');assert.ok(requester.action===null||requester.action.kind!=='sleep','higher-priority need must be able to interrupt occupancy wait');
noIssues('higher priority interrupts wait');

E.reset(44008);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;animal=st.agents.orange;quiet(requester);quiet(human);animal.offMap=true;occupy(st,human,'bed:left');requester.position={x:7,y:4};requester.action=E.buildAction(requester,{id:'sleep'});E.ensureIntentForAction(st,requester);E.adoptDecisionEvidence(st,requester,requester.action,{source:{type:'test',intentKind:'sleep'},contributors:[]});conflict=C.preferredConflict(st,requester);candidates=C.resolutionCandidates(st,requester,conflict);const e1=C.captureConflictResolutionEvidence(st,requester,requester.action,{conflict,candidates,selectedResolution:candidates[0].kind});human.action={kind:'rest',phase:'resting',started:st.tick,restTicks:0};human.posture={kind:'standing',slotId:null,furnitureId:null};assert.equal(e1.observation.observedPosture,'lying');assert.equal(e1.observation.observedActionKind,null);occupy(st,human,'bed:left');const conflict2=C.preferredConflict(st,requester),e2=C.captureConflictResolutionEvidence(st,requester,requester.action,{conflict:conflict2,candidates:C.resolutionCandidates(st,requester,conflict2),selectedResolution:'waitForSlot'});assert.notEqual(e1.id,e2.id);assert.equal(e2.priorConflictDecisionId,e1.id);assert.equal(e1.selectedResolution,candidates[0].kind);

let observationCalls=0;const originalObserve=E.observeAgentContext;E.observeAgentContext=(...args)=>{observationCalls++;return originalObserve(...args);};try{C.preferredConflict(st,requester);}finally{E.observeAgentContext=originalObserve;}assert.ok(observationCalls>0);
assert.equal(Object.hasOwn(C,'canObserveResponderContext'),false);
assert.equal(C.OCCUPANCY_WAIT_TICKS,3,'occupancy wait owns its finite patience value independently of Social awaitResponse');
noIssues('evidence + shared observation');

console.log('Sleep preferred Slot conflict regression: ok');
