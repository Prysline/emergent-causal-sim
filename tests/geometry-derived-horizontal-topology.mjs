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

assert.equal(A.VERSION,'world-authoring-v3');
assert.equal(A.FURNITURE_CATALOG_VERSION,'furniture-definitions-v1');
assert.equal(A.DEFAULT_WORLD_AUTHORING.authoringSchema,'world-authoring-v3');
assert.equal(A.DEFAULT_WORLD_AUTHORING.furnitureCatalogVersion,'furniture-definitions-v1');
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
  authored.map.layers[0].cells['3,4']={terrain:'wall',material:'stone'};
  let topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].structuralOpen,false);
  assert.equal(topology.cells['3,4'].open,false);

  authored.map.layers[0].cells['3,4']={terrain:'doorway',material:'wood'};
  topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].structuralOpen,true,'opening must create structural floor-level openness without walkability flags');
  assert.equal(topology.cells['3,4'].open,true);
  assert.ok(topology.cells['3,4'].adjacent.includes('3,5'));

  authored.furniture.testSolid={id:'testSolid',definitionId:'front-door',origin:{x:3,y:4,z:0}};
  topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].structuralOpen,true);
  assert.equal(topology.cells['3,4'].open,false,'solid Furniture Definition geometry must close authored opening');
  assert.deepEqual(topology.cells['3,4'].blockedBy,['furniture:testSolid']);

  delete authored.furniture.testSolid;
  topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].open,true,'removing blocker must restore connectivity');
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
  const st=compile(authored);
  assert.equal(st.map.tiles['0,6'].walkable,true,'doorway compatibility tile must expose base structural openness');
  assert.ok(st.map.tiles['5,2'].furnitureIds.includes('diningTable'),'furniture membership must come from shared derivation');
  const from=SP.normalizeNode(st,{x:4,y:2},'floor'),under=SP.normalizeNode(st,{x:5,y:2},'floor');
  const profile=SP.getPassageProfile(st,from,under);
  assert.equal(profile.clearanceHeight,.72,'PassageProfile must consume Definition-owned under-clearance geometry');
}

console.log('geometry-derived horizontal topology contract: ok');
