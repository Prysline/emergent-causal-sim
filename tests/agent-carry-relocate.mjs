import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','systems/resources.js','systems/agent-carry.js',
  'spatial.js','spatial-traversal.js','spatial-agent-carry.js','systems/physical.js','spatial-passage.js','systems/locomotion.js',
  'engine.js','validation/registry.js','validation/rules/physical-profile.js','validation/rules/agent-carry.js'
]);

const APP_VERSION='11.51.0-activity-concurrency';
const PHYSICAL_VERSION='11.45.0-agent-carry-relocate';
const C=globalThis.SimEmbodimentCapabilities;
const E=globalThis.SimEngine;
const A=globalThis.SimAgentCarry;
const P=globalThis.SimPhysical;
const SP=globalThis.SimSpatial;
const V=globalThis.SimValidator;

assert.equal(C.VERSION,'embodiment-capabilities-v5');
assert.equal(A.VERSION,'11.46.0-sleep-carry-integration');
assert.equal(P.VERSION,PHYSICAL_VERSION,'Physical own generation must not fake-bump when only carry lifecycle / selection semantics change');
assert.equal(SP.CANDIDATE_NODE_SELECTION_VERSION,'11.46.0-sleep-carry-integration');
assert.equal(C.agentCarryCapabilityForKind('human','twoArmCarry').massCapacity,35);
assert.equal(C.agentCarryCapabilityForKind('human','twoArmCarry').handsRequired,2);
assert.equal(C.agentCarryCapabilityForKind('cat','twoArmCarry'),null);
assert.deepEqual(C.agentCarryMethod('twoArmCarry').carriedGeometryCalibration,{widthFromHeightFactor:.60,lengthFromHeightFactor:.40});
assert.equal(C.freePosturesForKind('human').includes('carried'),false);

E.reset(14500);
let st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
assert.equal(st.version,APP_VERSION);
assert.equal(st.agentCarryVersion,'11.46.0-sleep-carry-integration');
assert.deepEqual(st.agentCarries,{});

const sleepingObservation=Object.freeze({observable:true,targetId:cat.id,observedTick:st.tick,observedAgentKind:'animal',observedActionKind:'sleep',observedPosture:'lying'});
let attempt=A.candidateAttemptability(st,human,sleepingObservation);
assert.equal(attempt.ok,true,'candidate-time attemptability should use requester-known state + explicit observation');
const originalMassForAttempt=cat.physical.mass;
cat.physical.mass=999;
attempt=A.candidateAttemptability(st,human,sleepingObservation);
assert.equal(attempt.ok,true,'hidden target mass must not make a requester-time candidate disappear');
let hiddenExecution=A.canEstablishCarry(st,human,cat,{cooperative:true});
assert.equal(hiddenExecution.ok,false);
assert.equal(hiddenExecution.reason,'mass-capacity-exceeded','execution-time World truth must still reject hidden impossible mass');
cat.physical.mass=originalMassForAttempt;
cat.held='cupA';
attempt=A.candidateAttemptability(st,human,sleepingObservation);
assert.equal(attempt.ok,true,'hidden target held state must not make a requester-time candidate disappear');
hiddenExecution=A.canEstablishCarry(st,human,cat,{cooperative:true});
assert.equal(hiddenExecution.ok,false);
assert.equal(hiddenExecution.reason,'nested-held-container-unsupported');
cat.held=null;
const hiddenRelation={id:'agent-carry:hidden',carrierId:'zhou',carriedAgentId:cat.id,method:'twoArmCarry',responderMode:'cooperative',establishedTick:st.tick};
st.agentCarries[cat.id]=hiddenRelation;
attempt=A.candidateAttemptability(st,human,sleepingObservation);
assert.equal(attempt.ok,true,'hidden target carry relation must not be read by candidate-time attemptability');
hiddenExecution=A.canEstablishCarry(st,human,cat,{cooperative:true});
assert.equal(hiddenExecution.ok,false);
assert.equal(hiddenExecution.reason,'agent-already-in-carry-relation');
delete st.agentCarries[cat.id];

let feasibility=A.canEstablishCarry(st,human,cat,{cooperative:false});
assert.equal(feasibility.ok,false);
assert.equal(feasibility.reason,'awake-responder-not-cooperative');
feasibility=A.canEstablishCarry(st,human,cat,{cooperative:true});
assert.equal(feasibility.ok,true);
assert.equal(feasibility.mass,4.5);

