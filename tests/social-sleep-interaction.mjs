import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','engine.js','state-validator.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

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
  a.action={intent:'sleep',phase:'sleeping',sleepTicks,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};
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
  human.position={x:9,y:2};
  cat.needs.sleepNeed=100;
  putToSleep(st,cat,'sofa:left',0);
  assert.equal(E.interactionWakeChance(cat,18),0,'高 sleepNeed 且剛入睡時，輕摸可以完全不足以喚醒');
  human.action={intent:'petCat',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};
  E.tick();

  assert.equal(cat.action?.intent,'sleep','輕摸不一定叫醒正在深睡的貓');
  const pet=st.events.find(e=>e.data?.action==='petCat');
  assert.ok(pet,'摸貓本身應記為發起者 action');
  assert.ok(!pet.text.includes('蹭了幾下'),'摸貓不得再固定虛構貓有回蹭');
  const noResponse=st.events.find(e=>e.data?.action==='sleepDisturbance'&&e.data?.target===cat.id);
  assert.ok(noResponse?.text.includes('沒有對摸觸作出明顯回應'),'睡著且未醒的貓應明確保持無回應');
  assert.equal(noResponse.data.wakeChance,0);
  assert.equal(noResponse.data.stimulusKind,'touch');
  noIssues('pet sleeping cat without fabricated response');
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
  st.agents.zhou.offMap=true;
  human.position={x:9,y:2};
  cat.position={x:9,y:2};
  cat.action={intent:'seekHuman',phase:'interact',targetAgent:human.id,started:st.tick,wait:0};
  human.needs.sleepNeed=70;
  putToSleep(st,human,'sofa:left',0);
  const before=E.interactionWakeChance(human,34);
  E.tick();

  const contact=st.events.find(e=>e.data?.action==='seekHuman');
  assert.ok(contact,'貓打擾睡著的人仍應先形成真實接觸事件');
  assert.equal(contact.data.stimulusIntensity,34);
  assert.equal(contact.data.stimulusKind,'touch+sound');
  if(E.isSleeping(human)){
    assert.equal(human.pendingInteraction,null,'沒有叫醒時不得假設睡著的人已接收到撒嬌請求');
    const miss=st.events.find(e=>e.data?.action==='sleepDisturbance'&&e.data?.target===human.id);
    assert.ok(miss,'未喚醒時應留下可觀測的 disturbance 結果');
    assert.equal(miss.data.wakeChance,before);
  }else{
    assert.equal(human.pendingInteraction?.type,'cat_request','真的被叫醒後才建立可回應的貓撒嬌請求');
    const wake=st.events.find(e=>e.data?.action==='sleepWake');
    assert.ok(wake?.causeIds?.includes(contact.id),'互動喚醒應保留造成喚醒的接觸事件因果鏈');
  }
  noIssues('cat disturbs sleeping human coherently');
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
  st.agents.zhou.offMap=true;
  human.position={...cat.position};
  human.action={intent:'petCat',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};
  E.tick();
  const pet=st.events.find(e=>e.data?.action==='petCat');
  assert.ok(pet);
  assert.ok(!pet.text.includes('靠過去蹭'),'清醒貓被摸時也不應由 petCat action 固定宣告回蹭');
  noIssues('awake pet does not fabricate reciprocal rub');
}

console.log('v11.10 social / sleep interaction regression: ok');
