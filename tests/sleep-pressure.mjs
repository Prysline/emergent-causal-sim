import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world-authoring-v1.js','world-initializer.js','world.js','release.js','spatial.js','engine.js','state-validator.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine;
const SP=globalThis.SimSpatial;
const V=globalThis.SimValidator;

function noIssues(label){
  const result=V.validateState(E.getState());
  assert.equal(result.issueCount,0,`${label}: ${result.issues.map(x=>x.code+': '+x.message).join(' | ')}`);
}

function isolate(st,id='zhen'){
  for(const a of Object.values(st.agents))a.offMap=a.id!==id;
  return st.agents[id];
}

function putToSleep(st,a,{slotId='bed:left',sleepTicks=0}={}){
  const slot=SP.getSlot(st,slotId);
  assert.ok(slot?.canSleep,`${slotId} 必須是合法睡眠 slot`);
  a.position={...slot.position};
  a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  a.action={
    kind:'sleep',phase:'sleeping',sleepTicks,
    sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},
    started:st.tick,wait:0
  };
  return slot;
}

E.reset(20260911);
{
  const st=E.getState();
  assert.equal(st.version,'11.22.0-spatial-z-identity');
  for(const a of Object.values(st.agents))assert.ok(Number.isFinite(a.needs.sleepNeed),'每個 Agent 都必須有正式 sleepNeed state');
  assert.equal(E.sleepProfile(st.agents.zhen).circadianPattern,'diurnal','人類預設應為日行性');
  assert.equal(E.sleepProfile(st.agents.orange).circadianPattern,'crepuscular','貓預設應為晨昏性');
  noIssues('sleep state reset');
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
  assert.ok(E.circadianSleepBias(human,3*60)>E.circadianSleepBias(human,15*60),'日行性角色凌晨應比午後更偏向睡眠');
  assert.ok(E.circadianSleepBias(cat,12*60)>E.circadianSleepBias(cat,6*60),'晨昏性角色正午應比黎明更偏向睡眠');

  human.traits.circadianPattern='nocturnal';
  assert.ok(E.circadianSleepBias(human,15*60)>E.circadianSleepBias(human,3*60),'個體可覆寫成夜行性節律');

  delete human.traits.circadianPattern;
  human.traits.circadianPhaseOffsetMinutes=180;
  assert.ok(E.circadianSleepBias(human,6*60)>E.circadianSleepBias(human,3*60),'正相位偏移應把日行性睡眠峰向後移');
  noIssues('circadian profile overrides');
}

E.reset(20260911);
{
  const st=E.getState(),a=isolate(st);
  a.needs.fatigue=75;
  a.needs.sleepNeed=70;
  const fatigueBefore=a.needs.fatigue,sleepNeedBefore=a.needs.sleepNeed;
  a.action={kind:'rest',phase:'chooseSurface',restTicks:0,started:st.tick,wait:0};

  for(let i=0;i<40&&a.action;i++)E.tick();

  assert.equal(a.action,null,'短休應能正常完成');
  assert.ok(a.needs.fatigue<fatigueBefore-30,'短休應明顯降低活動疲勞');
  assert.ok(a.needs.sleepNeed>=sleepNeedBefore,'清醒短休不得消除 sleepNeed；清醒時間仍應累積睡眠需求');
  noIssues('rest does not erase sleep pressure');
}

E.reset(20260911);
{
  const st=E.getState(),a=isolate(st);
  st.minute=12*60;
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:90,sleepNeed:5,social:0});
  E.tick();
  assert.equal(st.thoughts[a.id]?.pick?.id,'rest','高活動疲勞但低 sleepNeed 應優先短休，不應因 fatigue 自動睡覺');
  assert.equal(a.action?.kind,'rest');
  noIssues('fatigue chooses rest');
}

E.reset(20260911);
{
  const st=E.getState(),a=isolate(st);
  st.minute=23*60;
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:10,sleepNeed:90,social:0});
  E.tick();
  assert.equal(st.thoughts[a.id]?.pick?.id,'sleep','低 fatigue 但高 sleepNeed 在合適時段仍應選擇睡眠');
  assert.equal(a.action?.kind,'sleep');
  noIssues('sleep pressure chooses sleep');
}

E.reset(20260911);
{
  const st=E.getState(),a=isolate(st),profile=E.sleepProfile(a);
  st.minute=10*60;
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:40,sleepNeed:5,social:0});
  putToSleep(st,a,{sleepTicks:profile.minSleepTicks-1});
  E.tick();

  assert.equal(a.action,null,'sleepNeed 足夠低且清醒傾向夠高時應自然醒');
  assert.equal(a.posture.kind,'lying','醒來不等於起床；未移動前應保留躺姿');
  assert.ok(a.needs.fatigue>20,'自然醒不應要求 fatigue 先降到固定低門檻');
  const wake=st.events.find(e=>e.data?.action==='sleepWake');
  assert.ok(wake?.text.includes('自然醒來'),'自然醒事件應明確標示原因');
  assert.equal(wake.data.wakeReason,'自然醒來');
  noIssues('natural wake with residual fatigue');
}

E.reset(20260911);
{
  const st=E.getState(),a=isolate(st);
  st.minute=2*60;
  Object.assign(a.needs,{hunger:0,thirst:95,fatigue:30,sleepNeed:80,social:0});
  putToSleep(st,a,{sleepTicks:2});
  E.tick();
  assert.equal(a.action,null,'極端口渴應能中斷睡眠');
  const wake=st.events.find(e=>e.data?.action==='sleepWake');
  assert.ok(wake?.text.includes('口渴'),'喚醒事件應保留口渴原因');
  noIssues('thirst wakes sleeper');
}

E.reset(20260911);
{
  const st=E.getState(),a=isolate(st);
  st.minute=2*60;
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:30,sleepNeed:80,social:0});
  putToSleep(st,a,{sleepTicks:2});
  E.addNoise(a.position,80,3,'test');
  E.tick();
  assert.equal(a.action,null,'強烈局部噪音應能吵醒角色');
  const wake=st.events.find(e=>e.data?.action==='sleepWake');
  assert.ok(wake?.text.includes('噪音'),'喚醒事件應保留噪音原因');
  noIssues('noise wakes sleeper');
}

E.reset(20260911);
{
  const st=E.getState(),a=isolate(st);
  st.minute=23*60;
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:55,sleepNeed:80,social:0});
  putToSleep(st,a,{sleepTicks:0});
  const before=a.needs.sleepNeed;
  for(let i=0;i<5&&a.action;i++)E.tick();
  assert.ok(a.needs.sleepNeed<before,'真正睡眠必須降低 sleepNeed');
  assert.equal(a.action?.kind,'sleep','高 sleepNeed 的夜間睡眠不應在幾個 tick 後立刻自然醒');
  noIssues('sleep reduces sleep pressure');
}

console.log('v11.10 sleep pressure regression: ok');
