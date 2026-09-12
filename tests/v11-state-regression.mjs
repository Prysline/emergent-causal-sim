import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','engine.js','state-validator.js'])vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
const E=globalThis.SimEngine,SP=globalThis.SimSpatial;

function noIssues(label){const v=E.validateState();if(v.issueCount)console.error('STATE_DEBUG',label,JSON.stringify(v,null,2));assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);}
function digest(st){return JSON.stringify({tick:st.tick,day:st.day,minute:st.minute,agents:Object.fromEntries(Object.entries(st.agents).map(([id,a])=>[id,{position:a.position,needs:a.needs,status:a.status,posture:a.posture,held:a.held,carrying:a.carrying,action:a.action,offMap:a.offMap}])),containers:Object.fromEntries(Object.entries(st.containers).map(([id,c])=>[id,{position:c.position,contents:c.contents,supportId:c.supportId}])),supply:st.supply,events:st.events.slice(0,20).map(e=>[e.time,e.text,e.type])});}

E.reset(20260911);
{
  const st=E.getState();
  assert.equal(st.version,'11.5-sleep-bed');
  assert.equal(st.zones,undefined);assert.equal(st.surfaces,undefined);
  assert.equal(Object.keys(st.map.rooms).length,1,'目前單一封閉室內應自動推導成一個 Room');
  assert.ok(Object.values(st.map.tiles).some(t=>t.terrain==='wall'));
  assert.equal(st.map.tiles['0,6'].terrain,'doorway');
  assert.equal(st.containers.plateA.servingDish,true);assert.equal(st.containers.plateA.canEatFrom,true);
  assert.equal(st.containers.plateB.servingDish,true);assert.equal(st.containers.plateB.canEatFrom,true);
  assert.equal(st.containers.mealTray.canEatFrom,true);
  assert.equal(st.containers.waterBucket.portable,true,'v11.3 水桶必須是可攜 Container');
  assert.ok(E.RESOURCE_TYPES.water.loadPerUnit>0&&E.RESOURCE_TYPES.food.loadPerUnit>0,'資源必須具有通用 loadPerUnit');
  assert.ok(st.containers.waterBucket.emptyLoad>0&&st.containers.plateA.emptyLoad>0,'可攜容器必須具有 emptyLoad');
  assert.equal(st.containers.waterBucket.currentLoad,undefined,'不得儲存需要同步的 currentLoad 快取');
  assert.equal(st.furniture.bed.slots.length,2,'v11.5 雙人床必須提供兩個獨立 slot');
  assert.ok(st.furniture.bed.slots.every(s=>s.canSleep&&s.canRest&&s.restPosture==='lying'),'床位必須同時是可躺短休與可睡眠 slot');
  assert.ok(st.furniture.sofa.slots.every(s=>s.canSleep),'沙發保留較低品質的合法睡眠 fallback');
  noIssues('initial contract');
}

for(const seed of [20260911,7,42]){E.reset(seed);noIssues(`reset ${seed}`);for(let i=0;i<800;i++){E.tick();noIssues(`seed ${seed} tick ${i+1}`);}}

E.reset(77);for(let i=0;i<300;i++)E.tick();const d1=digest(E.getState());
E.reset(77);for(let i=0;i<300;i++)E.tick();const d2=digest(E.getState());
assert.equal(d1,d2,'相同 Seed 必須完全重現');

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,start={...a.position};
  a.action={intent:'wander',phase:'move',started:st.tick,targetTile:{x:2,y:5},wait:0};E.tick();
  assert.equal(Math.abs(a.position.x-start.x)+Math.abs(a.position.y-start.y),1,'一個 tick 最多移動一格');noIssues('atomic movement');
}

