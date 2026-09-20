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

const authoringIndex=indexOf('src/world-authoring.js');
const worldIndex=indexOf('src/world.js');
const releaseIndex=indexOf('src/release.js');
const engineIndex=indexOf('src/engine.js');
const initialManifestIndex=indexOf('src/world/initial-state-manifest.js');
const pipelineIndex=indexOf('src/runtime-hook-pipeline.js');
const hookManifestIndex=indexOf('src/runtime/hook-manifest.js');
const validatorIndex=indexOf('src/state-validator.js');
const manifestIndex=indexOf('src/state-validator-manifest.js');
const uiIndex=indexOf('src/ui.js');
const bootstrapIndex=indexOf('src/app/bootstrap.js');

assert.ok(authoringIndex<worldIndex,'current authoring owner must load before world.js');
assert.equal(scripts.includes('src/world-authoring-v1.js'),false,'production must not load the retired legacy-named authoring asset');
assert.ok(worldIndex<engineIndex,'world ownership must initialize before engine');
assert.equal(releaseIndex,worldIndex+1,'release owner must load immediately after world.js');
assert.equal(initialManifestIndex,engineIndex-1,'initial-state manifest must finalize immediately before engine loads');
assert.equal(pipelineIndex,engineIndex+1,'runtime hook dispatcher must immediately wrap the canonical engine before feature hooks load');
assert.ok(hookManifestIndex>pipelineIndex,'runtime hook manifest must finalize after runtime feature hooks register');
assert.equal(validatorIndex,hookManifestIndex+1,'validator registry must load after runtime hook finalization');
assert.ok(manifestIndex>validatorIndex,'validator manifest must finalize after the base registry');
assert.ok(manifestIndex<uiIndex,'validator registry must finalize before the base UI');
assert.equal(bootstrapIndex,scripts.length-1,'app bootstrap must be the final production script');
assert.ok(bootstrapIndex>uiIndex,'app bootstrap must start only after UI definitions/extensions load');

const initializerExtensions=scripts.filter(path=>
  path!=='src/world.js'&&readRepoFile(path).includes('registerInitialStateInitializer(')
);
assert.ok(initializerExtensions.length>0,'architecture guard must discover initial-state extensions');
for(const path of initializerExtensions){
  assert.ok(indexOf(path)>worldIndex,path+' must register after world.js creates the initial-state pipeline');
  assert.ok(indexOf(path)<initialManifestIndex,path+' must register before initial-state manifest finalization');
}

const hookExtensions=scripts.filter(path=>
  path!=='src/runtime-hook-pipeline.js'&&readRepoFile(path).includes('registerRuntimeHook(')
);
assert.ok(hookExtensions.length>0,'architecture guard must discover runtime hook extensions');
for(const path of hookExtensions){
  assert.ok(indexOf(path)>pipelineIndex,path+' must register after runtime-hook-pipeline.js');
  assert.ok(indexOf(path)<hookManifestIndex,path+' must register before runtime-hook manifest finalization');
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
assert.equal(A.LEGACY_VERSION,undefined,'current-only authoring must not expose a legacy schema marker');
assert.equal(A.migrateAuthoring,undefined,'current-only authoring must not expose production migration machinery');
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
assert.equal(W.isInitialStateRegistryFinalized(),true);
assert.equal(E.isRuntimeHookRegistryFinalized(),true);
assert.equal(V.isValidationRegistryFinalized(),true);
assert.equal(E.getState(),null,'module loading before app bootstrap must not auto-reset the engine');

const releaseVersionWriters=scripts.filter(path=>/W\.VERSION\s*=|st\.version\s*=/.test(readRepoFile(path)));
assert.deepEqual(releaseVersionWriters,['src/release.js'],'current runtime release marker must have exactly one production writer');

const retiredSpatialAssets=[
  'src/spatial-v111.js',
  'src/contact-v1112.js',
  'src/spatial-v1113.js',
  'src/spatial-v1114.js',
  'src/spatial-passage-v1170.js',
  'src/engine-spatial-v1114.js'
];
assert.deepEqual(scripts.filter(path=>retiredSpatialAssets.includes(path)),[],'production must not reload retired version-named Spatial assets');
const spatialInitWriters=scripts.filter(path=>/\bSP\.init\s*=/.test(readRepoFile(path)));
assert.deepEqual(spatialInitWriters,['src/spatial-traversal.js'],'Spatial runtime bootstrap must have exactly one production init owner during Cleanup-3A');

const state=E.reset(20260911);
assert.equal(state.version,CURRENT_VERSION,'full production runtime reset must preserve the current release marker');
const validation=V.validateState(state);
assert.equal(validation.issueCount,0,validation.issues.map(issue=>issue.code+': '+issue.message).join(' | '));

console.log('Production source/load architecture regression: ok');
