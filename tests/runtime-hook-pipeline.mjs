import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');


const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

const EXPECTED_HOOKS={
  beforeTick:[
    {id:'socialOutcome.capture-events',order:100},
    {id:'memoryDeliberation.capture-idle',order:200},
    {id:'humanSocial.prepare',order:300},
    {id:'socialResponse.capture-pet-offers',order:400},
    {id:'affect.decay',order:500},
    {id:'intent.soft-reconsideration',order:700},
    {id:'intent.replan-preemption',order:800},
    {id:'socialBid.prepare',order:900},
    {id:'intent.reconcile-before',order:1000},
    {id:'spatial.capture',order:1100}
  ],
  afterTick:[
    {id:'spatial.effects',order:100},
    {id:'intent.reconcile-after',order:200},
    {id:'socialBid.settle',order:300},
    {id:'intent.recover-aborts',order:400},
    {id:'memory.process-events',order:500},
    {id:'socialResponse.resolve-pet-offers',order:600},
    {id:'humanSocial.resolve',order:700},
    {id:'memoryDeliberation.correct-initial',order:800},
    {id:'socialOutcome.process',order:900}
  ],
  afterReset:[
    {id:'intent.normalize-reset',order:100},
    {id:'socialBid.normalize-reset',order:200},
    {id:'memory.normalize-reset',order:300},
    {id:'affect.normalize-reset',order:400},
    {id:'memoryRetention.normalize-reset',order:500}
  ],
  episodicMemoryCreated:[
    {id:'appraisal.base',order:100},
    {id:'appraisal.social-response',order:200},
    {id:'appraisal.human-social',order:300},
    {id:'relationship.consolidate',order:350},
    {id:'affect.from-appraisal',order:400}
  ]
};

assert.equal(E.RUNTIME_HOOK_PIPELINE_VERSION,'runtime-hook-pipeline-2');
assert.equal(E.tick,E.RUNTIME_PIPELINE_TICK,'simulation runtimes must not replace the pipeline tick dispatcher');
assert.equal(E.reset,E.RUNTIME_PIPELINE_RESET,'simulation runtimes must not replace the pipeline reset dispatcher');
assert.equal(E.addEvent,E.CORE_ADD_EVENT,'simulation runtimes must not replace the core event creator');
assert.deepEqual(E.listEventCreatedListeners(),[{id:'memory.episodic-observation',order:100}],'Memory must consume the core event-created lifecycle through a named listener');

for(const [phase,expected] of Object.entries(EXPECTED_HOOKS)){
  assert.deepEqual(E.listRuntimeHooks(phase),expected,`${phase} hook ids/orders are architecture semantics and must remain explicit`);
}

assert.equal(E.isRuntimeHookRegistryFinalized(),true,'domain-runtime profile must finalize a complete simulation schedule before UI loads');
assert.deepEqual(E.currentRuntimeHookManifest(),EXPECTED_HOOKS);
assert.deepEqual(E.currentRuntimeObserverManifest(),{afterTick:[],afterReset:[]},'headless runtime must not require Presentation observers');
E.registerRuntimeObserver('afterTick','qa.presentation-observer',()=>{},10);
assert.deepEqual(E.listRuntimeObservers('afterTick'),[{id:'qa.presentation-observer',order:10}],'Presentation observers may register after simulation hook finalization');
assert.throws(()=>E.registerRuntimeObserver('afterTick','qa.presentation-observer',()=>{},20),/Duplicate runtime observer/);
assert.throws(()=>E.registerRuntimeHook('beforeTick','qa.late-simulation-hook',()=>{},999),/Runtime hook registry is finalized/,'late simulation hooks must fail after manifest finalization');
assert.throws(()=>E.registerRuntimeHook('unknownPhase','bad',()=>{}),/Unknown runtime hook phase/,'unknown phases must fail loudly');

const isolatedContext={window:{SimEngine:{tick(){},reset(){}}}};
vm.runInNewContext(fs.readFileSync(new URL('../src/runtime-hook-pipeline.js',import.meta.url),'utf8'),isolatedContext,{filename:'src/runtime-hook-pipeline.js'});
const isolatedEngine=isolatedContext.window.SimEngine;
isolatedEngine.registerRuntimeHook('beforeTick','qa.duplicate-hook',()=>{},10);
assert.throws(()=>isolatedEngine.registerRuntimeHook('beforeTick','qa.duplicate-hook',()=>{},20),/Duplicate runtime hook/,'duplicate hook ids must fail loudly before finalization');

E.reset(20260911);
noIssues('reset');
for(let i=0;i<200;i++){
  E.tick();
  noIssues(`tick ${i+1}`);
}
assert.equal(E.getState().tick,200,'pipeline must advance the canonical core exactly once per E.tick call');
assert.equal(E.tick,E.RUNTIME_PIPELINE_TICK,'tick dispatcher identity must remain stable after long-run execution');
assert.equal(E.reset,E.RUNTIME_PIPELINE_RESET,'reset dispatcher identity must remain stable after long-run execution');

const srcDir=new URL('../src/',import.meta.url),testsDir=new URL('../tests/',import.meta.url);
const hookSourceFiles=fs.readdirSync(srcDir).filter(name=>name.endsWith('.js')&&name!=='runtime-hook-pipeline.js').filter(name=>fs.readFileSync(new URL(name,srcDir),'utf8').includes('registerRuntimeHook('));
assert.ok(hookSourceFiles.length>0,'architecture guard must discover runtime hook extensions');
for(const name of hookSourceFiles){
  const source=fs.readFileSync(new URL(name,srcDir),'utf8');
  assert.ok(!/\bE\.(?:tick|reset|onEpisodicMemoryCreated)\s*=(?!=)/.test(source),`${name} must not own a no-pipeline lifecycle wrapper`);
  assert.ok(source.includes(`if(!E.registerRuntimeHook)throw new Error('${name} requires runtime-hook-pipeline.js');`),`${name} must fail loudly when the production pipeline is missing`);
}
for(const testName of fs.readdirSync(testsDir).filter(name=>name.endsWith('.mjs')&&!name.startsWith('browser-'))){
  const source=fs.readFileSync(new URL(testName,testsDir),'utf8');
  const quotedJs=[...source.matchAll(/['"]([A-Za-z0-9._-]+\.js)['"]/g)].map(m=>m[1]);
  const loadedHookFiles=hookSourceFiles.filter(name=>quotedJs.includes(name));
  if(!loadedHookFiles.length)continue;
  const engineIndex=quotedJs.indexOf('engine.js'),pipelineIndex=quotedJs.indexOf('runtime-hook-pipeline.js');
  assert.ok(engineIndex>=0,`${testName} loads hook extensions without engine.js`);
  assert.ok(pipelineIndex>engineIndex,`${testName} must load runtime-hook-pipeline.js after engine.js`);
  const firstHookIndex=Math.min(...loadedHookFiles.map(name=>quotedJs.indexOf(name)));
  assert.ok(pipelineIndex<firstHookIndex,`${testName} must load runtime-hook-pipeline.js before every hook extension`);
}

console.log('Runtime hook pipeline regression: ok');
