import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,AC=globalThis.SimAgentCarry,SC=globalThis.SimSleepConflict,V=globalThis.SimValidator;
const APP_VERSION='11.47.0-social-bid-carry-cooperation';

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
const addConflictBid=(st,requester,responder,{kind='sleepSlotYield',slot='bed:left',perceived=true}={})=>{
  const action=kind==='sleepSlotDriveAway'?'sleepSlotDriveAway':'sleepSlotYieldRequest';
  const id=E.addEvent('sleep conflict test bid','normal',[],{actor:requester.id,target:responder.id,action,slot,socialBid:true,bidKind:kind,interactionKind:kind==='sleepSlotDriveAway'?'nonPhysicalDriveAway':'requestYield',expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:perceived});
  st.causes[id].data.bidId=id;return id;
};

// A: assigned preferred Slot stays illegal while conflict deliberation can compare alternate / wait / attention / Human request / nonphysical drive-away.
E.reset(44001);
let st=E.getState(),requester=st.agents.zhen,human=st.agents.zhou,cat=st.agents.orange;
assert.equal(st.version,APP_VERSION);
cat.offMap=true;nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');
assert.equal(SP.sleepTargets(st,requester).some(x=>x.id==='bed:left'),false);
assert.equal(SP.sleepTargetExclusion(st,requester,'bed:left').reason,'occupied');
assert.ok(U.associationReasons(st,requester,'sleep',{kind:'slot',id:'bed:left'}).some(x=>x.key==='assignedToSelf'));
let conflict=SC.selfSleepAssociations(st,requester).find(x=>x.slot.id==='bed:left');assert.ok(conflict);
let evaluation=SC.conflictCandidates(st,requester,conflict);
assert.deepEqual(evaluation.observation,E.observeAgentContext(st,requester,human),'sleep conflict must consume the shared Agent-context observation owner');
for(const kind of ['alternate','wait','attention','requestYield','driveAway'])assert.ok(evaluation.candidates.some(x=>x.kind===kind),'missing '+kind);
assert.equal(evaluation.candidates.some(x=>x.kind==='carryOccupant'),false,'awake occupant must not enter sleeping carry path without cooperation evidence');
armSleep(st,requester);const observedSnapshot=structuredClone(evaluation.observation);SC.resolveSleepChoice(st,requester,requester.action);
assert.ok(requester.conflictResolutionEvidence.length>=1);
const evidence=requester.conflictResolutionEvidence.at(-1);
assert.equal(evidence.preferredSlot.id,'bed:left');assert.equal(evidence.observation.observedTick,observedSnapshot.observedTick);
human.action={kind:'rest',phase:'resting',started:st.tick,wait:0,restTicks:0,targetFatigue:0,restTarget:{kind:'standing',position:{...human.position},quality:.18,posture:'standing'}};
assert.deepEqual(evidence.observation,observedSnapshot,'Conflict Resolution Evidence must freeze decision-time observation');
assert.equal(Object.hasOwn(evidence.observation,'needs'),false,'evidence must not retain full Agent state');

// B: habit-only preferred Slot participates without inventing assignment truth; Sleep consumes Usage-owned deltas rather than duplicating 8 / 5 / 4.
E.reset(44002);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;st.usageAssignments=[];
E.consolidateUsageHabit(st,requester,'sleep',{kind:'slot',id:'bed:left'},{usedTick:st.tick,sourceMemoryId:'memory:test:1'});
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');
const habitReasons=U.associationReasons(st,requester,'sleep',{kind:'slot',id:'bed:left'});
assert.ok(habitReasons.some(x=>x.kind==='habit'));assert.equal(habitReasons.some(x=>x.kind==='assignment'),false);assert.equal(SC.hasPreferredSleepConflict(st,requester),true);
const habitContributors=U.preferenceContributors(st,requester,'sleep',{kind:'slot',id:'bed:left'}).filter(c=>c?.direction==='self'&&['assignment','claim','habit'].includes(c.kind)&&(Number(c.delta)||0)>0);
const habitCanonicalStrength=Math.max(0,Math.min(10,habitContributors.reduce((sum,c)=>sum+(Number(c.delta)||0),0)));
assert.equal(SC.associationStrength(st,requester,{kind:'slot',id:'bed:left'}),habitCanonicalStrength,'Sleep insistence must equal the bounded Usage canonical contributor total');

