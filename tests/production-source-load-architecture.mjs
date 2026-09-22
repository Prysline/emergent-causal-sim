import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  loadProductionBefore,
  productionScriptPaths,
  readRepoFile
} from './helpers/production-loader.mjs';

globalThis.window=globalThis;

const CURRENT_VERSION='11.27.2-room-value-legacy-removal';
const SPATIAL_IDENTITY_VERSION='11.22.0-spatial-z-identity';
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

const furnitureDefinitionsIndex=indexOf('src/furniture-definitions.js');
const authoringIndex=indexOf('src/world-authoring.js');
const capabilityIndex=indexOf('src/embodiment-capabilities.js');
const initializerIndex=indexOf('src/world-initializer.js');
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
const validatorIndex=indexOf('src/validation/registry.js');
const manifestIndex=indexOf('src/validation/manifest.js');
const uiIndex=indexOf('src/ui/core.js');
const labelsIndex=indexOf('src/ui/labels.js');
const bootstrapIndex=indexOf('src/app/bootstrap.js');

assert.ok(furnitureDefinitionsIndex<authoringIndex,'Furniture Definitions must load before world-authoring.js');
assert.ok(authoringIndex<capabilityIndex&&capabilityIndex<initializerIndex&&initializerIndex<worldIndex,'shared embodiment capabilities must stay authoring-safe and load before initializer/runtime owners');
const capabilitySource=readRepoFile('src/embodiment-capabilities.js');
assert.doesNotMatch(capabilitySource,/SimEngine|SimSpatial|registerInitialStateInitializer/,'shared embodiment capability contract must stay pure and authoring-safe');
assert.ok(authoringIndex<worldIndex,'current authoring owner must load before world.js');
assert.equal(scripts.includes('src/world-authoring-v1.js'),false,'production must not load the retired legacy-named authoring asset');
assert.ok(worldIndex<engineIndex,'world ownership must initialize before engine');
assert.equal(releaseIndex,worldIndex+1,'release owner must load immediately after world.js');
assert.equal(initialManifestIndex,engineIndex-1,'initial-state manifest must finalize immediately before engine loads');
assert.ok(physicalIndex<passageIndex&&passageIndex<locomotionIndex&&locomotionIndex<crowdingIndex,'production embodiment load order must remain Physical -> Passage -> Locomotion -> Crowding');
assert.ok(crowdingIndex<initialManifestIndex,'embodiment initial-state registrants must load before initial-state manifest finalization');
assert.equal(pipelineIndex,engineIndex+1,'runtime hook dispatcher must immediately wrap the canonical engine before feature hooks load');
assert.ok(hookManifestIndex>pipelineIndex,'runtime hook manifest must finalize after every simulation hook registrant');
assert.ok(hookManifestIndex<validatorIndex,'simulation hook manifest must finalize before validation/UI composition');
assert.ok(validatorIndex>pipelineIndex,'validator registry may finalize independently of the runtime-hook manifest');
assert.ok(manifestIndex>validatorIndex,'validator manifest must finalize after the base registry');
assert.ok(manifestIndex<uiIndex,'validator registry must finalize before the base UI');
assert.equal(labelsIndex,uiIndex+1,'Presentation labels owner must load immediately after the base UI');
const expectedUiSources=[
  'src/ui/core.js',
  'src/ui/labels.js',
  'src/ui/spatial/observability.js',
  'src/ui/spatial/environment.js',
  'src/ui/inspectors/intent.js',
  'src/ui/inspectors/memory.js',
  'src/ui/inspectors/appraisal.js',
  'src/ui/inspectors/affect.js',
  'src/ui/inspectors/social-response.js',
  'src/ui/inspectors/memory-retention.js',
  'src/ui/inspectors/memory-deliberation.js',
  'src/ui/inspectors/social-outcomes.js',
  'src/ui/observability-controls.js',
  'src/ui/resident-view.js',
  'src/ui/inspectors/relationship.js',
  'src/ui/inspectors/physical.js',
  'src/ui/inspectors/locomotion.js',
  'src/ui/entity-readable.js'
];
assert.deepEqual(scripts.filter(path=>path.startsWith('src/ui/')),expectedUiSources,'production UI must use only semantic current source paths in stable order');
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
assert.ok(hookManifestIndex<uiIndex,'simulation runtime-hook manifest must finalize before any UI definitions load');
const observerExtensions=scripts.filter(path=>
  path!=='src/runtime-hook-pipeline.js'&&readRepoFile(path).includes('registerRuntimeObserver(')
);
assert.deepEqual(observerExtensions,[
  'src/ui/observability-controls.js',
  'src/ui/resident-view.js',
  'src/ui/inspectors/relationship.js'
],'only the three current Presentation refresh/reset owners may register runtime observers in Cleanup-5B-1');
for(const path of observerExtensions){
  assert.ok(indexOf(path)>hookManifestIndex,path+' must not participate in simulation hook completeness');
  assert.ok(indexOf(path)>uiIndex&&indexOf(path)<bootstrapIndex,path+' must register in the Presentation composition boundary');
}