function oneStepLoadCase({water=null,foodCarry=null}){
  E.reset(12345);
  const st=E.getState(),a=st.agents.zhen,bucket=st.containers.waterBucket;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  a.position={x:2,y:5};a.metrics.exertionToday=0;a.held=null;a.carrying=null;
  if(water!==null){bucket.contents={water};bucket.position={...a.position};a.held='waterBucket';}
  if(foodCarry!==null)a.carrying={resource:'food',amount:foodCarry};
  a.action={intent:'wander',phase:'move',targetTile:{x:3,y:5},started:st.tick,wait:0};
  E.tick();
  return {exertion:a.metrics.exertionToday,load:a.metrics.lastExertion?.load||0};
}
{
  const empty=oneStepLoadCase({water:0}),full=oneStepLoadCase({water:100});
  assert.ok(full.load>empty.load,'滿水桶的即時負重必須高於空水桶');
  assert.ok(full.exertion>empty.exertion,'相同角色與路程下，滿水桶必須造成更多活動量');
}
{
  const light=oneStepLoadCase({foodCarry:10}),heavy=oneStepLoadCase({foodCarry:40});
  assert.ok(heavy.load>light.load,'抽象搬運較多食物時負重必須較高');
  assert.ok(heavy.exertion>light.exertion,'抽象搬運較多食物時相同步行必須更耗力');
}
E.reset(20260911);
{
  const st=E.getState(),bucket=st.containers.waterBucket;
  bucket.contents={};const empty=E.containerLoad('waterBucket');
  E.transferResource('water','tap','waterBucket',20);const filled=E.containerLoad('waterBucket');
  assert.ok(filled>empty,'內容物增加後 containerLoad 必須即時計算變重');
  assert.equal(bucket.currentLoad,undefined,'重量不得另存 cached currentLoad');
  const a=st.agents.zhen;a.held='plateA';st.containers.plateA.contents={food:10};a.carrying={resource:'food',amount:20};
  assert.ok(Math.abs(E.effectiveCarryLoad(a)-(E.containerLoad('plateA')+E.carriedResourceLoad(a.carrying)))<1e-9,'held 與 carrying 必須共用同一 total carry load');
  noIssues('derived carry load');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,c=st.containers.cupB;
  a.position={x:4,y:3};c.position={x:4,y:4};delete c.supportId;
  a.action={intent:'drinkWater',phase:'toVessel',container:'cupB',sourceObject:'waterBucket',resource:'water',started:st.tick,wait:0};
  E.tick();assert.equal(a.action.phase,'take','相鄰 Tile 不得再被舊 Zone prerequisite 阻擋');
  E.tick();assert.equal(a.held,'cupB');assert.equal(a.action.phase,'toSource');noIssues('cross-boundary interaction');
}

