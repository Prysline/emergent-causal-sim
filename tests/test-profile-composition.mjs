import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  authoringProfilePaths,
  spatialCoreProfilePaths,
  runtimeProfilePaths,
  initialStateProfilePaths,
  TEST_PROFILE_CONTRACT
} from './helpers/test-profiles.mjs';

assert.deepEqual(authoringProfilePaths(),[
  'src/world-authoring.js',
  'src/world-initializer.js'
]);
assert.deepEqual(spatialCoreProfilePaths(),[
  'src/world-authoring.js',
  'src/world-initializer.js',
  'src/world.js',
  'src/release.js',
  'src/spatial.js'
]);

const engineCore=runtimeProfilePaths([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js',
  'engine.js','validation/registry.js'
]);
assert.equal(engineCore.includes('src/spatial-traversal.js'),false,'engine-core profile must not implicitly load traversal');
assert.ok(engineCore.indexOf('src/spatial/finalize.js')<engineCore.indexOf('src/engine.js'),'runtime profile must finalize initial state before Engine captures factories');

const initialState=initialStateProfilePaths([
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js'
]);
assert.equal(initialState.at(-1),'src/spatial/finalize.js','initial-state profile must finish with the Spatial finalizer when Engine is absent');
assert.throws(
  ()=>runtimeProfilePaths(['world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-v111.js','engine.js']),
  /retired sources/,
  'runtime profiles must reject retired source names rather than silently alias them'
);
assert.deepEqual(TEST_PROFILE_CONTRACT.engineCore,[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js',
  'spatial/finalize.js','engine.js','validation/registry.js'
]);

const workflow=fs.readFileSync(new URL('../.github/workflows/node-regression.yml',import.meta.url),'utf8');
const stateTests=[...workflow.matchAll(/node (tests\/[A-Za-z0-9._/-]+\.mjs)/g)].map(match=>match[1]);
assert.ok(stateTests.length>0,'Node regression workflow must enumerate current Node regression tests');

const retiredNames=Object.keys(TEST_PROFILE_CONTRACT.retiredSources);
for(const relativePath of stateTests){
  if(relativePath==='tests/test-profile-composition.mjs')continue;
  const source=fs.readFileSync(new URL('../'+relativePath,import.meta.url),'utf8');
  for(const retired of retiredNames){
    assert.equal(source.includes("'"+retired+"'")||source.includes('"'+retired+'"'),false,relativePath+' must not load retired source '+retired);
  }
  assert.doesNotMatch(source,/\bSP\.init\s*\(/,relativePath+' must not invoke the retired Spatial init lifecycle');
  const handLoadsEngine=/['"]engine\.js['"]/.test(source);
  const productionDerived=/productionScriptPaths|loadProductionBefore|loadProductionThrough/.test(source);
  if(handLoadsEngine&&!productionDerived){
    assert.ok(source.includes('loadRuntimeProfile'),relativePath+' must compose handwritten Engine stacks through loadRuntimeProfile()');
  }
  if(/\bW\.createInitialState(?:FromAuthoring)?\s*\(/.test(source)&&!productionDerived){
    assert.ok(
      source.includes('loadInitialStateProfile')||source.includes('loadRuntimeProfile'),
      relativePath+' must declare an initial-state/runtime profile when it calls the canonical World factory'
    );
  }
}

console.log('Test composition profile regression: ok');
