import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';
globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','engine.js','validation/registry.js']);
const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const table=(st,x,y)=>SP.normalizeNode(st,{x,y},'diningTable:surface');
const hasNode=(st,list,node)=>list.some(p=>SP.nodeSame(st,p,node));

E.reset(20260911);
const st=E.getState(),a=st.agents.zhen;
assert.equal(st.version,'11.29.2-batch-step-yielding');
assert.equal(st.interactionModel,undefined);

assert.equal(SP.nodeWalkable(st,floor(st,4,2),a),false,'reduced profile must still apply shared Human walk envelope to chair geometry');
assert.equal(SP.nodeWalkable(st,floor(st,4,2),st.agents.orange),true,'smaller Cat walk envelope may still fit the chair tile geometry');

const pickup=SP.interactionGeometry(st,{kind:'object',id:'waterBucket'},a,'pickup');
assert.equal(pickup.mode,'occupy');
assert.equal(pickup.positions.length,1);
assert.ok(hasNode(st,pickup.positions,floor(st,5,5)));
const drink=SP.interactionGeometry(st,{kind:'object',id:'waterBucket'},a,'drinkFrom');
assert.equal(drink.mode,'reach');
assert.ok(hasNode(st,drink.positions,floor(st,4,5)),'同一物件的 drinkFrom 可與 pickup 使用不同 geometry');

const basketPickup=SP.interactionGeometry(st,{kind:'object',id:'basket'},a,'pickup');
assert.equal(basketPickup.mode,'occupy');
assert.equal(basketPickup.positions.length,1);
assert.ok(hasNode(st,basketPickup.positions,floor(st,3,2)));

const tap=SP.interactionGeometry(st,{kind:'source',id:'tap'},a,'fill');
assert.equal(tap.mode,'port');
assert.equal(tap.positions.length,1);
assert.ok(hasNode(st,tap.positions,floor(st,5,5)));
const tray=SP.interactionGeometry(st,{kind:'object',id:'mealTray'},a,'serve');
assert.equal(tray.mode,'supportReach');
for(const p of [floor(st,5,1),floor(st,6,1),floor(st,5,4),floor(st,6,4)])assert.ok(hasNode(st,tray.positions,p),'supportReach 應保留未被椅子佔用的北／南桌邊 floor contact');
for(const p of [floor(st,4,2),floor(st,7,2),floor(st,4,3),floor(st,7,3)])assert.ok(!hasNode(st,tray.positions,p),'Human supportReach 不得把餐椅佔用格當成 floor contact');
assert.ok(hasNode(st,tray.positions,table(st,5,2)),'supportReach 仍可包含合法 tabletop local contact node');

const trayEat=SP.interactionGeometry(st,{kind:'object',id:'mealTray'},a,'eatFrom');
assert.equal(trayEat.mode,'reach','直接吃現成食物必須依食物本身的位置，而不是整張桌子的 perimeter');
assert.ok(hasNode(st,trayEat.positions,floor(st,5,1)),'mealTray 應保留實際可站的北側 floor contact');
assert.ok(hasNode(st,trayEat.positions,table(st,5,2)),'mealTray reach 應保留物件所在 tabletop node');
assert.ok(!hasNode(st,trayEat.positions,floor(st,4,2)),'chairNW 佔用格不得被當成 Human floor contact');
assert.ok(!hasNode(st,trayEat.positions,floor(st,7,2)),'站在餐桌另一側不得隔兩格直接吃 mealTray');
const plateEat=SP.interactionGeometry(st,{kind:'object',id:'plateB'},a,'eatFrom');
assert.equal(plateEat.mode,'reach','桌上的 serving dish 若直接進食，也必須接近該盤子的實際位置');
assert.ok(hasNode(st,plateEat.positions,floor(st,6,4)),'plateB 應允許未被椅子佔用的南側 floor contact');
assert.ok(!hasNode(st,plateEat.positions,floor(st,7,3)),'chairSE 佔用格不得被當成 Human floor contact');
assert.ok(hasNode(st,plateEat.positions,table(st,6,3)),'plateB reach 應保留物件所在 tabletop node');

st.containers.testCrate={id:'testCrate',name:'測試箱',portable:true,capacity:10,contents:{},position:{x:3,y:5},interactions:{pickup:{mode:'occupy'},drinkFrom:{mode:'reach'}}};
assert.equal(SP.interactionGeometry(st,{kind:'object',id:'testCrate'},a,'pickup').mode,'occupy');
assert.equal(SP.interactionGeometry(st,{kind:'object',id:'testCrate'},a,'drinkFrom').mode,'reach');
delete st.containers.testCrate;

const pantry=st.containers.foodPantry,old={...pantry.position},next={x:3,y:5};
assert.equal(SP.walkable(st,old),false,'固定物件所在格應由實體動態阻擋');
pantry.position={...next};
assert.equal(SP.walkable(st,old),true,'固定物件移走後舊格不應留下 cached blocker');
assert.equal(SP.walkable(st,next),false,'固定物件新位置應立即成為 blocker');
assert.equal(V.validateState(st).issueCount,0);
console.log('interaction geometry + dynamic blocker contract passed');