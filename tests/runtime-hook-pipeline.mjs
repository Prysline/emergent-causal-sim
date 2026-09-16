import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const files=[
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js','interruption-schema-v1123.js','deliberation-schema-v1124.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js','memory-retention-schema-v1133.js','human-social-response-schema-v1133a.js','memory-deliberation-schema-v1134.js','social-outcome-memory-schema-v1135.js','presentation-schema-v1140.js',
  'engine.js','runtime-hook-pipeline.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js','intent-runtime-v1123.js','intent-runtime-v1124.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js','memory-retention-runtime-v1133.js','human-social-response-runtime-v1133a.js','memory-deliberation-runtime-v1134.js','social-outcome-memory-runtime-v1135.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js','state-validator-v1135.js'
];
for(const file of files)vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

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
    {id:'affect.from-appraisal',order:400}
  ]
};

assert.equal(E.RUNTIME_HOOK_PIPELINE_VERSION,'runtime-hook-pipeline-1');
assert.equal(E.tick,E.RUNTIME_PIPELINE_TICK,'simulation runtimes must not replace the pipeline tick dispatcher');
assert.equal(E.reset,E.RUNTIME_PIPELINE_RESET,'simulation runtimes must not replace the pipeline reset dispatcher');
assert.equal(E.addEvent,E.CORE_ADD_EVENT,'simulation runtimes must not replace the core event creator');
assert.deepEqual(E.listEventCreatedListeners(),[{id:'memory.episodic-observation',order:100}],'Memory must consume the core event-created lifecycle through a named listener');

for(const [phase,expected] of Object.entries(EXPECTED_HOOKS)){
  assert.deepEqual(E.listRuntimeHooks(phase),expected,`${phase} hook ids/orders are architecture semantics and must remain explicit`);
}

assert.throws(()=>E.registerRuntimeHook('beforeTick','intent.reconcile-before',()=>{},999),/Duplicate runtime hook/,'duplicate hook ids must fail loudly');
assert.throws(()=>E.registerRuntimeHook('unknownPhase','bad',()=>{}),/Unknown runtime hook phase/,'unknown phases must fail loudly');

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
