import assert from 'node:assert/strict';
import fs from 'node:fs';
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

// Preferred fixed-Slot conflict: objective occupancy stays in Spatial, while Deliberation keeps the private conflict context.
const noIssues=label=>{const result=V.validateState(E.getState());assert.equal(result.issueCount,0,`${label}: ${result.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
function actualSlot(st,id){for(const f of Object.values(st.furniture||{})){const slot=(f.slots||[]).find(x=>x.id===id);if(slot)return {slot,furnitureId:f.id};}return null;}
function occupy(st,agent,slotId,{sleeping=false}={}){
  const found=actualSlot(st,slotId);assert.ok(found,slotId+' must exist');
  agent.offMap=false;agent.position={...found.slot.position};agent.posture={kind:'lying',slotId,furnitureId:found.furnitureId};agent.action=null;agent.activeIntent=null;
  if(sleeping){agent.action={kind:'sleep',phase:'sleeping',sleepTicks:1,sleepTarget:{kind:'slot',id:slotId,position:{...found.slot.position}},started:st.tick,wait:0};E.ensureIntentForAction(st,agent);}
  return found.slot;
}
function armRequester(st,requester,slotId='bed:left'){
  const slot=SP.getSlot(st,slotId);requester.offMap=false;requester.position={x:slot.position.x,y:slot.position.y-1,z:slot.position.z||0};requester.posture={kind:'standing',slotId:null,furnitureId:null};requester.action=null;requester.activeIntent=null;
  Object.assign(requester.needs,{hunger:8,thirst:8,fatigue:12,sleepNeed:90,social:8});
}
function assignFixedSleep(st,agentId='zhen',slotId='bed:left'){st.usageAssignments=[{id:`fixed-${agentId}-${slotId}`,principal:{kind:'agent',id:agentId},activity:'sleep',target:{kind:'slot',id:slotId}}];}
function disableOtherSleepSlots(st,keepId='bed:left'){for(const furniture of Object.values(st.furniture||{}))for(const slot of furniture.slots||[])if(slot.id!==keepId&&slot.canSleep)slot.canSleep=false;}
function responseEvent(st,requestId){return st.events.find(e=>e.data?.action==='sleepSlotResponse'&&e.data?.responseToRequest===requestId)||null;}

// A: assigned preferred bed occupied by Human, alternate legal bed remains a real sleep target.
E.reset(44001);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;st.agents.orange.offMap=true;armRequester(st,a);assignFixedSleep(st);occupy(st,b,'bed:left');
assert.equal(SP.sleepSlotAvailability(st,a,'bed:left').reason,'occupied');
assert.equal(SP.sleepTargets(st,a).some(x=>x.id==='bed:left'),false,'occupied preferred Slot must stay outside legal sleepTargets');
assert.equal(SP.sleepTargets(st,a).some(x=>x.id==='bed:right'),true,'alternate bed should remain objectively legal');
let conflict=E.preferredSleepConflict(st,a);assert.ok(conflict,'fixed self-association + Agent occupancy should create a private preferred-slot conflict');
assert.equal(conflict.preferredTarget.id,'bed:left');assert.equal(conflict.observation.observable,true);assert.equal(conflict.observation.targetId,b.id);
assert.deepEqual(conflict.observation,E.observeAgentContext(st,a,b),'sleep conflict must consume the shared Agent-context observation owner');
let resolution=E.sleepConflictResolutionCandidates(st,a,{sleepConflictHistory:[]},conflict,{jitter:false});
for(const kind of ['alternateSleepTarget','wait','attention','requestYield','driveAwayNonphysical'])assert.ok(resolution.some(x=>x.kind===kind),kind+' must be a legal first-version Human resolution candidate');

// Evidence is decision-time data: later World state must not backfill the saved observation snapshot.
a.activeIntent={id:'intent:zhen:44001:sleep',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test',tick:st.tick}};
a.action=E.buildAction(a,{id:'sleep'});a.action.intentId=a.activeIntent.id;E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:[]});
const frozenObservation=structuredClone(conflict.observation);
const ce=E.captureConflictResolutionEvidence(st,a,a.action,{preferredTarget:conflict.preferredTarget,associationReasons:conflict.associationReasons,observation:conflict.observation,candidates:resolution,selection:resolution[0]});
assert.ok(ce&&ce.parentDecisionId===a.action.decisionId);b.action={kind:'rest',phase:'resting',started:st.tick,wait:0};b.posture={kind:'sitting',slotId:'bed:left',furnitureId:'bed'};
assert.deepEqual(ce.observation,frozenObservation,'Conflict Resolution Evidence must remain a frozen decision-time snapshot');

// B: habit alone can identify the preferred Slot; it biases persistence but does not become legality.
E.reset(44002);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;st.agents.orange.offMap=true;armRequester(st,a);st.usageAssignments=[];
E.addEvent('habit proof','normal',[],{actor:a.id,action:'sleep',phase:'start',slot:'bed:left',furniture:'bed',position:E.positionRef(a.position)});
occupy(st,b,'bed:left');conflict=E.preferredSleepConflict(st,a);
assert.ok(conflict?.associationReasons.some(x=>x.kind==='habit'),'habit-only preferred Slot should still form a conflict when occupied');
assert.equal(SP.sleepTargets(st,a).some(x=>x.id==='bed:left'),false);

// C: sleeping Animal uses the same observation + attention path and never gains Human-only request shortcuts.
E.reset(44003);st=E.getState();a=st.agents.zhen;const cat=st.agents.orange;st.agents.zhou.offMap=true;armRequester(st,a);assignFixedSleep(st);occupy(st,cat,'bed:left',{sleeping:true});
conflict=E.preferredSleepConflict(st,a);assert.equal(conflict.observation.observedAgentKind,'animal');assert.equal(conflict.observation.observedActionKind,'sleep');assert.equal(conflict.observation.observedPosture,'lying');
resolution=E.sleepConflictResolutionCandidates(st,a,{sleepConflictHistory:[]},conflict,{jitter:false});
assert.ok(resolution.some(x=>x.kind==='attention'));assert.equal(resolution.some(x=>x.kind==='requestYield'||x.kind==='driveAwayNonphysical'),false,'Animal occupant must not receive Human-only yield/drive-away semantics');
assert.deepEqual(conflict.observation,E.observeAgentContext(st,a,cat));

// D: Human response remains responder-local. Accepting a request is a response first; leaving the Slot happens on the next responder Action step.
E.reset(44004);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;st.agents.orange.offMap=true;armRequester(st,a);occupy(st,b,'bed:left');
let requestId=E.addEvent('sleep slot request','normal',[],{actor:a.id,target:b.id,action:'sleepSlotRequest',requestKind:'yield',interactionPurpose:'clearPreferredSleepSlot',slot:'bed:left',expectsResponse:true,perceivedByTarget:true,requestExpiresTick:st.tick+4});
let responderOptions=E.sleepConflictResponderOptions(st,b);assert.ok(responderOptions.some(x=>x.response==='accept')&&responderOptions.some(x=>x.response==='refuse'));
const accept=responderOptions.find(x=>x.response==='accept');b.action=E.buildAction(b,accept);assert.equal(b.action?.kind,'respondSleepSlotRequest');E.ensureIntentForAction(st,b);a.offMap=true;
E.tick();let understood=st.events.find(e=>e.data?.action==='sleepSlotRequestUnderstood'&&e.data?.responseToRequest===requestId),accepted=responseEvent(st,requestId);assert.ok(understood,'understood must be a distinct structured outcome before acceptance/refusal');assert.equal(accepted?.data?.understoodEventId,understood.id);assert.equal(accepted?.data?.response,'accepted');assert.equal(b.posture.slotId,'bed:left','accepted response must not itself release the Slot');
E.tick();assert.ok(st.events.some(e=>e.data?.action==='sleepSlotYield'&&e.data?.responseToRequest===requestId));assert.equal(b.posture.slotId,null,'responder must release the Slot through its own Action');
noIssues('accepted yield');

E.reset(44005);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;st.agents.orange.offMap=true;armRequester(st,a);occupy(st,b,'bed:left');
requestId=E.addEvent('sleep slot request','normal',[],{actor:a.id,target:b.id,action:'sleepSlotRequest',requestKind:'yield',interactionPurpose:'clearPreferredSleepSlot',slot:'bed:left',expectsResponse:true,perceivedByTarget:true,requestExpiresTick:st.tick+4});
responderOptions=E.sleepConflictResponderOptions(st,b);const refuse=responderOptions.find(x=>x.response==='refuse');b.action=E.buildAction(b,refuse);E.ensureIntentForAction(st,b);a.offMap=true;E.tick();
assert.equal(responseEvent(st,requestId)?.data?.response,'refused');assert.equal(b.posture.slotId,'bed:left','refusal must preserve responder state and occupancy');
noIssues('refused yield');

// E: no alternate does not erase the conflict into "no sleep position"; resolution remains inside sleep deliberation.
E.reset(44006);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;st.agents.orange.offMap=true;armRequester(st,a);assignFixedSleep(st);disableOtherSleepSlots(st);occupy(st,b,'bed:left');
assert.equal(SP.sleepTargets(st,a).length,0);assert.equal(E.hasPreferredSleepConflict(st,a),true);assert.ok(E.baseUtilityForAction(a,'sleep')>0,'preferred occupancy conflict must keep sleep as a viable intent even with zero legal sleepTargets');
assert.ok(E.candidateIntents(st,a).some(x=>x.intentKind==='sleep'));
a.activeIntent={id:'intent:zhen:44006:sleep',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test',tick:st.tick}};a.action=E.buildAction(a,{id:'sleep'});a.action.intentId=a.activeIntent.id;E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:[]});
const originalRand=E.rand;E.rand=()=>0;const handled=E.resolvePreferredSleepConflict(st,a,a.action,[]);E.rand=originalRand;
assert.equal(handled?.handled,true);assert.ok(['sleepConflictWait','sleepConflictAwaitResponse'].includes(a.action.phase),'no-alternate conflict must enter resolution lifecycle instead of aborting');

// No response is not refusal/ignored. The requester records a neutral noResponse outcome and re-deliberates.
const waitAction=a.action;waitAction.phase='sleepConflictAwaitResponse';waitAction.sleepConflictPreferredSlotId='bed:left';waitAction.sleepConflictRequestEventId=E.addEvent('unanswered request','normal',[],{actor:a.id,target:b.id,action:'sleepSlotRequest',requestKind:'yield',slot:'bed:left',expectsResponse:true,perceivedByTarget:true,requestExpiresTick:st.tick+1});waitAction.sleepConflictWaitUntil=st.tick+1;
st.tick+=1;assert.equal(E.stepPreferredSleepConflict(st,a,waitAction),true);assert.equal(waitAction.sleepConflictLastOutcome,'noResponse');assert.equal(responseEvent(st,waitAction.sleepConflictRequestEventId),null);
const waitEnded=st.events.find(e=>e.data?.action==='sleepConflictWaitEnded');assert.equal(waitEnded?.data?.outcome,'noResponse');assert.equal(Object.hasOwn(waitEnded?.data||{},'rejected'),false);assert.equal(Object.hasOwn(waitEnded?.data||{},'ignored'),false);assert.equal(Object.hasOwn(waitEnded?.data||{},'intentionalIgnore'),false);

// Occupancy waiting is a distinct sleep-conflict source but remains interruptible by a clearly higher-priority need.
E.reset(44007);st=E.getState();a=st.agents.zhen;b=st.agents.zhou;st.agents.orange.offMap=true;armRequester(st,a);assignFixedSleep(st);disableOtherSleepSlots(st);occupy(st,b,'bed:left');st.tick=10;a.needs.sleepNeed=70;a.needs.thirst=100;
a.activeIntent={id:'intent:zhen:7:sleep',kind:'sleep',createdTick:7,lifecycle:'actionBound',source:{type:'test',tick:7}};a.action={kind:'sleep',phase:'sleepConflictWait',started:7,wait:0,sleepTicks:0,intentId:a.activeIntent.id,sleepConflictPreferredSlotId:'bed:left',sleepConflictWaitUntil:20,sleepConflictWaitSource:'occupancy'};
assert.equal(E.isSleepConflictWaiting(a.action),true);assert.equal(E.applySoftReconsideration(st,a),true,'higher-priority need should interrupt occupancy wait through normal soft reconsideration');assert.equal(a.action.kind,'drinkWater');

// Conflict code must consume the shared observation owner rather than recreate Room/distance rules, and missing owners fail loudly.
const deliberationSource=fs.readFileSync(new URL('../src/systems/intent/deliberation.js',import.meta.url),'utf8');
assert.match(deliberationSource,/E\.observeAgentContext\(st,a,occupant\)/);assert.doesNotMatch(deliberationSource,/SP\.roomAt|SP\.manhattan/,'sleep conflict must not duplicate Agent-context observability rules');
const savedUsage=globalThis.SimUsage;globalThis.SimUsage=null;assert.throws(()=>E.preferredSleepConflicts(st,a),/requires SimUsage associationReasons/);globalThis.SimUsage=savedUsage;

console.log('Usage preference sleep regression: ok');
