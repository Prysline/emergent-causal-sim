import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';
globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','engine.js','validation/registry.js']);
const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;

function noIssues(label){const v=V.validateState(E.getState());if(v.issueCount)console.error('STATE_DEBUG',label,JSON.stringify(v,null,2));assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);}
function digest(st){return JSON.stringify({tick:st.tick,day:st.day,minute:st.minute,agents:Object.fromEntries(Object.entries(st.agents).map(([id,a])=>[id,{position:a.position,needs:a.needs,status:a.status,posture:a.posture,held:a.held,action:a.action,offMap:a.offMap}])),containers:Object.fromEntries(Object.entries(st.containers).map(([id,c])=>[id,{position:c.position,contents:c.contents,supportId:c.supportId}])),supply:st.supply,events:st.events.slice(0,20).map(e=>[e.time,e.text,e.type,e.data?.entities])});}

E.reset(20260911);
{
  const st=E.getState();
  assert.equal(st.version,'11.29.0-horizontal-geometry-foundation');
  assert.equal(st.interactionModel,undefined);assert.equal(st.zones,undefined);assert.equal(st.surfaces,undefined);assert.equal(st.debug,undefined);
  assert.equal(st.supply.workerId,undefined,'補給者不得保存第二份 owner truth');
  assert.equal(Object.keys(st.map.rooms).length,1);
  assert.equal(Object.hasOwn(st.map.rooms.room1,'value'),false,'Derived Room topology must not retain the removed legacy Room value aggregate');
  assert.equal(st.map.cellSizeMeters,1);
  assert.equal(Object.values(st.map.tiles).filter(t=>t.terrain==='floor').length,60);
  assert.equal(Object.values(st.map.tiles).filter(t=>t.terrain==='void').length,36);
  assert.equal(st.map.boundaries['0|v:1,6'].kind,'opening');
  assert.equal(st.doors.frontDoor.state,'open');
  assert.equal(st.exits.frontExit.kind,'offMap');
  assert.deepEqual(st.exits.frontExit.access,{x:1,y:6});
  assert.equal(st.containers.waterBucket.portable,true);assert.equal(st.containers.waterBucket.interactions.pickup.mode,'occupy');assert.equal(st.containers.waterBucket.interactions.drinkFrom.mode,'reach');
  assert.ok(st.containers.mealTray.restock&&st.containers.waterBucket.restock,'補充需求應存在 World policy，而不是寫死在 Engine');
  assert.equal(st.containers.mealTray.restock.strategy,'logisticsContainer','固體資源搬運應走真正物流容器');
  const basket=st.containers.basket;assert.ok(basket&&SP.hasRole(basket,'logisticsContainer'));assert.equal(basket.portable,true);assert.ok(basket.transportResources.includes('food'));assert.ok(basket.capacity>0);
  for(const a of Object.values(st.agents)){assert.equal(Object.prototype.hasOwnProperty.call(a,'carrying'),false,'Agent 不應再保存抽象 carrying truth');assert.ok(Number.isFinite(a.needs.sleepNeed),'Agent 應保存獨立 sleepNeed');}
  assert.ok(st.sources.tap.interactions.fill&&st.sources.tap.interactionPorts.length);
  const before=JSON.stringify(st),validation=V.validateState(st),after=JSON.stringify(st);assert.equal(validation.issueCount,0);assert.equal(after,before,'Validator 必須是純函式，不得寫回 simulation state');
}

for(const seed of [20260911,7,42]){E.reset(seed);noIssues(`reset ${seed}`);for(let i=0;i<800;i++){E.tick();noIssues(`seed ${seed} tick ${i+1}`);}}
E.reset(77);for(let i=0;i<300;i++)E.tick();const d1=digest(E.getState());E.reset(77);for(let i=0;i<300;i++)E.tick();assert.equal(digest(E.getState()),d1,'相同 Seed 必須完全重現');

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,start={...a.position};a.action={kind:'wander',phase:'move',started:st.tick,targetTile:{x:2,y:5},wait:0};E.tick();assert.equal(Math.abs(a.position.x-start.x)+Math.abs(a.position.y-start.y),1,'一個 tick 最多移動一格');noIssues('atomic movement');
}

