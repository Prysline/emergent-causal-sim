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
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou,slot=SP.getSlot(st,'chairNW:seat');
  a.position={...slot.position};a.posture={kind:'sitting',slotId:slot.id,furnitureId:slot.furnitureId};
  b.position={x:4,y:3};b.needs.hunger=55;b.action={intent:'eat',phase:'prepare',targetObject:'mealTray',started:st.tick,wait:0};
  E.tick();assert.equal(b.action.phase,'toFood','能碰到 mealTray 的座位被占用時應允許站著吃');
  assert.ok(!Object.entries(st.reservations).some(([k,v])=>k.startsWith('slot:')&&v===b.id),'站著吃不應留下座位預約');noIssues('standing meal fallback');
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

{
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const legacy of ['recovery.js','supply.js','action-guard.js','seating.js','rest-surface.js','spatial-ui.js','furniture-ui.js','recovery-ui.js','supply-ui.js'])assert.ok(!index.includes(legacy),`index 不應再載入 ${legacy}`);
}
console.log('v11-state-regression: ok');
