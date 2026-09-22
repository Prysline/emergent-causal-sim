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
loadProductionBefore('src/ui/core.js');

const W=globalThis.SimWorld,E=globalThis.SimEngine,V=globalThis.SimValidator;
assert.equal(W.isInitialStateRegistryFinalized(),true);
assert.equal(E.isRuntimeHookRegistryFinalized(),true,'simulation runtime-hook registry must finalize before UI loads');
assert.deepEqual(E.currentRuntimeObserverManifest(),{afterTick:[],afterReset:[]},'bootstrap prefix must not require Presentation observers');
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

function gateContext({initial=true,runtime=true,validation=true,scenario='',preview=null}={}){
  let resets=0,starts=0,previewStarts=0,resetStateSource=null;
  const humanScenarios=[],petScenarios=[];
  const state={seed:1};
  const engine={
    PREVIEW_MODE:false,
    PREVIEW_FINGERPRINT:null,
    isRuntimeHookRegistryFinalized:()=>runtime,
    configureResetStateSource(id,createState){resetStateSource={id,createState};return {id};},
    currentResetStateSource(){return {id:resetStateSource?.id||'default'};},
    reset(){resets++;return resetStateSource?resetStateSource.createState(1):state;},
    getState(){return state;},
    prepareHumanTalkScenario(mode){humanScenarios.push(mode);return {scenario:mode};},
    preparePetResponseScenario(mode){petScenarios.push(mode);return {scenario:mode};}
  };
  const previewResult=preview||{requested:false,ok:true,authoring:null,fingerprint:null,issues:[]};
  const context={
    URLSearchParams,
    JSON,
    window:{
      location:{search:scenario?'?scenario='+scenario:''},
      SimWorld:{
        isInitialStateRegistryFinalized:()=>initial,
        createInitialStateFromAuthoring(authoring,seed){return {seed,authoring:structuredClone(authoring)};}
      },
      SimEngine:engine,
      SimValidator:{isValidationRegistryFinalized:()=>validation},
      SimUI:{start(){starts++;}},
      SimEditorPreviewBridge:{getActivePreview(){return previewResult;},startUI(){previewStarts++;}}
    }
  };
  return {
    context,
    engine,
    previewResult,
    resets:()=>resets,
    starts:()=>starts,
    previewStarts:()=>previewStarts,
    resetStateSource:()=>resetStateSource,
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

const previewAuthoring={authoringSchema:'world-authoring-v6',furnitureCatalogVersion:'furniture-definitions-v4',map:{width:1,height:1,cellSizeMeters:1,layers:[{z:0,cells:{},boundaries:{}}]},doors:{},exits:{}};
const previewGate=gateContext({preview:{requested:true,ok:true,authoring:previewAuthoring,fingerprint:'preview-fp',issues:[]}});
vm.runInNewContext(bootstrapSource,previewGate.context,{filename:'src/app/bootstrap.js'});
assert.equal(previewGate.resetStateSource()?.id,'editor-preview','Composition Root must translate Preview into the generic Engine reset-state source');
assert.equal(previewGate.engine.PREVIEW_MODE,true);
assert.equal(previewGate.engine.PREVIEW_FINGERPRINT,'preview-fp');
assert.equal(previewGate.resets(),1,'ordinary Preview startup must perform one reset through the configured source');
previewAuthoring.map.width=99;
assert.equal(previewGate.resetStateSource().createState(2).authoring.map.width,1,'Preview reset source must retain the canonical snapshot captured at startup');

const invalidPreview=gateContext({preview:{requested:true,ok:false,authoring:null,fingerprint:null,issues:[{code:'preview_invalid'}]}});
assert.throws(()=>vm.runInNewContext(bootstrapSource,invalidPreview.context,{filename:'src/app/bootstrap.js'}),/Editor Preview bootstrap failed/);
assert.equal(invalidPreview.resets(),0,'invalid Preview must fail before runtime reset');
assert.equal(invalidPreview.starts(),0,'invalid Preview must fail before UI startup');

const engineSource=readRepoFile('src/engine.js');
assert.doesNotMatch(engineSource,/\n\s*reset\(DEFAULT_SEED\);/,'engine.js must not self-start during module evaluation');
assert.doesNotMatch(engineSource,/SimEditorPreviewBridge|getActivePreview/,'Engine must not depend directly on the Editor Preview adapter');
assert.match(engineSource,/configureResetStateSource/,'Engine must expose a generic reset-state source boundary');
assert.match(bootstrapSource,/SimEditorPreviewBridge[\s\S]*getActivePreview/,'Composition Root must own Editor Preview startup input');
for(const [path,pattern] of [
  ['src/systems/social/human-response.js',/prepareHumanTalkScenario\(scenario\)/],
  ['src/systems/social/animal-response.js',/preparePetResponseScenario\(scenario\)/]
]){
  assert.doesNotMatch(readRepoFile(path),pattern,path+' must not auto-run URL scenarios during module evaluation');
}
console.log('Application bootstrap lifecycle regression: ok');