function oneStepContainerLoadCase({water=null,basketFood=null}){
  E.reset(12345);const st=E.getState(),a=st.agents.zhen,bucket=st.containers.waterBucket,basket=st.containers.basket;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;a.position={x:2,y:5};a.metrics.exertionToday=0;a.held=null;
  if(water!==null){bucket.contents={water};bucket.position={...a.position};a.held=bucket.id;}
  if(basketFood!==null){basket.contents={food:basketFood};basket.position={...a.position};a.held=basket.id;}
  a.action={kind:'wander',phase:'move',targetTile:{x:3,y:5},started:st.tick,wait:0};E.tick();return {exertion:a.metrics.exertionToday,load:a.metrics.lastExertion?.load||0};
}
{
  const empty=oneStepContainerLoadCase({water:0}),full=oneStepContainerLoadCase({water:100});assert.ok(full.load>empty.load);assert.ok(full.exertion>empty.exertion);
  const light=oneStepContainerLoadCase({basketFood:10}),heavy=oneStepContainerLoadCase({basketFood:40});assert.ok(heavy.load>light.load,'同一物流容器裝更多食物時負重必須更高');assert.ok(heavy.exertion>light.exertion,'裝更多食物的籃子步行必須更耗力');
}

E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange;cat.needs.fatigue=75;cat.action={kind:'rest',phase:'chooseSurface',restTicks:0,started:st.tick,wait:0};for(let i=0;i<6&&cat.posture.kind==='standing';i++)E.tick();assert.ok(['lying','sitting'].includes(cat.posture.kind));noIssues('cat rest posture');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou;st.agents.orange.offMap=true;a.position={x:7,y:5};b.position={x:10,y:5};a.needs.sleepNeed=90;b.needs.sleepNeed=90;
  for(const x of [a,b])x.action={kind:'sleep',phase:'chooseSurface',sleepTicks:0,started:st.tick,wait:0};
  for(let i=0;i<20&&!(a.action?.phase==='sleeping'&&b.action?.phase==='sleeping');i++){E.tick();noIssues(`sleep ${i}`);}assert.equal(a.posture.furnitureId,'bed');assert.equal(b.posture.furnitureId,'bed');assert.notEqual(a.posture.slotId,b.posture.slotId);assert.ok(['bed:left','bed:right'].includes(a.posture.slotId));assert.ok(['bed:left','bed:right'].includes(b.posture.slotId));
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,b=st.agents.zhou;st.agents.orange.offMap=true;
  const slot=SP.getSlot(st,'bed:left'),freeEgress=SP.slotEgressNodes(st,slot,a,'walk')[0];
  assert.ok(freeEgress,'bed:left must have an egress candidate in the default world');
  a.position={...slot.position};
  a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  a.action={kind:'wander',phase:'start',targetTile:{x:2,y:2,z:0},started:st.tick,wait:0};
  b.position={...freeEgress};
  b.posture={kind:'standing',slotId:null,furnitureId:null};
  E.tick();
  assert.equal(a.posture.slotId,slot.id,'blocked egress must keep the Agent slot-bound');
  assert.ok(SP.nodeSame(st,a.position,slot.position),'blocked egress must not teleport the Agent onto the occupied floor node');
  noIssues('blocked slot egress');
  b.position={x:7,y:4,z:0};
  E.tick();
  assert.equal(a.posture.slotId,null,'once egress is free, movement must release slot occupancy before routing');
  assert.equal(a.posture.kind,'standing');
  assert.ok(SP.nodeSame(st,a.position,freeEgress),'first movement transition out of a Slot must land on the legal egress node');
  noIssues('slot egress released');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;const trayBefore=st.containers.mealTray.contents.food;a.needs.hunger=60;a.action={kind:'eat',phase:'prepare',started:st.tick,wait:0};for(let i=0;i<45&&a.action;i++)E.tick();assert.equal(a.action,null);const serve=st.events.find(e=>e.data?.action==='serveFood');assert.ok(serve);assert.ok(st.containers.mealTray.contents.food<trayBefore);assert.equal(a.held,null);assert.ok(serve.data.entities.includes(`agent:${a.id}`));noIssues('serving meal');
}

