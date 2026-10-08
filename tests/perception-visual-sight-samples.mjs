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
  'systems/perception/visual-sight-samples.js'
]);

const A=globalThis.SimWorldAuthoring,C=globalThis.SimEmbodimentCapabilities,P=globalThis.SimPerception;
const physical=C.defaultPhysicalProfile('human');
const observer={kind:'human',physical,position:{x:2,y:4,z:0},posture:{kind:'standing'}};
const target={kind:'human',physical:C.defaultPhysicalProfile('human'),position:{x:4,y:4,z:0},posture:{kind:'standing'}};

assert.equal(P.VISUAL_LOS_VERSION,'perception-visual-los-v2');
assert.equal(P.VISUAL_SIGHT_SAMPLES_VERSION,'perception-visual-sight-samples-v1');

const first=P.derivePhysicalSightSamples(observer);
assert.deepEqual(first,{
  layerZ:0,
  posture:'standing',
  poseEnvelope:{height:1.65,width:.45,length:.30},
  observerOrigin:{x:2,y:4},
  targetSamples:[{kind:'body-center',position:{x:2,y:4}}]
});
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.poseEnvelope));
assert.ok(Object.isFrozen(first.observerOrigin));
assert.ok(Object.isFrozen(first.targetSamples));
assert.deepEqual(P.derivePhysicalSightSamples(observer),first,'identical Physical state must derive identical sight samples');

const sitting={...observer,posture:{kind:'sitting'}};
const sittingSamples=P.derivePhysicalSightSamples(sitting);
assert.equal(sittingSamples.posture,'sitting');
assert.ok(sittingSamples.poseEnvelope.height<first.poseEnvelope.height,'posture-specific PoseEnvelope must remain visible in sight-sample evidence');
assert.deepEqual(sittingSamples.observerOrigin,first.observerOrigin,'P1 must not invent an eye-height or planar posture offset');

assert.throws(()=>P.derivePhysicalSightSamples({...observer,posture:{kind:'kneeling'}}),/do not support posture kneeling/,'unsupported PoseEnvelope must fail instead of silently falling back to standing');
assert.throws(()=>P.derivePhysicalSightSamples({...observer,physical:null}),/without a canonical PoseEnvelope/);
assert.throws(()=>P.derivePhysicalSightSamples({...observer,position:null}),/canonical Agent position/);
assert.throws(()=>P.derivePhysicalSightSamples({...observer,position:{x:2,y:4,z:.5}}),/integer z/);

const authored=JSON.parse(JSON.stringify(A.DEFAULT_WORLD_AUTHORING));
authored.furniture.cabinetProbe={id:'cabinetProbe',definitionId:'cabinet-tall',origin:{x:3,y:4,z:0},orientation:'south'};
const projection=P.projectStaticVisualOpacity(authored,0);
const targetSamples=P.derivePhysicalSightSamples(target);
const los=P.classifyStaticVisualLos(first.observerOrigin,targetSamples.targetSamples[0].position,projection);
assert.deepEqual(los,{
  losAvailable:false,
  blockedBy:{
    id:'furniture:cabinetProbe:body',
    sourceType:'furniture-solid',
    source:{furnitureId:'cabinetProbe',definitionId:'cabinet-tall',solidKey:'body'}
  },
  unavailableReason:'opaque-static-geometry'
},'LOS must consume derived representative points without owning sight-sample generation');

const source=readRepoFile('src/systems/perception/visual-sight-samples.js');
assert.doesNotMatch(source,/eyeHeight|visibilityCache|observation|memory|attention/i,'sight-sample P1 must not invent eye height, persistent visibility, or observation truth');
assert.doesNotMatch(source,/fallback|standing['"]?\s*:/i,'unsupported posture must not silently fall back to standing');

console.log('perception visual sight samples: ok');
