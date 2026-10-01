import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,V=globalThis.SimValidator;
assert.equal(E.VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.USAGE_PREFERENCE_VERSION,'11.44.0-sleep-slot-conflict');

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('sleep-conflict-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));

const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,label+': '+v.issues.map(x=>x.code+': '+x.message).join(' | '));};
const bind=(a,slot,action=null)=>{a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};a.action=action;a.activeIntent=null;};
const near=(a,slot)=>{a.position={x:slot.position.x,y:Math.max(0,slot.position.y-1)};a.posture={kind:'standing',slotId:null,furnitureId:null};a.offMap=false;};

E.reset(44001);
let st=E.getState(),a=st.agents.zhen,h=st.agents.zhou,cat=st.agents.orange,left=SP.getSlot(st,'bed:left');
near(a,left);bind(h,left);
assert.equal(SP.sleepTargets(st,a).some(x=>x.id==='bed:left'),false,'occupied preferred Slot must stay out of legal sleepTargets');
let conflict=E.preferredSleepConflict(st,a);
assert.equal(conflict?.preferredSlot.id,'bed:left');
assert.ok(conflict.associationReasons.some(x=>x.key==='assignedToSelf'));
let eval1=E.resolutionCandidates(st,a,conflict,SP.sleepTargets(st,a));
assert.ok(eval1.candidates.some(x=>x.kind==='alternateSleep'),'assigned occupied bed with alternate must compare alternate sleep');
assert.ok(eval1.candidates.some(x=>x.kind==='waitForSlot'));
assert.ok(eval1.candidates.some(x=>x.kind==='requestYield'),'observable Human occupant must expose request-yield candidate');
assert.ok(eval1.candidates.some(x=>x.kind==='nonphysicalDriveAway'),'observable Human occupant must expose nonphysical drive-away candidate');
noIssues('assigned alternate');

st.usageAssignments=[];
a.usageHabits={'sleep|slot:bed:left':{activity:'sleep',target:{kind:'slot',id:'bed:left'},strength:.7,lastUsedTick:st.tick,useCount:3,lastSourceMemoryId:'memory:test'}};
conflict=E.preferredSleepConflict(st,a);
assert.equal(conflict?.preferredSlot.id,'bed:left','habit-only preferred bed must still form conflict reasoning');
assert.ok(conflict.associationReasons.some(x=>x.key==='habitualForSelf'));
assert.ok(conflict.persistence>0&&conflict.persistence<U.PREFERENCE_CAP,'habit must remain bounded');

st.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
a.usageHabits={};
bind(cat,left,{kind:'sleep',phase:'sleeping',sleepTicks:2,sleepTarget:{kind:'slot',id:left.id,position:{...left.position}},started:st.tick,wait:0});
h.posture={kind:'standing',slotId:null,furnitureId:null};h.position={x:10,y:5};
near(a,left);
conflict=E.preferredSleepConflict(st,a);
let animalEval=E.resolutionCandidates(st,a,conflict,SP.sleepTargets(st,a));
assert.equal(animalEval.observation.observedAgentKind,'animal');
assert.ok(animalEval.candidates.some(x=>x.kind==='gainAttention'));
assert.ok(!animalEval.candidates.some(x=>x.kind==='requestYield'),'Animal occupant must not receive Human request-yield shortcut');
assert.ok(!animalEval.candidates.some(x=>x.kind==='nonphysicalDriveAway'),'Animal occupant must not receive Human drive-away shortcut');
const attention=E.performAttentionInteraction(a,cat,{stimulus:{kind:'sound',intensity:0}});
assert.equal(attention.performed,true);
assert.equal(st.events.some(e=>e.data?.responseToBid===attention.eventId),false,'wake/attention must not imply request acceptance');