// C: sleeping Animal can form a carry candidate but never Human request/drive-away; private occupant Usage ranking is not consulted.
E.reset(44003);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;human.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,cat,'bed:left',{sleeping:true});
conflict=SC.selfSleepAssociations(st,requester).find(x=>x.slot.id==='bed:left');assert.ok(conflict);
evaluation=SC.conflictCandidates(st,requester,conflict);
assert.ok(evaluation.candidates.some(x=>x.kind==='wait'));assert.ok(evaluation.candidates.some(x=>x.kind==='attention'));
assert.equal(evaluation.candidates.some(x=>x.kind==='requestYield'),false);assert.equal(evaluation.candidates.some(x=>x.kind==='driveAway'),false);
const carryCandidate=evaluation.candidates.find(x=>x.kind==='carryOccupant');
assert.ok(carryCandidate,'observed sleeping Animal with requester-time attemptability + placement proposal should produce carry candidate');
assert.equal(carryCandidate.targetAgent,cat.id);
assert.notEqual(carryCandidate.targetPlacement?.id,'bed:left','original conflict Slot must be excluded from relocation proposal');
assert.ok(['slot','floor'].includes(carryCandidate.targetPlacement?.kind));
if(carryCandidate.targetPlacement.kind==='slot')assert.equal(SP.getSlot(st,carryCandidate.targetPlacement.id)?.canSleep,true,'Slot-first proposal must use a sleep-capable Slot');
const privateMass=cat.physical.mass;cat.physical.mass=999;
evaluation=SC.conflictCandidates(st,requester,conflict);
const hiddenMassCandidate=evaluation.candidates.find(x=>x.kind==='carryOccupant');
assert.ok(hiddenMassCandidate,'hidden target mass must not erase requester-time sleeping carry candidate');
assert.equal(E.buildAction(requester,{id:'carryAgent',targetAgent:cat.id,targetPlacement:hiddenMassCandidate.targetPlacement,cooperative:false}),null,'execution-time canonical carry feasibility must still reject hidden impossible mass');
cat.physical.mass=privateMass;
cat.held='cupA';
evaluation=SC.conflictCandidates(st,requester,conflict);
assert.ok(evaluation.candidates.some(x=>x.kind==='carryOccupant'),'hidden held state must not erase requester-time sleeping carry candidate');
assert.equal(E.buildAction(requester,{id:'carryAgent',targetAgent:cat.id,targetPlacement:evaluation.candidates.find(x=>x.kind==='carryOccupant').targetPlacement,cooperative:false}),null,'execution-time canonical feasibility must reject hidden nested held state');
cat.held=null;

