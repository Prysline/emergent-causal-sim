import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','engine.js','validation/registry.js','validation/rules/spatial-node.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

function openSquare(){
  E.reset(22900);
  const st=E.getState();
  for(const tile of Object.values(st.map.tiles||{})){tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];}
  for(const [x,y] of [[1,1],[2,1],[1,2],[2,2]]){const tile=st.map.tiles[x+','+y];tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];}
  st.furniture={};st.map.boundaries={};st.doors={};st.map.passageConstraints={};
  for(const c of Object.values(st.containers||{}))if(c.position)c.position={x:7,y:4};
  for(const source of Object.values(st.sources||{}))if(source.position)source.position={x:7,y:4};
  const human=st.agents.zhen;human.position=floor(st,1,1);human.posture={kind:'standing',slotId:null,furnitureId:null};
  return {st,human,a:floor(st,1,1),b:floor(st,2,2),east:floor(st,2,1)};
}

assert.equal(SP.PASSAGE_PROFILE_VERSION,'11.29.0-horizontal-connection-passage');
assert.equal(SP.VERSION,'11.29.0-traversal-maneuver');

{
  const {st,human,a,b,east}=openSquare();
  const passage=SP.getPassageProfile(st,a,b);
  assert.equal(passage.edgeKind,'horizontal');
  assert.equal(passage.horizontalKind,'diagonal');
  assert.equal(passage.status,'candidate');
  assert.ok(Math.abs(passage.distanceMeters-Math.SQRT2)<1e-9);
  assert.equal(passage.resource,'corner:world|floor|0|2,2');
  assert.equal(passage.horizontalConnection.kind,'diagonal');
  assert.equal(SP.traversalFeasibility(st,human,a,b).modes.walk.feasible,true);

  const maneuver=SP.traversalManeuver(st,a,b);
  assert.deepEqual(maneuver.directionVector,{x:1,y:1,z:0});
  assert.ok(Math.abs(maneuver.distanceMeters-Math.SQRT2)<1e-9);
  assert.equal(maneuver.primaryResource,passage.resource);
  assert.equal(maneuver.influenceNodes.length,4);

  const reverse=SP.traversalManeuver(st,b,a);
  assert.deepEqual(reverse.directionVector,{x:-1,y:-1,z:0});
  assert.equal(reverse.primaryResource,maneuver.primaryResource,'directed maneuvers must share the objective connection resource');

  const productionNeighbors=SP.traversalNeighbors(st,a,human.id);
  assert.ok(productionNeighbors.some(node=>SP.nodeSame(st,node,east)),'existing cardinal production traversal remains active');
  assert.equal(productionNeighbors.some(node=>SP.nodeSame(st,node,b)),false,'Slice 2 must not enable production diagonal routing');
}

{
  const {st,human,a,b}=openSquare();
  st.map.boundaries['0|v:2,1']={id:'v:2,1',kind:'wall'};
  const passage=SP.getPassageProfile(st,a,b);
  assert.equal(passage.status,'blocked');
  assert.equal(passage.options.length,0);
  const feasibility=SP.traversalFeasibility(st,human,a,b);
  assert.equal(feasibility.edgeValid,true);
  assert.equal(feasibility.edgeOpen,false);
  assert.equal(feasibility.modes.walk.feasible,false);
}

{
  const {st,human,a,b}=openSquare();
  st.furniture.cornerNib={id:'cornerNib',footprint:[{x:1,y:1}],slots:[],spatial:{solids:[{key:'cornerNib',layerZ:0,bounds:{x:1.9,y:1.9,z:0,width:.1,depth:.1,height:1}}]}};
  const passage=SP.getPassageProfile(st,a,b);
  assert.equal(passage.status,'unsupported');
  assert.equal(SP.traversalFeasibility(st,human,a,b).edgeOpen,false,'unsupported geometry must conservatively reject feasibility');
}

console.log('8-direction Slice 2 runtime Passage + TraversalManeuver contract: ok');
