import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','engine.js'
]);

const D=globalThis.SimFurnitureDefinitions,E=globalThis.SimEngine,SP=globalThis.SimSpatial;
const local=(x,y,z=0)=>({x,y,z});
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

assert.equal(D.VERSION,'furniture-definitions-v7');

const invalidLegacyDefinition={
  id:'invalid-legacy',
  name:'舊式測試家具',
  icon:'?',
  kind:'test',
  blocksMovement:false,
  footprint:[{x:0,y:0,z:0}],
  displayOffset:{x:0,y:0,z:0},
  slots:[],
  spatial:{floor:{mode:'solid'}}
};
assert.throws(
  ()=>D.resolveDefinitionInstance(invalidLegacyDefinition,{id:'invalidLegacy',definitionId:'invalid-legacy',origin:{x:0,y:0,z:0},orientation:'north'}),
  /blocksMovement/,
  'legacy blocksMovement must be rejected rather than interpreted as traversal truth'
);
const invalidLegacyGeometry={
  id:'invalid-floor-mode',name:'舊 floor mode',icon:'?',kind:'test',
  footprint:[local(0,0)],displayOffset:local(0,0),slots:[],
  spatial:{solids:[{key:'body',bounds:{x:0,y:0,z:0,width:1,depth:1,height:1}}],floor:{mode:'solid'}}
};
assert.throws(
  ()=>D.resolveDefinitionInstance(invalidLegacyGeometry,{id:'invalidFloor',definitionId:'invalid-floor-mode',origin:local(0,0),orientation:'north'}),
  /spatial\.solids instead of spatial\.floor \/ spatial\.under/,
  'Furniture v6 must reject legacy Definition-authored floor/under geometry'
);

const platformDefinition={
  id:'test-low-platform',
  name:'測試矮平台',
  icon:'▱',
  kind:'platform',
  footprint:[local(0,0),local(1,0)],
  displayOffset:local(0,0),
  slots:[],
  spatial:{
    solids:[{key:'body',bounds:{x:0,y:0,z:0,width:2,depth:1,height:.25}}],
    surface:{
      key:'top',
      label:'測試平台頂面',
      onSolid:{key:'body',face:'top'},
      traversable:true,
      allowKinds:['cat'],
      moveCost:{cat:2.25},
      transitionCost:{cat:3.5}
    }
  }
};

const resolved=D.resolveDefinitionInstance(platformDefinition,{
  id:'testPlatform',
  definitionId:'test-low-platform',
  origin:local(3,4),
  orientation:'north'
});
assert.deepEqual(resolved.footprint,[local(3,4),local(4,4)]);
assert.equal(resolved.spatial.solids.length,1);
assert.deepEqual(resolved.spatial.solids[0],{key:'body',layerZ:0,bounds:{x:3,y:4,z:0,width:2,depth:1,height:.25}});
assert.equal(resolved.spatial.surface.id,'testPlatform:top');
assert.deepEqual(resolved.spatial.surface.cells,[local(3,4),local(4,4)]);
assert.equal(resolved.blocksMovement,undefined,'resolved traversal truth must come from spatial geometry, not blocksMovement');
assert.equal(D.analyzeFloorTile(resolved.spatial.solids,3,4,0).blocked,true,'floor-start solid must block generic floor topology, not only agent-specific envelope checks');
const invalidRuntimeSurface=JSON.parse(JSON.stringify(platformDefinition));
invalidRuntimeSurface.spatial.surface.id='precomputed:top';
assert.throws(
  ()=>D.resolveDefinitionInstance(invalidRuntimeSurface,{id:'invalidSurface',definitionId:'test-low-platform',origin:local(1,1),orientation:'north'}),
  /runtime id \/ cells/,
  'Definition must not persist instance-specific runtime surface identity'
);

E.reset(20260911);
const st=E.getState(),cat=st.agents.orange,human=st.agents.zhen;
st.furniture.testPlatform=resolved;
for(const cell of resolved.footprint){
  const tile=SP.tileByPos(st,cell);
  if(!tile.furnitureIds.includes(resolved.id))tile.furnitureIds.push(resolved.id);
}

const topA=SP.normalizeNode(st,{x:3,y:4},'testPlatform:top');
const topB=SP.normalizeNode(st,{x:4,y:4},'testPlatform:top');
assert.equal(SP.nodeWalkable(st,floor(st,3,4),cat),false,'solid footprint must block the floor node');
assert.equal(SP.nodeWalkable(st,topA,cat),true,'generic Definition surface must be traversable for allowed kinds');
assert.equal(SP.nodeWalkable(st,topA,human),false,'generic Definition surface must enforce allowKinds');
assert.equal(SP.traversalEdgeCost(st,floor(st,2,4),topA,cat,'walk','walk'),3.5,'surface transition cost must come from Definition surface override');
assert.equal(SP.traversalEdgeCost(st,topA,topB,cat,'walk','walk'),2.25,'surface move cost must come from Definition surface override');

cat.position={...floor(st,2,4)};
const path=SP.astar(st,cat.position,topA,cat.id);
assert.ok(path.length>=2,'generic non-dining-table surface must participate in route search');
assert.equal(path.at(-1).surfaceId,'testPlatform:top');

const traversalSource=fs.readFileSync(new URL('../src/spatial-traversal.js',import.meta.url),'utf8');
const authoringSource=fs.readFileSync(new URL('../src/world-authoring.js',import.meta.url),'utf8');
const definitionSource=fs.readFileSync(new URL('../src/furniture-definitions.js',import.meta.url),'utf8');
assert.doesNotMatch(traversalSource,/st\.furniture\?\.diningTable|diningTable:surface/,'Spatial traversal must not special-case the default dining table');
assert.doesNotMatch(authoringSource,/furniture\.blocksMovement/,'authoring topology must consume Definition-owned metric geometry');
assert.doesNotMatch(definitionSource,/blocksMovement:/,'Furniture Definitions must not persist blocksMovement as traversal truth');
assert.doesNotMatch(definitionSource,/floor:\{mode:/,'production Furniture Definitions must not author legacy floor modes');
assert.equal(D.getDefinition('dining-table').spatial.solids.find(solid=>solid.key==='tabletop').bounds.z,.72);
assert.deepEqual(D.getDefinition('double-bed').footprint,[local(0,0),local(1,0),local(0,1),local(1,1)]);

console.log('furniture traversal geometry regression: ok');