E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,plate=st.containers.plateA;st.agents.zhen.offMap=true;st.agents.zhou.offMap=true;st.containers.mealTray.contents.food=0;plate.contents={food:8};plate.position={x:3,y:6};delete plate.supportId;cat.position={x:2,y:6};cat.needs.hunger=80;cat.action={kind:'eat',phase:'prepare',started:st.tick,wait:0};const before=plate.contents.food;for(let i=0;i<8&&cat.action;i++){E.tick();assert.equal(cat.held,null);}assert.ok((plate.contents.food||0)<before);noIssues('cat eats plate');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,bucket=st.containers.waterBucket;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;bucket.contents.water=0;a.position={x:4,y:5};a.action={kind:'restockContainer',phase:'toContainer',destinationId:bucket.id,sourceId:'tap',sourceKind:'source',resource:'water',strategy:'carryContainer',started:st.tick,wait:0};for(let i=0;i<25&&a.action;i++)E.tick();assert.equal(a.action,null);assert.ok(bucket.contents.water>0);assert.ok(SP.same(bucket.position,{x:5,y:5}),'portable restock must leave the bucket at the intended Spatial position regardless of node metadata');noIssues('portable restock');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,tray=st.containers.mealTray,pantry=st.containers.foodPantry,basket=st.containers.basket;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;tray.contents.food=0;basket.contents={};basket.position={x:3,y:2};const pantryBefore=pantry.contents.food;let heldBasket=false,loadedBasket=false;
  a.action={kind:'restockContainer',phase:'toCarrier',destinationId:tray.id,sourceId:pantry.id,sourceKind:'object',resource:'food',strategy:'logisticsContainer',carrierId:basket.id,started:st.tick,wait:0};
  for(let i=0;i<45&&a.action;i++){E.tick();if(a.held===basket.id)heldBasket=true;if((basket.contents.food||0)>0)loadedBasket=true;noIssues(`logistics restock ${i}`);}
  assert.equal(a.action,null,'室內補貨流程應完成');assert.equal(heldBasket,true,'角色必須真的拿起物流籃');assert.equal(loadedBasket,true,'食物必須先實際存在物流籃中');assert.ok((tray.contents.food||0)>0);assert.ok(pantry.contents.food<pantryBefore);assert.equal(basket.contents.food||0,0,'卸貨後物流籃應為空');assert.equal(a.held,null);assert.ok(SP.same(basket.position,a.position),'卸貨後空籃應留在實際卸貨位置');assert.ok(st.events.some(e=>e.data?.action==='restockContainer'&&e.data?.carrier===basket.id&&e.data?.entities?.includes(`container:${basket.id}`)));noIssues('physical logistics restock');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,exit=SP.allExits(st).find(x=>SP.exitStructurallyAvailable(st,x)),dest=Object.values(st.containers).find(c=>SP.hasRole(c,'externalSupplyDestination')),basket=st.containers.basket;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;basket.contents={};basket.position={x:3,y:2};const before=dest.contents.food;let heldBeforeExit=false,returnedLoaded=false;
  assert.ok(exit&&exit.id==='frontExit','default world must expose the formal off-map Exit');
  a.action={kind:'externalSupply',phase:'toCarrier',exitId:exit.id,destinationId:dest.id,resource:'food',carrierId:basket.id,workLeft:1,produced:0,started:st.tick,wait:0};assert.equal(E.supplyStatus().workerId,a.id,'worker 應由 active action 推導');
  for(let i=0;i<55&&a.action;i++){E.tick();if(a.offMap)heldBeforeExit ||= a.held===basket.id;if(st.events.some(e=>e.data?.action==='supplyReturn'&&e.data?.carrier===basket.id&&(basket.contents.food||0)>0))returnedLoaded=true;noIssues(`external supply ${i}`);}
  assert.equal(a.action,null);assert.equal(heldBeforeExit,true,'角色必須帶著籃子才可離家補給');assert.equal(returnedLoaded,true,'外出取得的資源必須先存在籃子裡再入庫');assert.equal(E.supplyStatus().workerId,null);assert.ok(dest.contents.food>before);assert.equal(basket.contents.food||0,0);assert.equal(a.held,null);assert.ok(SP.same(basket.position,a.position),'入庫後空籃應留在食物櫃互動位置');assert.equal(st.supply.workerId,undefined);assert.ok(st.events.some(e=>e.data?.action==='supplyExit'&&e.data?.carrier===basket.id));assert.ok(st.events.some(e=>e.data?.action==='supplyDeposit'&&e.data?.carrier===basket.id));noIssues('physical external supply');
}

