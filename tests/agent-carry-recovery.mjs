import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','systems/resources.js','systems/agent-carry.js',
  'spatial.js','spatial-traversal.js','spatial-agent-carry.js','systems/physical.js','spatial-passage.js','systems/locomotion.js',
  'engine.js','runtime-hook-pipeline.js','systems/agent-carry-recovery.js'
]);

const E=globalThis.SimEngine,A=globalThis.SimAgentCarry,AR=globalThis.SimAgentCarryRecovery,SP=globalThis.SimSpatial;

function sleepingFixture(seed){
  E.reset(seed);
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
  const slot=SP.allSlots(st).find(s=>s.canSleep&&SP.slotAllows(s,cat)&&SP.slotPoseFits(s,cat,'lying'));
  assert.ok(slot);
  cat.position={...slot.position};cat.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};cat.action={kind:'sleep',phase:'sleeping',started:st.tick,sleepTicks:2,wait:0};
  const approach=SP.bestSlotApproachNode(st,slot,human,{mode:'walk',objective:'traversalCost'});assert.ok(approach);
  human.position={...approach};human.posture={kind:'standing',slotId:null,furnitureId:null};
  return {st,human,cat,slot};
}

{
  const {st,human,cat}=sleepingFixture(14610);
  const observation={observable:true,targetId:cat.id,observedTick:st.tick,observedAgentKind:'animal',observedActionKind:'sleep',observedPosture:'lying'};
  const originalMass=cat.physical.mass,originalHeld=cat.held;
  cat.physical.mass=999;cat.held='hidden-container';
  st.agentCarries[cat.id]={id:'hidden-relation',carrierId:'zhou',carriedAgentId:cat.id,method:A.METHOD,responderMode:'sleeping'};
  const attempt=A.carryAttemptability(st,human,observation);
  assert.equal(attempt.ok,true,'candidate-time attemptability must not inspect target hidden mass / held / carry relation');
  delete st.agentCarries[cat.id];cat.physical.mass=999;cat.held=null;
  const execution=A.canEstablishCarry(st,human,cat);
  assert.equal(execution.ok,false,'execution-time World truth must still reject hidden physical infeasibility');
  assert.equal(execution.reason,'mass-capacity-exceeded');
  cat.physical.mass=originalMass;cat.held=originalHeld;
}

{
  const {st,human,cat}=sleepingFixture(14611);
  const established=A.establishCarry(st,human,cat);assert.equal(established.ok,true);
  const floor=(SP.adjacentWalkable(st,SP.nodeForAgent(st,human))||[])[0];assert.ok(floor);
  const original=SP.bestCandidateNode,calls=[];
  SP.bestCandidateNode=(...args)=>{calls.push(args);return original(...args);};
  try{A.bestPlacementApproach(st,human,{kind:'floor',position:floor});}finally{SP.bestCandidateNode=original;}
  assert.equal(calls.length,1,'Agent Carry floor approach must delegate winner selection to Spatial canonical selector');
}

{
  const {st,human,cat}=sleepingFixture(14612);
  assert.equal(A.establishCarry(st,human,cat).ok,true);
  const action=E.buildAction(human,{id:'carryAgent',targetAgent:cat.id,targetPlacement:{kind:'slot',id:'missing-slot'}});assert.ok(action);
  action.sleepConflict={originalConflictSlotId:'original-conflict-slot',conflictDecisionId:'conflict-test',requestedPlacement:{kind:'slot',id:'missing-slot'}};
  human.action=action;
  E.tick();
  const relation=A.relationForCarrier(E.getState(),human);
  assert.ok(relation,'post-pickup placement invalidation must preserve canonical carry relation until recovery completes');
  assert.equal(human.action?.kind,'carryAgent','Agent Carry recovery must reacquire lifecycle ownership before ordinary Deliberation');
  assert.equal(human.action?.recovery?.kind,'neutralFloor');
  assert.notEqual(human.action?.targetPlacement?.id,'original-conflict-slot');
  for(let i=0;i<30&&A.relationForCarrier(E.getState(),human);i++)E.tick();
  assert.equal(A.relationForCarrier(E.getState(),human),null,'recovery must eventually clear the canonical relation through legal placement');
  const placement=E.getState().events.find(event=>event.data?.action==='agentPlacementComplete'&&event.data?.recovery===true);
  assert.ok(placement,'canonical placement event must be explicitly annotated as recovery');
  assert.equal(placement.data.originalRelocationSuccess,false,'recovery placement must not count as original relocation success');
  assert.ok(E.getState().events.some(event=>event.data?.action==='agentCarryRecoveryComplete'&&event.data?.originalRelocationSuccess===false));
}

{
  const {st,human,cat}=sleepingFixture(14613);
  assert.equal(A.establishCarry(st,human,cat).ok,true);
  human.action=E.buildAction(human,{id:'carryAgent',targetAgent:cat.id,targetPlacement:{kind:'slot',id:'missing-slot'}});assert.ok(human.action);
  human.action.sleepConflict={originalConflictSlotId:'original-conflict-slot',requestedPlacement:{kind:'slot',id:'missing-slot'}};
  const originalSelector=SP.bestCandidateNodeResult;SP.bestCandidateNodeResult=()=>null;
  E.tick();
  SP.bestCandidateNodeResult=originalSelector;
  let relation=A.relationForCarrier(E.getState(),human);
  assert.ok(relation);
  assert.equal(human.action,null,'recovery-blocked may wait without fabricating a placement Action');
  assert.equal(relation.recovery?.phase,'recovery-blocked');
  assert.equal(relation.recovery?.owner,'carryAgent','blocked relation itself must retain canonical lifecycle ownership');
  const retryAt=relation.recovery.retryAfterTick;
  E.tick();
  relation=A.relationForCarrier(E.getState(),human);assert.ok(relation);
  assert.equal(E.getState().tick<retryAt,true,'first blocked wait tick must not retry early');
  E.tick();
  relation=A.relationForCarrier(E.getState(),human);
  assert.ok(!relation||human.action?.kind==='carryAgent','retry cadence must either resume canonical recovery or finish it, never enter ordinary Deliberation');
}

assert.equal(AR.RECOVERY_RETRY_TICKS,2);
console.log('Agent carry post-pickup recovery regression: ok');
