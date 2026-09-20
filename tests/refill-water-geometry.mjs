import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
globalThis.window=globalThis;
for(const file of ['world-authoring.js','world-initializer.js','world.js','spatial.js','engine.js','state-validator.js'])vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
const E=globalThis.SimEngine,V=globalThis.SimValidator;
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;

E.reset(20260911);
const st=E.getState(),a=st.agents.zhen,bucket=st.containers.waterBucket;
st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
a.position={x:4,y:5};bucket.contents={water:0};bucket.position={x:5,y:5};
a.action={kind:'restockContainer',phase:'toContainer',started:st.tick,wait:0,destinationId:'waterBucket',sourceId:'tap',sourceKind:'source',resource:'water',strategy:'carryContainer'};

let pickupPos=null,restockEvent=null;const heldPositions=[];
for(let i=0;i<20&&!restockEvent;i++){
  E.tick();const validation=V.validateState(st);assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join(' | '));
  if(a.held==='waterBucket'){pickupPos??={...a.position};heldPositions.push({...a.position});}
  restockEvent=st.events.find(e=>e.data?.action==='restockContainer'&&e.data?.to==='waterBucket')||null;
}
assert.deepEqual(pickupPos,{x:5,y:5});
assert.ok(heldPositions.length>0);
assert.ok(heldPositions.every(p=>same(p,{x:5,y:5})),'拿起容器後不應為相鄰 port 多走一格');
assert.ok(restockEvent,'資料驅動 restock 流程應完成');
assert.equal(restockEvent.data.position,'5,5');
assert.equal(a.held,null);
assert.deepEqual(bucket.position,{x:5,y:5});
assert.ok((bucket.contents.water||0)>0);
console.log('portable container restock geometry passed');
