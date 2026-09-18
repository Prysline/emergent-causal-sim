import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world-authoring-v1.js','world-initializer.js','world.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}

const A=globalThis.SimWorldAuthoring,I=globalThis.SimWorldInitializer,W=globalThis.SimWorld;
assert.equal(A.VERSION,'world-authoring-v1');
assert.equal(A.DEFAULT_WORLD_AUTHORING.authoringSchema,A.VERSION);
assert.equal(W.WIDTH,12);
assert.equal(W.HEIGHT,8);
assert.equal(W.FURNITURE_DEFS,undefined);
assert.equal(W.OBJECT_START,undefined);
assert.equal(W.AGENT_START,undefined);

const authored=A.DEFAULT_WORLD_AUTHORING;
const authoredBefore=JSON.stringify(authored);
assert.equal(Object.isFrozen(authored),true);
assert.equal(authored.map.layers.length,1);
assert.equal(authored.map.layers[0].z,0);

for(const cell of Object.values(authored.map.layers[0].cells)){
  for(const derived of ['walkable','roomId','furnitureIds'])assert.equal(Object.prototype.hasOwnProperty.call(cell,derived),false,'authoring cell must not persist '+derived);
}
for(const f of Object.values(authored.furniture))for(const slot of f.slots||[])assert.equal(Object.prototype.hasOwnProperty.call(slot,'furnitureId'),false,'authoring slot must not persist furniture backlink');

const st=W.createInitialState(20260911);
assert.equal(JSON.stringify(authored),authoredBefore,'initializer must not mutate canonical authoring package');
assert.equal(st.version,'11.10-sleep-social-stimulus');
assert.equal(st.map.width,12);
assert.equal(st.map.height,8);
assert.equal(Object.keys(st.map.tiles).length,96);
assert.equal(Object.values(st.map.tiles).filter(t=>t.terrain==='floor').length,60);
assert.equal(Object.values(st.map.tiles).filter(t=>t.terrain==='wall').length,35);
assert.equal(Object.values(st.map.tiles).filter(t=>t.terrain==='doorway').length,1);
assert.equal(st.map.tiles['0,6'].walkable,false);
assert.equal(st.map.tiles['1,1'].walkable,true);
assert.equal(Object.keys(st.furniture).length,8);
assert.equal(Object.keys(st.containers).length,9);
assert.equal(Object.keys(st.sources).length,1);
assert.equal(Object.keys(st.agents).length,3);
assert.deepEqual(st.agents.zhen.position,{x:9,y:3});
assert.deepEqual(st.agents.zhou.position,{x:7,y:3});
assert.deepEqual(st.agents.orange.position,{x:2,y:6});
assert.equal(st.furniture.bed.slots[0].furnitureId,'bed');
assert.ok(st.map.tiles['5,2'].furnitureIds.includes('diningTable'));
assert.equal(st.map.rooms&&Object.keys(st.map.rooms).length,0);
assert.equal(st.map.roomRevision,0);
assert.equal(st.map.passageConstraints,undefined);

const again=W.createInitialState(20260911);
assert.deepEqual(again,st,'same package + same seed must produce the same base runtime state');
const otherSeed=W.createInitialState(7);
const normalizeSeed=x=>{const y=JSON.parse(JSON.stringify(x));y.seed=0;y.rngState=0;return y;};
assert.deepEqual(normalizeSeed(otherSeed),normalizeSeed(st),'changing seed must not change authored world content');

const unsupported=JSON.parse(JSON.stringify(authored));
unsupported.map.layers[0].z=1;
assert.throws(()=>I.createInitialState(unsupported,{seed:1,version:'test'}),/exactly one z=0 layer/);

console.log('world authoring foundation: ok');