const engineDependentSubsystemSchemas=[
  'src/systems/action/state.js',
  'src/systems/intent/state.js',
  'src/systems/social/state.js',
  'src/systems/memory/state.js',
  'src/systems/appraisal/state.js',
  'src/systems/affect/state.js',
  'src/systems/relationship/state.js'
];
const engineDependentSubsystemRuntimes=[
  'src/systems/action/runtime.js',
  'src/systems/intent/runtime.js',
  'src/systems/social/bid.js',
  'src/systems/intent/replanning.js',
  'src/systems/intent/deliberation.js',
  'src/systems/memory/runtime.js',
  'src/systems/appraisal/runtime.js',
  'src/systems/appraisal/animal-social-response.js',
  'src/systems/appraisal/human-social-response.js',
  'src/systems/relationship/runtime.js',
  'src/systems/affect/runtime.js',
  'src/systems/social/animal-response.js',
  'src/systems/memory/retention.js',
  'src/systems/social/human-response.js',
  'src/systems/memory/deliberation.js',
  'src/systems/memory/social-outcome.js'
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
assert.deepEqual(auditedModuleEvaluationStateTouches,[],'Cleanup-4C-4 must leave no Engine-dependent module-evaluation state normalization touch');

const validationRulesDir=new URL('../src/validation/rules/',import.meta.url);
const validatorRules=fs.readdirSync(validationRulesDir)
  .filter(name=>name.endsWith('.js'))
  .map(name=>'src/validation/rules/'+name)
  .sort();
assert.equal(validatorRules.length,18,'architecture guard must discover every semantic validator rule');
for(const path of validatorRules){
  assert.ok(indexOf(path)>validatorIndex,path+' must load after validation/registry.js');
  assert.ok(indexOf(path)<manifestIndex,path+' must load before validation/manifest.js');
}

loadProductionBefore('src/ui/core.js');

const FD=globalThis.SimFurnitureDefinitions;
const A=globalThis.SimWorldAuthoring;
const EC=globalThis.SimEmbodimentCapabilities;
const R=globalThis.SimRelease;
const W=globalThis.SimWorld;
const SP=globalThis.SimSpatial;
const P=globalThis.SimPhysical;
const L=globalThis.SimLocomotion;
const C=globalThis.SimCrowding;
const V=globalThis.SimValidator;
const E=globalThis.SimEngine;

assert.equal(FD.VERSION,'furniture-definitions-v5');
assert.equal(A.VERSION,'world-authoring-v6');
assert.equal(A.FURNITURE_CATALOG_VERSION,FD.VERSION);
assert.equal(EC.VERSION,'embodiment-capabilities-v1');
assert.deepEqual(EC.freePosturesForKind('cat'),['standing','lying']);
assert.equal(A.LEGACY_VERSION,undefined,'current-only authoring must not expose a legacy schema marker');
assert.equal(A.migrateAuthoring,undefined,'current-only authoring must not expose production migration machinery');
assert.equal(R.VERSION,CURRENT_VERSION);
assert.equal(W.VERSION,CURRENT_VERSION);
assert.equal(W.PRESENTATION_SCHEMA_VERSION,undefined,'Presentation marker must no longer live on SimWorld');
assert.equal(SP.SPATIAL_IDENTITY_VERSION,SPATIAL_IDENTITY_VERSION,'Spatial Identity subsystem generation must not follow an unrelated product patch');
assert.equal(W.PHYSICAL_SCHEMA_VERSION,'11.17.0-passage-profile-multimode');
assert.equal(P.VERSION,'11.17.0-passage-profile-multimode');
assert.equal(SP.PASSAGE_PROFILE_VERSION,'11.26.0-vertical-structure-passage');
assert.equal(SP.ROUTE_SEMANTICS_VERSION,'11.24.0-route-locomotion-cost');
assert.equal(W.LOCOMOTION_SCHEMA_VERSION,'11.24.0-locomotion-objective-burden');
assert.equal(L.VERSION,'11.24.0-locomotion-objective-burden');
assert.equal(C.VERSION,'11.26.0-vertical-flow-congestion');
assert.equal(W.RELATIONSHIP_SCHEMA_VERSION,'11.15.2-relationship-responder-bias');
assert.equal(W.isInitialStateRegistryFinalized(),true);
assert.equal(E.isRuntimeHookRegistryFinalized(),true,'simulation runtime-hook registry must finalize before production UI loads');
assert.deepEqual(E.currentRuntimeObserverManifest(),{afterTick:[],afterReset:[]},'headless production prefix must be complete without Presentation observers');
assert.equal(V.isValidationRegistryFinalized(),true);
assert.equal(E.getState(),null,'module loading before app bootstrap must not auto-reset the engine');

const labelsSource=readRepoFile('src/ui/labels.js');
assert.match(labelsSource,/const VERSION=R\.VERSION;/,'Presentation marker must derive from the canonical release owner');
assert.match(labelsSource,/PRESENTATION_VERSION:VERSION/,'Presentation marker must be owned by SimUI');
assert.match(labelsSource,/interactionLabel/,'interaction labels must be owned by the semantic UI labels module');
assert.equal(scripts.includes('src/presentation-schema-v1140.js'),false,'production must not load the retired no-op Presentation schema');
assert.equal(fs.existsSync(new URL('../src/presentation-schema-v1140.js',import.meta.url)),false,'retired Presentation schema source must not remain in the current tree');

const uiStartupFiles=[
  'src/ui/inspectors/social-response.js',
  'src/ui/spatial/observability.js',
  'src/ui/observability-controls.js',
  'src/ui/resident-view.js',
  'src/ui/inspectors/relationship.js',
  'src/ui/entity-readable.js'
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
const retiredAppraisalAffectRelationshipAssets=[
  'src/appraisal-schema-v1131.js',
  'src/appraisal-runtime-v1131.js',
  'src/appraisal-social-response-v1132a.js',
  'src/appraisal-human-social-response-v1133a.js',
  'src/affect-schema-v1132.js',
  'src/affect-runtime-v1132.js',
  'src/relationship-schema-v1150.js',
  'src/relationship-runtime-v1150.js'
];
assert.deepEqual(scripts.filter(path=>retiredAppraisalAffectRelationshipAssets.includes(path)),[],'production must not load retired Appraisal / Affect / Relationship sources');
for(const path of retiredAppraisalAffectRelationshipAssets){
  assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),false,path+' must not remain as a second current implementation');
}
const retiredMemoryAssets=[
  'src/memory-schema-v1130.js',
  'src/memory-retention-schema-v1133.js',
  'src/memory-deliberation-schema-v1134.js',
  'src/social-outcome-memory-schema-v1135.js',
  'src/memory-runtime-v1130.js',
  'src/memory-retention-runtime-v1133.js',
  'src/memory-deliberation-runtime-v1134.js',
  'src/social-outcome-memory-runtime-v1135.js'
];
assert.deepEqual(scripts.filter(path=>retiredMemoryAssets.includes(path)),[],'production must not load retired Memory sources');
for(const path of retiredMemoryAssets){
  assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),false,path+' must not remain as a second current implementation');
}
const retiredValidationAssets=[
  'src/state-validator.js',
  'src/state-validator-manifest.js',
  'src/state-validator-v1160.js',
  'src/state-validator-v1190.js',
  'src/state-validator-v111.js',
  'src/state-validator-v1114.js',
  'src/state-validator-v1120.js',
  'src/state-validator-v1121.js',
  'src/state-validator-v1122.js',
  'src/state-validator-v1123.js',
  'src/state-validator-v1124.js',
  'src/state-validator-v1130.js',
  'src/state-validator-v1131.js',
  'src/state-validator-v1132.js',
  'src/state-validator-v1132a.js',
  'src/state-validator-v1133.js',
  'src/state-validator-v1133a.js',
  'src/state-validator-v1134.js',
  'src/state-validator-v1135.js',
  'src/state-validator-v1150.js'
];
assert.deepEqual(scripts.filter(path=>retiredValidationAssets.includes(path)),[],'production must not load retired Validation source paths');
for(const path of retiredValidationAssets){
  assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),false,path+' must not remain as a second current implementation');
}
const retiredUiAssets=[
  'src/ui.js',
  'src/ui-spatial-observability.js',
  'src/ui-spatial-environment.js',
  'src/ui-intent-v1121.js',
  'src/ui-memory-v1130.js',
  'src/ui-appraisal-v1131.js',
  'src/ui-affect-v1132.js',
  'src/ui-social-response-v1132a.js',
  'src/ui-memory-retention-v1133.js',
  'src/ui-memory-deliberation-v1134.js',
  'src/ui-social-outcome-memory-v1135.js',
  'src/ui-observability-controls-v1133a.js',
  'src/ui-resident-view-v1140.js',
  'src/ui-relationship-v1150.js',
  'src/ui-physical-v1160.js',
  'src/ui-locomotion-v1190.js',
  'src/ui-entity-readable-v1141.js'
];
assert.deepEqual(scripts.filter(path=>retiredUiAssets.includes(path)),[],'production must not load retired UI source paths');
for(const path of retiredUiAssets){
  assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),false,path+' must not remain as a second current UI implementation');
}
const indexHtml=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const path of ['styles/observability-v1133a.css','styles/resident-view-v1140.css']){
  assert.equal(indexHtml.includes(path),false,'production must not load retired CSS path '+path);
  assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),false,path+' must not remain as a second current stylesheet');
}
for(const path of ['styles/observability.css','styles/resident-view.css']){
  assert.equal(indexHtml.includes(path),true,'production must load semantic current stylesheet '+path);
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