cat.held='cupA';
feasibility=A.canEstablishCarry(st,human,cat,{cooperative:true});
assert.equal(feasibility.ok,false);
assert.equal(feasibility.reason,'nested-held-container-unsupported','Agent carry v1 requires the carried Agent to be empty-handed');
cat.held=null;

human.held='cupA';
feasibility=A.canEstablishCarry(st,human,cat,{cooperative:true});
assert.equal(feasibility.ok,false);
assert.equal(feasibility.reason,'hand-capacity-exceeded');
human.held=null;

const originalMass=cat.physical.mass;
cat.physical.mass=36;
feasibility=A.canEstablishCarry(st,human,cat,{cooperative:true});
assert.equal(feasibility.ok,false);
assert.equal(feasibility.reason,'mass-capacity-exceeded');
cat.physical.mass=originalMass;

const originalPlanRoute=SP.planRoute;
SP.planRoute=(state,agent,node)=>{
  const x=Number(node?.x),picked=x===0?{traversalCost:4,pathDistance:8}:x===1||x===2?{traversalCost:4,pathDistance:7}:{traversalCost:9,pathDistance:9};
  return {path:[node],steps:[],objective:'traversalCost',...picked};
};
try{
  const candidates=[
    SP.normalizeNode(st,{x:2,y:0,z:0,spaceId:'home',surfaceId:'floor'}),
    SP.normalizeNode(st,{x:1,y:0,z:0,spaceId:'home',surfaceId:'floor'}),
    SP.normalizeNode(st,{x:0,y:0,z:0,spaceId:'home',surfaceId:'floor'})
  ].filter(Boolean);
  const result=SP.bestCandidateNodeResult(st,human,candidates,{objective:'traversalCost'});
  assert.ok(result);
  assert.equal(result.objectiveCost,4);
  assert.equal(result.pathDistance,7,'canonical candidate selector must use pathDistance after objective tie');
  const tied=candidates.filter(n=>n.x===1||n.x===2).map(n=>SP.nodeKey(st,n)).sort()[0];
  assert.equal(result.nodeKey,tied,'canonical candidate selector must use stable nodeKey after objective/pathDistance tie');
}finally{SP.planRoute=originalPlanRoute;}

let established=A.establishCarry(st,human,cat,{cooperative:true});
assert.equal(established.ok,true);
assert.equal(Object.keys(st.agentCarries).length,1);
assert.equal(st.agentCarries[cat.id].carrierId,human.id);
assert.equal(cat.position,null,'carried Agent must leave ordinary position truth');
assert.deepEqual(cat.posture,{kind:'carried',slotId:null,furnitureId:null});
assert.deepEqual(A.projectedPosition(st,cat),human.position,'observable carried position must project from the carrier');
assert.ok(SP.nodeSame(st,SP.nodeForAgent(st,cat),SP.nodeForAgent(st,human)),'Spatial node projection must follow the carrier');
assert.equal(P.getEffectiveTraversalEnvelope(st,human,'walk').carriedAgentId,cat.id);
assert.equal(P.getEffectiveTraversalEnvelope(st,human,'walk').clearanceLength,.45,'carried Cat length must enlarge the Human walk envelope');
assert.equal(P.locomotionModeHandsFeasible(st,human,'walk'),true);
assert.equal(P.locomotionModeHandsFeasible(st,human,'kneelCrawl'),false,'twoArmCarry leaves no support hand for crawl');
assert.equal(P.surfaceManeuverHandsFeasible(st,human,'jump'),false,'jump is explicitly unsupported by twoArmCarry v1');
assert.equal(P.surfaceManeuverHandsFeasible(st,human,'step'),true,'step remains available when current geometry permits it');

let validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(issue=>issue.code+': '+issue.message).join(' | '));

const carrierNode=SP.nodeForAgent(st,human);
const floorTarget=(SP.adjacentWalkable(st,carrierNode)||[]).find(node=>(SP.nodeOccupantsAt(st,node,cat.id)||[]).length===0);
assert.ok(floorTarget,'test world must expose an adjacent legal floor placement');
let selectorCalls=0;
const originalBestCandidateNode=SP.bestCandidateNode;
SP.bestCandidateNode=(...args)=>{selectorCalls++;return originalBestCandidateNode(...args);};
let approach;
try{approach=A.bestPlacementApproach(st,human,{kind:'floor',position:floorTarget});}finally{SP.bestCandidateNode=originalBestCandidateNode;}
assert.ok(approach);
assert.ok(selectorCalls>0,'Agent Carry floor approach must delegate candidate winner selection to Spatial / Route');
let placed=A.placeCarriedAgent(st,human,{kind:'floor',position:floorTarget});
assert.equal(placed.ok,true);
assert.equal(st.agentCarries[cat.id],undefined);
assert.ok(SP.nodeSame(st,SP.nodeForAgent(st,cat),floorTarget));
assert.equal(cat.posture.kind,'standing');
validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(issue=>issue.code+': '+issue.message).join(' | '));

