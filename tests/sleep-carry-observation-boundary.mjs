import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,AC=globalThis.SimAgentCarry,SC=globalThis.SimSleepConflict;

E.reset(14601);
let st=E.getState(),requester=st.agents.zhen,cat=st.agents.orange;
const observedSleeping=Object.freeze({observable:true,targetId:cat.id,observedTick:st.tick,observedAgentKind:'animal',observedActionKind:'sleep',observedPosture:'lying'});
assert.equal(AC.candidateAttemptability(st,requester,observedSleeping).ok,true);
const notSettledSleep=Object.freeze({...observedSleeping,observedPosture:'standing'});
const notSettledAttempt=AC.candidateAttemptability(st,requester,notSettledSleep);
assert.equal(notSettledAttempt.ok,false,'sleep Action without observed lying posture must not count as observed sleeping');
assert.equal(notSettledAttempt.reason,'no-observed-sleep-or-cooperation');

const conflictSlot=SP.getSlot(st,'bed:left'),otherSlot=SP.getSlot(st,'bed:right');
assert.ok(conflictSlot&&otherSlot,'default fixture must expose both bed slots');
let canonicalOtherSlot=null;
for(const furniture of Object.values(st.furniture||{}))for(const slot of furniture.slots||[]){
  if(slot.id===otherSlot.id)canonicalOtherSlot=slot;
  else if(slot.id!==conflictSlot.id)slot.canSleep=false;
}
assert.ok(canonicalOtherSlot,'test must resolve the canonical alternate Slot');
canonicalOtherSlot.canSleep=true;canonicalOtherSlot.allowKinds=['human'];
const approach=SP.slotApproachNodes(st,conflictSlot,requester,'walk')[0];
assert.ok(approach);requester.position={...approach};requester.posture={kind:'standing',slotId:null,furnitureId:null};
const proposal=SC.sleepingRelocationProposal(st,requester,{slot:conflictSlot},observedSleeping);
assert.ok(proposal,'bounded floor fallback should remain available when the only alternate sleep Slot is kind-incompatible');
assert.notEqual(proposal.target?.id,otherSlot.id,'candidate-time relocation must respect public Slot allowKinds from observed target kind');
assert.equal(proposal.target?.kind,'floor','kind-incompatible sleep Slot must fall through to bounded floor fallback');
assert.equal(SC.sleepingRelocationProposal(st,requester,{slot:conflictSlot},notSettledSleep),null,'relocation proposal itself must reject a non-lying sleep observation');

console.log('Sleep carry observation boundary regression: ok');
