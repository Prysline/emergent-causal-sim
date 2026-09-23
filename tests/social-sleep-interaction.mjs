import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js'
]);

const E=globalThis.SimEngine;
const SP=globalThis.SimSpatial;
const V=globalThis.SimValidator;

function noIssues(label){
  const result=V.validateState(E.getState());
  assert.equal(result.issueCount,0,`${label}: ${result.issues.map(x=>x.code+': '+x.message).join(' | ')}`);
}

function putToSleep(st,a,slotId='sofa:left',sleepTicks=0){
  const slot=SP.getSlot(st,slotId);
  assert.ok(slot?.canSleep,`${slotId} 必須可睡眠`);
  a.position={...slot.position};
  a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  a.action={kind:'sleep',phase:'sleeping',sleepTicks,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};
  return slot;
}

E.reset(20260911);
{
  const st=E.getState(),actor=st.agents.zhen,target=st.agents.zhou;
  st.agents.orange.offMap=true;
  actor.needs={...actor.needs,hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:100};
  target.needs.sleepNeed=100;
  putToSleep(st,target,'bed:left',0);
  E.tick();
  const thought=st.thoughts[actor.id];
  assert.ok(thought,'清醒角色應產生決策');
  assert.ok(!thought.options.some(o=>o.id==='talk'),'普通聊天不得把正在 sleeping 的人列為候選');
  assert.notEqual(thought.pick.id,'talk');
  noIssues('talk excludes sleeper');
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
  st.agents.zhou.offMap=true;
  human.position={x:9,y:3};
  cat.needs.sleepNeed=100;
  putToSleep(st,cat,'sofa:left',0);
  assert.equal(E.interactionWakeChance(cat,18),0,'高 sleepNeed 且剛入睡時，輕摸可以完全不足以喚醒');
  human.action={kind:'petAnimal',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};
  E.tick();

  assert.equal(cat.action?.kind,'sleep','輕摸不一定叫醒正在深睡的貓');
  const pet=st.events.find(e=>e.data?.action==='petAnimal');
  assert.ok(pet,'撫摸本身應記為發起者 action');
  assert.ok(!pet.text.includes('蹭了幾下'),'撫摸不得固定虛構動物有回蹭');
  const noResponse=st.events.find(e=>e.data?.action==='sleepDisturbance'&&e.data?.target===cat.id);
  assert.ok(noResponse?.text.includes('沒有對摸觸作出明顯回應'),'睡著且未醒的貓應明確保持無回應');
  assert.equal(noResponse.data.wakeChance,0);
  assert.equal(noResponse.data.stimulusKind,'touch');
  noIssues('pet sleeping animal without fabricated response');
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
  st.agents.zhou.offMap=true;
  human.position={x:9,y:2};
  cat.position={x:9,y:3};
  cat.action={kind:'seekHuman',phase:'interact',targetAgent:human.id,started:st.tick,wait:0};
  human.needs.sleepNeed=70;
  human.traits.sleepRecoveryRate=0; // 凍結本測試的 sleepNeed，避免同 tick 的正常睡眠恢復改變 wakeChance 基準。
  putToSleep(st,human,'sofa:left',0);
  const before=E.interactionWakeChance(human,34);
  E.tick();

  const contact=st.events.find(e=>e.data?.action==='seekHuman');
  assert.ok(contact,'動物打擾睡著的人仍應先形成真實接觸事件');
  assert.equal(contact.data.stimulusIntensity,34);
  assert.equal(contact.data.stimulusKind,'touch+sound');
  assert.equal(contact.data.socialBid,true,'Current Social Bid lifecycle 應把 seekHuman contact 標記成 immutable world Bid');
  assert.equal(contact.data.bidId,contact.id);
  assert.equal(cat.activeIntent?.kind,'awaitResponse','requester 是否被回應仍由自己的 private wait Intent 表示');
  if(E.isSleeping(human)){
    assert.equal(contact.data.perceivedByTarget,false,'沒有叫醒時不得聲稱睡著的人已感知 Bid');
    assert.equal(human.observedSocialBids.some(x=>x.bidId===contact.id),false,'未感知的 Bid 不得進入 responder local observations');
    const miss=st.events.find(e=>e.data?.action==='sleepDisturbance'&&e.data?.target===human.id);
    assert.ok(miss,'未喚醒時應留下可觀測的 disturbance 結果');
    assert.equal(miss.data.wakeChance,before);
  }else{
    assert.equal(contact.data.perceivedByTarget,true,'真的被叫醒後 contact 才可標記為 target perceived');
    assert.ok(human.observedSocialBids.some(x=>x.bidId===contact.id),'真的被叫醒後 responder 才保留自己的 observed Social Bid reference');
    const wake=st.events.find(e=>e.data?.action==='sleepWake');
    assert.ok(wake?.causeIds?.includes(contact.id),'互動喚醒應保留造成喚醒的接觸事件因果鏈');
  }
  assert.equal(Object.prototype.hasOwnProperty.call(human,'pendingInteraction'),false,'Current lifecycle 不得恢復 legacy pendingInteraction');
  noIssues('animal disturbs sleeping human coherently');
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
  st.agents.zhou.offMap=true;
  human.position={...cat.position};
  human.action={kind:'petAnimal',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};
  E.tick();
  const pet=st.events.find(e=>e.data?.action==='petAnimal');
  assert.ok(pet);
  assert.ok(!pet.text.includes('靠過去蹭'),'清醒動物被摸時也不應由 petAnimal action 固定宣告回蹭');
  noIssues('awake pet does not fabricate reciprocal rub');
}

console.log('Current social / sleep interaction regression: ok');
