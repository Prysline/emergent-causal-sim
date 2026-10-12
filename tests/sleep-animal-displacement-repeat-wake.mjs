import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,SC=globalThis.SimSleepConflict,V=globalThis.SimValidator;

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('sleep-animal-conflict-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));

const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,label+': '+v.issues.map(x=>x.code+': '+x.message).join(' | '));};
const placeAtSlot=(st,a,slotId,{sleeping=false}={})=>{
  const slot=SP.getSlot(st,slotId);a.offMap=false;a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};a.action=null;a.activeIntent=null;
  if(sleeping){a.needs.sleepNeed=80;a.action={kind:'sleep',phase:'sleeping',sleepTicks:0,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};E.ensureIntentForAction(st,a);}
  return slot;
};
const nearSlot=(st,a,slotId)=>{const slot=SP.getSlot(st,slotId),node=SP.slotApproachNodes?.(st,slot,a,'walk')?.[0]||slot.position;a.offMap=false;a.position={...node};a.posture={kind:'standing',slotId:null,furnitureId:null};a.action=null;a.activeIntent=null;return slot;};
const armSleep=(st,a)=>{a.needs.sleepNeed=90;a.needs.hunger=12;a.needs.thirst=12;a.needs.fatigue=25;a.action=E.buildAction(a,{id:'sleep'});E.ensureIntentForAction(st,a);E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:E.decisionContributorsForAction(a,'sleep'),utility:E.baseUtilityForAction(a,'sleep')});return a.action;};
const disableAlternateSleepSlots=st=>{for(const furniture of Object.values(st.furniture||{}))for(const slot of furniture.slots||[])if(slot.id!=='bed:left')slot.canSleep=false;};

assert.equal(SC.VERSION,'11.57.0-sleep-animal-resolution');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.48.1-sleep-perception-approach','generic Deliberation generation must not fake-bump for Sleep-only policy');
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.48.1-sleep-perception-approach','Decision Evidence schema is reused unchanged');
assert.equal(E.socialBidResponseContract('sleepSlotAnimalMoveAway')?.canonicalResponses,false,'Animal move-away is a perceived directed interaction, not a fabricated accept/refuse contract');

// A: relocation ranking consumes only public embodiment + canonical Slot/Physical/objective quality, not target-private Usage/hidden physical state.
E.reset(45701);
let st=E.getState(),requester=st.agents.zhen,cat=st.agents.orange,human=st.agents.zhou;
human.offMap=true;nearSlot(st,requester,'bed:left');placeAtSlot(st,cat,'bed:left',{sleeping:true});
let conflict=SC.observedPreferredSleepConflict(st,requester);assert.ok(conflict);
const publicEmbodiment=SC.publicRelocationEmbodiment(conflict.observation);assert.ok(publicEmbodiment);assert.equal(publicEmbodiment.kind,'cat');
const beforePlacement=SC.sleepingRelocationProposal(st,requester,conflict,conflict.observation);assert.ok(beforePlacement);
if(beforePlacement.target.kind==='slot'){
  const slot=SP.getSlot(st,beforePlacement.target.id);assert.equal(slot.canSleep,true);assert.equal(SP.slotAllows(slot,publicEmbodiment),true);assert.equal(SP.slotPoseFits(slot,publicEmbodiment,'lying'),true);assert.equal(SP.slotAvailable(st,slot.id,cat.id),true);
  assert.equal(beforePlacement.objectiveSleepQuality,slot.sleepQuality??slot.restQuality??.35);
}
cat.usageHabits={sleep:{'slot:bed:right':{score:999,lastUsedTick:st.tick}}};
cat.physical={...cat.physical,mass:999,bodyGeometry:{height:9,width:9,length:9}};
const afterPrivateMutation=SC.sleepingRelocationProposal(st,requester,conflict,conflict.observation);
assert.deepEqual(afterPrivateMutation,beforePlacement,'candidate-time relocation destination must not read target-private Usage or hidden instance physical state');
assert.equal(SP.sleepTargets(st,requester).some(x=>x.id==='bed:left'),false,'occupied preferred Slot must remain illegal');

// B: a completed wait is outcome evidence, not a retry counter; next ranking reacts to persistence.
E.reset(45702);st=E.getState();requester=st.agents.zhen;cat=st.agents.orange;human=st.agents.zhou;human.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,cat,'bed:left',{sleeping:true});disableAlternateSleepSlots(st);armSleep(st,requester);
requester.action.phase='conflictWait';requester.action.preferredConflictSlotId='bed:left';requester.action.conflictWaitSource='sleepSlotOccupancy';requester.action.conflictWaitStartedTick=st.tick;requester.action.conflictWaitUntilTick=st.tick;
const initialConflict=SC.observedPreferredSleepConflict(st,requester);const initialEval=SC.conflictCandidates(st,requester,initialConflict);E.captureConflictResolutionEvidence(st,requester,requester.action,{preferredSlot:{kind:'slot',id:'bed:left'},associationReasons:initialConflict.reasons,observation:initialEval.observation,candidates:initialEval.candidates,selectedResolution:'wait',contributors:initialEval.candidates.find(x=>x.kind==='wait')?.contributors||[]});
SC.stepSleepConflict(st,requester,requester.action);
const waitOutcome=st.events.find(e=>e.data?.action==='sleepSlotConflictOutcome'&&e.data?.outcomeKind==='waitExpiredOccupancyPersisted');assert.ok(waitOutcome);
assert.equal(Object.hasOwn(waitOutcome.data,'retryCount'),false);assert.equal(Object.hasOwn(requester.action,'retryCount'),false);
conflict=SC.observedPreferredSleepConflict(st,requester);let evaluation=SC.conflictCandidates(st,requester,conflict);
assert.equal(evaluation.signals.waitPersisted,true);assert.ok(evaluation.candidates.find(x=>x.kind==='wait').contributors.some(c=>c.key==='waitExpiredOccupancyPersisted'&&c.value<0));