bind(h,left);cat.posture={kind:'standing',slotId:null,furnitureId:null};cat.action=null;cat.position={x:9,y:5};near(a,left);
Object.assign(h.needs,{hunger:5,thirst:5,fatigue:5,sleepNeed:5,social:100});h.traits.social=1;h.action=null;h.activeIntent=null;
const postureBefore=structuredClone(h.posture);
const bidId=E.addEvent('fixture yield request','normal',[],{actor:a.id,target:h.id,action:'requestYield',socialBid:true,bidKind:'yieldSleepSlotRequest',interactionKind:'requestYield',expectsResponse:true,bidFrom:a.id,bidTo:h.id,preferredSlotId:left.id,perceivedByTarget:true,position:E.positionRef(a.position)});
st.causes[bidId].data.bidId=bidId;E.addObservedBid(st,h,st.causes[bidId],st.tick);
assert.deepEqual(h.posture,postureBefore,'request event itself must not move responder');
E.tick();st=E.getState();h=st.agents.zhou;
const response=st.events.find(e=>e.data?.responseToBid===bidId);
assert.equal(response?.data?.sleepConflictResponse,'accepted','high-engagement Human fixture should choose its own accepted response');
assert.equal(response?.data?.actor,h.id,'response must be authored by responder');
assert.ok(response.id!==bidId,'request and response must remain separate canonical events');

E.reset(44002);st=E.getState();a=st.agents.zhen;h=st.agents.zhou;cat=st.agents.orange;left=SP.getSlot(st,'bed:left');const right=SP.getSlot(st,'bed:right');
near(a,left);bind(h,left);bind(cat,right);cat.action=null;
assert.equal(SP.sleepTargets(st,a).length,0,'fixture must have no legal alternate');
assert.ok(E.baseUtilityForAction(a,'sleep')>0,'preferred occupied Slot must keep sleep deliberation alive even without legal sleepTargets');
conflict=E.preferredSleepConflict(st,a);const noAlt=E.resolutionCandidates(st,a,conflict,[]);
assert.ok(noAlt.candidates.some(x=>x.kind==='waitForSlot'));
assert.ok(noAlt.candidates.some(x=>x.kind==='gainAttention'));
assert.ok(noAlt.candidates.some(x=>x.kind==='requestYield'));
assert.ok(!noAlt.candidates.some(x=>x.kind==='alternateSleep'));

a.action={kind:'sleep',phase:'conflictAwaitResponse',sleepTicks:0,started:st.tick,wait:0,conflictBidId:'missing-bid',conflictResponseUntil:st.tick,conflictPreferredSlot:left.id};
E.ensureIntentForAction(st,a);
let step=E.stepSleepPreferredSlotConflict(st,a,a.action,[]);
assert.equal(step.handled,true);
const noResponse=st.events.find(e=>e.data?.action==='sleepConflictNoResponse');
assert.ok(noResponse);
assert.equal(/拒絕|忽略|故意/.test(noResponse.text),false,'no response must not be classified as refusal or intentional ignore');

a.action.phase='conflictWait';a.action.conflictWaitStarted=st.tick;a.needs.hunger=99;
step=E.stepSleepPreferredSlotConflict(st,a,a.action,[]);
assert.match(step.abortReason,/更迫切/,'higher-priority emergency must interrupt occupancy wait');

a.action.decisionId='decision:test';a.conflictResolutionEvidence=[];
const observation=E.observeAgentContext(st,a,h);
const evidence=E.captureConflictResolutionEvidence(st,a,a.action,{preferredSlot:{kind:'slot',id:left.id},associationReasons:[{kind:'assignment',key:'assignedToSelf'}],observation,candidates:[{kind:'waitForSlot',score:1}],selectedResolution:'waitForSlot',contributors:[]});
assert.ok(evidence);
h.action={kind:'groom',phase:'groom'};
assert.notEqual(evidence.observation.observedActionKind,'groom','Conflict Resolution Evidence must freeze decision-time observation snapshot');

const source=fs.readFileSync(new URL('../src/systems/intent/sleep-conflict.js',import.meta.url),'utf8');
assert.match(source,/E\.observeAgentContext/,'sleep conflict must consume the shared Agent-context observation owner');
assert.doesNotMatch(source,/SP\.roomAt|SP\.manhattan/,'sleep conflict must not duplicate observability rules');

noIssues('sleep conflict final');
console.log('Sleep preferred Slot conflict regression: ok');