// C2: when no alternate sleep Slot remains, relocation may fall back to bounded floor while generic attention can still win utility.
for(const furniture of Object.values(st.furniture||{}))for(const slot of furniture.slots||[])if(slot.id!=='bed:left')slot.canSleep=false;
conflict=SC.selfSleepAssociations(st,requester).find(x=>x.slot.id==='bed:left');evaluation=SC.conflictCandidates(st,requester,conflict);
const floorCarry=evaluation.candidates.find(x=>x.kind==='carryOccupant');assert.ok(floorCarry);assert.equal(floorCarry.targetPlacement.kind,'floor','no compatible nearby sleep Slot should fall back to bounded floor');
armSleep(st,requester);SC.resolveSleepChoice(st,requester,requester.action);
assert.ok(st.events.some(e=>e.data?.action==='attentionStimulus'),'sleeping Animal no-alternate case should still be able to select generic attention by utility');
assert.equal(requester.action?.phase,'conflictWait','attention-only resolution must enter explicit reassessment instead of falling through to core sleep target failure');
assert.equal(requester.action?.conflictWaitSource,'attentionReassessment');
assert.equal(SP.slotAvailable(st,'bed:left',requester.id),false,'wake consequence must not imply Slot release');
assert.equal(st.events.some(e=>['acceptSleepSlotYield','refuseSleepSlotYield'].includes(e.data?.action)),false,'Animal attention must not create Human yield response');
E.tick();
assert.equal(st.events.some(e=>e.data?.action==='abort'&&e.data?.actionKind==='sleep'),false,'attention reassessment must not collapse into the old no-sleep-position abort on the next core step');

// D: Human responder observes a World bid locally, decides locally, and owns its departure Intent/Action. Response insistence also consumes Usage-owned delta.
E.reset(44004);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');human.needs.sleepNeed=10;
const responderContributors=U.preferenceContributors(st,human,'sleep',{kind:'slot',id:'bed:left'}).filter(c=>c?.direction==='self'&&['assignment','claim','habit'].includes(c.kind)&&(Number(c.delta)||0)>0);
const responderCanonicalStrength=Math.max(0,Math.min(10,responderContributors.reduce((sum,c)=>sum+(Number(c.delta)||0),0)));
const responseProbe=SC.responseEvaluation(st,human,{data:{slot:'bed:left',bidFrom:requester.id,bidKind:'sleepSlotYield'}},st.tick);
assert.equal(responseProbe.ownAssociationStrength,responderCanonicalStrength,'responder-side insistence must equal the bounded Usage canonical contributor total');
let bidId=addConflictBid(st,requester,human);
assert.ok(E.observedBidRefs(st,human).some(ref=>ref.bidId===bidId),'perceived conflict bid must enter responder-private observation through the World-event listener');
requester.activeIntent={id:'intent:zhen:test:awaitResponse:'+bidId,kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId,context:'sleepSlotConflict'},patienceUntilTick:st.tick+3};
SC.processSleepConflictResponses(st);
const accepted=st.events.find(e=>e.data?.action==='acceptSleepSlotYield'&&e.data?.responseToBid===bidId);assert.ok(accepted);
assert.equal(accepted.data.perceivedByTarget,true,'response perception must be recorded through the shared Agent-context boundary');
assert.equal(human.posture.slotId,'bed:left','accept response itself must not directly rewrite responder posture');
assert.equal(human.activeIntent?.kind,'yieldSleepSlot','accepted responder should own its departure Intent even when egress is temporarily blocked');
assert.equal(requester.activeIntent?.kind,'awaitResponse','responder response must not directly clear requester-private Intent');
requester.offMap=true;
SC.processSleepConflictResponses(st);
assert.equal(requester.activeIntent,null,'requester may settle its own wait after consuming a perceived response event');
assert.equal(human.action?.kind,'wander','responder should bind its own departure Action once canonical egress becomes executable');
assert.ok(st.events.some(e=>e.data?.action==='understandSleepSlotRequest'&&e.data?.responseToBid===bidId),'perceived request must be able to become an explicit understood outcome before acceptance');
for(let i=0;i<4&&!st.events.some(e=>e.data?.action==='completeSleepSlotYield'&&e.data?.responseToBid===bidId);i++)E.tick();
assert.ok(st.events.some(e=>e.data?.action==='completeSleepSlotYield'&&e.data?.responseToBid===bidId),'accepted response must stay distinct from actual Slot release completion');

E.reset(44005);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');human.needs.sleepNeed=100;
bidId=addConflictBid(st,requester,human);SC.processSleepConflictResponses(st);
assert.ok(st.events.some(e=>e.data?.action==='refuseSleepSlotYield'&&e.data?.responseToBid===bidId));
assert.equal(human.action,null);assert.equal(human.posture.slotId,'bed:left');

