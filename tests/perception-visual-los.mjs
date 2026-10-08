import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';
import {readRepoFile} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadInitialStateProfile(['furniture-definitions.js','furniture-visual-properties.js','world-authoring.js','world-initializer.js','world.js','systems/perception/visual-orientation.js','systems/perception/visual-range.js','systems/perception/visual-los.js','spatial.js']);

const D=globalThis.SimFurnitureDefinitions,A=globalThis.SimWorldAuthoring,P=globalThis.SimPerception;
const clone=value=>JSON.parse(JSON.stringify(value));

assert.equal(D.VISUAL_OPACITY_VERSION,'furniture-visual-opacity-v1');
assert.equal(P.VISUAL_ORIENTATION_VERSION,'perception-visual-orientation-v1');
assert.equal(P.VISUAL_RANGE_VERSION,'perception-visual-range-v1');
assert.equal(P.VISUAL_LOS_VERSION,'perception-visual-los-v2');

const authored=clone(A.DEFAULT_WORLD_AUTHORING);
const projection=P.projectStaticVisualOpacity(authored,0);
assert.ok(Object.isFrozen(projection));
assert.ok(projection.length>0);
assert.ok(projection.some(entry=>entry.id==='boundary:0:v:1,3'),'explicit authored wall must project to static opaque geometry');
assert.equal(projection.some(entry=>entry.id==='boundary:0:v:1,6'),false,'authored opening must not become opaque merely because it is a boundary');
assert.equal(projection.some(entry=>entry.sourceType==='furniture-solid'),false,'existing solid Furniture without explicit visual opacity must remain non-occluding');

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

const cabinetAuthoring=clone(A.DEFAULT_WORLD_AUTHORING);
cabinetAuthoring.furniture.cabinetProbe={id:'cabinetProbe',definitionId:'cabinet-tall',origin:{x:3,y:4,z:0},orientation:'south'};
const cabinetProjection=P.projectStaticVisualOpacity(cabinetAuthoring,0);
const cabinetOccluder=cabinetProjection.find(entry=>entry.id==='furniture:cabinetProbe:body');
assert.deepEqual(cabinetOccluder?.source,{furnitureId:'cabinetProbe',definitionId:'cabinet-tall',solidKey:'body'});
assert.equal(cabinetOccluder?.sourceType,'furniture-solid');
assert.equal(cabinetOccluder?.opacity,'opaque');
assert.deepEqual(P.classifyStaticVisualLos({x:2,y:4},{x:4,y:4},cabinetProjection),{
  losAvailable:false,
  blockedBy:{id:'furniture:cabinetProbe:body',sourceType:'furniture-solid',source:{furnitureId:'cabinetProbe',definitionId:'cabinet-tall',solidKey:'body'}},
  unavailableReason:'opaque-static-geometry'
},'explicit opt-in Furniture visual opacity must block planar LOS');
assert.deepEqual(P.projectStaticVisualOpacity(cabinetAuthoring,0),cabinetProjection,'Furniture opacity projection must be deterministic');

const invalidDefinition=clone(D.getDefinition('cabinet-tall'));
invalidDefinition.spatial.solids[0].visualOpacity='translucent';
assert.throws(()=>D.resolveDefinitionInstance(invalidDefinition,{id:'badCabinet',definitionId:'cabinet-tall',origin:{x:2,y:2,z:0},orientation:'south'}),/unsupported visualOpacity translucent/,'unsupported authored visual metadata must fail explicitly');

const rangeBefore=P.classifyVisualRange({x:1,y:3},{x:0,y:3});
assert.equal(rangeBefore.rangeAvailable,true,'LOS blockage must not overwrite independent range authority');
assert.equal(P.classifyStaticVisualLos({x:1,y:3},{x:0,y:3},projection).losAvailable,false);

const passableWallAuthoring=clone(A.DEFAULT_WORLD_AUTHORING);
passableWallAuthoring.map.layers[0].boundaries['v:1,3'].passable=true;
assert.ok(P.projectStaticVisualOpacity(passableWallAuthoring,0).some(entry=>entry.id==='boundary:0:v:1,3'),'explicit wall semantics, not movement passability, own wall opacity');

const secondLayer=clone(A.DEFAULT_WORLD_AUTHORING);
secondLayer.map.layers.push({z:1,cells:{},boundaries:{'v:2,2':{kind:'wall',material:'stone'}}});
secondLayer.furniture.cabinetUpper={id:'cabinetUpper',definitionId:'cabinet-tall',origin:{x:3,y:3,z:1},orientation:'south'};
assert.equal(P.projectStaticVisualOpacity(secondLayer,0).some(entry=>entry.source?.z===1||entry.source?.furnitureId==='cabinetUpper'),false,'single-layer projection must not let another z layer occlude this LOS query');
assert.deepEqual(P.projectStaticVisualOpacity(secondLayer,1).map(entry=>entry.id),['boundary:1:v:2,2','furniture:cabinetUpper:body']);

const malformed=clone(A.DEFAULT_WORLD_AUTHORING);
malformed.map.layers[0].boundaries.bad={kind:'wall',material:'stone'};
assert.throws(()=>P.projectStaticVisualOpacity(malformed,0),/Invalid authored wall boundary geometry/,'missing wall geometry must fail explicitly');
assert.throws(()=>P.projectStaticVisualOpacity({},0),/authored map layers/);
assert.throws(()=>P.projectStaticVisualOpacity(authored),/explicit integer layer z/);
assert.throws(()=>P.projectStaticVisualOpacity(authored,7),/cannot find authored layer 7/);
assert.throws(()=>P.classifyStaticVisualLos({x:1,y:1},{x:2,y:2},null),/explicit visual opacity projection/);
assert.throws(()=>P.classifyStaticVisualLos({x:1,y:1},{x:1,y:1},projection),/distinct observer and target/);
assert.throws(()=>P.classifyStaticVisualLos({x:Infinity,y:1},{x:2,y:2},projection),/finite x\/y coordinates/);
assert.throws(()=>P.classifyStaticVisualLos({x:1,y:1},{x:2,y:2},[{id:'bad',opacity:'opaque',geometry:{kind:'axis-aligned-rect',minX:2,maxX:1,minY:0,maxY:1}}]),/Invalid visual opacity geometry/);

const source=readRepoFile('src/systems/perception/visual-los.js');
assert.doesNotMatch(source,/SimPhysical|planRoute|traversalCost|staticBlocked|geometryBlocked|boundaryPassable|blocksMovement/,'LOS must not consume movement / route / Physical authority as visual opacity');
assert.doesNotMatch(source,/door\.state|doorsForBoundary/,'closed-door movement state must not become opacity authority');
assert.doesNotMatch(source,/targetId|observerId|observation|memory/i,'LOS evidence must not claim target identity, observation, or memory truth');

console.log('perception visual LOS: ok');
