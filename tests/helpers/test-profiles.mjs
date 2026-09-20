import {loadScriptsInThisContext} from './production-loader.mjs';

const RETIRED_SOURCES=Object.freeze({
  'spatial-v111.js':'spatial-traversal.js',
  'contact-v1112.js':'spatial-contact.js',
  'spatial-v1113.js':'spatial-floor-effects.js',
  'spatial-v1114.js':'spatial-surface-environment.js',
  'spatial-passage-v1170.js':'spatial-passage.js',
  'engine-spatial-v1114.js':'spatial-runtime-effects.js',
  'physical-schema-v1160.js':'systems/physical.js',
  'physical-runtime-v1160.js':'systems/physical.js',
  'locomotion-schema-v1190.js':'systems/locomotion.js',
  'locomotion-runtime-v1190.js':'systems/locomotion.js',
  'action-schema-v1120.js':'systems/action/state.js',
  'action-runtime-v1120.js':'systems/action/runtime.js',
  'intent-schema-v1121.js':'systems/intent/state.js',
  'intent-runtime-v1121.js':'systems/intent/runtime.js',
  'interruption-schema-v1123.js':'systems/intent/state.js',
  'intent-runtime-v1123.js':'systems/intent/replanning.js',
  'deliberation-schema-v1124.js':'systems/intent/state.js',
  'intent-runtime-v1124.js':'systems/intent/deliberation.js',
  'social-bid-schema-v1122.js':'systems/social/state.js',
  'social-bid-runtime-v1122.js':'systems/social/bid.js',
  'social-response-schema-v1132a.js':'systems/social/state.js',
  'social-response-runtime-v1132a.js':'systems/social/animal-response.js',
  'human-social-response-schema-v1133a.js':'systems/social/state.js',
  'human-social-response-runtime-v1133a.js':'systems/social/human-response.js'
});

const AUTHORING_PROFILE=Object.freeze([
  'world-authoring.js',
  'world-initializer.js'
]);

const SPATIAL_CORE_PROFILE=Object.freeze([
  ...AUTHORING_PROFILE,
  'world.js',
  'release.js',
  'spatial.js'
]);

const ENGINE_CORE_PROFILE=Object.freeze([
  ...SPATIAL_CORE_PROFILE,
  'spatial/finalize.js',
  'engine.js',
  'state-validator.js'
]);

function normalizePath(path){
  return path.startsWith('src/')?path:'src/'+path;
}

function assertCurrentSources(paths){
  const retired=paths.filter(path=>RETIRED_SOURCES[path]);
  if(retired.length){
    const replacements=retired.map(path=>path+' -> '+RETIRED_SOURCES[path]).join(', ');
    throw new Error('Test profile references retired sources: '+replacements);
  }
}

function unique(paths){
  const seen=new Set();
  return paths.filter(path=>!seen.has(path)&&seen.add(path));
}

export function authoringProfilePaths(extra=[]){
  const paths=unique([...AUTHORING_PROFILE,...extra]);
  assertCurrentSources(paths);
  return paths.map(normalizePath);
}

export function spatialCoreProfilePaths(extra=[]){
  const paths=unique([...SPATIAL_CORE_PROFILE,...extra]);
  assertCurrentSources(paths);
  return paths.map(normalizePath);
}

export function runtimeProfilePaths(paths){
  const current=unique([...paths]);
  assertCurrentSources(current);
  const engineIndex=current.indexOf('engine.js');
  if(engineIndex<0)throw new Error('Runtime test profile requires engine.js.');
  if(!current.includes('world.js'))throw new Error('Runtime test profile requires world.js.');
  if(!current.includes('spatial.js'))throw new Error('Runtime test profile requires spatial.js.');
  if(!current.includes('spatial/finalize.js'))current.splice(engineIndex,0,'spatial/finalize.js');
  const finalizerIndex=current.indexOf('spatial/finalize.js');
  const resolvedEngineIndex=current.indexOf('engine.js');
  if(finalizerIndex>resolvedEngineIndex)throw new Error('spatial/finalize.js must load before engine.js.');
  return current.map(normalizePath);
}

export function initialStateProfilePaths(paths){
  const current=unique([...paths]);
  assertCurrentSources(current);
  if(current.includes('engine.js'))throw new Error('Initial-state profile must not load engine.js.');
  if(!current.includes('world.js'))throw new Error('Initial-state profile requires world.js.');
  if(!current.includes('spatial.js'))throw new Error('Initial-state profile requires spatial.js.');
  if(!current.includes('spatial/finalize.js'))current.push('spatial/finalize.js');
  return current.map(normalizePath);
}

export function loadAuthoringProfile(extra=[]){
  const paths=authoringProfilePaths(extra);
  loadScriptsInThisContext(paths);
  return paths;
}

export function loadSpatialCoreProfile(extra=[]){
  const paths=spatialCoreProfilePaths(extra);
  loadScriptsInThisContext(paths);
  return paths;
}

export function loadRuntimeProfile(paths){
  const resolved=runtimeProfilePaths(paths);
  loadScriptsInThisContext(resolved);
  return resolved;
}

export function loadInitialStateProfile(paths){
  const resolved=initialStateProfilePaths(paths);
  loadScriptsInThisContext(resolved);
  return resolved;
}

export const TEST_PROFILE_CONTRACT=Object.freeze({
  authoring:Object.freeze([...AUTHORING_PROFILE]),
  spatialCore:Object.freeze([...SPATIAL_CORE_PROFILE]),
  engineCore:Object.freeze([...ENGINE_CORE_PROFILE]),
  retiredSources:RETIRED_SOURCES
});