E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange;cat.needs.fatigue=75;cat.action={intent:'rest',phase:'chooseSurface',restTicks:0,started:st.tick,wait:0};
  for(let i=0;i<5&&cat.posture.kind==='standing';i++)E.tick();
  assert.ok(['lying','sitting'].includes(cat.posture.kind),'貓休息時必須有正式 posture');noIssues('cat rest posture');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou;
  for(const s of st.furniture.bed.slots)s.canRest=false;
  a.position={x:8,y:2};b.position={x:8,y:3};a.needs.fatigue=72;b.needs.fatigue=72;
  a.action={intent:'rest',phase:'chooseSurface',restTicks:0,started:st.tick,wait:0};b.action={intent:'rest',phase:'chooseSurface',restTicks:0,started:st.tick,wait:0};
  for(let i=0;i<8&&!(a.posture.kind==='sitting'&&b.posture.kind==='sitting');i++)E.tick();
  assert.equal(a.posture.furnitureId,'sofa');assert.equal(b.posture.furnitureId,'sofa');assert.notEqual(a.posture.slotId,b.posture.slotId);noIssues('sofa slots');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou;st.agents.orange.offMap=true;
  a.position={x:8,y:5};b.position={x:8,y:4};a.needs.fatigue=90;b.needs.fatigue=90;
  a.action={intent:'sleep',phase:'chooseSurface',sleepTicks:0,minSleepTicks:18,targetFatigue:12,started:st.tick,wait:0};
  b.action={intent:'sleep',phase:'chooseSurface',sleepTicks:0,minSleepTicks:18,targetFatigue:12,started:st.tick,wait:0};
  for(let i=0;i<12&&!(a.action?.phase==='sleeping'&&b.action?.phase==='sleeping');i++){E.tick();noIssues(`two sleepers tick ${i+1}`);}
  assert.equal(a.action?.phase,'sleeping');assert.equal(b.action?.phase,'sleeping');
  assert.equal(a.posture.kind,'lying');assert.equal(b.posture.kind,'lying');
  assert.equal(a.posture.furnitureId,'bed');assert.equal(b.posture.furnitureId,'bed');assert.notEqual(a.posture.slotId,b.posture.slotId,'兩人睡眠必須占用不同床位');noIssues('two bed sleep slots');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,owner=st.agents.zhou;st.agents.orange.offMap=true;owner.offMap=true;
  st.reservations['slot:bed:left']=owner.id;st.reservations['slot:bed:right']=owner.id;
  a.needs.fatigue=90;a.action={intent:'sleep',phase:'chooseSurface',sleepTicks:0,minSleepTicks:18,targetFatigue:12,started:st.tick,wait:0};
  E.tick();assert.ok(a.action?.sleepTarget?.id?.startsWith('sofa:'),'床位都不可用時，睡眠應能選擇 canSleep 沙發 fallback');
  delete st.reservations['slot:bed:left'];delete st.reservations['slot:bed:right'];noIssues('sleep sofa fallback');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,slot=SP.getSlot(st,'bed:left');st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  const rest=E.restRecoveryInfo(a),sleep=E.sleepRecoveryInfo(a);assert.ok(sleep.recovery>rest.recovery,'同一張床上，sleep 每 tick 恢復必須高於短休');noIssues('sleep stronger than rest');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,slot=SP.getSlot(st,'bed:left');st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  a.position={...slot.position};a.needs.fatigue=90;a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};a.action={intent:'sleep',phase:'sleeping',sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},sleepTicks:2,minSleepTicks:18,targetFatigue:12,started:st.tick,wait:0};
  E.addNoise(a.position,100,2,'test-noise');E.tick();assert.equal(a.action?.phase,'sleeping','v11.5 不應因單次噪音自行新增未定案的吵醒規則');noIssues('sleep commitment under noise');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  a.position={x:8,y:5};a.needs.fatigue=88;a.action={intent:'sleep',phase:'chooseSurface',sleepTicks:0,minSleepTicks:18,targetFatigue:12,started:st.tick,wait:0};let enteredSleep=false;
  for(let i=0;i<120&&a.action;i++){E.tick();if(a.action?.phase==='sleeping')enteredSleep=true;noIssues(`natural wake tick ${i+1}`);}
  assert.equal(enteredSleep,true,'睡眠流程必須真正進入 sleeping phase');assert.equal(a.action,null,'充分恢復後必須自然結束 sleep action');assert.ok(a.needs.fatigue<20,'自然醒後 fatigue 應已顯著恢復');assert.ok(st.events.some(e=>e.data?.action==='sleepWake'),'自然醒必須留下可觀察 timeline 事件');assert.equal(a.posture.kind,'lying','醒來後可保持躺著，下一次移動再正式起身');noIssues('natural wake');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou;b.position={...a.position};const v=E.validateState();assert.equal(v.issueCount,0);assert.equal(v.crowdingTiles.length,1);
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  const trayBefore=st.containers.mealTray.contents.food;a.needs.hunger=60;a.action={intent:'eat',phase:'prepare',started:st.tick,wait:0};
  for(let i=0;i<40&&a.action;i++)E.tick();
  assert.equal(a.action,null,'一般人類用餐流程應可完整結束');
  const serve=st.events.find(e=>e.data?.action==='serveFood');assert.ok(serve,'一般人類應先把食物盛入餐盤');
  const plate=st.containers[serve.data.to];assert.equal(plate.servingDish,true);assert.equal(plate.contents.food||0,0,'吃完後餐盤應為空');
  assert.ok(st.containers.mealTray.contents.food<trayBefore,'盛盤必須真的從現成食物轉移資源');
  assert.equal(a.held,null,'吃完應把餐盤留在用餐位置');assert.ok(SP.same(plate.position,a.position),'空盤應留在角色吃完的位置');
  assert.equal(a.posture.kind,'sitting','有空座位時人類應優先坐著吃');noIssues('human serving plate meal');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou,plate=st.containers.plateA;
  st.agents.orange.offMap=true;
  const nw=SP.getSlot(st,'chairNW:seat');b.position={...nw.position};b.posture={kind:'sitting',slotId:nw.id,furnitureId:nw.furnitureId};
  st.reservations['slot:chairSW:seat']='zhou';
  a.position={x:4,y:2};a.held='plateA';delete plate.supportId;plate.position={...a.position};plate.contents={food:8};a.action={intent:'eat',phase:'chooseSeat',container:'plateA',started:st.tick,wait:0};
  E.tick();assert.equal(a.action.phase,'toSeat');assert.ok(['chairNE:seat','chairSE:seat'].includes(a.action.slotId),'拿著餐盤後應能選擇餐桌右側座位，不再受 mealTray 單點限制');
  delete st.reservations['slot:chairSW:seat'];noIssues('plate decouples meal seat from tray');
}

