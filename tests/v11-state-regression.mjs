import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','engine.js','state-validator.js'])vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;

function noIssues(label){const v=V.validateState(E.getState());if(v.issueCount)console.error('STATE_DEBUG',label,JSON.stringify(v,null,2));assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);}
function digest(st){return JSON.stringify({tick:st.tick,day:st.day,minute:st.minute,agents:Object.fromEntries(Object.entries(st.agents).map(([id,a])=>[id,{position:a.position,needs:a.needs,status:a.status,posture:a.posture,held:a.held,carrying:a.carrying,action:a.action,offMap:a.offMap}])),containers:Object.fromEntries(Object.entries(st.containers).map(([id,c])=>[id,{position:c.position,contents:c.contents,supportId:c.supportId}])),supply:st.supply,events:st.events.slice(0,20).map(e=>[e.time,e.text,e.type,e.data?.entities])});}

E.reset(20260911);
{
  const st=E.getState();
  assert.equal(st.version,'11.7-core-consolidation');
  assert.equal(st.interactionModel,undefined);assert.equal(st.zones,undefined);assert.equal(st.surfaces,undefined);assert.equal(st.debug,undefined);
  assert.equal(st.supply.workerId,undefined,'補給者不得保存第二份 owner truth');
  assert.equal(Object.keys(st.map.rooms).length,1);
  assert.ok(Object.values(st.map.tiles).some(t=>t.terrain==='wall'));
  assert.equal(st.map.tiles['0,6'].terrain,'doorway');
  assert.equal(st.containers.waterBucket.portable,true);assert.equal(st.containers.waterBucket.interactions.pickup.mode,'occupy');assert.equal(st.containers.waterBucket.interactions.drinkFrom.mode,'reach');
  assert.ok(st.containers.mealTray.restock&&st.containers.waterBucket.restock,'補充需求應存在 World policy，而不是寫死在 Engine');
  assert.ok(st.sources.tap.interactions.fill&&st.sources.tap.interactionPorts.length);
  const before=JSON.stringify(st),validation=V.validateState(st),after=JSON.stringify(st);assert.equal(validation.issueCount,0);assert.equal(after,before,'Validator 必須是純函式，不得寫回 simulation state');
}

for(const seed of [20260911,7,42]){E.reset(seed);noIssues(`reset ${seed}`);for(let i=0;i<800;i++){E.tick();noIssues(`seed ${seed} tick ${i+1}`);}}
E.reset(77);for(let i=0;i<300;i++)E.tick();const d1=digest(E.getState());E.reset(77);for(let i=0;i<300;i++)E.tick();assert.equal(digest(E.getState()),d1,'相同 Seed 必須完全重現');

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,start={...a.position};a.action={intent:'wander',phase:'move',started:st.tick,targetTile:{x:2,y:5},wait:0};E.tick();assert.equal(Math.abs(a.position.x-start.x)+Math.abs(a.position.y-start.y),1,'一個 tick 最多移動一格');noIssues('atomic movement');
}

function oneStepLoadCase({water=null,foodCarry=null}){
  E.reset(12345);const st=E.getState(),a=st.agents.zhen,bucket=st.containers.waterBucket;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;a.position={x:2,y:5};a.metrics.exertionToday=0;a.held=null;a.carrying=null;
  if(water!==null){bucket.contents={water};bucket.position={...a.position};a.held='waterBucket';}if(foodCarry!==null)a.carrying={resource:'food',amount:foodCarry};a.action={intent:'wander',phase:'move',targetTile:{x:3,y:5},started:st.tick,wait:0};E.tick();return {exertion:a.metrics.exertionToday,load:a.metrics.lastExertion?.load||0};
}
{
  const empty=oneStepLoadCase({water:0}),full=oneStepLoadCase({water:100});assert.ok(full.load>empty.load);assert.ok(full.exertion>empty.exertion);
  const light=oneStepLoadCase({foodCarry:10}),heavy=oneStepLoadCase({foodCarry:40});assert.ok(heavy.load>light.load);assert.ok(heavy.exertion>light.exertion);
}

E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange;cat.needs.fatigue=75;cat.action={intent:'rest',phase:'chooseSurface',restTicks:0,started:st.tick,wait:0};for(let i=0;i<6&&cat.posture.kind==='standing';i++)E.tick();assert.ok(['lying','sitting'].includes(cat.posture.kind));noIssues('cat rest posture');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou;st.agents.orange.offMap=true;a.position={x:8,y:5};b.position={x:8,y:4};a.needs.fatigue=90;b.needs.fatigue=90;
  for(const x of [a,b])x.action={intent:'sleep',phase:'chooseSurface',sleepTicks:0,minSleepTicks:18,targetFatigue:12,started:st.tick,wait:0};
  for(let i=0;i<12&&!(a.action?.phase==='sleeping'&&b.action?.phase==='sleeping');i++){E.tick();noIssues(`sleep ${i}`);}assert.equal(a.posture.furnitureId,'bed');assert.equal(b.posture.furnitureId,'bed');assert.notEqual(a.posture.slotId,b.posture.slotId);
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;const trayBefore=st.containers.mealTray.contents.food;a.needs.hunger=60;a.action={intent:'eat',phase:'prepare',started:st.tick,wait:0};for(let i=0;i<45&&a.action;i++)E.tick();assert.equal(a.action,null);const serve=st.events.find(e=>e.data?.action==='serveFood');assert.ok(serve);assert.ok(st.containers.mealTray.contents.food<trayBefore);assert.equal(a.held,null);assert.ok(serve.data.entities.includes(`agent:${a.id}`));noIssues('serving meal');
}

