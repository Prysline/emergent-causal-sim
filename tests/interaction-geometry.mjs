import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','engine.js','state-validator.js'])vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;

E.reset(20260911);
const st=E.getState(),a=st.agents.zhen;
assert.equal(st.version,'11.10-sleep-social-stimulus');
assert.equal(st.interactionModel,undefined);

const pickup=SP.interactionGeometry(st,{kind:'object',id:'waterBucket'},a,'pickup');
assert.equal(pickup.mode,'occupy');
assert.deepEqual(pickup.positions,[{x:5,y:5}]);
const drink=SP.interactionGeometry(st,{kind:'object',id:'waterBucket'},a,'drinkFrom');
assert.equal(drink.mode,'reach');
assert.ok(drink.positions.some(p=>same(p,{x:4,y:5})),'同一物件的 drinkFrom 可與 pickup 使用不同 geometry');

const basketPickup=SP.interactionGeometry(st,{kind:'object',id:'basket'},a,'pickup');
assert.equal(basketPickup.mode,'occupy');
assert.deepEqual(basketPickup.positions,[{x:3,y:2}]);

const tap=SP.interactionGeometry(st,{kind:'source',id:'tap'},a,'fill');
assert.equal(tap.mode,'port');
assert.deepEqual(tap.positions,[{x:5,y:5}]);
const tray=SP.interactionGeometry(st,{kind:'object',id:'mealTray'},a,'serve');
assert.equal(tray.mode,'supportReach');
for(const p of [{x:4,y:2},{x:7,y:2},{x:4,y:3},{x:7,y:3}])assert.ok(tray.positions.some(q=>same(q,p)));

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
