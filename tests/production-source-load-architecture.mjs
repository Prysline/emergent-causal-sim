import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
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
const physicalIndex=indexOf('src/systems/physical.js');
const passageIndex=indexOf('src/spatial-passage.js');
const locomotionIndex=indexOf('src/systems/locomotion.js');
const crowdingIndex=indexOf('src/crowding-runtime-v1200.js');
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
assert.ok(physicalIndex<passageIndex&&passageIndex<locomotionIndex&&locomotionIndex<crowdingIndex,'production embodiment load order must remain Physical -> Passage -> Locomotion -> Crowding');
assert.ok(crowdingIndex<initialManifestIndex,'embodiment initial-state registrants must load before initial-state manifest finalization');
assert.equal(pipelineIndex,engineIndex+1,'runtime hook dispatcher must immediately wrap the canonical engine before feature hooks load');
assert.ok(hookManifestIndex>pipelineIndex,'runtime hook manifest must finalize after every production hook registrant');
assert.ok(validatorIndex>pipelineIndex,'validator registry may finalize independently of the runtime-hook manifest');
assert.ok(manifestIndex>validatorIndex,'validator manifest must finalize after the base registry');
assert.ok(manifestIndex<uiIndex,'validator registry must finalize before the base UI');
assert.equal(bootstrapIndex,scripts.length-1,'app bootstrap must be the final production script');
assert.ok(bootstrapIndex>uiIndex,'app bootstrap must start only after UI definitions/extensions load');

