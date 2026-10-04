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
  'src/furniture-definitions.js',
  'src/horizontal-geometry.js',
  'src/world-authoring.js',
  'src/embodiment-capabilities.js',
  'src/world-initializer.js'
]);
assert.deepEqual(spatialCoreProfilePaths(),[
  'src/furniture-definitions.js',
  'src/horizontal-geometry.js',
  'src/world-authoring.js',
  'src/embodiment-capabilities.js',
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
assert.ok(engineCore.includes('src/systems/resources.js'),'Engine runtime profiles must include the canonical Resources owner');
assert.ok(engineCore.includes('src/systems/agent-carry.js'),'Engine runtime profiles must include the canonical Agent Carry owner');
assert.ok(engineCore.includes('src/systems/physical.js'),'Engine runtime profiles must include the canonical Physical owner for carried hand feasibility');
assert.ok(engineCore.indexOf('src/systems/resources.js')<engineCore.indexOf('src/systems/agent-carry.js'),'Resources must load before Agent Carry in Engine runtime profiles');
assert.ok(engineCore.indexOf('src/systems/agent-carry.js')<engineCore.indexOf('src/systems/physical.js'),'Agent Carry must load before Physical consumes its handling profile');
assert.ok(engineCore.indexOf('src/systems/physical.js')<engineCore.indexOf('src/spatial/finalize.js'),'Physical initial-state registration must happen before the Spatial finalizer');
assert.ok(engineCore.indexOf('src/spatial/finalize.js')<engineCore.indexOf('src/engine.js'),'runtime profile must finalize initial state before Engine captures factories');

const traversalOnlyInitialState=initialStateProfilePaths([
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js'
]);
assert.equal(traversalOnlyInitialState.includes('src/spatial-agent-carry.js'),false,'traversal-only profiles must not implicitly install Agent carry projection without the Agent Carry owner');
assert.equal(traversalOnlyInitialState.at(-1),'src/spatial/finalize.js','initial-state profile must finish with the Spatial finalizer when Engine is absent');

const agentCarryTraversalInitialState=initialStateProfilePaths([
  'world-authoring.js','world-initializer.js','world.js','spatial.js','systems/agent-carry.js','spatial-traversal.js'
]);
assert.ok(agentCarryTraversalInitialState.includes('src/systems/resources.js'),'Agent Carry profiles must include the canonical Resources owner');
assert.ok(agentCarryTraversalInitialState.includes('src/spatial-agent-carry.js'),'Agent Carry traversal profiles must install Agent carry position projection');
assert.ok(agentCarryTraversalInitialState.indexOf('src/systems/agent-carry.js')<agentCarryTraversalInitialState.indexOf('src/spatial-agent-carry.js'),'Agent Carry owner must load before its Spatial projection');
assert.throws(
  ()=>runtimeProfilePaths(['world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-v111.js','engine.js']),
  /retired sources/,
  'runtime profiles must reject retired source names rather than silently alias them'
);
assert.deepEqual(TEST_PROFILE_CONTRACT.engineCore,[
  'furniture-definitions.js','horizontal-geometry.js','world-authoring.js','embodiment-capabilities.js','world-initializer.js','world.js','release.js','spatial.js',
  'systems/resources.js','systems/agent-carry.js','systems/physical.js','spatial/finalize.js','engine.js','validation/registry.js'
]);

const workflow=fs.readFileSync(new URL('../.github/workflows/node-regression.yml',import.meta.url),'utf8');
const stateTests=[...workflow.matchAll(/node (tests\/[A-Za-z0-9._/-]+\.mjs)/g)].map(match=>match[1]);
assert.ok(stateTests.length>0,'Node regression workflow must enumerate current Node regression tests');

const releaseSource=fs.readFileSync(new URL('../src/release.js',import.meta.url),'utf8');
const currentOverallMatch=releaseSource.match(/const VERSION='([^']+)'/);
assert.ok(currentOverallMatch,'release.js must expose the canonical overall VERSION marker');
const currentOverallVersion=currentOverallMatch[1];

const physicalSource=fs.readFileSync(new URL('../src/systems/physical.js',import.meta.url),'utf8');
const currentPhysicalMatch=physicalSource.match(/const VERSION='([^']+)'/);
assert.ok(currentPhysicalMatch,'systems/physical.js must expose the canonical Physical VERSION marker');
const currentPhysicalVersion=currentPhysicalMatch[1];

const embodimentSource=fs.readFileSync(new URL('../src/embodiment-capabilities.js',import.meta.url),'utf8');
const currentEmbodimentMatch=embodimentSource.match(/const VERSION='([^']+)'/);
assert.ok(currentEmbodimentMatch,'embodiment-capabilities.js must expose the canonical capability VERSION marker');
const currentEmbodimentVersion=currentEmbodimentMatch[1];

