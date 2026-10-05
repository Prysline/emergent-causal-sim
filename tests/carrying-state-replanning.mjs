import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','systems/resources.js','systems/agent-carry.js','spatial.js','spatial-traversal.js','spatial-agent-carry.js','systems/action/state.js','systems/intent/state.js','systems/social/state.js','systems/physical.js','spatial-passage.js','systems/locomotion.js','engine.js','runtime-hook-pipeline.js','systems/action/runtime.js','systems/intent/runtime.js','systems/intent/decision-evidence.js','systems/intent/deliberation.js','systems/intent/replanning.js','validation/registry.js','validation/rules/physical-profile.js','validation/rules/agent-carry.js','validation/rules/intent-active.js','validation/rules/interruption.js']);

const E=globalThis.SimEngine,A=globalThis.SimAgentCarry,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const noIssues=label=>{const result=V.validateState(E.getState());assert.equal(result.issueCount,0,label+': '+result.issues.map(x=>x.code+': '+x.message).join(' | '));};
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.48.0-carrying-replanning');
assert.deepEqual(E.listCarryingDecisionOptionProviders(),[]);
assert.throws(()=>E.registerCarryingDecisionOptionProvider('',()=>[]),/requires id/);
E.registerCarryingDecisionOptionProvider('test.domain',()=>[]);
assert.throws(()=>E.registerCarryingDecisionOptionProvider('test.domain',()=>[]),/duplicate/);

function establish(seed){
  E.reset(seed);const st=E.getState(),carrier=st.agents.zhen,carried=st.agents.orange;st.agents.zhou.offMap=true;
  const contact=(SP.agentContactNodes?.(st,carried,carrier)||SP.adjacentWalkable(st,SP.nodeForAgent(st,carried))||[])[0];assert.ok(contact);carrier.position={...contact};carrier.posture={kind:'standing',slotId:null,furnitureId:null};carried.action={kind:'sleep',phase:'sleeping',started:st.tick,sleepTicks:2,wait:0};assert.equal(A.establishCarry(st,carrier,carried).ok,true);carried.action=null;carried.activeIntent=null;
  carrier.activeIntent={id:'intent:zhen:0:sleep:test',kind:'sleep',createdTick:0,lifecycle:'actionBound',source:{type:'test'}};
  carrier.action=E.buildAction(carrier,{id:'carryAgent',targetAgent:carried.id,targetPlacement:{kind:'floor',position:{x:-999,y:-999,z:0,spaceId:'home',surfaceId:'floor'}},relocationContext:'sleepSlotConflict',relocationOutcome:'failed'});assert.ok(carrier.action);carrier.action.intentId=carrier.activeIntent.id;carrier.action.phase='recoveryBlocked';carrier.action.recoveryMode=true;carrier.action.relocationOutcome='failed';carrier.action.relocationFailedEventId=E.addEvent('test relocation failure','normal',[],{actor:carrier.id,target:carried.id,action:'agentRelocationFailed'});return {st,carrier,carried};
}

let {st,carrier,carried}=establish(14800);
let prior=E.adoptDecisionEvidence(st,carrier,carrier.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'},contributors:[]}).id;
assert.equal(E.applyCarryingReplan(st,carrier),true,'placement invalidation should enter carrying-state deliberation');
assert.equal(carrier.action?.kind,'carryAgent');assert.equal(carrier.action?.recoveryMode,true);assert.equal(carrier.action?.relocationOutcome,'failed');assert.notEqual(carrier.action?.decisionId,prior);assert.equal(carrier.decisionEvidence?.priorDecisionId,prior);assert.equal(carrier.decisionEvidence?.source?.type,'carryingReplan');assert.ok(A.relationForCarrier(st,carrier));assert.equal(st.events.some(e=>e.data?.action==='carryingReplanDecision'),true);noIssues('placement carrying replan');

({st,carrier,carried}=establish(14801));
const originalAccessible=SP.nodeLocomotionAccessible;SP.nodeLocomotionAccessible=()=>false;
try{
  prior=E.adoptDecisionEvidence(st,carrier,carrier.action,{source:{type:'test',tick:st.tick,intentKind:'sleep'}}).id;
  assert.equal(E.applyCarryingReplan(st,carrier),true);assert.equal(carrier.action?.phase,'recoveryBlocked');assert.equal(carrier.action?.carryingDecisionKind,'wait');assert.equal(carrier.action?.carryingWaitUntilTick,st.tick+E.CARRY_WAIT_TICKS);assert.notEqual(carrier.action?.decisionId,prior);assert.equal(carrier.decisionEvidence?.priorDecisionId,prior);assert.ok(A.relationForCarrier(st,carrier));assert.equal(E.SOFT_RECONSIDERABLE_ACTIONS?.has('carryAgent')||false,false);assert.equal(E.applyCarryingReplan(st,carrier),false,'wait must not rerank before cadence expires');st.tick=carrier.action.carryingWaitUntilTick;const waitDecision=carrier.action.decisionId;assert.equal(E.applyCarryingReplan(st,carrier),true,'wait cadence should trigger a fresh carrying decision');assert.notEqual(carrier.action.decisionId,waitDecision);assert.equal(carrier.decisionEvidence?.source?.trigger,'wait-cadence');assert.ok(A.relationForCarrier(st,carrier));
} finally {SP.nodeLocomotionAccessible=originalAccessible;}
noIssues('stationary carry wait');
console.log('carrying-state generic re-deliberation regression: ok');