E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,plate=st.containers.plateA;st.agents.zhen.offMap=true;st.agents.zhou.offMap=true;st.containers.mealTray.contents.food=0;plate.contents={food:8};plate.position={x:3,y:6};delete plate.supportId;cat.position={x:2,y:6};cat.needs.hunger=80;cat.action={intent:'eat',phase:'prepare',started:st.tick,wait:0};const before=plate.contents.food;for(let i=0;i<8&&cat.action;i++){E.tick();assert.equal(cat.held,null);}assert.ok((plate.contents.food||0)<before);noIssues('cat eats plate');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,bucket=st.containers.waterBucket;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;bucket.contents.water=0;a.position={x:4,y:5};a.action={intent:'restockContainer',phase:'toContainer',destinationId:'waterBucket',sourceId:'tap',sourceKind:'source',resource:'water',strategy:'carryContainer',started:st.tick,wait:0};for(let i=0;i<25&&a.action;i++)E.tick();assert.equal(a.action,null);assert.ok(bucket.contents.water>0);assert.deepEqual(bucket.position,{x:5,y:5});noIssues('portable restock');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,tray=st.containers.mealTray,pantry=st.containers.foodPantry;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;tray.contents.food=0;const before=pantry.contents.food;a.action={intent:'restockContainer',phase:'toSource',destinationId:'mealTray',sourceId:'foodPantry',sourceKind:'object',resource:'food',strategy:'carryResource',started:st.tick,wait:0};for(let i=0;i<30&&a.action;i++)E.tick();assert.ok((tray.contents.food||0)>0);assert.ok(pantry.contents.food<before);assert.equal(a.carrying,null);noIssues('resource restock');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,door=SP.allSlots(st).find(s=>s.canExit),dest=Object.values(st.containers).find(c=>SP.hasRole(c,'externalSupplyDestination'));st.agents.zhou.offMap=true;st.agents.orange.offMap=true;const before=dest.contents.food;a.action={intent:'externalSupply',phase:'toExit',exitSlot:door.id,destinationId:dest.id,resource:'food',workLeft:1,produced:0,started:st.tick,wait:0};assert.equal(E.supplyStatus().workerId,a.id,'worker 應由 active action 推導');for(let i=0;i<40&&a.action;i++)E.tick();assert.equal(a.action,null);assert.equal(E.supplyStatus().workerId,null);assert.ok(dest.contents.food>before);assert.equal(st.supply.workerId,undefined);noIssues('derived supply owner');
}

E.reset(20260911);
{
  const st=E.getState(),target=st.agents.zhen,actor=st.agents.zhou;target.offMap=true;actor.action={intent:'talk',phase:'move',targetAgent:target.id,started:st.tick,wait:0};E.tick();assert.equal(actor.action,null);assert.ok(st.events.some(e=>e.text.includes(`${target.name}已經離開可互動範圍`)));noIssues('target interruption');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,cat=st.agents.orange;a.action={intent:'petCat',phase:'move',targetAgent:cat.id,spatialGoal:{x:5,y:4},started:0,wait:0};assert.equal(E.actionLabel(a),`摸${cat.name}・目標 (5,4)`);assert.ok(!E.actionLabel(a).includes('・・'));
}

{
  const engine=fs.readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');
  for(const id of ['waterBucket','mealTray','foodPantry','alcoholBottle','frontDoor:inside',"targetAgent:'orange'"])assert.ok(!engine.includes(id),`Engine 不得綁定具體世界 entity ID：${id}`);
  assert.ok(!engine.includes('supply.workerId'),'Engine 不得維護第二份 supply owner truth');
  assert.ok(!engine.includes('planLabel:'),'不得保留舊 planLabel compatibility alias');
  const validator=fs.readFileSync(new URL('../src/state-validator.js',import.meta.url),'utf8');
  assert.ok(!validator.includes('E.validateState='));assert.ok(!validator.includes('validationStatus='));assert.ok(!validator.includes('debug.validation'));
  const world=fs.readFileSync(new URL('../src/world.js',import.meta.url),'utf8');
  assert.ok(!world.includes("id==='mealTray'"),'World 初始化不得以 entity ID skip list 決定 blocker');
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const legacy of ['recovery.js','supply.js','action-guard.js','seating.js','rest-surface.js','spatial-ui.js','furniture-ui.js','recovery-ui.js','supply-ui.js'])assert.ok(!index.includes(legacy));
}
console.log('v11.7 core consolidation regression: ok');
