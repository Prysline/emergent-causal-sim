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
assert.equal(E.isRuntimeHookRegistryFinalized(),false);
assert.equal(V.isValidationRegistryFinalized(),true);
assert.equal(E.getState(),null,'engine module evaluation must not start the simulation');
E.finalizeRuntimeHooks(E.currentRuntimeHookManifest());
assert.equal(E.isRuntimeHookRegistryFinalized(),true);

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

function gateContext({initial=true,runtime=true,validation=true,scenario=''}={}){
  let resets=0,starts=0,previewStarts=0;
  const humanScenarios=[],petScenarios=[];
  const context={
    URLSearchParams,
    window:{
      location:{search:scenario?'?scenario='+scenario:''},
      SimWorld:{isInitialStateRegistryFinalized:()=>initial},
      SimEngine:{
        isRuntimeHookRegistryFinalized:()=>runtime,
        reset(){resets++;return {seed:1};},
        getState(){return null;},
        prepareHumanTalkScenario(mode){humanScenarios.push(mode);return {scenario:mode};},
        preparePetResponseScenario(mode){petScenarios.push(mode);return {scenario:mode};}
      },
      SimValidator:{isValidationRegistryFinalized:()=>validation},
      SimUI:{start(){starts++;}},
      SimEditorPreviewBridge:{startUI(){previewStarts++;}}
    }
  };
  return {
    context,
    resets:()=>resets,
    starts:()=>starts,
    previewStarts:()=>previewStarts,
    humanScenarios:()=>[...humanScenarios],
    petScenarios:()=>[...petScenarios]
  };
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

for(const [scenario,kind] of [
  ['talk-brief','human'],
  ['pet-accept','pet']
]){
  const gate=gateContext({scenario});
  vm.runInNewContext(bootstrapSource,gate.context,{filename:'src/app/bootstrap.js'});
  assert.equal(gate.resets(),0,scenario+' startup must not perform an extra default reset');
  assert.equal(gate.starts(),1,scenario+' startup must start UI exactly once');
  assert.equal(gate.previewStarts(),1,scenario+' startup must start preview presentation exactly once');
  assert.deepEqual(gate.humanScenarios(),kind==='human'?[scenario]:[],scenario+' must dispatch only the matching human scenario helper');
  assert.deepEqual(gate.petScenarios(),kind==='pet'?[scenario]:[],scenario+' must dispatch only the matching pet scenario helper');
}

const engineSource=readRepoFile('src/engine.js');
assert.doesNotMatch(engineSource,/\n\s*reset\(DEFAULT_SEED\);/,'engine.js must not self-start during module evaluation');
for(const [path,pattern] of [
  ['src/human-social-response-runtime-v1133a.js',/prepareHumanTalkScenario\(scenario\)/],
  ['src/social-response-runtime-v1132a.js',/preparePetResponseScenario\(scenario\)/]
]){
  assert.doesNotMatch(readRepoFile(path),pattern,path+' must not auto-run URL scenarios during module evaluation');
}
console.log('Application bootstrap lifecycle regression: ok');