E.reset(14501);
st=E.getState();human=st.agents.zhen;cat=st.agents.orange;
const sleepSlot=SP.allSlots(st).find(slot=>slot.canSleep&&SP.slotAllows(slot,cat)&&SP.slotPoseFits(slot,cat,'lying'));
assert.ok(sleepSlot,'default world must expose a legal sleeping Slot for Cat');
cat.position={...sleepSlot.position};
cat.posture={kind:'lying',slotId:sleepSlot.id,furnitureId:sleepSlot.furnitureId};
cat.action={kind:'sleep',phase:'sleeping',started:st.tick,sleepTicks:1,wait:0};
const pickupApproach=SP.bestSlotApproachNode(st,sleepSlot,human,{mode:'walk',objective:'traversalCost'});
assert.ok(pickupApproach);
human.position={...pickupApproach};
human.posture={kind:'standing',slotId:null,furnitureId:null};
established=A.establishCarry(st,human,cat);
assert.equal(established.ok,true,'sleeping responder is supported without treating sleep as consent');
assert.equal(established.relation.responderMode,'sleeping');
validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(issue=>issue.code+': '+issue.message).join(' | '));

const destinationSlot=SP.allSlots(st).find(slot=>slot.id!==sleepSlot.id&&slot.canSleep&&SP.slotAllows(slot,cat)&&SP.slotPoseFits(slot,cat,'lying')&&SP.slotAvailable(st,slot.id,cat.id));
if(destinationSlot){
  const slotApproach=SP.bestSlotApproachNode(st,destinationSlot,human,{mode:'walk',objective:'traversalCost'});
  if(slotApproach){
    human.position={...slotApproach};
    placed=A.placeCarriedAgent(st,human,{kind:'slot',id:destinationSlot.id});
    assert.equal(placed.ok,true);
    assert.equal(placed.posture,'lying');
    assert.equal(cat.posture.slotId,destinationSlot.id);
  }
}

E.reset(14503);
st=E.getState();human=st.agents.zhen;cat=st.agents.orange;
const wakeSleepSlot=SP.allSlots(st).find(slot=>slot.canSleep&&SP.slotAllows(slot,cat)&&SP.slotPoseFits(slot,cat,'lying'));
cat.position={...wakeSleepSlot.position};
cat.posture={kind:'lying',slotId:wakeSleepSlot.id,furnitureId:wakeSleepSlot.furnitureId};
cat.action={kind:'sleep',phase:'sleeping',started:st.tick,sleepTicks:1,wait:0};
const wakePickupApproach=SP.bestSlotApproachNode(st,wakeSleepSlot,human,{mode:'walk',objective:'traversalCost'});
human.position={...wakePickupApproach};human.posture={kind:'standing',slotId:null,furnitureId:null};
established=A.establishCarry(st,human,cat);
assert.equal(established.ok,true);
assert.equal(established.relation.responderMode,'sleeping','relation keeps establishment mode as provenance');
cat.action=null;
validation=V.validateState(st);
assert.equal(validation.issueCount,0,'waking after legal establishment must not invalidate the physical carry relation');
const wakeCarrierNode=SP.nodeForAgent(st,human);
const awakeFloorTarget=(SP.adjacentWalkable(st,wakeCarrierNode)||[]).find(node=>(SP.nodeOccupantsAt(st,node,cat.id)||[]).length===0);
assert.ok(awakeFloorTarget);
placed=A.placeCarriedAgent(st,human,{kind:'floor',position:awakeFloorTarget});
assert.equal(placed.ok,true);
assert.equal(placed.posture,'standing','release posture must derive from current responder state, not establishment provenance');

