import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadInitialStateProfile([
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js'
]);

const A=globalThis.SimWorldAuthoring,I=globalThis.SimWorldInitializer,W=globalThis.SimWorld,SP=globalThis.SimSpatial;
const clone=value=>JSON.parse(JSON.stringify(value));
const compile=authoring=>{
  const st=I.createInitialState(authoring,{seed:12100,version:'test'});
  W.runInitialStateInitializers(st,{seed:12100});
  return st;
};

assert.equal(A.VERSION,'world-authoring-v5');
assert.equal(A.FURNITURE_CATALOG_VERSION,'furniture-definitions-v3');
assert.equal(A.DEFAULT_WORLD_AUTHORING.authoringSchema,'world-authoring-v5');
assert.equal(A.DEFAULT_WORLD_AUTHORING.furnitureCatalogVersion,'furniture-definitions-v3');
assert.equal(A.resolveFurnitureInstance(A.DEFAULT_WORLD_AUTHORING.furniture.diningTable).spatial.under.clearance,.72);

{
  const legacy=clone(A.DEFAULT_WORLD_AUTHORING);
  legacy.authoringSchema='world-authoring-v2';
  assert.equal(A.migrateAuthoring,undefined,'current-only authoring must not expose legacy migration machinery');
  const report=A.validateAuthoring(legacy);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_schema_unsupported'));
  assert.throws(
    ()=>A.parseAuthoringJSON(JSON.stringify(legacy)),
    error=>error?.code==='world_authoring_schema_unsupported'&&/world-authoring-v2/.test(error.message),
    'JSON import must reject legacy authoringSchema instead of migrating it'
  );
}

{
  const authored=clone(A.DEFAULT_WORLD_AUTHORING);
  authored.map.layers[0].boundaries['v:4,4']={kind:'wall',material:'stone'};
  let topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].structuralOpen,true);
  assert.equal(topology.cells['4,4'].structuralOpen,true);
  assert.equal(topology.cells['3,4'].adjacent.includes('4,4'),false,'wall boundary must block the edge without consuming either Cell');

  authored.map.layers[0].boundaries['v:4,4']={kind:'opening',material:'wood',clearanceWidth:.8,clearanceHeight:2};
  topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].adjacent.includes('4,4'),true,'opening boundary must restore the edge');

  authored.doors.testDoor={id:'testDoor',name:'測試門',boundary:{z:0,id:'v:4,4'},state:'closed'};
  topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].adjacent.includes('4,4'),false,'closed Door must block its opening edge');

  authored.doors.testDoor.state='open';
  topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].adjacent.includes('4,4'),true,'open Door must restore its opening edge');
}

{
  const authored=clone(A.DEFAULT_WORLD_AUTHORING);
  authored.map.layers.push({z:1,cells:{'8,4':{terrain:'floor',material:'wood'}},boundaries:{}});
  authored.structures.stairA={id:'stairA',kind:'stair',lower:{x:8,y:4,z:0},upper:{x:8,y:4,z:1},clearanceWidth:.8};
  const horizontal=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(horizontal.cells['8,4'].adjacent.includes('8,4,1'),false,'horizontal topology must never serialize or derive a cross-Z neighbor');
  const connections=A.deriveStructureConnections(authored);
  assert.deepEqual(connections,[{id:'stairA',kind:'stair',lower:{x:8,y:4,z:0},upper:{x:8,y:4,z:1},clearanceWidth:.8}],'vertical connectivity must have a separate pure Structure derivation owner');
}

{
  const authored=clone(A.DEFAULT_WORLD_AUTHORING);
  authored.furniture.testCover={id:'testCover',definitionId:'dining-table',origin:{x:3,y:4,z:0}};
  const topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].open,true,'Definition-owned under-clearance geometry must remain generically connected');
  assert.deepEqual(topology.cells['3,4'].under,[{furnitureId:'testCover',clearanceHeight:.72,clearanceWidth:null}]);
}

{
  const authored=clone(A.DEFAULT_WORLD_AUTHORING);
  authored.map.layers[0].boundaries['v:4,4']={kind:'opening',clearanceWidth:.8,clearanceHeight:2};
  const st=compile(authored);
  assert.equal(st.map.cellSizeMeters,1);
  assert.equal(st.map.boundaries['0|v:1,6'].kind,'opening');
  assert.equal(st.doors.frontDoor.state,'open');
  assert.equal(st.exits.frontExit.kind,'offMap');
  assert.ok(st.map.tiles['5,2'].furnitureIds.includes('diningTable'),'furniture membership must come from shared derivation');
  const from=SP.normalizeNode(st,{x:3,y:4},'floor'),to=SP.normalizeNode(st,{x:4,y:4},'floor');
  const boundaryProfile=SP.getPassageProfile(st,from,to);
  assert.equal(boundaryProfile.clearanceWidth,.8,'PassageProfile must consume opening boundary metric clearance');
  assert.equal(boundaryProfile.clearanceHeight,2);
  assert.equal(boundaryProfile.constrainedBy.boundary,'v:4,4');
  const underFrom=SP.normalizeNode(st,{x:4,y:2},'floor'),under=SP.normalizeNode(st,{x:5,y:2},'floor');
  const underProfile=SP.getPassageProfile(st,underFrom,under);
  assert.equal(underProfile.clearanceHeight,.72,'PassageProfile must still consume Definition-owned under-clearance geometry');
}

console.log('geometry-derived horizontal topology contract: ok');
