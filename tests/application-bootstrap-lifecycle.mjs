import vm from 'node:vm';
import assert from 'node:assert/strict';
import {
  loadProductionBefore,
  productionScriptPaths,
  readRepoFile
} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
const scripts=productionScriptPaths();
assert.equal(scripts.at(-1),'src/app/bootstrap.js','production composition root must be the final script');
loadProductionBefore('src/ui.js');

const W=globalThis.SimWorld,E=globalThis.SimEngine,V=globalThis.SimValidator;
assert.equal(W.isInitialStateRegistryFinalized(),true);
assert.equal(E.isRuntimeHookRegistryFinalized(),true);
assert.equal(V.isValidationRegistryFinalized(),true);
assert.equal(E.getState(),null,'engine module evaluation must not start the simulation');

let uiStarts=0;
globalThis.SimUI={start(){uiStarts++;return true;}};
const bootstrapSource=readRepoFile('src/app/bootstrap.js');
vm.runInThisContext(bootstrapSource,{filename:'src/app/bootstrap.js'});
assert.equal(uiStarts,1,'bootstrap must start UI exactly once');
assert.equal(globalThis.SimApp.isStarted(),true);
const first=structuredClone(E.getState());
assert.ok(first&&first.tick===0,'bootstrap must create the first runtime state');
const second=structuredClone(E.reset());
assert.deepEqual(second,first,'first startup and subsequent reset must use the same reset lifecycle');

function gateContext({initial=true,runtime=true,validation=true}={}){
  let resets=0,starts=0;
  const context={
    window:{
      SimWorld:{isInitialStateRegistryFinalized:()=>initial},
      SimEngine:{isRuntimeHookRegistryFinalized:()=>runtime,reset(){resets++;return {seed:1};},getState(){return null;}},
      SimValidator:{isValidationRegistryFinalized:()=>validation},
      SimUI:{start(){starts++;}}
    }
  };
  return {context,resets:()=>resets,starts:()=>starts};
}
for(const [label,flags,pattern] of [
  ['initial-state',{initial:false},/initial-state registry/],
  ['runtime-hook',{runtime:false},/runtime-hook registry/],
  ['validation',{validation:false},/validation registry/]
]){
  const gate=gateContext(flags);
  assert.throws(()=>vm.runInNewContext(bootstrapSource,gate.context,{filename:'src/app/bootstrap.js'}),pattern,label+' manifest gate must block startup');
  assert.equal(gate.resets(),0,label+' gate must block reset');
  assert.equal(gate.starts(),0,label+' gate must block UI start');
}

const engineSource=readRepoFile('src/engine.js');
assert.doesNotMatch(engineSource,/\n\s*reset\(DEFAULT_SEED\);/,'engine.js must not self-start during module evaluation');
console.log('Application bootstrap lifecycle regression: ok');