E.reset(20260911);
{
  const st=E.getState(),target=st.agents.zhen,actor=st.agents.zhou;target.offMap=true;actor.action={kind:'talk',phase:'move',targetAgent:target.id,started:st.tick,wait:0};E.tick();assert.equal(actor.action,null);assert.ok(st.events.some(e=>e.text.includes(`${target.name}已經離開可互動範圍`)));noIssues('target interruption');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,cat=st.agents.orange;a.action={kind:'petAnimal',phase:'move',targetAgent:cat.id,spatialGoal:{x:5,y:4},started:0,wait:0};assert.equal(E.actionLabel(a),`摸${cat.name}・目標 (5,4)`);assert.ok(!E.actionLabel(a).includes('・・'));
}

{
  const engine=fs.readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');
  for(const id of ['waterBucket','mealTray','foodPantry','alcoholBottle','frontDoor','frontExit',"targetAgent:'orange'"])assert.ok(!engine.includes(id),`Engine 不得綁定具體世界 entity ID：${id}`);
  assert.ok(!engine.includes('exitSlot'),'Engine external supply 不得保留 Furniture slot 出口欄位');
  assert.ok(!engine.includes('.canExit'),'Engine external supply 不得回頭讀 Furniture canExit compatibility');
  assert.ok(!engine.includes('supply.workerId'),'Engine 不得維護第二份 supply owner truth');
  assert.ok(!engine.includes('planLabel:'),'不得保留舊 planLabel compatibility alias');
  assert.ok(!engine.includes('.carrying'),'Engine 不得重新引入 Agent.carrying 物流模型');
  assert.ok(!engine.includes('carriedResourceLoad'),'Engine 不得保留抽象 hauling weight helper');
  const validator=fs.readFileSync(new URL('../src/validation/registry.js',import.meta.url),'utf8');
  assert.ok(!validator.includes('E.validateState='));assert.ok(!validator.includes('validationStatus='));assert.ok(!validator.includes('debug.validation'));
  const authoring=fs.readFileSync(new URL('../src/world-authoring.js',import.meta.url),'utf8');
  assert.ok(!authoring.includes('carrying:null'),'Authoring package 不得初始化 Agent.carrying');assert.ok(authoring.includes("'logisticsContainer'"),'Canonical authoring 應定義物流容器 capability');assert.ok(!authoring.includes("id==='mealTray'"),'World initialization 不得以 entity ID skip list 決定 blocker');
  const world=fs.readFileSync(new URL('../src/world.js',import.meta.url),'utf8');
  for(const legacyOwner of ['FURNITURE_DEFS','OBJECT_START','AGENT_START'])assert.ok(!world.includes(legacyOwner),'world.js 不應繼續持有 '+legacyOwner+' canonical authoring truth');
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const legacy of ['recovery.js','supply.js','action-guard.js','seating.js','rest-surface.js','spatial-ui.js','furniture-ui.js','recovery-ui.js','supply-ui.js'])assert.ok(!index.includes(legacy));
}
console.log('Current state regression: ok');
execFileSync(process.execPath,[fileURLToPath(new URL('./validator-rule-registry.mjs',import.meta.url))],{stdio:'inherit'});
