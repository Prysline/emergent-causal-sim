import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,SC=globalThis.SimSleepConflict,V=globalThis.SimValidator;

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('sleep-conflict-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));

const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,label+': '+v.issues.map(x=>x.code+': '+x.message).join(' | '));};
const placeAtSlot=(st,a,slotId,{sleeping=false}={})=>{
  const slot=SP.getSlot(st,slotId);a.offMap=false;a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};a.action=null;a.activeIntent=null;
  if(sleeping){a.needs.sleepNeed=80;a.action={kind:'sleep',phase:'sleeping',sleepTicks:0,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};E.ensureIntentForAction(st,a);}
  return slot;
};
const nearSlot=(st,a,slotId)=>{
  const slot=SP.getSlot(st,slotId),node=SP.slotApproachNodes?.(st,slot,a,'walk')?.[0]||slot.position;a.offMap=false;a.position={...node};a.posture={kind:'standing',slotId:null,furnitureId:null};a.action=null;a.activeIntent=null;return slot;
};
const armSleep=(st,a)=>{
  a.needs.sleepNeed=90;a.needs.hunger=12;a.needs.thirst=12;a.needs.fatigue=25;
  a.action=E.buildAction(a,{id:'sleep'});E.ensureIntentForAction(st,a);
  E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:E.decisionContributorsForAction(a,'sleep'),utility:E.baseUtilityForAction(a,'sleep')});
  return a.action;
};
const addConflictBid=(st,requester,responder,{kind='sleepSlotYield',slot='bed:left'}={})=>{
  const action=kind==='sleepSlotDriveAway'?'sleepSlotDriveAway':'sleepSlotYieldRequest';
  const id=E.addEvent('sleep conflict test bid','normal',[],{actor:requester.id,target:responder.id,action,slot,socialBid:true,bidKind:kind,interactionKind:kind==='sleepSlotDriveAway'?'nonPhysicalDriveAway':'requestYield',expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:true});
  st.causes[id].data.bidId=id;E.addObservedBid(st,responder,st.causes[id],st.tick);return id;
};

// A: assigned preferred Slot stays illegal while conflict deliberation can compare alternate / wait / attention / Human request / nonphysical drive-away.
E.reset(44001);
let st=E.getState(),requester=st.agents.zhen,human=st.agents.zhou,cat=st.agents.orange;
cat.offMap=true;const left=nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');
assert.equal(SP.sleepTargets(st,requester).some(x=>x.id==='bed:left'),false);
assert.equal(SP.sleepTargetExclusion(st,requester,'bed:left').reason,'occupied');
assert.ok(U.associationReasons(st,requester,'sleep',{kind:'slot',id:'bed:left'}).some(x=>x.key==='assignedToSelf'));
let conflict=SC.selfSleepAssociations(st,requester).find(x=>x.slot.id==='bed:left');assert.ok(conflict);
let evaluation=SC.conflictCandidates(st,requester,conflict);
for(const kind of ['alternate','wait','attention','requestYield','driveAway'])assert.ok(evaluation.candidates.some(x=>x.kind===kind),'missing '+kind);
armSleep(st,requester);const observedSnapshot=structuredClone(evaluation.observation);SC.resolveSleepChoice(st,requester,requester.action);
assert.ok(requester.conflictResolutionEvidence.length>=1);
const evidence=requester.conflictResolutionEvidence.at(-1);
assert.equal(evidence.preferredSlot.id,'bed:left');assert.equal(evidence.observation.observedTick,observedSnapshot.observedTick);
human.action={kind:'rest',phase:'resting',started:st.tick,wait:0,restTicks:0,targetFatigue:0,restTarget:{kind:'standing',position:{...human.position},quality:.18,posture:'standing'}};
assert.deepEqual(evidence.observation,observedSnapshot,'Conflict Resolution Evidence must freeze decision-time observation');
assert.equal(Object.hasOwn(evidence.observation,'needs'),false,'evidence must not retain full Agent state');

// B: habit-only preferred Slot participates without inventing assignment truth.
E.reset(44002);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;st.usageAssignments=[];
E.consolidateUsageHabit(st,requester,'sleep',{kind:'slot',id:'bed:left'},{usedTick:st.tick,sourceMemoryId:'memory:test:1'});
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');
const habitReasons=U.associationReasons(st,requester,'sleep',{kind:'slot',id:'bed:left'});
assert.ok(habitReasons.some(x=>x.kind==='habit'));assert.equal(habitReasons.some(x=>x.kind==='assignment'),false);assert.equal(SC.hasPreferredSleepConflict(st,requester),true);

