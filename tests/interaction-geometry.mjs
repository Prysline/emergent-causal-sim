import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','engine.js','state-validator.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;

E.reset(20260911);
const st=E.getState(),a=st.agents.zhen;
assert.equal(st.interactionModel,'11.6-interaction-geometry');

const bucket=SP.interactionGeometry(st,{kind:'object',id:'waterBucket'},a,'pickup');
assert.equal(bucket.mode,'occupy');
assert.deepEqual(bucket.positions,[{x:5,y:5}]);
a.position={x:4,y:5};
assert.equal(SP.isAtInteraction(st,a,{kind:'object',id:'waterBucket'},'pickup'),false);
a.position={x:5,y:5};
assert.equal(SP.isAtInteraction(st,a,{kind:'object',id:'waterBucket'},'pickup'),true);

const tap=SP.interactionGeometry(st,{kind:'source',id:'tap'},a,'fill');
assert.equal(tap.mode,'port');
assert.deepEqual(tap.positions,[{x:5,y:5}]);
a.position={x:6,y:4};
assert.equal(SP.isAtInteraction(st,a,{kind:'source',id:'tap'},'fill'),false);

const tray=SP.interactionGeometry(st,{kind:'object',id:'mealTray'},a,'use');
assert.equal(tray.mode,'supportReach');
for(const p of [{x:4,y:2},{x:7,y:2},{x:4,y:3},{x:7,y:3}])assert.ok(tray.positions.some(q=>same(q,p)));
assert.ok(tray.positions.every(p=>SP.walkable(st,p)));

st.containers.testCrate={id:'testCrate',name:'測試箱',portable:true,groundInteraction:'occupy',capacity:10,contents:{},position:{x:3,y:5}};
const generic=SP.interactionGeometry(st,{kind:'object',id:'testCrate'},a,'pickup');
assert.equal(generic.mode,'occupy');
assert.deepEqual(generic.positions,[{x:3,y:5}]);
delete st.containers.testCrate;

console.log('interaction geometry primitives passed');
