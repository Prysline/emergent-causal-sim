import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;

const initializerFiles=[
  'spatial-v111.js',
  'spatial-observability.js',
  'contact-v1112.js',
  'spatial-v1113.js',
  'spatial-v1114.js',
  'action-schema-v1120.js',
  'intent-schema-v1121.js',
  'social-bid-schema-v1122.js',
  'interruption-schema-v1123.js',
  'deliberation-schema-v1124.js',
  'memory-schema-v1130.js',
  'appraisal-schema-v1131.js',
  'affect-schema-v1132.js',
  'social-response-schema-v1132a.js',
  'memory-retention-schema-v1133.js',
  'human-social-response-schema-v1133a.js',
  'memory-deliberation-schema-v1134.js',
  'social-outcome-memory-schema-v1135.js',
  'presentation-schema-v1140.js',
  'relationship-schema-v1150.js',
  'physical-schema-v1160.js',
  'locomotion-schema-v1190.js'
];

for(const file of ['world-authoring-v1.js','world-initializer.js','world.js','spatial.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}
const canonicalCreateInitialState=globalThis.SimWorld.createInitialState;
for(const file of initializerFiles){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}

const W=globalThis.SimWorld;
assert.equal(W.createInitialState,canonicalCreateInitialState,'subsystem extensions must not replace the canonical createInitialState owner');
const EXPECTED=[
  {id:'spatial.schema',order:10},
  {id:'spatialObservability.schema',order:20},
  {id:'contact.schema',order:30},
  {id:'spatialFloorEffects.schema',order:40},
  {id:'spatialSurfaceEnvironment.schema',order:50},
  {id:'action.schema',order:100},
  {id:'intent.schema',order:200},
  {id:'socialBid.schema',order:300},
  {id:'interruption.schema',order:400},
  {id:'deliberation.schema',order:500},
  {id:'memory.schema',order:600},
  {id:'appraisal.schema',order:700},
  {id:'affect.schema',order:800},
  {id:'socialResponse.schema',order:900},
  {id:'memoryRetention.schema',order:1000},
  {id:'humanSocialResponse.schema',order:1100},
  {id:'memoryDeliberation.schema',order:1200},
  {id:'socialOutcomeMemory.schema',order:1300},
  {id:'presentation.schema',order:1400},
  {id:'relationship.schema',order:1500},
  {id:'physical.schema',order:1600},
  {id:'locomotion.schema',order:1700}
];

assert.equal(W.INITIAL_STATE_PIPELINE_VERSION,'initial-state-pipeline-1');
assert.deepEqual(W.listInitialStateInitializers(),EXPECTED,'initial-state order is architecture semantics and must remain explicit');
assert.throws(()=>W.registerInitialStateInitializer('intent.schema',()=>{},999),/Duplicate initial-state initializer/);
assert.throws(()=>W.registerInitialStateInitializer('',()=>{},1),/non-empty string/);
assert.throws(()=>W.registerInitialStateInitializer('bad.handler',null,1),/must be a function/);

const st=W.createInitialState(20260911);
assert.equal(st.version,'11.20.0-dynamic-congestion','full production schema set must preserve current release marker');
for(const agent of Object.values(st.agents||{})){
  assert.equal(agent.activeIntent,null,`${agent.id}: activeIntent initialization parity`);
  assert.deepEqual(agent.observedSocialBids,[],`${agent.id}: observedSocialBids initialization parity`);
  assert.deepEqual(agent.relationships,{},`${agent.id}: relationships initialization parity`);
  assert.deepEqual(agent.locomotion,{mode:null,phase:'idle'},`${agent.id}: locomotion initialization parity`);
  assert.ok(agent.affect&&agent.affect.valence===0&&agent.affect.activation===0&&agent.affect.frustration===0,`${agent.id}: neutral affect initialization parity`);
  assert.ok(agent.physical,`${agent.id}: physical profile initialization parity`);
}
assert.ok(st.furniture?.diningTable?.spatial?.surface,'Spatial initializer must install authored surface traversal definitions');
assert.equal(st.containers?.mealTray?.interactions?.serve?.mode,'reach','Contact initializer must install supported-object interaction definitions');
assert.ok(st.furniture?.diningTable?.spatial?.surface?.cells?.every(cell=>cell.contents&&typeof cell.contents==='object'),'Surface environment initializer must install per-cell contents');

const again=W.createInitialState(20260911);
assert.deepEqual(again,st,'same seed must remain deterministic after lifecycle consolidation');

const srcDir=new URL('../src/',import.meta.url);
const wrapperAssignments=[];
for(const name of fs.readdirSync(srcDir).filter(name=>name.endsWith('.js'))){
  const source=fs.readFileSync(new URL(name,srcDir),'utf8');
  if(name!=='world.js'&&/\.createInitialState\s*=/.test(source))wrapperAssignments.push(name);
}
assert.deepEqual(wrapperAssignments,[],'world.js must remain the only createInitialState lifecycle owner');

for(const name of initializerFiles){
  const source=fs.readFileSync(new URL(name,srcDir),'utf8');
  assert.ok(source.includes('registerInitialStateInitializer('),`${name} must register through the canonical initial-state pipeline`);
  assert.ok(source.includes(`${name} requires world.js initial-state pipeline.`),`${name} must fail loudly when the pipeline is missing`);
  assert.doesNotMatch(source,/baseCreateInitialState|W\.createInitialState\s*=/,`${name} must not recreate the wrapper chain`);
}

const indexSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const worldIndex=indexSource.indexOf('src/world.js');
const engineIndex=indexSource.indexOf('src/engine.js');
assert.ok(worldIndex>=0&&engineIndex>worldIndex,'world.js must load before engine.js');
for(const name of initializerFiles){
  const initializerIndex=indexSource.indexOf('src/'+name);
  assert.ok(initializerIndex>worldIndex&&initializerIndex<engineIndex,`${name} must register after world.js and before engine.js captures createInitialState`);
}

console.log('initial-state pipeline regression: ok');
