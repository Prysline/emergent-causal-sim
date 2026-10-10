import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

const SELF=fileURLToPath(import.meta.url);
const CHILD_VARIANT=process.env.INTENT_REPLAN_VALIDATION_VARIANT||'';
const CHILD_OUTPUT=process.env.INTENT_REPLAN_VALIDATION_OUTPUT||'';

const PROFILE=[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js','systems/physical.js','spatial-passage.js','systems/locomotion.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js'
];

function lifecycleSnapshot(st){
  return {
    tick:st.tick,
    agents:Object.fromEntries(Object.entries(st.agents||{}).map(([id,a])=>[id,{
      action:a.action?{kind:a.action.kind,phase:a.action.phase,intentId:a.action.intentId||null}:null,
      activeIntent:a.activeIntent?{id:a.activeIntent.id,kind:a.activeIntent.kind,lifecycle:a.activeIntent.lifecycle}:null
    }]))
  };
}

function assertLifecycle(st){
  for(const a of Object.values(st.agents||{})){
    if(a.action){
      assert.equal(a.activeIntent?.lifecycle,'actionBound',`${a.name} action must have actionBound Intent at tick ${st.tick}`);
      assert.equal(a.action.intentId,a.activeIntent?.id,`${a.name} Action/Intent linkage mismatch at tick ${st.tick}`);
    }
    if(a.activeIntent?.lifecycle==='open')assert.equal(a.action,null,`${a.name} open Intent must not persist an Action at tick ${st.tick}`);
  }
}

function runChild(){
  assert.ok(CHILD_VARIANT==='baseline'||CHILD_VARIANT==='candidate','child variant must be baseline or candidate');
  assert.ok(CHILD_OUTPUT,'child output path required');
  globalThis.window=globalThis;
  loadRuntimeProfile(PROFILE);
  const E=globalThis.SimEngine,V=globalThis.SimValidator;
  assert.ok(E?.tick&&V?.validateState,'diagnostic requires Intent runtime and validator');

  let validationCalls=0;
  const originalValidate=V.validateState;
  V.validateState=function(...args){validationCalls++;return originalValidate.apply(this,args);};
  const noIssues=label=>{
    const v=V.validateState(E.getState());
    assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);
  };

  E.reset(77);
  const trace=[];
  const started=performance.now();
  for(let i=0;i<500;i++){
    E.tick();
    const st=E.getState();
    assertLifecycle(st);
    trace.push(lifecycleSnapshot(st));
    if(CHILD_VARIANT==='baseline')noIssues(`tick ${i+1}`);
    else if(i%25===0)noIssues(`tick ${i+1}`);
  }
  if(CHILD_VARIANT==='candidate')noIssues('500 tick integration final');
  const elapsedMs=performance.now()-started;
  const finalState=E.getState();
  fs.writeFileSync(CHILD_OUTPUT,JSON.stringify({
    variant:CHILD_VARIANT,
    elapsedMs,
    validationCalls,
    stateJson:JSON.stringify(finalState),
    rngState:finalState.rngState,
    lifecycleTraceJson:JSON.stringify(trace)
  }));
}

function runCase(tmpDir,variant){
  const output=path.join(tmpDir,`${variant}.json`);
  const child=spawnSync(process.execPath,[SELF],{
    env:{...process.env,INTENT_REPLAN_VALIDATION_VARIANT:variant,INTENT_REPLAN_VALIDATION_OUTPUT:output},
    encoding:'utf8',
    maxBuffer:16*1024*1024
  });
  assert.equal(child.status,0,`${variant} child failed:\n${child.stderr||child.stdout}`);
  return JSON.parse(fs.readFileSync(output,'utf8'));
}

if(CHILD_VARIANT){
  runChild();
}else{
  const tmpDir=fs.mkdtempSync(path.join(os.tmpdir(),'intent-replan-validation-cadence-'));
  try{
    const baseline=runCase(tmpDir,'baseline');
    const candidate=runCase(tmpDir,'candidate');
    assert.equal(baseline.validationCalls,500,'baseline must preserve current per-tick generic validation cadence');
    assert.equal(candidate.validationCalls,21,'candidate must use the existing every-25-ticks + final validation convention');
    assert.equal(candidate.stateJson,baseline.stateJson,'candidate must preserve exact canonical simulation state');
    assert.deepEqual(candidate.rngState,baseline.rngState,'candidate must preserve RNG state');
    assert.equal(candidate.lifecycleTraceJson,baseline.lifecycleTraceJson,'candidate must preserve every-tick Action/Intent lifecycle trace');
    const report={
      note:'Diagnostic-only comparison of current Intent long-run generic validation cadence. The 500-tick horizon and every-tick Intent lifecycle assertions are unchanged.',
      baseline:{elapsedMs:baseline.elapsedMs,validationCalls:baseline.validationCalls},
      candidate:{elapsedMs:candidate.elapsedMs,validationCalls:candidate.validationCalls},
      delta:{
        elapsedMs:candidate.elapsedMs-baseline.elapsedMs,
        validationCalls:candidate.validationCalls-baseline.validationCalls,
        validationReductionPct:(1-candidate.validationCalls/baseline.validationCalls)*100
      }
    };
    console.log('INTENT_REPLAN_VALIDATION_CADENCE_DIAGNOSTIC '+JSON.stringify(report));
    console.log('Intent replan validation cadence diagnostic: exact state/RNG/lifecycle-trace parity ok');
  } finally {
    fs.rmSync(tmpDir,{recursive:true,force:true});
  }
}
