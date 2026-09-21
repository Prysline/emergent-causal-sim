import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadScriptsInThisContext,productionScriptPaths,readRepoFile} from './helpers/production-loader.mjs';

globalThis.window=globalThis;

const productionScripts=productionScriptPaths();
const lifecyclePaths=productionScripts.filter(path=>
  path!=='src/world.js'&&/registerInitialState(?:Initializer|Finalizer)\(/.test(readRepoFile(path))
);
const lifecycleFiles=lifecyclePaths.map(path=>path.replace(/^src\//,''));

loadScriptsInThisContext(['src/furniture-definitions.js','src/world-authoring.js','src/embodiment-capabilities.js','src/world-initializer.js','src/world.js','src/spatial.js']);
const canonicalCreateInitialState=globalThis.SimWorld.createInitialState;
const canonicalCreateInitialStateFromAuthoring=globalThis.SimWorld.createInitialStateFromAuthoring;
loadScriptsInThisContext(lifecyclePaths);

const W=globalThis.SimWorld;
assert.equal(W.createInitialState,canonicalCreateInitialState,'subsystem extensions must not replace the canonical createInitialState owner');
assert.equal(W.createInitialStateFromAuthoring,canonicalCreateInitialStateFromAuthoring,'subsystem extensions must not replace the explicit authoring initial-state factory');
const EXPECTED_SCHEMA=[
  {id:'release.version',order:0},
  {id:'spatial.schema',order:10},
  {id:'contact.schema',order:30},
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
  {id:'relationship.schema',order:1500},
  {id:'physical.schema',order:1600},
  {id:'locomotion.schema',order:1700}
];
const EXPECTED_FINALIZE=[
  {id:'spatial.finalize',order:100}
];

assert.equal(W.INITIAL_STATE_PIPELINE_VERSION,'initial-state-pipeline-2');
assert.deepEqual(W.INITIAL_STATE_PHASES,['schema','finalize']);
assert.deepEqual(W.listInitialStateInitializers('schema'),EXPECTED_SCHEMA,'schema-phase order is architecture semantics and must remain explicit');
assert.deepEqual(W.listInitialStateInitializers('finalize'),EXPECTED_FINALIZE,'finalize-phase order is architecture semantics and must remain explicit');
assert.throws(()=>W.registerInitialStateInitializer('intent.schema',()=>{},999),/Duplicate initial-state initializer/);
assert.throws(()=>W.registerInitialStateInitializer('',()=>{},1),/non-empty string/);
assert.throws(()=>W.registerInitialStateInitializer('bad.handler',null,1),/must be a function/);
loadScriptsInThisContext(['src/world/initial-state-manifest.js']);
assert.equal(W.isInitialStateRegistryFinalized(),true);
assert.deepEqual(W.currentInitialStateManifest(),{schema:EXPECTED_SCHEMA,finalize:EXPECTED_FINALIZE});
assert.throws(()=>W.registerInitialStateInitializer('late.schema',()=>{},1800),/registry is finalized/);

const st=W.createInitialState(20260911);
assert.equal(st.version,'11.23.1-editor-source-port-observability','full production schema set must preserve current release marker');
for(const agent of Object.values(st.agents||{})){
  assert.equal(agent.activeIntent,null,`${agent.id}: activeIntent initialization parity`);
  assert.deepEqual(agent.observedSocialBids,[],`${agent.id}: observedSocialBids initialization parity`);
  assert.deepEqual(agent.relationships,{},`${agent.id}: relationships initialization parity`);
  assert.deepEqual(agent.locomotion,{mode:null,phase:'idle'},`${agent.id}: locomotion initialization parity`);
  assert.ok(agent.affect&&agent.affect.valence===0&&agent.affect.activation===0&&agent.affect.frustration===0,`${agent.id}: neutral affect initialization parity`);
  assert.ok(agent.physical,`${agent.id}: physical profile initialization parity`);
}
assert.ok(st.furniture?.diningTable?.spatial?.surface,'Spatial initializer must install authored surface traversal definitions');
assert.equal(st.agents?.zhen?.position?.surfaceId,'floor','Spatial finalizer must normalize persistent agent surface identity');
assert.ok(st.agents?.zhen?.position?.spaceId,'Spatial finalizer must normalize persistent agent room-space identity');
assert.equal(st.containers?.mealTray?.interactions?.serve?.mode,'reach','Contact initializer must install supported-object interaction definitions');
assert.ok(st.furniture?.diningTable?.spatial?.surface?.cells?.every(cell=>cell.contents&&typeof cell.contents==='object'),'Surface environment initializer must install per-cell contents');

const again=W.createInitialState(20260911);
assert.deepEqual(again,st,'same seed must remain deterministic after lifecycle consolidation');

const A=globalThis.SimWorldAuthoring;
const custom=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
custom.furniture.chairNW.origin={x:3,y:4,z:0};
const customState=W.createInitialStateFromAuthoring(custom,20260911);
assert.deepEqual(customState.furniture.chairNW.footprint,[{x:3,y:4}],'explicit authoring factory must compile the supplied canonical document');
assert.equal(customState.version,'11.23.1-editor-source-port-observability');
assert.deepEqual(W.createInitialState(20260911).furniture.chairNW.footprint,st.furniture.chairNW.footprint,'explicit preview initialization must not mutate the default world factory');
assert.deepEqual(W.createInitialStateFromAuthoring(custom,20260911),customState,'preview reset source must remain deterministic for the same snapshot and seed');

const srcDir=new URL('../src/',import.meta.url);
const wrapperAssignments=[];
for(const name of fs.readdirSync(srcDir).filter(name=>name.endsWith('.js'))){
  const source=fs.readFileSync(new URL(name,srcDir),'utf8');
  if(name!=='world.js'&&/\.createInitialState\s*=/.test(source))wrapperAssignments.push(name);
}
assert.deepEqual(wrapperAssignments,[],'world.js must remain the only createInitialState lifecycle owner');

for(const name of lifecycleFiles){
  const source=fs.readFileSync(new URL(name,srcDir),'utf8');
  assert.ok(/registerInitialState(?:Initializer|Finalizer)\(/.test(source),`${name} must register through the canonical initial-state pipeline`);
  assert.ok(source.includes(`${name} requires world.js initial-state pipeline.`),`${name} must fail loudly when the pipeline is missing`);
  assert.doesNotMatch(source,/baseCreateInitialState|W\.createInitialState\s*=/,`${name} must not recreate the wrapper chain`);
}

const worldIndex=productionScripts.indexOf('src/world.js');
const engineIndex=productionScripts.indexOf('src/engine.js');
assert.ok(worldIndex>=0&&engineIndex>worldIndex,'world.js must load before engine.js');
for(const name of lifecycleFiles){
  const lifecycleIndex=productionScripts.indexOf('src/'+name);
  assert.ok(lifecycleIndex>worldIndex&&lifecycleIndex<engineIndex,`${name} must register after world.js and before engine.js captures createInitialState`);
}

console.log('initial-state pipeline regression: ok');
