import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','engine.js','state-validator.js'])vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
const E=globalThis.SimEngine;
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;

E.reset(20260911);
const st=E.getState(),a=st.agents.zhen,bucket=st.containers.waterBucket;
st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
a.position={x:4,y:5};a.action={intent:'refillWater',phase:'toBucket',started:st.tick,wait:0};
bucket.contents={water:0};bucket.position={x:5,y:5};

let pickupPos=null,refillEvent=null;
const heldPositions=[];
for(let i=0;i<20&&!refillEvent;i++){
  E.tick();
  const validation=E.validateState();
  assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join(' | '));
  if(a.held==='waterBucket'){
    pickupPos??={...a.position};heldPositions.push({...a.position});
  }
  refillEvent=st.events.find(e=>e.data?.action==='refillWater')||null;
}

assert.deepEqual(pickupPos,{x:5,y:5});
assert.ok(heldPositions.length>0);
assert.ok(heldPositions.every(p=>same(p,{x:5,y:5})),'拿起水桶後不應再為水龍頭多走一格');
assert.ok(refillEvent,'補水流程應完成');
assert.equal(refillEvent.data.position,'5,5');
assert.equal(a.held,null);
assert.deepEqual(bucket.position,{x:5,y:5});
assert.ok((bucket.contents.water||0)>0);
console.log('refill water geometry passed');