// C: wake success is distinct from occupancy release, and same-episode repeat wake loses value after persisted occupancy.
const originalCapacity=requester.physical.manipulation.handCapacity;requester.physical.manipulation.handCapacity=1;
evaluation=SC.conflictCandidates(st,requester,conflict);assert.equal(evaluation.candidates.some(x=>x.kind==='carryOccupant'),false,'fixture must make two-arm carry unavailable for the first wake comparison');
assert.equal(evaluation.selected.kind,'attention','after a persisted wait, wake may be the next legal low-escalation option when carry is unavailable');
const originalAttention=E.performAttentionInteraction;
E.performAttentionInteraction=(actor,target,{stimulus}={})=>{const eventId=E.addEvent('forced wake fixture','normal',[],{actor:actor.id,target:target.id,action:'attentionStimulus',interactionPurpose:'gainAttention',stimulusKind:stimulus?.kind||'sound',stimulusIntensity:stimulus?.intensity||24,position:E.positionRef(actor.position)});target.action=null;target.activeIntent=null;return {performed:true,reason:null,eventId,wake:{woke:true}};};
requester.action.phase='chooseSurface';SC.resolveSleepChoice(st,requester,requester.action);E.performAttentionInteraction=originalAttention;
const wakeOutcome=st.events.find(e=>e.data?.action==='sleepSlotConflictOutcome'&&e.data?.outcomeKind==='wakeSucceededOccupancyPersisted');assert.ok(wakeOutcome);assert.equal(wakeOutcome.data.wakeSucceeded,true);assert.equal(wakeOutcome.data.occupancyPersisted,true);assert.equal(SP.slotAvailable(st,'bed:left',requester.id),false,'wake success must not imply Slot release');
placeAtSlot(st,cat,'bed:left',{sleeping:true});requester.physical.manipulation.handCapacity=originalCapacity;requester.action.phase='chooseSurface';
conflict=SC.observedPreferredSleepConflict(st,requester);evaluation=SC.conflictCandidates(st,requester,conflict);
const repeatAttention=evaluation.candidates.find(x=>x.kind==='attention'),carry=evaluation.candidates.find(x=>x.kind==='carryOccupant');assert.ok(repeatAttention&&carry);assert.ok(repeatAttention.contributors.some(c=>c.key==='repeatWakeAfterOccupancyPersisted'&&c.value<0));assert.ok(carry.score>repeatAttention.score,'legal low-disruption carry must be able to outrank repeat wake after wake succeeded but occupancy persisted');

// D: awake Animal self-displacement is perceived first, then owned by the Animal Movement Intent/Action; started departure is pending, not refusal/failure.
E.reset(45703);st=E.getState();requester=st.agents.zhen;cat=st.agents.orange;human=st.agents.zhou;human.offMap=true;
nearSlot(st,requester,'bed:left');placeAtSlot(st,cat,'bed:left');disableAlternateSleepSlots(st);armSleep(st,requester);
conflict=SC.observedPreferredSleepConflict(st,requester);evaluation=SC.conflictCandidates(st,requester,conflict);
assert.equal(evaluation.selected.kind,'animalMoveAway');assert.equal(evaluation.candidates.some(x=>x.kind==='requestYield'||x.kind==='driveAway'),false,'Animal policy must not inherit Human yield/drive-away response assumptions');
const catPositionBefore=structuredClone(cat.position);SC.resolveSleepChoice(st,requester,requester.action);
const moveBid=st.events.find(e=>e.data?.bidKind==='sleepSlotAnimalMoveAway'&&e.data?.bidTo===cat.id);assert.ok(moveBid);assert.equal(moveBid.data.perceivedByTarget,true);assert.deepEqual(cat.position,catPositionBefore,'requester interaction must not teleport the Animal');assert.equal(requester.action?.phase,'conflictWait');assert.equal(requester.action?.conflictWaitSource,'animalMoveAwayReassessment');
assert.equal(cat.action,null,'perceived shoo must remain distinct from actual Animal movement before responder processing');
SC.processSleepConflictResponses(st);
assert.equal(cat.activeIntent?.kind,'yieldSleepSlot');assert.equal(cat.activeIntent?.source?.type,'sleepSlotAnimalMoveAway');assert.equal(cat.action?.kind,'wander','Animal must produce its own Movement Action');assert.deepEqual(cat.position,catPositionBefore,'binding departure Action must not itself teleport the Animal');
assert.equal(st.events.some(e=>e.data?.responseToBid===moveBid.id&&['accepted','refused','delayed'].includes(e.data?.responseKind)),false,'Animal move-away must not fabricate Human-style verbal accept/refuse/delay');
requester.action.phase='chooseSurface';conflict=SC.observedPreferredSleepConflict(st,requester);evaluation=SC.conflictCandidates(st,requester,conflict);
assert.equal(evaluation.signals.departurePending,true);assert.equal(evaluation.candidates.some(x=>x.kind==='animalMoveAway'||x.kind==='requestCarryCooperation'||x.kind==='carryOccupant'),false,'started departure must not be treated as move-away failure or trigger immediate carry escalation');assert.equal(evaluation.selected.kind,'wait');

noIssues('sleep Animal displacement + repeat-wake policy');
console.log('Sleep Animal displacement + repeat-wake regression: ok');
