import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';
import {readRepoFile} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadInitialStateProfile(['world-authoring.js','world-initializer.js','world.js','systems/perception/visual-orientation.js','systems/perception/visual-range.js','spatial.js']);

const A=globalThis.SimWorldAuthoring,W=globalThis.SimWorld,P=globalThis.SimPerception;
const near=(actual,expected,epsilon=1e-12)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected}`);

assert.equal(P.VISUAL_ORIENTATION_VERSION,'perception-visual-orientation-v1');
assert.equal(P.VISUAL_RANGE_VERSION,'perception-visual-range-v1');
assert.equal(P.VISUAL_CELL_SIZE_METERS,A.CELL_SIZE_METERS,'Visual range must consume the canonical World Authoring cell scale');
assert.equal(P.VISUAL_CELL_SIZE_METERS,1,'current authoring scale is one meter per map cell');
assert.equal(P.VISUAL_MAXIMUM_HORIZON_METERS,11);

near(P.visualDistanceMeters({x:0,y:0},{x:3,y:4}),5);
near(P.visualDistanceAttenuation(0),1);
near(P.visualDistanceAttenuation(11),Math.exp(-1));
assert.ok(P.visualDistanceAttenuation(2)>P.visualDistanceAttenuation(6));
assert.ok(P.visualDistanceAttenuation(6)>P.visualDistanceAttenuation(10),'distance attenuation must be deterministic and monotonic');

const currentInteriorSpan=P.classifyVisualRange({x:1,y:1},{x:10,y:6});
near(currentInteriorSpan.distanceMeters,Math.hypot(9,5));
assert.equal(currentInteriorSpan.rangeAvailable,true,'11 m P1 horizon must cover the current 10 x 6 authored interior floor-center span');
assert.ok(currentInteriorSpan.distanceQuality>0);
assert.ok(Object.isFrozen(currentInteriorSpan));

const atHorizon=P.classifyVisualRange({x:0,y:0},{x:11,y:0});
assert.deepEqual(atHorizon,{
  distanceMeters:11,
  maximumHorizonMeters:11,
  distanceQuality:Math.exp(-1),
  rangeAvailable:true,
  unavailableReason:null
});
const beyondHorizon=P.classifyVisualRange({x:0,y:0},{x:12,y:0});
assert.deepEqual(beyondHorizon,{
  distanceMeters:12,
  maximumHorizonMeters:11,
  distanceQuality:0,
  rangeAvailable:false,
  unavailableReason:'beyond-maximum-horizon'
});

const st=W.createInitialState(49),observer=st.agents.zhen;
observer.facing='north';
const snapshot=P.captureVisualOrientationSnapshot(st,observer),origin={x:0,y:0};
assert.equal(P.classifyVisualBearing(snapshot,origin,{x:0,y:-5}).visualClass,'direct');
assert.equal(P.classifyVisualBearing(snapshot,origin,{x:5,y:0}).visualClass,'peripheral');
near(P.classifyVisualRange(origin,{x:0,y:-5}).distanceQuality,P.classifyVisualRange(origin,{x:5,y:0}).distanceQuality);
assert.equal(P.classifyVisualBearing(snapshot,origin,{x:0,y:-1000}).visualClass,'direct','bearing authority must remain independent from range authority');
assert.equal(P.classifyVisualRange(origin,{x:0,y:-1000}).rangeAvailable,false);

const source=readRepoFile('src/systems/perception/visual-range.js');
assert.doesNotMatch(source,/SimSpatial|pathDistance|planRoute|traversalCost/,'Visual distance must not consume route or traversal authority');
assert.doesNotMatch(source,/targetId|observerId/,'sensory range evidence must not claim target identity or observer knowledge');
assert.doesNotMatch(source,/PoseEnvelope|eyePosition|visibilityCache/,'Range-only Slice must preserve the future visual-origin / target-geometry seam without creating a second body-geometry truth');

assert.throws(()=>P.visualDistanceMeters({x:0,y:0},{x:Infinity,y:0}),/finite x\/y coordinates/);
assert.throws(()=>P.visualDistanceAttenuation(-1),/Invalid visual distance/);

console.log('perception visual range: ok');
