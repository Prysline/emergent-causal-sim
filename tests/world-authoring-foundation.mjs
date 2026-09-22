import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['furniture-definitions.js','world-authoring.js','embodiment-capabilities.js','world-initializer.js','world.js','release.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}

const D=globalThis.SimFurnitureDefinitions,A=globalThis.SimWorldAuthoring,I=globalThis.SimWorldInitializer,W=globalThis.SimWorld;
assert.equal(D.VERSION,'furniture-definitions-v4');
assert.equal(A.VERSION,'world-authoring-v6');
assert.equal(A.FURNITURE_CATALOG_VERSION,D.VERSION);
assert.equal(A.DEFAULT_WORLD_AUTHORING.authoringSchema,A.VERSION);
assert.equal(A.DEFAULT_WORLD_AUTHORING.furnitureCatalogVersion,D.VERSION);
assert.equal(Object.isFrozen(D.DEFINITIONS),true,'system Furniture Catalog must be immutable');
assert.equal(W.WIDTH,12);
assert.equal(W.HEIGHT,8);
assert.equal(W.FURNITURE_DEFS,undefined);
assert.equal(W.OBJECT_START,undefined);
assert.equal(W.AGENT_START,undefined);

const authored=A.DEFAULT_WORLD_AUTHORING;
const authoredBefore=JSON.stringify(authored);
assert.equal(Object.isFrozen(authored),true);
assert.equal(authored.map.layers.length,1);
assert.equal(authored.map.layers[0].z,0);
assert.equal(authored.map.cellSizeMeters,1);
assert.equal(Object.keys(authored.map.layers[0].boundaries).length,32);
assert.equal(authored.map.layers[0].boundaries['v:1,6'].kind,'opening');
assert.deepEqual(authored.structures,{},'default world may remain single-level without inventing a demonstration stair');

for(const cell of Object.values(authored.map.layers[0].cells)){
  for(const derived of ['walkable','roomId','furnitureIds'])assert.equal(Object.prototype.hasOwnProperty.call(cell,derived),false,'authoring cell must not persist '+derived);
}
for(const instance of Object.values(authored.furniture)){
  assert.deepEqual(Object.keys(instance).sort(),instance.name===undefined?['definitionId','id','orientation','origin']:['definitionId','id','name','orientation','origin']);
  for(const legacy of ['value','mealSeat','restQuality','sleepQuality','footprint','displayAt','slots','blocksMovement','supportsObjects','spatial','canExit','quality','condition']){
    assert.equal(Object.prototype.hasOwnProperty.call(instance,legacy),false,'v6 instance must not persist intrinsic field '+legacy);
  }
}

const chair=A.resolveFurnitureInstance(authored.furniture.chairNW);
assert.equal(chair.id,'chairNW');
assert.equal(chair.name,'餐椅 A');
assert.deepEqual(chair.footprint,[{x:4,y:2,z:0}]);
assert.equal(chair.slots[0].id,'chairNW:seat');
assert.equal(chair.slots[0].restQuality,.48);
assert.equal(chair.slots[0].mealSeat,undefined,'mealSeat must not survive into v6 Definition/runtime projection');
assert.equal(authored.furniture.frontDoor,undefined,'Door must no longer exist as a Furniture Instance');
assert.deepEqual(authored.doors.frontDoor,{id:'frontDoor',name:'大門',boundary:{z:0,id:'v:1,6'},state:'open',compatibility:{roomValueContribution:18}});
assert.deepEqual(authored.exits.frontExit,{id:'frontExit',name:'大門外',kind:'offMap',boundary:{z:0,id:'v:1,6'},access:{x:1,y:6,z:0}});

const st=I.createInitialState(authored,{seed:20260911,version:'11.27.0-furniture-orientation'});
assert.equal(JSON.stringify(authored),authoredBefore,'compiler must not mutate canonical authoring package');
assert.equal(st.version,'11.27.0-furniture-orientation');
assert.equal(st.map.width,12);
assert.equal(st.map.height,8);
assert.equal(Object.keys(st.map.tiles).length,96);
assert.equal(Object.values(st.map.tiles).filter(t=>t.terrain==='floor').length,60);
assert.equal(Object.values(st.map.tiles).filter(t=>t.terrain==='void').length,36);
assert.equal(st.map.cellSizeMeters,1);
assert.deepEqual(st.structures,{},'Initializer must expose the formal runtime Structure root even when the default world has none');
assert.equal(Object.keys(st.map.boundaries).length,32);
assert.equal(st.map.boundaries['0|v:1,6'].kind,'opening');
assert.equal(st.doors.frontDoor.state,'open');
assert.equal(st.exits.frontExit.kind,'offMap');
assert.deepEqual(st.exits.frontExit.access,{x:1,y:6});
assert.equal(st.map.tiles['1,6'].walkable,true,'world-exit access must remain on an authored floor cell');
assert.equal(Object.keys(st.furniture).length,7);
assert.equal(st.furniture.diningTable.value,30,'Room value compatibility projection must preserve current runtime behavior');
assert.equal(st.furniture.sofa.slots[0].restQuality,.82);
assert.equal(st.furniture.sofa.slots[0].sleepQuality,.62);
assert.equal(st.furniture.bed.slots[0].furnitureId,'bed');
assert.ok(st.map.tiles['5,2'].furnitureIds.includes('diningTable'));
assert.equal(st.furniture.diningTable.spatial.floor.mode,'under','Definition floor geometry must survive runtime compilation');
assert.equal(st.furniture.diningTable.spatial.under.clearance,.72,'Definition under-clearance must survive runtime compilation');
assert.equal(st.furniture.diningTable.spatial.surface.id,'diningTable:surface','Definition surface key must derive a stable instance surface id');
assert.deepEqual(st.furniture.diningTable.spatial.surface.cells,[{x:5,y:2},{x:6,y:2},{x:5,y:3},{x:6,y:3}],'Definition-local surface coverage must compile to runtime world cells');
assert.equal(st.furniture.diningTable.blocksMovement,undefined,'runtime Furniture must not retain blocksMovement as intrinsic traversal truth');
assert.deepEqual(st.agents.zhen.position,{x:9,y:3});
assert.deepEqual(st.agents.zhou.position,{x:7,y:3});
assert.deepEqual(st.agents.orange.position,{x:2,y:6});
assert.equal(st.map.rooms&&Object.keys(st.map.rooms).length,0);
assert.equal(st.map.roomRevision,0);
assert.equal(st.map.passageConstraints,undefined);

const serialized=A.serializeAuthoring(authored);
assert.match(serialized,/"furnitureCatalogVersion": "furniture-definitions-v4"/);
assert.match(serialized,/"definitionId": "chair-basic"/);
assert.ok(!serialized.includes('"restQuality"')&&!serialized.includes('"sleepQuality"')&&!serialized.includes('"mealSeat"'),'legacy activity fields must not serialize in v6');
assert.ok(serialized.includes('"orientation": "north"'),'v6 Furniture Instances must serialize canonical orientation');
assert.ok(!serialized.includes('"footprint"'),'resolved Definition geometry must not serialize into Furniture Instances');
assert.ok(serialized.includes('"structures"')&&serialized.includes('"boundaries"')&&serialized.includes('"doors"')&&serialized.includes('"exits"'),'v6 structural truth must serialize explicitly');
assert.ok(!serialized.includes('"canExit"'),'v6 must not serialize legacy furniture exit compatibility');

const again=I.createInitialState(authored,{seed:20260911,version:'11.27.0-furniture-orientation'});
assert.deepEqual(again,st,'same package + same seed must produce the same raw compiled state');
const otherSeed=I.createInitialState(authored,{seed:7,version:'11.27.0-furniture-orientation'});
const normalizeSeed=x=>{const y=JSON.parse(JSON.stringify(x));y.seed=0;y.rngState=0;return y;};
assert.deepEqual(normalizeSeed(otherSeed),normalizeSeed(st),'changing seed must not change authored world content');

const missingPlacementLayer=JSON.parse(JSON.stringify(authored));
missingPlacementLayer.map.layers[0].z=1;
assert.throws(()=>I.createInitialState(missingPlacementLayer,{seed:1,version:'test'}),/initial_placement_layer_missing/,'runtime must reject resident placements that reference a layer no longer present');

console.log('world authoring foundation: ok');
