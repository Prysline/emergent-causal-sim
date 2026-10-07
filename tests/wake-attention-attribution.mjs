import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const noIssues=label=>{const result=V.validateState(E.getState());assert.equal(result.issueCount,0,`${label}: ${result.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const relation=(a,id)=>a.relationships?.[id]||null;
function placePair(st){
  const requester=st.agents.zhou,target=st.agents.orange;
  st.agents.zhen.offMap=true;
  requester.offMap=false;target.offMap=false;
  requester.position={x:5,y:5};target.position={x:5,y:6};
  requester.action=null;requester.activeIntent=null;target.action=null;target.activeIntent=null;
  return {requester,target};
}
function sleep(st,target){
  const slot=SP.getSlot(st,'sofa:left');
  target.position={...slot.position};
  target.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  target.action={kind:'sleep',phase:'sleeping',sleepTicks:4,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};
  E.ensureIntentForAction(st,target);
  return slot;
}
function attentionEvent(st,requester,target){
  return E.addEvent(`${requester.name}試著引起${target.name}的注意。`,'normal',[],{actor:requester.id,target:target.id,action:'attentionStimulus',interactionPurpose:'gainAttention',stimulusKind:'sound',stimulusIntensity:24,position:E.positionRef(requester.position)});
}

assert.equal(E.WAKE_ATTENTION_ATTRIBUTION_VERSION,'wake-attention-attribution-v1');
assert.equal(E.WAKE_ATTENTION_RELATIONSHIP_VERSION,'wake-attention-relationship-v1');

// Ordinary attention remains relationship-neutral when it did not actually wake the target.
E.reset(49101);
let st=E.getState(),pair=placePair(st),requester=pair.requester,target=pair.target;
let attentionId=attentionEvent(st,requester,target);
let memory=target.episodicMemories.find(m=>m.sourceEventId===attentionId);
assert.ok(memory,'awake direct target should remember the attention event');
assert.equal(memory.appraisal.ruleId,'attentionStimulus-v1');
assert.equal(memory.appraisal.goalCongruence,0,'attention without a wake consequence must not invent negative meaning');
assert.equal(memory.appraisal.factors.some(f=>f.kind==='sleepWakeInterruption'),false);
assert.equal(relation(target,requester.id),null,'ordinary attention must not become Relationship evidence merely because it was noticed');
noIssues('ordinary attention neutral');

// Failed wake remains outside the sleeping responder's private memory / Relationship boundary.
E.reset(49102);
st=E.getState();pair=placePair(st);requester=pair.requester;target=pair.target;sleep(st,target);
attentionId=attentionEvent(st,requester,target);
E.addEvent(`${target.name}沒有因這次刺激醒來。`,'normal',[attentionId],{actor:requester.id,target:target.id,action:'sleepDisturbance',stimulusKind:'sound',stimulusIntensity:0,wakeChance:0,wakeRoll:50,position:E.positionRef(target.position)});
assert.equal(target.episodicMemories.some(m=>m.sourceEventId===attentionId),false,'sleeping target must not know about an attention event that did not wake it');
assert.equal(relation(target,requester.id),null,'failed wake must not remotely alter responder Relationship');
noIssues('failed wake private boundary');

// Once canonical attention -> sleepWake causality exists, the awakened target may appraise its own observed cause and consolidate directionally.
E.reset(49103);
st=E.getState();pair=placePair(st);requester=pair.requester;target=pair.target;sleep(st,target);
attentionId=attentionEvent(st,requester,target);
assert.equal(target.episodicMemories.some(m=>m.sourceEventId===attentionId),false,'attention must initially remain unavailable while target is sleeping');
target.action=null;target.posture={kind:'standing',slotId:null,furnitureId:null};E.reconcileIntents(st);
const wakeId=E.addEvent(`${target.name}被${requester.name}的引起注意互動驚動而醒來。`,'normal',[attentionId],{actor:target.id,action:'sleepWake',wakeReason:`被${requester.name}的引起注意互動驚動而醒來`,sleepTicks:4,fatigue:0,sleepNeed:48,sleepEfficiency:1,circadianBias:0,sleepPropensity:48,position:E.positionRef(target.position)});
memory=E.rememberObservedEvent(st,target,st.causes[attentionId],st.tick);
assert.ok(memory,'awakened target should be able to form its own episodic memory of the causal attention event');
assert.equal(memory.appraisal.ruleId,'attentionStimulus-v1');
const interruption=memory.appraisal.factors.find(f=>f.kind==='sleepWakeInterruption');
assert.ok(interruption,'appraisal must explicitly connect the observed attention memory to its canonical wake consequence');
assert.equal(interruption.wakeEventId,wakeId);
assert.ok(memory.appraisal.goalCongruence<0,'sleep interruption should be bounded negative evidence for the awakened responder');
assert.deepEqual(memory.appraisal.agency,{kind:'other',agentId:requester.id});
const responderRel=relation(target,requester.id);
assert.ok(responderRel?.familiarity>0,'wake-causing attention should leave a directional familiarity trace');
assert.ok(responderRel?.affinity<0,'wake-causing attention should consolidate the responder historical appraisal negatively');
assert.equal(relation(requester,target.id),null,'the requester must not receive the mirrored target-side Relationship update');
const originalMemoryId=memory.id,originalAppraisal=JSON.stringify(memory.appraisal);
st.tick+=1;
E.observeEventForMemories(st,st.causes[attentionId],st.tick);
const revisited=target.episodicMemories.find(m=>m.sourceEventId===attentionId);
assert.equal(revisited.id,originalMemoryId,'re-observation must reuse the existing canonical episodic memory');
assert.equal(revisited.lastObservedTick,st.tick,'re-observation metadata must not advance beyond canonical state time');
assert.equal(JSON.stringify(revisited.appraisal),originalAppraisal,'re-observation must not silently reappraise historical meaning');
assert.deepEqual(relation(target,requester.id),responderRel,'re-observing the same source memory must not consolidate twice');
noIssues('wake-causing attention attribution');

console.log('Wake-causing attention attribution regression: ok');
