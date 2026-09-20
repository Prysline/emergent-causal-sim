import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','spatial.js','engine.js','validation/registry.js']);

const E=globalThis.SimEngine;
const SP=globalThis.SimSpatial;
const V=globalThis.SimValidator;
const foodOf=c=>c?.contents?.food||0;
const approx=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-9,`${message}: ${actual} !== ${expected}`);
const noIssues=label=>{
  const result=V.validateState(E.getState());
  assert.equal(result.issueCount,0,`${label}: ${result.issues.map(x=>x.code+': '+x.message).join(' | ')}`);
};

function isolateHuman(st,id='zhen'){
  for(const a of Object.values(st.agents))a.offMap=a.id!==id;
  return st.agents[id];
}

function startIndoorFoodRestock(st,a){
  const tray=st.containers.mealTray;
  const pantry=st.containers.foodPantry;
  const basket=st.containers.basket;
  tray.contents.food=0;
  basket.contents={};
  basket.position={x:3,y:2};
  a.action={
    kind:'restockContainer',phase:'toCarrier',destinationId:tray.id,
    sourceId:pantry.id,sourceKind:'object',resource:'food',
    strategy:'logisticsContainer',carrierId:basket.id,
    started:st.tick,wait:0
  };
  return {tray,pantry,basket};
}

E.reset(20260911);
{
  const st=E.getState();
  const a=isolateHuman(st);
  const {tray,pantry,basket}=startIndoorFoodRestock(st,a);
  const totalBefore=foodOf(tray)+foodOf(pantry)+foodOf(basket);

  for(let i=0;i<45&&a.action;i++)E.tick();

  assert.equal(a.action,null,'室內物流補貨應完成');
  approx(foodOf(tray)+foodOf(pantry)+foodOf(basket),totalBefore,'pantry → basket → mealTray 必須守恆');
  assert.equal(foodOf(basket),0,'卸貨後物流容器應為空');
  assert.equal(a.held,null,'完成後 Agent 不應繼續持有物流容器');
  assert.ok(SP.same(basket.position,a.position),'空籃應留在實際卸貨位置');
  assert.ok(!Object.values(st.reservations).includes(a.id),'完成後不得殘留 Agent reservation');
  noIssues('indoor logistics conservation');
}

E.reset(20260911);
{
  const st=E.getState();
  const owner=st.agents.zhen;
  const actor=st.agents.zhou;
  st.agents.orange.offMap=true;
  owner.offMap=true;
  const tray=st.containers.mealTray;
  const pantry=st.containers.foodPantry;
  const basket=st.containers.basket;
  tray.contents.food=0;
  basket.contents={};
  st.reservations[`object:${basket.id}`]=owner.id;
  actor.action={
    kind:'restockContainer',phase:'toCarrier',destinationId:tray.id,
    sourceId:pantry.id,sourceKind:'object',resource:'food',
    strategy:'logisticsContainer',carrierId:basket.id,
    started:st.tick,wait:0
  };

  E.tick();

  assert.equal(st.reservations[`object:${basket.id}`],owner.id,'既有物流容器 reservation 不得被覆寫');
  assert.equal(actor.held,null,'其他角色不得拿起已被預約的物流容器');
  assert.equal(actor.action?.phase,'toCarrier','其他角色應停留在等待物流容器的階段');
  noIssues('logistics reservation exclusivity');
}

E.reset(20260911);
{
  const st=E.getState();
  const a=isolateHuman(st);
  const {tray,pantry,basket}=startIndoorFoodRestock(st,a);

  for(let i=0;i<35&&foodOf(basket)<=0;i++)E.tick();
  assert.ok(foodOf(basket)>0,'中斷測試前，資源必須已經實際裝進物流容器');
  assert.equal(a.held,basket.id,'中斷測試前，角色必須正在持有物流容器');

  const positionAtInterrupt={...a.position};
  const conservedBeforeAbort=foodOf(pantry)+foodOf(basket)+foodOf(tray);
  delete st.containers[tray.id];
  E.tick();

  assert.equal(a.action,null,'目標消失後物流行動應中止');
  assert.equal(a.held,null,'中止後不應殘留 held state');
  assert.ok(foodOf(basket)>0,'中止後已裝載資源應留在物流容器內，不得消失');
  approx(foodOf(pantry)+foodOf(basket),conservedBeforeAbort,'中止後 pantry + basket 的物資總量必須守恆');
  assert.ok(SP.same(basket.position,positionAtInterrupt),'中止後物流容器應落在角色實際中斷位置');
  assert.ok(!Object.values(st.reservations).includes(a.id),'中止後不得殘留 Agent reservation');
  noIssues('logistics interruption cleanup');
}

E.reset(20260911);
{
  const st=E.getState();
  const a=isolateHuman(st);
  const door=SP.allSlots(st).find(s=>s.canExit);
  const dest=Object.values(st.containers).find(c=>SP.hasRole(c,'externalSupplyDestination'));
  const basket=st.containers.basket;
  basket.contents={};
  basket.position={x:3,y:2};
  const destinationBefore=foodOf(dest);
  a.action={
    kind:'externalSupply',phase:'toCarrier',exitSlot:door.id,
    destinationId:dest.id,resource:'food',carrierId:basket.id,
    workLeft:1,produced:0,started:st.tick,wait:0
  };

  for(let i=0;i<55&&a.action;i++)E.tick();

  assert.equal(a.action,null,'外出補給應完成');
  const delivered=foodOf(dest)-destinationBefore;
  approx(delivered,st.supply.totalProduced,'外部新增資源量必須等於實際入庫量');
  assert.equal(foodOf(basket),0,'外出補給卸貨後物流容器應為空');
  assert.equal(a.held,null,'外出補給完成後不應殘留 held state');
  assert.ok(SP.same(basket.position,a.position),'外出補給卸貨後空籃應留在實際放下位置');
  assert.ok(!Object.values(st.reservations).includes(a.id),'外出補給完成後不得殘留 Agent reservation');
  noIssues('external supply accounting');
}

console.log('v11.8 logistics invariants: ok');