E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,plate=st.containers.plateA;
  st.agents.zhen.offMap=true;st.agents.zhou.offMap=true;st.containers.mealTray.contents.food=0;
  plate.contents={food:8};plate.position={x:3,y:6};delete plate.supportId;cat.position={x:2,y:6};cat.needs.hunger=80;cat.action={intent:'eat',phase:'prepare',started:st.tick,wait:0};
  const before=plate.contents.food;
  for(let i=0;i<8&&cat.action;i++){E.tick();assert.equal(cat.held,null,'橘子吃盤中食物時不得拿起餐盤');}
  assert.ok((plate.contents.food||0)<before,'橘子應能直接吃可接近餐盤裡的食物');assert.equal(cat.held,null);noIssues('cat eats nearby plate food');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  st.containers.plateA.servingDish=false;st.containers.plateB.servingDish=false;a.needs.hunger=90;a.action={intent:'eat',phase:'prepare',started:st.tick,wait:0};
  E.tick();assert.equal(a.action.phase,'toDirectFood','非常餓或沒有可用餐盤時仍應保留直接吃的 fallback');assert.equal(a.held,null);noIssues('direct meal fallback');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,bucket=st.containers.waterBucket;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;bucket.contents.water=5;bucket.position={x:2,y:5};delete bucket.supportId;a.position={x:2,y:5};
  const before=bucket.contents.water;a.action={intent:'refillWater',phase:'toBucket',started:st.tick,wait:0};let heldDuringTrip=false;
  for(let i=0;i<30&&a.action;i++){E.tick();if(a.held==='waterBucket')heldDuringTrip=true;}
  assert.equal(a.action,null,'補水流程應能完整結束');assert.ok(heldDuringTrip,'角色必須真的拿起水桶再搬去補水');assert.ok(bucket.contents.water>before,'實際抵達水龍頭後水桶水量才可增加');assert.equal(a.held,null,'補完水後應放下水桶');assert.ok(!SP.same(bucket.position,{x:2,y:5}),'水桶應隨角色移到水龍頭附近，而不是留在遠處被補水');assert.ok(SP.isAtInteraction(st,a,{kind:'source',id:'tap'}),'補水完成位置必須能實際操作水龍頭');assert.ok(st.events.some(e=>e.data?.action==='refillWater'&&e.data?.from==='tap'&&e.data?.to==='waterBucket'),'timeline 應記錄實際來源與目的容器');noIssues('portable bucket refill');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,bucket=st.containers.waterBucket;bucket.contents.water=5;a.position={x:5,y:5};a.held=null;a.action={intent:'refillWater',phase:'fill',started:st.tick,wait:0};const before=bucket.contents.water;
  E.tick();assert.equal(bucket.contents.water,before,'只站在水龍頭旁但沒有拿著水桶時不得遠端補水');assert.equal(a.action,null,'違反 transfer contract 時應中止該行動');noIssues('reject remote bucket refill');
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange,bucket=st.containers.waterBucket;human.position={x:3,y:5};human.held='waterBucket';bucket.position={...human.position};cat.position={x:2,y:5};cat.action={intent:'drinkWater',phase:'move',targetObject:'waterBucket',resource:'water',started:st.tick,wait:0};
  E.tick();assert.equal(cat.action,null,'橘子不能直接喝正在被別人拿著的水桶');assert.equal(human.held,'waterBucket');noIssues('cat respects held bucket');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,before=st.containers.foodPantry.contents.food;
  st.supply.workerId=a.id;a.position={x:9,y:5};a.carrying={resource:'food',amount:40};a.action={intent:'supplyFood',phase:'returnPantry',workLeft:0,produced:40,started:st.tick,wait:0};
  E.tick();assert.equal(st.containers.foodPantry.contents.food,before,'未抵達食物櫃前不得入庫');
  for(let i=0;i<20&&a.action?.phase==='returnPantry';i++)E.tick();if(a.action?.phase==='deposit')E.tick();
  assert.ok(st.containers.foodPantry.contents.food>before,'抵達 interaction position 後才可入庫');noIssues('supply physical deposit');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,start={...a.position};for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const t=SP.tileAt(st,start.x+dx,start.y+dy);if(t?.terrain==='floor')t.walkable=false;}assert.deepEqual(SP.astar(st,start,{x:2,y:2},a.id),[]);
}

