import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,W=globalThis.SimWorld,A=globalThis.SimWorldAuthoring,SP=globalThis.SimSpatial,U=globalThis.SimUsage,V=globalThis.SimValidator;
assert.equal(E.VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');

const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
authored.usageAssignments=[{id:'zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
E.configureResetStateSource('sleep-slot-conflict-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,label+': '+v.issues.map(x=>x.code+': '+x.message).join(' | '));};
const occupy=(st,agent,slot,{sleeping=false}={})=>{
  agent.offMap=false;agent.position={...slot.position};agent.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  agent.action=sleeping?{kind:'sleep',phase:'sleeping',sleepTicks:1,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0}:null;
  agent.activeIntent=null;
};
const prepareRequester=(st,a)=>{
  a.offMap=false;a.action=E.buildAction(a,{id:'sleep'});a.activeIntent={id:'intent:'+a.id+':sleep-conflict',kind:'sleep',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test'}};
  a.action.intentId=a.activeIntent.id;E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',intentKind:'sleep'},contributors:[]});return a.action;
};

E.reset(44001);
let st=E.getState(),zhen=st.agents.zhen,zhou=st.agents.zhou,orange=st.agents.orange,left=SP.getSlot(st,'bed:left');
orange.offMap=true;occupy(st,zhou,left);zhen.position={...left.position};zhen.posture={kind:'standing',slotId:null,furnitureId:null};
assert.equal(SP.sleepTargets(st,zhen).some(x=>x.id==='bed:left'),false,'occupied preferred Slot must remain objectively illegal');
let conflict=E.preferredSleepSlotConflicts(st,zhen)[0];
assert.equal(conflict.slot.id,'bed:left');assert.ok(conflict.reasons.some(x=>x.key==='assignedToSelf'));
let legal=U.rankSleepTargets(st,zhen,SP.sleepTargets(st,zhen)),candidates=E.sleepConflictResolutionCandidates(st,zhen,conflict,legal);
assert.ok(candidates.some(x=>x.id==='alternateSleepTarget'));assert.ok(candidates.some(x=>x.id==='waitForPreferredSlot'));assert.ok(candidates.some(x=>x.id==='requestYield'));
let action=prepareRequester(st,zhen);E.resolveSleepPreferredSlotConflict(st,zhen,action,legal);
let evidence=E.currentConflictResolutionEvidence(zhen);
assert.equal(evidence.preferredSlot.id,'bed:left');assert.equal(evidence.observation.targetId,'zhou');assert.equal(evidence.observation.observedPosture,'lying');
zhou.posture={kind:'standing',slotId:null,furnitureId:null};assert.equal(evidence.observation.observedPosture,'lying','Conflict Resolution Evidence must freeze the decision-time observation snapshot');
noIssues('assigned + alternate');

E.reset(44002);st=E.getState();zhen=st.agents.zhen;zhou=st.agents.zhou;orange=st.agents.orange;left=SP.getSlot(st,'bed:left');
st.usageAssignments=[];orange.offMap=true;
E.addEvent('habit proof','normal',[],{actor:'zhen',action:'sleep',phase:'start',slot:'bed:left',furniture:'bed',position:E.positionRef(zhen.position)});
assert.ok(E.usageHabit(st,zhen,'sleep',{kind:'slot',id:'bed:left'})?.effectiveStrength>0);
occupy(st,zhou,left);zhen.position={...left.position};zhen.posture={kind:'standing',slotId:null,furnitureId:null};
conflict=E.preferredSleepSlotConflicts(st,zhen)[0];assert.ok(conflict.reasons.some(x=>x.key==='habitualForSelf'),'habit alone must form preferred-slot conflict reasoning');
noIssues('habit only');

E.reset(44003);st=E.getState();zhen=st.agents.zhen;zhou=st.agents.zhou;orange=st.agents.orange;left=SP.getSlot(st,'bed:left');
zhou.offMap=true;occupy(st,orange,left,{sleeping:true});zhen.position={...left.position};zhen.posture={kind:'standing',slotId:null,furnitureId:null};
conflict=E.preferredSleepSlotConflicts(st,zhen)[0];candidates=E.sleepConflictResolutionCandidates(st,zhen,conflict,U.rankSleepTargets(st,zhen,SP.sleepTargets(st,zhen)));
assert.equal(conflict.observation.observedAgentKind,'animal');assert.ok(candidates.some(x=>x.id==='gainOccupantAttention'));assert.equal(candidates.some(x=>x.id==='requestYield'||x.id==='driveAwayNonPhysical'),false,'Animal occupant must not receive Human-only yield/drive-away candidates');
action=prepareRequester(st,zhen);action.phase='conflictAttention';action.sleepConflictPreferredSlot='bed:left';action.sleepConflictTargetAgent='orange';
E.stepSleepPreferredSlotConflict(st,zhen,action);
assert.equal((st.events||[]).some(e=>e.data?.action==='acceptSleepSlotYield'&&e.data?.target==='zhen'),false,'wake/attention must not imply accepted yield');
noIssues('sleeping animal');

E.reset(44004);st=E.getState();zhen=st.agents.zhen;zhou=st.agents.zhou;orange=st.agents.orange;left=SP.getSlot(st,'bed:left');orange.offMap=true;
occupy(st,zhou,left);zhen.position={...left.position};zhen.posture={kind:'standing',slotId:null,furnitureId:null};
zhou.relationships??={};zhou.relationships.zhen={familiarity:1,affinity:1,lastUpdatedTick:st.tick};
const bidId=E.addEvent('sleep slot request','normal',[],{actor:'zhen',target:'zhou',action:'sleepSlotYieldRequest',slot:'bed:left',socialBid:true,bidKind:'sleepSlotYieldRequest',interactionKind:'requestYield',expectsResponse:true,bidFrom:'zhen',bidTo:'zhou',perceivedByTarget:true});
const bid=st.causes[bidId];bid.data.bidId=bidId;E.addObservedBid(st,zhou,bid,st.tick);
const beforePosture=structuredClone(zhou.posture);E.tick();st=E.getState();zhou=st.agents.zhou;
const accept=(st.events||[]).find(e=>e.data?.action==='acceptSleepSlotYield'&&e.data?.responseToBid===bidId);
assert.ok(accept,'idle Human responder with favorable current signals may accept through responder-local evaluation');
assert.equal(accept.data.actor,'zhou');assert.deepEqual(beforePosture,{kind:'lying',slotId:'bed:left',furnitureId:'bed'},'request creation must not move responder before its own decision');
assert.equal((st.events||[]).some(e=>e.data?.action==='refuseSleepSlotYield'&&e.data?.responseToBid===bidId),false);
noIssues('human responder agency');

E.reset(44005);st=E.getState();zhen=st.agents.zhen;zhou=st.agents.zhou;orange=st.agents.orange;left=SP.getSlot(st,'bed:left');const right=SP.getSlot(st,'bed:right');
occupy(st,zhou,left);occupy(st,orange,right,{sleeping:true});zhen.position={...left.position};zhen.posture={kind:'standing',slotId:null,furnitureId:null};zhen.needs.sleepNeed=95;
assert.equal(SP.sleepTargets(st,zhen).length,0,'fixture must have no legal alternate sleep target');
assert.ok(E.candidateIntents(st,zhen).some(c=>c.intentKind==='sleep'),'preferred-slot conflict must keep sleep deliberation alive when no legal target exists');
conflict=E.preferredSleepSlotConflicts(st,zhen)[0];candidates=E.sleepConflictResolutionCandidates(st,zhen,conflict,[]);
assert.equal(candidates.some(x=>x.id==='alternateSleepTarget'),false);assert.ok(candidates.some(x=>x.id==='waitForPreferredSlot'));assert.ok(candidates.some(x=>x.id==='requestYield'));
noIssues('no alternate');

E.reset(44006);st=E.getState();zhen=st.agents.zhen;zhou=st.agents.zhou;orange=st.agents.orange;left=SP.getSlot(st,'bed:left');orange.offMap=true;occupy(st,zhou,left);
zhen.position={...left.position};zhen.posture={kind:'standing',slotId:null,furnitureId:null};Object.assign(zhen.needs,{sleepNeed:70,thirst:100,hunger:10,fatigue:10});
action=prepareRequester(st,zhen);action.phase='conflictWait';action.sleepConflictPreferredSlot='bed:left';action.sleepConflictUntilTick=st.tick+10;zhen.activeIntent.createdTick=st.tick-3;
assert.equal(E.reconsiderationSnapshot(st,zhen).ok,true,'occupancy wait must be soft-reconsiderable');E.applySoftReconsideration(st,zhen);
assert.notEqual(zhen.action?.kind,'sleep','higher-priority need must be able to interrupt occupancy wait');
noIssues('wait preemption');

E.reset(44007);st=E.getState();zhen=st.agents.zhen;zhou=st.agents.zhou;orange=st.agents.orange;left=SP.getSlot(st,'bed:left');orange.offMap=true;occupy(st,zhou,left);
zhen.position={...left.position};zhen.posture={kind:'standing',slotId:null,furnitureId:null};action=prepareRequester(st,zhen);
const noResponseBid=E.addEvent('perceived request','normal',[],{actor:'zhen',target:'zhou',action:'sleepSlotYieldRequest',slot:'bed:left',socialBid:true,bidKind:'sleepSlotYieldRequest',bidFrom:'zhen',bidTo:'zhou',perceivedByTarget:true});st.causes[noResponseBid].data.bidId=noResponseBid;
action.phase='conflictAwaitResponse';action.sleepConflictPreferredSlot='bed:left';action.sleepConflictBidId=noResponseBid;action.sleepConflictUntilTick=st.tick;
E.stepSleepPreferredSlotConflict(st,zhen,action);
assert.equal(action.sleepConflictOutcome,'noResponse');assert.notEqual(action.sleepConflictOutcome,'refused','no response must not be collapsed into refusal/rejection/intentional ignore');
noIssues('no response');

console.log('Sleep preferred slot conflict regression: ok');
