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
  assert.equal(st.zones,undefined);assert.equal(st.surfaces,undefined);
  assert.equal(Object.keys(st.map.rooms).length,1,'目前單一封閉室內應自動推導成一個 Room');
  assert.ok(Object.values(st.map.tiles).some(t=>t.terrain==='wall'));
  assert.equal(st.map.tiles['0,6'].terrain,'doorway');
  assert.equal(st.containers.plateA.servingDish,true);assert.equal(st.containers.plateA.canEatFrom,true);
  assert.equal(st.containers.plateB.servingDish,true);assert.equal(st.containers.plateB.canEatFrom,true);
  assert.equal(st.containers.mealTray.canEatFrom,true);
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
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou;a.position={x:8,y:2};b.position={x:8,y:3};a.needs.fatigue=72;b.needs.fatigue=72;
  a.action={intent:'rest',phase:'chooseSurface',restTicks:0,started:st.tick,wait:0};b.action={intent:'rest',phase:'chooseSurface',restTicks:0,started:st.tick,wait:0};
  for(let i=0;i<8&&!(a.posture.kind==='sitting'&&b.posture.kind==='sitting');i++)E.tick();
  assert.equal(a.posture.furnitureId,'sofa');assert.equal(b.posture.furnitureId,'sofa');assert.notEqual(a.posture.slotId,b.posture.slotId);noIssues('sofa slots');
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
  assert.ok(plate.contents.food<before,'橘子應能直接吃可接近餐盤裡的食物');assert.equal(cat.held,null);noIssues('cat eats nearby plate food');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  st.containers.plateA.servingDish=false;st.containers.plateB.servingDish=false;a.needs.hunger=90;a.action={intent:'eat',phase:'prepare',started:st.tick,wait:0};
  E.tick();assert.equal(a.action.phase,'toDirectFood','非常餓或沒有可用餐盤時仍應保留直接吃的 fallback');assert.equal(a.held,null);noIssues('direct meal fallback');
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
}
console.log('v11.2-state-regression: ok');
