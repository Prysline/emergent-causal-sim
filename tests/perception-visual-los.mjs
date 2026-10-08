import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';
import {readRepoFile} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadInitialStateProfile(['world-authoring.js','world-initializer.js','world.js','systems/perception/visual-orientation.js','systems/perception/visual-range.js','systems/perception/visual-los.js','spatial.js']);

const A=globalThis.SimWorldAuthoring,P=globalThis.SimPerception;
const clone=value=>JSON.parse(JSON.stringify(value));

assert.equal(P.VISUAL_ORIENTATION_VERSION,'perception-visual-orientation-v1');
assert.equal(P.VISUAL_RANGE_VERSION,'perception-visual-range-v1');
assert.equal(P.VISUAL_LOS_VERSION,'perception-visual-los-v1');

const authored=clone(A.DEFAULT_WORLD_AUTHORING);
const projection=P.projectStaticVisualOpacity(authored,0);
assert.ok(Object.isFrozen(projection));
assert.ok(projection.length>0);
assert.ok(projection.every(entry=>entry.opacity==='opaque'&&entry.sourceType==='world-boundary'));
assert.ok(projection.some(entry=>entry.id==='boundary:0:v:1,3'),'explicit authored wall must project to static opaque geometry');
assert.equal(projection.some(entry=>entry.id==='boundary:0:v:1,6'),false,'authored opening must not become opaque merely because it is a boundary');

const closedDoorAuthoring=clone(A.DEFAULT_WORLD_AUTHORING);
closedDoorAuthoring.doors.frontDoor.state='closed';
assert.equal(P.projectStaticVisualOpacity(closedDoorAuthoring,0).some(entry=>entry.id==='boundary:0:v:1,6'),false,'closed movement passage must not silently become visual opacity without explicit door visual geometry');

const wallResult=P.classifyStaticVisualLos({x:1,y:3},{x:0,y:3},projection);
assert.deepEqual(wallResult,{
  losAvailable:false,
  blockedBy:{id:'boundary:0:v:1,3',sourceType:'world-boundary',source:{z:0,boundaryId:'v:1,3'}},
  unavailableReason:'opaque-static-geometry'
});
assert.ok(Object.isFrozen(wallResult));
assert.ok(Object.isFrozen(wallResult.blockedBy));

const clearResult=P.classifyStaticVisualLos({x:2,y:4},{x:4,y:4},projection);
assert.deepEqual(clearResult,{losAvailable:true,blockedBy:null,unavailableReason:null});
assert.deepEqual(P.classifyStaticVisualLos({x:2,y:4},{x:4,y:4},projection),clearResult,'static LOS must be deterministic for identical inputs');

const rangeBefore=P.classifyVisualRange({x:1,y:3},{x:0,y:3});
assert.equal(rangeBefore.rangeAvailable,true,'LOS blockage must not overwrite independent range authority');
assert.equal(P.classifyStaticVisualLos({x:1,y:3},{x:0,y:3},projection).losAvailable,false);

const passableWallAuthoring=clone(A.DEFAULT_WORLD_AUTHORING);
passableWallAuthoring.map.layers[0].boundaries['v:1,3'].passable=true;
assert.ok(P.projectStaticVisualOpacity(passableWallAuthoring,0).some(entry=>entry.id==='boundary:0:v:1,3'),'explicit wall semantics, not movement passability, own this P1 opacity projection');

const secondLayer=clone(A.DEFAULT_WORLD_AUTHORING);
secondLayer.map.layers.push({z:1,cells:{},boundaries:{'v:2,2':{kind:'wall',material:'stone'}}});
assert.equal(P.projectStaticVisualOpacity(secondLayer,0).some(entry=>entry.source.z===1),false,'single-layer projection must not let another z layer occlude this LOS query');
assert.deepEqual(P.projectStaticVisualOpacity(secondLayer,1).map(entry=>entry.id),['boundary:1:v:2,2']);

const malformed=clone(A.DEFAULT_WORLD_AUTHORING);
malformed.map.layers[0].boundaries.bad={kind:'wall',material:'stone'};
assert.throws(()=>P.projectStaticVisualOpacity(malformed,0),/Invalid authored wall boundary geometry/,'missing wall geometry must fail explicitly');
assert.throws(()=>P.projectStaticVisualOpacity({},0),/authored map layers/);
assert.throws(()=>P.projectStaticVisualOpacity(authored),/explicit integer layer z/);
assert.throws(()=>P.projectStaticVisualOpacity(authored,7),/cannot find authored layer 7/);
assert.throws(()=>P.classifyStaticVisualLos({x:1,y:1},{x:2,y:2},null),/explicit visual opacity projection/);
assert.throws(()=>P.classifyStaticVisualLos({x:1,y:1},{x:1,y:1},projection),/distinct observer and target/);
assert.throws(()=>P.classifyStaticVisualLos({x:Infinity,y:1},{x:2,y:2},projection),/finite x\/y coordinates/);
assert.throws(()=>P.classifyStaticVisualLos({x:1,y:1},{x:2,y:2},[{id:'bad',opacity:'opaque',geometry:{kind:'vertical-segment',axis:'x',coordinate:NaN,spanStart:0,spanEnd:1}}]),/Invalid visual opacity geometry/);

const source=readRepoFile('src/systems/perception/visual-los.js');
assert.doesNotMatch(source,/SimSpatial|SimPhysical|planRoute|traversalCost|staticBlocked|geometryBlocked|boundaryPassable/,'LOS must not consume movement / route / Physical authority as visual opacity');
assert.doesNotMatch(source,/spatial\.solids|blocksMovement/,'Furniture solidity must not be silently promoted to visual opacity');
assert.doesNotMatch(source,/PoseEnvelope|eyePosition|visibilityCache/,'binary P1 must preserve future physical sight-sample and cache seams');
assert.doesNotMatch(source,/targetId|observerId|observation|memory/i,'LOS evidence must not claim target identity, observation, or memory truth');

console.log('perception visual LOS: ok');