// E: no alternate keeps sleep utility alive and enters conflict handling instead of losing context to "no sleep position".
E.reset(44006);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');st.furniture.bed.slots.find(x=>x.id==='bed:right').canSleep=false;requester.needs.sleepNeed=90;
assert.equal(SP.sleepTargets(st,requester).length,0);assert.ok(E.baseUtilityForAction(requester,'sleep')>0,'preferred conflict must keep sleep candidate alive');
armSleep(st,requester);SC.resolveSleepChoice(st,requester,requester.action);
assert.equal(st.events.some(e=>e.data?.action==='abort'&&e.data?.actionKind==='sleep'),false,'no-alternate conflict must not immediately abort as no sleep position');

// F: perception outcomes stay distinct. Not perceived never creates responder-private observation; perceived-but-busy is no response, not refusal/ignore.
E.reset(44007);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');
bidId=addConflictBid(st,requester,human,{perceived:false});
assert.equal(E.observedBidRefs(st,human).some(ref=>ref.bidId===bidId),false,'not-perceived conflict bid must not mutate responder-private observed bids');
SC.processSleepConflictResponses(st);
assert.equal(st.events.some(e=>e.data?.responseToBid===bidId),false,'not-perceived request must not produce understood/accepted/refused response');

E.reset(44008);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');human.action={kind:'rest',phase:'resting',started:st.tick,wait:0,restTicks:0,targetFatigue:0,restTarget:{kind:'standing',position:{...human.position},quality:.18,posture:'standing'}};E.ensureIntentForAction(st,human);
bidId=addConflictBid(st,requester,human);SC.processSleepConflictResponses(st);
assert.equal(st.events.some(e=>e.data?.responseToBid===bidId&&['acceptSleepSlotYield','refuseSleepSlotYield'].includes(e.data?.action)),false);
assert.equal(st.events.some(e=>/ignored|rejected|intentionalIgnore/i.test(String(e.data?.action||''))),false);

// G: occupancy wait is one private wait decision, then re-enters Deliberation; higher-priority emergency may interrupt it.
E.reset(44009);st=E.getState();requester=st.agents.zhen;human=st.agents.zhou;cat=st.agents.orange;cat.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,human,'bed:left');st.furniture.bed.slots.find(x=>x.id==='bed:right').canSleep=false;armSleep(st,requester);
requester.action.phase='conflictWait';requester.action.preferredConflictSlotId='bed:left';requester.action.conflictWaitSource='sleepSlotOccupancy';requester.action.conflictWaitStartedTick=0;requester.action.conflictWaitUntilTick=1;requester.needs.hunger=99;
E.tick();
assert.notEqual(requester.activeIntent?.kind,'sleep','emergency hunger must be able to preempt occupancy wait');
assert.equal(requester.action?.kind,'eat');

noIssues('sleep preferred Slot conflict');
assert.equal(E.SLEEP_SLOT_CONFLICT_VERSION,APP_VERSION);
assert.equal(AC.VERSION,'11.46.0-sleep-carry-integration');
assert.equal(SC.OCCUPANCY_REASSESS_TICKS,1,'occupancy wait must re-enter Deliberation instead of encoding a fixed multi-tick patience contract');
assert.equal(SC.OCCUPANCY_WAIT_TICKS,undefined,'sleep conflict must not expose a fixed occupancy patience contract');
assert.equal(SC.ATTENTION_REASSESS_TICKS,1,'attention-only resolution must have an explicit finite reassessment boundary');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,APP_VERSION);
assert.equal(E.MEMORY_SCHEMA_VERSION,'11.42.0-usage-preference-sleep');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.42.0-usage-preference-sleep');

console.log('Sleep preferred Slot conflict × sleeping Agent carry regression: ok');