// C: sleeping Animal can produce wait/attention but never Human request/drive-away; wake never releases the Slot by itself.
E.reset(44003);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;human.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,cat,'bed:left',{sleeping:true});SP.getSlot(st,'bed:right').canSleep=false;
conflict=SC.selfSleepAssociations(st,requester).find(x=>x.slot.id==='bed:left');evaluation=SC.conflictCandidates(st,requester,conflict);
assert.ok(evaluation.candidates.some(x=>x.kind==='wait'));assert.ok(evaluation.candidates.some(x=>x.kind==='attention'));
assert.equal(evaluation.candidates.some(x=>x.kind==='requestYield'),false);assert.equal(evaluation.candidates.some(x=>x.kind==='driveAway'),false);
armSleep(st,requester);SC.resolveSleepChoice(st,requester,requester.action);
assert.ok(st.events.some(e=>e.data?.action==='attentionStimulus'),'sleeping Animal no-alternate case should be able to select generic attention');
assert.equal(SP.slotAvailable(st,'bed:left',requester.id),false,'wake consequence must not imply Slot release');
assert.equal(st.events.some(e=>['acceptSleepSlotYield','declineSleepSlotYield'].includes(e.data?.action)),false,'Animal attention must not create Human yield response');

// D: Human responder decides locally. Acceptance/refusal is separate from actual Slot release.
E.reset(44004);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');human.needs.sleepNeed=10;
let bidId=addConflictBid(st,requester,human);
requester.activeIntent={id:'intent:zhen:test:awaitResponse:'+bidId,kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId,context:'sleepSlotConflict'},patienceUntilTick:st.tick+3};
SC.processSleepConflictResponses(st);
const accepted=st.events.find(e=>e.data?.action==='acceptSleepSlotYield'&&e.data?.responseToBid===bidId);assert.ok(accepted);
assert.equal(human.posture.slotId,'bed:left','accept response itself must not directly rewrite responder posture');
assert.equal(human.activeIntent?.kind,'yieldSleepSlot','accepted responder should own its departure Intent');
assert.equal(human.action?.kind,'wander','accepted responder should own its departure Action');
assert.equal(requester.activeIntent,null,'observable response should settle requester response wait');

E.reset(44005);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');human.needs.sleepNeed=100;
bidId=addConflictBid(st,requester,human);SC.processSleepConflictResponses(st);
assert.ok(st.events.some(e=>e.data?.action==='declineSleepSlotYield'&&e.data?.responseToBid===bidId));
assert.equal(human.action,null);assert.equal(human.posture.slotId,'bed:left');

// E: no alternate keeps sleep utility alive and enters conflict handling instead of losing context to "no sleep position".
E.reset(44006);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');SP.getSlot(st,'bed:right').canSleep=false;requester.needs.sleepNeed=90;
assert.equal(SP.sleepTargets(st,requester).length,0);assert.ok(E.baseUtilityForAction(requester,'sleep')>0,'preferred conflict must keep sleep candidate alive');
armSleep(st,requester);SC.resolveSleepChoice(st,requester,requester.action);
assert.equal(st.events.some(e=>e.data?.action==='abort'&&e.data?.actionKind==='sleep'),false,'no-alternate conflict must not immediately abort as no sleep position');

// No-response is not refusal / ignored; busy responder simply does not create a response event.
E.reset(44007);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');human.action={kind:'rest',phase:'resting',started:st.tick,wait:0,restTicks:0,targetFatigue:0,restTarget:{kind:'standing',position:{...human.position},quality:.18,posture:'standing'}};E.ensureIntentForAction(st,human);
bidId=addConflictBid(st,requester,human);SC.processSleepConflictResponses(st);
assert.equal(st.events.some(e=>e.data?.responseToBid===bidId&&['acceptSleepSlotYield','declineSleepSlotYield'].includes(e.data?.action)),false);
assert.equal(st.events.some(e=>/ignored|rejected|intentionalIgnore/i.test(String(e.data?.action||''))),false);

// Higher-priority emergency may interrupt occupancy wait.
E.reset(44008);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');SP.getSlot(st,'bed:right').canSleep=false;armSleep(st,requester);
requester.action.phase='conflictWait';requester.action.preferredConflictSlotId='bed:left';requester.action.conflictWaitStartedTick=0;requester.action.conflictWaitUntilTick=99;requester.needs.hunger=99;
E.tick();
assert.notEqual(requester.activeIntent?.kind,'sleep','emergency hunger must be able to preempt occupancy wait');
assert.equal(requester.action?.kind,'eat');

noIssues('sleep preferred Slot conflict');
assert.equal(E.SLEEP_SLOT_CONFLICT_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.MEMORY_SCHEMA_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.42.0-usage-preference-sleep');

console.log('Sleep preferred Slot conflict regression: ok');
