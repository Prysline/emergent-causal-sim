import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','systems/resources.js','systems/agent-carry.js',
  'spatial.js','spatial-traversal.js','spatial-agent-carry.js','systems/physical.js','spatial-passage.js','systems/locomotion.js',
  'engine.js','validation/registry.js','validation/rules/physical-profile.js','validation/rules/agent-carry.js'
]);

const APP_VERSION='11.45.0-agent-carry-relocate';
const C=globalThis.SimEmbodimentCapabilities;
const E=globalThis.SimEngine;
const A=globalThis.SimAgentCarry;
const P=globalThis.SimPhysical;
const SP=globalThis.SimSpatial;
const V=globalThis.SimValidator;

assert.equal(C.VERSION,'embodiment-capabilities-v5');
assert.equal(A.VERSION,APP_VERSION);
assert.equal(P.VERSION,APP_VERSION);
assert.equal(C.agentCarryCapabilityForKind('human','twoArmCarry').massCapacity,35);
assert.equal(C.agentCarryCapabilityForKind('human','twoArmCarry').handsRequired,2);
assert.equal(C.agentCarryCapabilityForKind('cat','twoArmCarry'),null);
assert.deepEqual(C.agentCarryMethod('twoArmCarry').carriedGeometryCalibration,{widthFromHeightFactor:.60,lengthFromHeightFactor:.40});
assert.equal(C.freePosturesForKind('human').includes('carried'),false);

E.reset(14500);
let st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
assert.equal(st.version,APP_VERSION);
assert.equal(st.agentCarryVersion,APP_VERSION);
assert.deepEqual(st.agentCarries,{});

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

const beforePosition={...cat.position};
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
  const approach=SP.bestSlotApproachNode(st,destinationSlot,human,{mode:'walk',objective:'traversalCost'});
  if(approach){
    human.position={...approach};
    placed=A.placeCarriedAgent(st,human,{kind:'slot',id:destinationSlot.id});
    assert.equal(placed.ok,true);
    assert.equal(placed.posture,'lying');
    assert.equal(cat.posture.slotId,destinationSlot.id);
  }
}

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

console.log('agent carry / relocate v1 regression: ok');
