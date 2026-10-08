import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';
import {readRepoFile} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadInitialStateProfile([
  'furniture-definitions.js',
  'furniture-visual-properties.js',
  'world-authoring.js',
  'world-initializer.js',
  'world.js',
  'systems/resources.js',
  'systems/agent-carry.js',
  'systems/perception/visual-orientation.js',
  'systems/perception/visual-range.js',
  'systems/perception/visual-los.js',
  'spatial.js',
  'systems/physical.js',
  'systems/perception/visual-sight-samples.js',
  'systems/perception/visual-availability.js'
]);

const A=globalThis.SimWorldAuthoring,C=globalThis.SimEmbodimentCapabilities,P=globalThis.SimPerception;
const physical=()=>C.defaultPhysicalProfile('human');
const state={tick:42};
const observer={id:'observer',kind:'human',facing:'east',physical:physical(),position:{x:2,y:4,z:0},posture:{kind:'standing'}};
const target={id:'target',kind:'human',facing:'west',physical:physical(),position:{x:4,y:4,z:0},posture:{kind:'standing'}};
const authored=JSON.parse(JSON.stringify(A.DEFAULT_WORLD_AUTHORING));
const clearProjection=P.projectStaticVisualOpacity(authored,0);

assert.equal(P.VISUAL_ORIENTATION_VERSION,'perception-visual-orientation-v1');
assert.equal(P.VISUAL_RANGE_VERSION,'perception-visual-range-v1');
assert.equal(P.VISUAL_LOS_VERSION,'perception-visual-los-v2');
assert.equal(P.VISUAL_SIGHT_SAMPLES_VERSION,'perception-visual-sight-samples-v1');
assert.equal(P.VISUAL_AVAILABILITY_VERSION,'perception-visual-availability-v1');

const available=P.classifyVisualSensoryAvailability(state,observer,target,clearProjection);
assert.equal(available.visualAvailable,true);
assert.equal(available.unavailableReason,null);
assert.equal(available.orientation.visualClass,'direct');
assert.equal(available.range.rangeAvailable,true);
assert.equal(available.los.losAvailable,true);
assert.deepEqual(available.sightSamples.observer,P.derivePhysicalSightSamples(observer));
assert.deepEqual(available.sightSamples.target,P.derivePhysicalSightSamples(target));
assert.ok(Object.isFrozen(available));
assert.ok(Object.isFrozen(available.sightSamples));
assert.ok(Object.isFrozen(available.orientation));
assert.ok(Object.isFrozen(available.range));
assert.ok(Object.isFrozen(available.los));
assert.deepEqual(P.classifyVisualSensoryAvailability(state,observer,target,clearProjection),available,'identical canonical inputs must produce deterministic composition evidence');

const behind={...target,position:{x:0,y:4,z:0}};
const orientationUnavailable=P.classifyVisualSensoryAvailability(state,observer,behind,clearProjection);
assert.equal(orientationUnavailable.orientation.visualClass,'unavailable');
assert.equal(orientationUnavailable.range.rangeAvailable,true);
assert.equal(orientationUnavailable.los.losAvailable,true);
assert.equal(orientationUnavailable.visualAvailable,false,'clear range / LOS must not overwrite unavailable orientation');
assert.equal(orientationUnavailable.unavailableReason,'outside-visual-field');

const far={...target,position:{x:20,y:4,z:0}};
const beyondRange=P.classifyVisualSensoryAvailability(state,observer,far,clearProjection);
assert.equal(beyondRange.orientation.visualClass,'direct');
assert.equal(beyondRange.range.rangeAvailable,false);
assert.equal(beyondRange.los.losAvailable,true);
assert.equal(beyondRange.visualAvailable,false,'clear LOS must not overwrite beyond-range evidence');
assert.equal(beyondRange.unavailableReason,'beyond-maximum-horizon');

authored.furniture.cabinetProbe={id:'cabinetProbe',definitionId:'cabinet-tall',origin:{x:3,y:4,z:0},orientation:'south'};
const blockedProjection=P.projectStaticVisualOpacity(authored,0);
const blocked=P.classifyVisualSensoryAvailability(state,observer,target,blockedProjection);
assert.equal(blocked.orientation.visualClass,'direct');
assert.equal(blocked.range.rangeAvailable,true);
assert.equal(blocked.los.losAvailable,false);
assert.equal(blocked.visualAvailable,false,'valid orientation / range must not overwrite blocked LOS');
assert.equal(blocked.unavailableReason,'opaque-static-geometry');
assert.deepEqual(blocked.los.blockedBy,{
  id:'furniture:cabinetProbe:body',
  sourceType:'furniture-solid',
  source:{furnitureId:'cabinetProbe',definitionId:'cabinet-tall',solidKey:'body'}
},'composition must preserve canonical blocker source refs');

assert.throws(()=>P.classifyVisualSensoryAvailability(null,observer,target,clearProjection),/state tick/);
assert.throws(()=>P.classifyVisualSensoryAvailability(state,{...observer,id:null},target,clearProjection),/observer Agent id/);
assert.throws(()=>P.classifyVisualSensoryAvailability(state,observer,target,null),/explicit visual opacity projection/);
assert.throws(()=>P.classifyVisualSensoryAvailability(state,observer,{...target,position:{x:4,y:4,z:1}},clearProjection),/does not support cross-layer sight/);

const originalDerive=P.derivePhysicalSightSamples;
let deriveCount=0;
P.derivePhysicalSightSamples=agent=>{deriveCount++;return originalDerive(agent);};
P.classifyVisualSensoryAvailability(state,observer,target,clearProjection);
P.derivePhysicalSightSamples=originalDerive;
assert.equal(deriveCount,2,'composition must reuse the canonical sight-sample helper for observer and target geometry');

const source=readRepoFile('src/systems/perception/visual-availability.js');
assert.doesNotMatch(source,/visibilityCache|observer\s*[×x]\s*target|global scan|getState\(|\.agents\b/i,'Visual availability must remain query-time and must not create persistent/global visibility state');
assert.doesNotMatch(source,/door|solidity|passability|movement/i,'Visual availability must not reinterpret movement or Door state as visual opacity');
assert.doesNotMatch(source,/observation|attention|memory|appraisal|relationship/i,'Visual availability must not jump into Agent-private cognition layers');

console.log('perception visual availability: ok');
