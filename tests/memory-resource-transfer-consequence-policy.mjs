import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of [
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'memory-schema-v1130.js',
  'engine.js','runtime-hook-pipeline.js','engine-spatial-v1114.js','memory-runtime-v1130.js'
]){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId]?.episodicMemories?.find(m=>m.sourceEventId===eventId)||null;

let probe=null;
function successfulTransferResult(st){
  return st.events.find(e=>{
    const d=e.data||{};
    if(d.actor!=='zhen'||d.resource!=='alcohol'||d.from!=='alcoholBottle'||d.to!=='cupA'||!Number.isFinite(d.amount)||d.amount<=0)return false;
    return (e.causeIds||[]).some(id=>st.causes[id]?.data?.action==='pour');
  })||null;
}

E.registerRuntimeHook('afterTick','test.success-transfer-before-memory',()=>{
  const st=E.getState(),result=successfulTransferResult(st);
  if(!result)return;
  const attemptId=result.causeIds.find(id=>st.causes[id]?.data?.action==='pour')||null;
  const before=E.episodicPolicyForEvent(st,result);
  result.data.action='resourceTransfer';
  const after=E.episodicPolicyForEvent(st,result);
  probe={resultId:result.id,attemptId,before,after,beforeMemory:!!memoryFor('zhen',result.id)};
},450);
E.registerRuntimeHook('afterTick','test.success-transfer-after-memory',()=>{
  if(!probe)return;
  probe.afterMemory=!!memoryFor('zhen',probe.resultId);
  probe.attemptMemory=!!memoryFor('zhen',probe.attemptId);
},550);

let found=null;
for(let seed=1;seed<=40&&!found;seed++){
  probe=null;
  E.reset(seed);
  const st=E.getState(),a=st.agents.zhen,cup=st.containers.cupA;
  st.agents.zhou.offMap=true;
  st.agents.orange.offMap=true;
  a.position={...floor(st,4,3)};
  a.status.intoxication=0;
  a.needs.fatigue=0;
  a.traits.careful=1;
  a.held='cupA';
  delete cup.supportId;
  cup.position={...a.position};
  cup.contents={};
  a.action={kind:'drinkAlcohol',phase:'fill',started:st.tick,wait:0,container:'cupA',sourceObject:'alcoholBottle',sourceKind:'object',resource:'alcohol'};

  E.tick();
  if(probe)found={seed,probe:{...probe},st:E.getState()};
}

assert.ok(found,'deterministic seed sweep should find a successful pour');
assert.ok(found.probe.attemptId,'successful transfer result must causally reference the pour action event');
assert.deepEqual(found.probe.before,{episodic:false,reason:'successfulResourceTransferConsequence'},'successful transfer consequence must be explicitly classified non-episodic before any action metadata exists');
assert.deepEqual(found.probe.after,{episodic:false,reason:'successfulResourceTransferConsequence'},'adding action metadata later must not silently turn the successful transfer consequence into an episode');
assert.equal(found.probe.beforeMemory,false,'core-loop psychological observation must still be deferred before phase 500');
assert.equal(found.probe.afterMemory,false,'successful resource transfer consequence must remain non-episodic after Memory processing');
assert.equal(found.probe.attemptMemory,true,'the source pour action remains the single episodic atom for a successful pour');
assert.equal(found.st.causes[found.probe.resultId].data.action,'resourceTransfer','regression must prove eligibility is not relying on a missing action field');

console.log('Memory successful resource transfer consequence policy regression: ok');
