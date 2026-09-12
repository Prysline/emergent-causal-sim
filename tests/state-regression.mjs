import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const core=['world.js','engine.js','recovery.js','supply.js','spatial.js','furniture.js','action-guard.js','seating.js','state-validator.js'];
for(const file of core){vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});}
const E=globalThis.SimEngine,SP=globalThis.SimSpatial;

function noIssues(label){
  const v=E.validateState();
  if(v.issueCount){
    const st=E.getState(),ids=new Set(v.issues.flatMap(x=>[x.agentId,x.containerId].filter(Boolean)));
    const debug={tick:st.tick,issues:v.issues,agents:{},containers:{},events:st.events.slice(0,12)};
    for(const id of ids){if(st.agents[id])debug.agents[id]=st.agents[id];if(st.containers[id])debug.containers[id]=st.containers[id];}
    console.error('STATE_DEBUG',JSON.stringify(debug,null,2));
  }
  assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);
}

for(const seed of [20260911,7,42]){
  E.reset(seed);noIssues(`reset seed ${seed}`);
  for(let i=0;i<800;i++){E.tick();noIssues(`seed ${seed} tick ${i+1}`);}
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,before=st.containers.mealTray.contents.food;
  a.plan={intent:'eat',phase:'move',targetObject:'mealTray',wait:0,started:st.tick};
  const start={...a.position};E.tick();
  assert.equal(st.containers.mealTray.contents.food,before,'移動 tick 不應同時吃掉食物');
  assert.equal(Math.abs(a.position.x-start.x)+Math.abs(a.position.y-start.y),1,'移動 tick 應最多前進一格');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,other=st.agents.zhou;
  a.position={x:7,y:2};a.location='table';other.position={x:10,y:2};other.location='rest';
  a.plan={intent:'drinkWater',phase:'toVessel',container:'cupB',resource:'water',sourceObject:'waterBucket',wait:0,started:st.tick};
  const bucket=st.containers.waterBucket.contents.water;
  E.tick();
  assert.equal(a.held,'cupB','抵達杯旁後應只完成拿杯子 phase');
  assert.equal(st.containers.waterBucket.contents.water,bucket,'拿杯子的同一 tick 不應同時取水');
  assert.equal(a.plan?.phase,'toSource','phase 應保留到下一 tick 再執行');
  noIssues('phase guard');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,start={...a.position},tiles=st.spatial.tiles;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const t=tiles[`${start.x+dx},${start.y+dy}`];if(t)t.walkable=false;}
  const path=SP.astar(start,{x:1,y:1},a.id);
  assert.deepEqual(path,[],'不可達路徑應回傳空陣列，而不是 [start]');
}

for(const file of ['spatial-ui.js','furniture-ui.js']){
  const src=fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
  assert.ok(!src.includes('MutationObserver'),`${file} 不應再靠 MutationObserver 維護 Inspector/selection`);
}
console.log('state-regression: ok');