E.reset(14502);
st=E.getState();human=st.agents.zhen;cat=st.agents.orange;st.agents.zhou.offMap=true;
const startTarget={...cat.position};
const adjacent=(SP.agentContactNodes?.(st,cat,human)||SP.adjacentWalkable(st,startTarget)||[])[0];
if(adjacent)human.position={...adjacent};
const releaseTarget=(SP.adjacentWalkable(st,SP.nodeForAgent(st,human))||[]).find(node=>!SP.nodeSame(st,node,SP.nodeForAgent(st,cat))&&(SP.nodeOccupantsAt(st,node,cat.id)||[]).length===0);
assert.ok(releaseTarget,'test world must expose a release target for the action lifecycle');
const action=E.buildAction(human,{id:'carryAgent',targetAgent:cat.id,targetPlacement:{kind:'floor',position:releaseTarget},cooperative:true});
assert.ok(action,'explicit carryAgent action must build from an approved target + placement');
human.action=action;
for(let i=0;i<30&&human.action;i++)E.tick();
assert.equal(human.action,null,'pickup → establish → locomotion → place lifecycle must complete');
assert.equal(A.relationForCarrier(E.getState(),human),null);
const eventActions=E.getState().events.map(event=>event.data?.action);
assert.ok(eventActions.includes('agentPickup'));
assert.ok(eventActions.includes('agentCarryEstablished'));
assert.ok(eventActions.includes('agentPlacementComplete'));

E.reset(14504);
st=E.getState();human=st.agents.zhen;cat=st.agents.orange;st.agents.zhou.offMap=true;
const recoverySleepSlot=SP.allSlots(st).find(slot=>slot.canSleep&&SP.slotAllows(slot,cat)&&SP.slotPoseFits(slot,cat,'lying'));
assert.ok(recoverySleepSlot);
cat.position={...recoverySleepSlot.position};cat.posture={kind:'lying',slotId:recoverySleepSlot.id,furnitureId:recoverySleepSlot.furnitureId};cat.action={kind:'sleep',phase:'sleeping',started:st.tick,sleepTicks:1,wait:0};
const recoveryPickupApproach=SP.bestSlotApproachNode(st,recoverySleepSlot,human,{mode:'walk',objective:'traversalCost'});
human.position={...recoveryPickupApproach};human.posture={kind:'standing',slotId:null,furnitureId:null};
established=A.establishCarry(st,human,cat);
assert.equal(established.ok,true);
const impossibleTarget={kind:'floor',position:{x:-999,y:-999,z:0,spaceId:'home',surfaceId:'floor'}};
human.action=E.buildAction(human,{id:'carryAgent',targetAgent:cat.id,targetPlacement:impossibleTarget,originalConflictSlotId:recoverySleepSlot.id,relocationContext:'sleepSlotConflict',relocationOutcome:'pending'});
assert.ok(human.action,'existing carry relation must be able to retain one carryAgent lifecycle owner');
const originalAccessible=SP.nodeLocomotionAccessible;
SP.nodeLocomotionAccessible=()=>false;
try{
  E.tick();
  assert.equal(human.action?.kind,'carryAgent');
  assert.equal(human.action?.phase,'recoveryBlocked','post-pickup invalidation must enter recovery-blocked rather than abort');
  assert.equal(human.action?.relocationOutcome,'failed','original relocation must be marked failed before recovery');
  assert.ok(A.relationForCarrier(st,human),'recovery-blocked must preserve canonical carry relation');
  const retryAt=human.action.recoveryRetryAtTick;
  E.tick();
  assert.equal(human.action?.phase,'recoveryBlocked');
  assert.ok(A.relationForCarrier(st,human));
  assert.equal(human.action.recoveryRetryAtTick,retryAt,'retry cadence must not spin every tick before the scheduled retry');
}finally{SP.nodeLocomotionAccessible=originalAccessible;}
for(let i=0;i<30&&human.action;i++)E.tick();
assert.equal(human.action,null,'recovery should eventually place safely once a legal nearby floor becomes available');
assert.equal(A.relationForCarrier(st,human),null,'recovery completion must clear the canonical carry relation');
const recoveryEvents=st.events.filter(event=>['agentRelocationFailed','agentCarryRecoveryBlocked','agentCarryRecoveryComplete'].includes(event.data?.action));
assert.ok(recoveryEvents.some(event=>event.data?.action==='agentRelocationFailed'));
assert.ok(recoveryEvents.some(event=>event.data?.action==='agentCarryRecoveryBlocked'));
const recoveryComplete=recoveryEvents.find(event=>event.data?.action==='agentCarryRecoveryComplete');
assert.ok(recoveryComplete);
assert.equal(recoveryComplete.data.relocationOutcome,'failed','safe recovery must not be reported as original relocation success');
assert.equal(recoveryComplete.data.slot,null,'v1 neutral recovery must use floor, not silently pick another comfort Slot');
assert.equal(st.events.some(event=>event.data?.action==='agentPlacementComplete'&&event.data?.relocationContext==='sleepSlotConflict'),false,'recovery completion must not emit original relocation success');

console.log('agent carry / relocate + sleeping recovery regression: ok');