const staleOverallAssertions=[];
const stalePhysicalAssertions=[];
for(const relativePath of stateTests){
  if(relativePath==='tests/test-profile-composition.mjs')continue;
  const source=fs.readFileSync(new URL('../'+relativePath,import.meta.url),'utf8');
  const constants=new Map(
    [...source.matchAll(/\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*['"]([^'"]+)['"]/g)]
      .map(match=>[match[1],match[2]])
  );
  for(const match of source.matchAll(/assert\.(?:equal|strictEqual)\((st\.version|E\.VERSION|E\.getState\(\)\.version),\s*([^,\n\)]+)/g)){
    const token=match[2].trim();
    const literal=token.match(/^['"]([^'"]+)['"]$/);
    const expectedVersion=literal?literal[1]:constants.get(token);
    if(expectedVersion&&expectedVersion!==currentOverallVersion){
      staleOverallAssertions.push(relativePath+': '+match[1]+' expects '+expectedVersion+' via '+token+' but release.js is '+currentOverallVersion);
    }
  }
  for(const match of source.matchAll(/assert\.(?:equal|strictEqual)\((W\.PHYSICAL_SCHEMA_VERSION|W\.PHYSICAL_RUNTIME_VERSION),\s*([^,\n\)]+)/g)){
    const token=match[2].trim();
    const literal=token.match(/^['"]([^'"]+)['"]$/);
    const expectedVersion=literal?literal[1]:constants.get(token);
    if(expectedVersion&&expectedVersion!==currentPhysicalVersion){
      stalePhysicalAssertions.push(relativePath+': '+match[1]+' expects '+expectedVersion+' via '+token+' but systems/physical.js is '+currentPhysicalVersion);
    }
  }
}
assert.deepEqual(staleOverallAssertions,[],'Current overall release assertions must be audited together with every release marker bump:\n'+staleOverallAssertions.join('\n'));
assert.deepEqual(stalePhysicalAssertions,[],'Current Physical assertions must be audited together with every Physical generation bump:\n'+stalePhysicalAssertions.join('\n'));

const currentDocPaths=['README.md','docs/architecture.md','docs/versioning.md'];
const staleCurrentDocs=[];
for(const relativePath of currentDocPaths){
  const source=fs.readFileSync(new URL('../'+relativePath,import.meta.url),'utf8');
  if(!source.includes(currentOverallVersion))staleCurrentDocs.push(relativePath+': missing current overall marker '+currentOverallVersion);
}
const versioningSource=fs.readFileSync(new URL('../docs/versioning.md',import.meta.url),'utf8');
if(!versioningSource.includes('Physical `'+currentPhysicalVersion+'`'))staleCurrentDocs.push('docs/versioning.md: missing current Physical marker '+currentPhysicalVersion);
if(!versioningSource.includes('Embodiment Capabilities 為 `'+currentEmbodimentVersion+'`'))staleCurrentDocs.push('docs/versioning.md: missing current Embodiment marker '+currentEmbodimentVersion);
assert.deepEqual(staleCurrentDocs,[],'Current docs must be synchronized before the long regression suite runs:\n'+staleCurrentDocs.join('\n'));

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
  const profileComposed=/loadAuthoringProfile|loadSpatialCoreProfile|loadRuntimeProfile|loadInitialStateProfile/.test(source);
  const handLoadsAuthoring=/['"](?:src\/)?world-authoring\.js['"]/.test(source);
  const handLoadsInitializer=/['"](?:src\/)?world-initializer\.js['"]/.test(source);
  if(handLoadsAuthoring&&!productionDerived&&!profileComposed){
    assert.ok(
      /['"](?:src\/)?horizontal-geometry\.js['"]/.test(source),
      relativePath+' must load horizontal-geometry.js before a direct world-authoring.js stack'
    );
  }
  if(handLoadsInitializer&&!productionDerived&&!profileComposed){
    assert.ok(
      /['"](?:src\/)?embodiment-capabilities\.js['"]/.test(source),
      relativePath+' must load embodiment-capabilities.js before a direct world-initializer.js stack'
    );
  }
  if(handLoadsEngine&&!productionDerived){
    assert.ok(source.includes('loadRuntimeProfile'),relativePath+' must compose handwritten Engine stacks through loadRuntimeProfile()');
  }
  const handFinalizesValidation=/['"](?:src\/)?validation\/manifest\.js['"]/.test(source);
  if(handFinalizesValidation&&!productionDerived){
    assert.ok(
      /['"](?:src\/)?systems\/usage\/runtime\.js['"]/.test(source),
      relativePath+' must load systems/usage/runtime.js before finalizing the current validation manifest'
    );
    assert.ok(
      /['"](?:src\/)?validation\/rules\/usage-preference\.js['"]/.test(source),
      relativePath+' must load validation/rules/usage-preference.js before finalizing the current validation manifest'
    );
  }
  if(/\bW\.createInitialState(?:FromAuthoring)?\s*\(/.test(source)&&!productionDerived){
    assert.ok(
      source.includes('loadInitialStateProfile')||source.includes('loadRuntimeProfile'),
      relativePath+' must declare an initial-state/runtime profile when it calls the canonical World factory'
    );
  }
}

console.log('Test composition profile regression: ok');