import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadScriptsInThisContext,productionScriptPaths,readRepoFile} from './helpers/production-loader.mjs';

globalThis.window=globalThis;

const productionScripts=productionScriptPaths();
const initializerPaths=productionScripts.filter(path=>
  path!=='src/world.js'&&readRepoFile(path).includes('registerInitialStateInitializer(')
);
const initializerFiles=initializerPaths.map(path=>path.replace(/^src\//,''));

loadScriptsInThisContext(['src/world-authoring.js','src/world-initializer.js','src/world.js','src/spatial.js']);
const canonicalCreateInitialState=globalThis.SimWorld.createInitialState;
const canonicalCreateInitialStateFromAuthoring=globalThis.SimWorld.createInitialStateFromAuthoring;
loadScriptsInThisContext(initializerPaths);

const W=globalThis.SimWorld;
assert.equal(W.createInitialState,canonicalCreateInitialState,'subsystem extensions must not replace the canonical createInitialState owner');
assert.equal(W.createInitialStateFromAuthoring,canonicalCreateInitialStateFromAuthoring,'subsystem extensions must not replace the explicit authoring initial-state factory');
const EXPECTED=[
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
assert.equal(st.version,'11.22.0-spatial-z-identity','full production schema set must preserve current release marker');
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

const A=globalThis.SimWorldAuthoring;
const custom=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
const chair=custom.furniture.chairNW,source=chair.footprint[0],dx=3-source.x,dy=4-source.y;
chair.footprint=chair.footprint.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
chair.displayAt={...chair.displayAt,x:chair.displayAt.x+dx,y:chair.displayAt.y+dy};
chair.slots=chair.slots.map(slot=>({...slot,position:{...slot.position,x:slot.position.x+dx,y:slot.position.y+dy}}));
const customState=W.createInitialStateFromAuthoring(custom,20260911);
assert.deepEqual(customState.furniture.chairNW.footprint,[{x:3,y:4}],'explicit authoring factory must compile the supplied canonical document');
assert.equal(customState.version,'11.22.0-spatial-z-identity');
assert.deepEqual(W.createInitialState(20260911).furniture.chairNW.footprint,st.furniture.chairNW.footprint,'explicit preview initialization must not mutate the default world factory');
assert.deepEqual(W.createInitialStateFromAuthoring(custom,20260911),customState,'preview reset source must remain deterministic for the same snapshot and seed');

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

const worldIndex=productionScripts.indexOf('src/world.js');
const engineIndex=productionScripts.indexOf('src/engine.js');
assert.ok(worldIndex>=0&&engineIndex>worldIndex,'world.js must load before engine.js');
for(const name of initializerFiles){
  const initializerIndex=productionScripts.indexOf('src/'+name);
  assert.ok(initializerIndex>worldIndex&&initializerIndex<engineIndex,`${name} must register after world.js and before engine.js captures createInitialState`);
}

console.log('initial-state pipeline regression: ok');
