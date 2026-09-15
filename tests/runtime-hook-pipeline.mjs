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
const ids=phase=>E.listRuntimeHooks(phase).map(x=>x.id);
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

assert.equal(E.RUNTIME_HOOK_PIPELINE_VERSION,'runtime-hook-pipeline-1');
assert.equal(E.tick,E.RUNTIME_PIPELINE_TICK,'simulation runtimes must not replace the pipeline tick dispatcher');
assert.equal(E.reset,E.RUNTIME_PIPELINE_RESET,'simulation runtimes must not replace the pipeline reset dispatcher');

assert.deepEqual(ids('beforeTick'),[
  'socialOutcome.capture-events',
  'memoryDeliberation.capture-idle',
  'humanSocial.prepare',
  'socialResponse.capture-pet-offers',
  'affect.decay',
  'memory.capture-events',
  'intent.soft-reconsideration',
  'intent.replan-preemption',
  'socialBid.prepare',
  'intent.reconcile-before',
  'action.normalize-before',
  'spatial.capture'
]);
assert.deepEqual(ids('afterTick'),[
  'spatial.effects',
  'action.normalize-after',
  'intent.reconcile-after',
  'socialBid.settle',
  'intent.recover-aborts',
  'memory.process-events',
  'socialResponse.resolve-pet-offers',
  'humanSocial.resolve',
  'memoryDeliberation.correct-initial',
  'socialOutcome.process'
]);
assert.deepEqual(ids('afterReset'),[
  'action.normalize-reset',
  'intent.normalize-reset',
  'socialBid.normalize-reset',
  'memory.normalize-reset',
  'affect.normalize-reset',
  'memoryRetention.normalize-reset'
]);
assert.deepEqual(ids('episodicMemoryCreated'),[
  'appraisal.base',
  'appraisal.social-response',
  'appraisal.human-social',
  'affect.from-appraisal'
]);

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

console.log('Runtime hook pipeline regression: ok');
