import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  loadProductionBefore,
  productionScriptPaths,
  readRepoFile
} from './helpers/production-loader.mjs';

globalThis.window=globalThis;

const CURRENT_VERSION='11.22.0-spatial-z-identity';
const scripts=productionScriptPaths();
const indexOf=path=>{
  const index=scripts.indexOf(path);
  assert.ok(index>=0,'production index must load '+path);
  return index;
};

assert.equal(new Set(scripts).size,scripts.length,'production index must not load the same source file twice');
for(const relativePath of scripts){
  assert.doesNotThrow(()=>readRepoFile(relativePath),'production source must exist: '+relativePath);
}

const worldIndex=indexOf('src/world.js');
const releaseIndex=indexOf('src/release.js');
const engineIndex=indexOf('src/engine.js');
const pipelineIndex=indexOf('src/runtime-hook-pipeline.js');
const validatorIndex=indexOf('src/state-validator.js');
const manifestIndex=indexOf('src/state-validator-manifest.js');
const uiIndex=indexOf('src/ui.js');

assert.ok(worldIndex<engineIndex,'world ownership must initialize before engine');
assert.equal(releaseIndex,worldIndex+1,'release owner must load immediately after world.js');
assert.equal(pipelineIndex,engineIndex+1,'runtime hook dispatcher must immediately wrap the canonical engine before feature hooks load');
assert.ok(validatorIndex>pipelineIndex,'validator registry must load after runtime feature ownership is available');
assert.ok(manifestIndex>validatorIndex,'validator manifest must finalize after the base registry');
assert.ok(manifestIndex<uiIndex,'validator registry must finalize before the base UI');

const initializerExtensions=scripts.filter(path=>
  path!=='src/world.js'&&readRepoFile(path).includes('registerInitialStateInitializer(')
);
assert.ok(initializerExtensions.length>0,'architecture guard must discover initial-state extensions');
for(const path of initializerExtensions){
  assert.ok(indexOf(path)>worldIndex,path+' must register after world.js creates the initial-state pipeline');
  assert.ok(indexOf(path)<engineIndex,path+' must register before engine bootstrap');
}

const hookExtensions=scripts.filter(path=>
  path!=='src/runtime-hook-pipeline.js'&&readRepoFile(path).includes('registerRuntimeHook(')
);
assert.ok(hookExtensions.length>0,'architecture guard must discover runtime hook extensions');
for(const path of hookExtensions){
  assert.ok(indexOf(path)>pipelineIndex,path+' must register after runtime-hook-pipeline.js');
}

const srcDir=new URL('../src/',import.meta.url);
const validatorExtensions=fs.readdirSync(srcDir)
  .filter(name=>/^state-validator-v.*\.js$/.test(name))
  .map(name=>'src/'+name)
  .sort();
assert.ok(validatorExtensions.length>0,'architecture guard must discover validator extensions');
for(const path of validatorExtensions){
  assert.ok(indexOf(path)>validatorIndex,path+' must load after state-validator.js');
  assert.ok(indexOf(path)<manifestIndex,path+' must load before state-validator-manifest.js');
}

loadProductionBefore('src/ui.js');

const A=globalThis.SimWorldAuthoring;
const R=globalThis.SimRelease;
const W=globalThis.SimWorld;
const SP=globalThis.SimSpatial;
const P=globalThis.SimPhysical;
const L=globalThis.SimLocomotion;
const C=globalThis.SimCrowding;
const V=globalThis.SimValidator;
const E=globalThis.SimEngine;

assert.equal(A.VERSION,'world-authoring-v2');
assert.equal(R.VERSION,CURRENT_VERSION);
assert.equal(W.VERSION,CURRENT_VERSION);
assert.equal(W.PRESENTATION_SCHEMA_VERSION,CURRENT_VERSION);
assert.equal(SP.SPATIAL_IDENTITY_VERSION,CURRENT_VERSION);
assert.equal(W.PHYSICAL_SCHEMA_VERSION,'11.17.0-passage-profile-multimode');
assert.equal(P.VERSION,'11.17.0-passage-profile-multimode');
assert.equal(SP.PASSAGE_PROFILE_VERSION,'11.17.0-passage-profile-multimode');
assert.equal(SP.ROUTE_SEMANTICS_VERSION,'11.18.0-route-semantics-split');
assert.equal(W.LOCOMOTION_SCHEMA_VERSION,'11.19.0-locomotion-execution-posture');
assert.equal(L.VERSION,'11.19.0-locomotion-execution-posture');
assert.equal(C.VERSION,'11.20.0-dynamic-congestion');
assert.equal(W.RELATIONSHIP_SCHEMA_VERSION,'11.15.2-relationship-responder-bias');
assert.equal(V.isValidationRegistryFinalized(),true);

const releaseVersionWriters=scripts.filter(path=>/W\.VERSION\s*=|st\.version\s*=/.test(readRepoFile(path)));
assert.deepEqual(releaseVersionWriters,['src/release.js'],'current runtime release marker must have exactly one production writer');

const state=E.reset(20260911);
assert.equal(state.version,CURRENT_VERSION,'full production runtime reset must preserve the current release marker');
const validation=V.validateState(state);
assert.equal(validation.issueCount,0,validation.issues.map(issue=>issue.code+': '+issue.message).join(' | '));

console.log('Production source/load architecture regression: ok');
