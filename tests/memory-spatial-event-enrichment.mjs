import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of [
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js',
  'engine.js','runtime-hook-pipeline.js','engine-spatial-v1114.js','memory-runtime-v1130.js','appraisal-runtime-v1131.js'
]){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId]?.episodicMemories?.find(m=>m.sourceEventId===eventId)||null;

let beforeSpatial=null;
let afterSpatial=null;
let beforeMemory=null;
let afterMemory=null;

function resetProbes(){
  beforeSpatial=null;
  afterSpatial=null;
  beforeMemory=null;
  afterMemory=null;
}
function failedPourEvent(){
  return E.getState().events.find(e=>e.data?.actor==='zhen'&&e.data?.reason==='coordination'&&e.data?.resource==='alcohol')||null;
}
function snapshot(event){
  if(!event)return null;
  const memory=memoryFor('zhen',event.id);
  return {
    eventId:event.id,
    eventTick:event.tick,
    action:event.data?.action||null,
    position:event.data?.position||null,
    effectNode:event.data?.effectNode||null,
    hasMemory:!!memory,
    observedAction:memory?.observed?.action||null,
    observedPosition:memory?.observed?.positionRef||null,
    appraisalRule:memory?.appraisal?.ruleId||null
  };
}

E.registerRuntimeHook('afterTick','test.spatial-enrichment-before-spatial',()=>{
  beforeSpatial=snapshot(failedPourEvent());
},50);
E.registerRuntimeHook('afterTick','test.spatial-enrichment-after-spatial',()=>{
  afterSpatial=snapshot(failedPourEvent());
},150);
E.registerRuntimeHook('afterTick','test.spatial-enrichment-before-memory',()=>{
  beforeMemory=snapshot(failedPourEvent());
},450);
E.registerRuntimeHook('afterTick','test.spatial-enrichment-after-memory',()=>{
  afterMemory=snapshot(failedPourEvent());
},550);

let found=null;
for(let seed=1;seed<=200&&!found;seed++){
  resetProbes();
  E.reset(seed);
  const st=E.getState(),a=st.agents.zhen,cup=st.containers.cupA;
  st.agents.zhou.offMap=true;
  st.agents.orange.offMap=true;
  a.position={...floor(st,4,3)};
  a.status.intoxication=100;
  a.needs.fatigue=100;
  a.traits.careful=0;
  a.held='cupA';
  delete cup.supportId;
  cup.position={...a.position};
  cup.contents={};
  a.action={kind:'drinkAlcohol',phase:'fill',started:st.tick,wait:0,container:'cupA',sourceObject:'alcoholBottle',sourceKind:'object',resource:'alcohol'};

  E.tick();
  if(afterSpatial?.action==='spill')found={seed,st:E.getState(),event:E.getState().causes[afterSpatial.eventId]};
}

assert.ok(found,'deterministic seed sweep should find a failed pour');
assert.ok(beforeSpatial,'failed pour result must exist before Spatial Effects');
assert.equal(beforeSpatial.action,null,'core creates the coordination-failure result before Spatial adds observable spill semantics');
assert.equal(beforeSpatial.hasMemory,false,'core-loop event must remain psychologically deferred before Spatial Effects');

assert.ok(afterSpatial,'Spatial Effects must retain the same canonical event');
assert.equal(afterSpatial.eventId,beforeSpatial.eventId,'Spatial Effects must enrich the existing canonical event, not create a second spill truth');
assert.equal(afterSpatial.action,'spill','Spatial Effects must classify the failed pour outcome as an observable spill');
assert.ok(afterSpatial.effectNode,'Spatial Effects must attach the derived effect node');
assert.equal(afterSpatial.position,afterSpatial.effectNode,'spill observation position must use the derived effect node');
assert.equal(afterSpatial.hasMemory,false,'Memory must still be deferred after spatial enrichment and before phase 500');

assert.deepEqual(beforeMemory,afterSpatial,'no earlier afterTick hook should form Memory for the deferred core event');
assert.ok(afterMemory?.hasMemory,'Memory phase 500 must observe the spatially enriched event reference');
assert.equal(afterMemory.eventId,afterSpatial.eventId);
assert.equal(afterMemory.eventTick,1);
assert.equal(afterMemory.observedAction,'spill','episodic projection must use the post-Spatial spill classification');
assert.equal(afterMemory.observedPosition,afterSpatial.effectNode,'episodic projection must use the post-Spatial effect position');
assert.equal(afterMemory.appraisalRule,'spill-v1','downstream Appraisal must receive the enriched spill semantics');

const zhenMemories=found.st.agents.zhen.episodicMemories;
assert.equal(zhenMemories.filter(m=>m.sourceEventId===found.event.id).length,1,'the enriched canonical event must create exactly one episode');

console.log('Memory spatial event enrichment regression: ok');