E.reset(20260911);
{
  const st=E.getState(),target=st.agents.zhen,actor=st.agents.zhou;
  target.offMap=true;actor.action={intent:'talk',phase:'move',targetAgent:'zhen',started:st.tick,wait:0};
  E.tick();
  assert.equal(actor.action,null,'互動目標離開可互動世界時應強烈中斷，而不是永久等待');
  assert.ok(st.events.some(e=>e.text.includes('阿真已經離開可互動範圍')),'中斷原因應可從 timeline 觀察');
  noIssues('off-map target interruption');
}

E.reset(20260911);
{
  const a=E.getState().agents.zhen;
  a.action={intent:'petCat',phase:'move',targetAgent:'orange',spatialGoal:{x:5,y:4},started:0,wait:0};
  assert.equal(E.actionLabel(a),'摸橘子・目標 (5,4)');
  a.action={intent:'seekHuman',phase:'move',targetAgent:'zhou',spatialGoal:{x:4,y:3},started:0,wait:0};
  assert.equal(E.actionLabel(a),'找人撒嬌・目標 (4,3)');
  assert.ok(!E.actionLabel(a).includes('・・'),'行動標籤不得重複分隔符');
}

{
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const legacy of ['recovery.js','supply.js','action-guard.js','seating.js','rest-surface.js','spatial-ui.js','furniture-ui.js','recovery-ui.js','supply-ui.js'])assert.ok(!index.includes(legacy),`index 不應再載入 ${legacy}`);
  const css=fs.readFileSync(new URL('../styles/app.css',import.meta.url),'utf8');
  assert.ok(css.includes('.slot-row{display:grid;grid-template-columns:minmax(0,1fr) auto;'),'Furniture slot Inspector 應使用可收縮的兩欄 layout');
  assert.ok(!css.includes('grid-template-columns:minmax(70px,1fr) 70px minmax(90px,1fr) minmax(90px,1fr)'),'不得恢復會讓 360px Inspector 爆版的四欄最小寬度');
  const engine=fs.readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');
  assert.ok(!engine.includes('(a.carrying.amount||0)*.0015'),'不得恢復舊 carrying.amount 專用移動成本公式');
  assert.ok(!engine.includes('window.SimSleep'),'Sleep 不得回到獨立 wrapper／patch runtime');
}
console.log('v11.5-state-regression: ok');