const lifecycleExtensions=scripts.filter(path=>
  path!=='src/world.js'&&/registerInitialState(?:Initializer|Finalizer)\(/.test(readRepoFile(path))
);
assert.ok(lifecycleExtensions.length>0,'architecture guard must discover initial-state lifecycle extensions');
for(const path of lifecycleExtensions){
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
assert.equal(hookManifestIndex,bootstrapIndex-1,'runtime-hook manifest must be the final registration gate immediately before app bootstrap');

const engineDependentSubsystemSchemas=[
  'src/systems/action/state.js',
  'src/systems/intent/state.js',
  'src/systems/social/state.js',
  'src/memory-schema-v1130.js',
  'src/appraisal-schema-v1131.js',
  'src/affect-schema-v1132.js',
  'src/memory-retention-schema-v1133.js',
  'src/memory-deliberation-schema-v1134.js',
  'src/social-outcome-memory-schema-v1135.js',
  'src/relationship-schema-v1150.js'
];
const engineDependentSubsystemRuntimes=[
  'src/systems/action/runtime.js',
  'src/systems/intent/runtime.js',
  'src/systems/social/bid.js',
  'src/systems/intent/replanning.js',
  'src/systems/intent/deliberation.js',
  'src/memory-runtime-v1130.js',
  'src/appraisal-runtime-v1131.js',
  'src/appraisal-social-response-v1132a.js',
  'src/appraisal-human-social-response-v1133a.js',
  'src/relationship-runtime-v1150.js',
  'src/affect-runtime-v1132.js',
  'src/systems/social/animal-response.js',
  'src/memory-retention-runtime-v1133.js',
  'src/systems/social/human-response.js',
  'src/memory-deliberation-runtime-v1134.js',
  'src/social-outcome-memory-runtime-v1135.js'
];

for(const path of engineDependentSubsystemSchemas){
  const source=readRepoFile(path);
  assert.ok(indexOf(path)>worldIndex&&indexOf(path)<initialManifestIndex,path+' must remain in the initial-state registration boundary');
  assert.doesNotMatch(source,/SimEngine|registerRuntimeHook\(|\bE\.getState\(/,path+' schema ownership must stay Engine-independent');
}
for(const path of engineDependentSubsystemRuntimes){
  const source=readRepoFile(path);
  assert.ok(indexOf(path)>engineIndex,path+' runtime ownership must load after Engine exists');
  assert.doesNotMatch(source,/registerInitialState(?:Initializer|Finalizer)\(/,path+' runtime ownership must not register structural initial state after manifest finalization');
}

const moduleEvaluationStateTouchPattern=/^\s{2}[A-Za-z_$][A-Za-z0-9_$]*\(E\.getState\(\)\);\s*$/m;
const auditedModuleEvaluationStateTouches=engineDependentSubsystemRuntimes.filter(path=>moduleEvaluationStateTouchPattern.test(readRepoFile(path)));
assert.deepEqual(auditedModuleEvaluationStateTouches,[
  'src/social-bid-runtime-v1122.js',
  'src/memory-runtime-v1130.js',
  'src/affect-runtime-v1132.js',
  'src/memory-retention-runtime-v1133.js'
],'Cleanup-4C must keep the remaining module-evaluation state-touch inventory explicit until each owning slice reviews it');

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
assert.equal(E.isRuntimeHookRegistryFinalized(),false,'runtime-hook registry must remain open until production UI hook extensions have loaded');
assert.equal(V.isValidationRegistryFinalized(),true);
assert.equal(E.getState(),null,'module loading before app bootstrap must not auto-reset the engine');

const uiStartupFiles=[
  'src/ui-social-response-v1132a.js',
  'src/ui-spatial-observability.js',
  'src/ui-observability-controls-v1133a.js',
  'src/ui-resident-view-v1140.js',
  'src/ui-relationship-v1150.js',
  'src/ui-entity-readable-v1141.js'
];
for(const path of uiStartupFiles){
  assert.ok(readRepoFile(path).includes('registerStartupExtension('),path+' must defer UI side effects to SimUI.start()');
}
const previewBridgeSource=readRepoFile('src/editor-preview-bridge.js');
const engineSource=readRepoFile('src/engine.js');
const bootstrapSource=readRepoFile('src/app/bootstrap.js');
assert.ok(previewBridgeSource.includes('startUI:updateIndicator'),'editor preview indicator must expose startup API to the composition root');
assert.doesNotMatch(previewBridgeSource,/DOMContentLoaded[^\n]*updateIndicator|else updateIndicator\(\)/,'editor preview bridge must not render during module evaluation');
assert.doesNotMatch(engineSource,/SimEditorPreviewBridge|getActivePreview/,'Runtime Kernel must not depend on the concrete Editor Preview adapter');
assert.match(engineSource,/configureResetStateSource/,'Runtime Kernel must expose a generic reset-state source boundary');
assert.match(bootstrapSource,/SimEditorPreviewBridge[\s\S]*getActivePreview/,'Composition Root must resolve the Editor Preview startup adapter');

let capturedHookManifest=null;
vm.runInNewContext(readRepoFile('src/runtime/hook-manifest.js'),{window:{SimEngine:{finalizeRuntimeHooks(expected){capturedHookManifest=expected;}}}});
const manifestHooks=[];
for(const [phase,entries] of Object.entries(capturedHookManifest||{}))for(const entry of entries)manifestHooks.push({phase,...entry});
const registeredHooks=[];
for(const path of hookExtensions){
  const source=readRepoFile(path);
  for(const match of source.matchAll(/registerRuntimeHook\('([^']+)'\s*,\s*'([^']+)'\s*,[\s\S]*?,\s*(\d+)\s*\)/g)){
    registeredHooks.push({phase:match[1],id:match[2],order:Number(match[3])});
  }
}
const sortHooks=list=>list.sort((a,b)=>a.phase.localeCompare(b.phase)||a.order-b.order||a.id.localeCompare(b.id));
assert.deepEqual(sortHooks(manifestHooks),sortHooks(registeredHooks),'runtime-hook manifest must exactly cover every production hook registration');

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
const retiredEmbodimentAssets=[
  'src/physical-schema-v1160.js',
  'src/physical-runtime-v1160.js',
  'src/locomotion-schema-v1190.js',
  'src/locomotion-runtime-v1190.js'
];
assert.deepEqual(scripts.filter(path=>retiredEmbodimentAssets.includes(path)),[],'production must not load retired Physical / Locomotion sources');
for(const path of retiredEmbodimentAssets){
  assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),false,path+' must not remain as a second current implementation');
}
const retiredActionIntentAssets=[
  'src/action-schema-v1120.js',
  'src/action-runtime-v1120.js',
  'src/intent-schema-v1121.js',
  'src/intent-runtime-v1121.js',
  'src/interruption-schema-v1123.js',
  'src/intent-runtime-v1123.js',
  'src/deliberation-schema-v1124.js',
  'src/intent-runtime-v1124.js'
];
assert.deepEqual(scripts.filter(path=>retiredActionIntentAssets.includes(path)),[],'production must not load retired Action / Intent sources');
for(const path of retiredActionIntentAssets){
  assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),false,path+' must not remain as a second current implementation');
}
const retiredSocialAssets=[
  'src/social-bid-schema-v1122.js',
  'src/social-bid-runtime-v1122.js',
  'src/social-response-schema-v1132a.js',
  'src/social-response-runtime-v1132a.js',
  'src/human-social-response-schema-v1133a.js',
  'src/human-social-response-runtime-v1133a.js'
];
assert.deepEqual(scripts.filter(path=>retiredSocialAssets.includes(path)),[],'production must not load retired Social sources');
for(const path of retiredSocialAssets){
  assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),false,path+' must not remain as a second current implementation');
}
const spatialInitWriters=scripts.filter(path=>/\bSP\.init\s*=/.test(readRepoFile(path)));
const spatialInitCallers=scripts.filter(path=>/\bSP\.init\s*\(/.test(readRepoFile(path)));
assert.deepEqual(spatialInitWriters,[],'production must not expose a Spatial init writer after Cleanup-3B');
assert.deepEqual(spatialInitCallers,[],'production must not invoke a second Spatial init lifecycle after Cleanup-3B');
assert.ok(readRepoFile('src/spatial.js').includes('function normalizeNode'),'Spatial core must own persistent node identity normalization');
assert.doesNotMatch(readRepoFile('src/spatial-traversal.js'),/function normalizeNode|\bSP\.init\b/,'Spatial traversal must not own node normalization or runtime bootstrap');

const state=E.reset(20260911);
assert.equal(state.version,CURRENT_VERSION,'full production runtime reset must preserve the current release marker');
const validation=V.validateState(state);
assert.equal(validation.issueCount,0,validation.issues.map(issue=>issue.code+': '+issue.message).join(' | '));

console.log('Production source/load architecture regression: ok');
