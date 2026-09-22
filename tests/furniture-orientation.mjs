import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','engine.js','editor-authoring-mutations.js'
]);

const D=globalThis.SimFurnitureDefinitions;
const A=globalThis.SimWorldAuthoring;
const I=globalThis.SimWorldInitializer;
const W=globalThis.SimWorld;
const SP=globalThis.SimSpatial;
const M=globalThis.SimEditorAuthoringMutations;
const clone=value=>JSON.parse(JSON.stringify(value));
const local=(x,y,z=0)=>({x,y,z});
const fp=value=>A.semanticFingerprint(value);

assert.equal(D.VERSION,'furniture-definitions-v5');
assert.equal(A.VERSION,'world-authoring-v6');
assert.deepEqual(D.ORIENTATIONS,['north','east','south','west']);
assert.deepEqual(A.FURNITURE_ORIENTATIONS,['north','east','south','west']);

// The local frame is north-canonical and footprint-normalized; asymmetric geometry proves every quarter turn.
const asymmetricDefinition={
  id:'orientation-probe',
  name:'方向測試家具',
  icon:'⌁',
  kind:'probe',
  supportsObjects:true,
  footprint:[local(0,0),local(1,0),local(2,0),local(0,1)],
  displayOffset:local(2,1),
  slots:[{key:'off-center',label:'偏心槽位',offset:local(0,1),allowKinds:['human']}],
  spatial:{
    floor:{mode:'under'},
    under:{clearance:.7,cover:'probe'},
    surface:{key:'top',label:'測試頂面',coverage:'footprint',traversable:true,allowKinds:['human']}
  }
};
const origin=local(4,3);
const expected={
  north:{
    footprint:[local(4,3),local(5,3),local(6,3),local(4,4)],
    displayAt:local(6,4),
    slot:local(4,4)
  },
  east:{
    footprint:[local(5,3),local(5,4),local(5,5),local(4,3)],
    displayAt:local(4,5),
    slot:local(4,3)
  },
  south:{
    footprint:[local(6,4),local(5,4),local(4,4),local(6,3)],
    displayAt:local(4,3),
    slot:local(6,3)
  },
  west:{
    footprint:[local(4,5),local(4,4),local(4,3),local(5,5)],
    displayAt:local(5,3),
    slot:local(5,5)
  }
};
for(const orientation of D.ORIENTATIONS){
  const instance={id:'probe-'+orientation,definitionId:asymmetricDefinition.id,origin,orientation};
  const resolved=D.resolveDefinitionInstance(asymmetricDefinition,instance);
  assert.deepEqual(resolved.footprint,expected[orientation].footprint,orientation+' asymmetric footprint');
  assert.deepEqual(resolved.displayAt,expected[orientation].displayAt,orientation+' display offset');
  assert.deepEqual(resolved.slots[0].position,expected[orientation].slot,orientation+' slot position');
  assert.equal(resolved.slots[0].id,'probe-'+orientation+':off-center','slot identity must stay instanceId:key');
  assert.deepEqual(resolved.spatial.surface.cells,resolved.footprint,orientation+' surface cells must follow rotated footprint');
  assert.equal(resolved.spatial.under.clearance,.7,'under clearance semantics must not change with orientation');
  for(const point of asymmetricDefinition.footprint){
    const world=D.localToWorld(asymmetricDefinition,instance,point);
    assert.deepEqual(D.worldToLocal(asymmetricDefinition,instance,world),point,orientation+' local/world inverse');
  }
}
assert.throws(
  ()=>D.resolveDefinitionInstance({...asymmetricDefinition,id:'bad-frame',footprint:[local(1,0)]},{id:'bad',definitionId:'bad-frame',origin,orientation:'north'}),
  /minX = 0 and minY = 0/,
  'Definition footprint must establish the canonical NW local anchor'
);
assert.throws(
  ()=>D.resolveDefinitionInstance(asymmetricDefinition,{id:'missing-orientation',definitionId:asymmetricDefinition.id,origin}),
  /orientation must be north \/ east \/ south \/ west/,
  'resolver must reject missing orientation instead of silently assuming north'
);

// world-authoring-v6 requires orientation and round-trips it.
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  assert.ok(Object.values(doc.furniture).every(instance=>instance.orientation==='north'));
  let invalid=clone(doc);
  delete invalid.furniture.sofa.orientation;
  let report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(error=>error.code==='authoring_furniture_orientation_invalid'));
  invalid=clone(doc);
  invalid.furniture.sofa.orientation='northeast';
  report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(error=>error.code==='authoring_furniture_orientation_invalid'));
  doc.furniture.sofa.orientation='west';
  const roundTrip=A.parseAuthoringJSON(A.serializeAuthoring(doc));
  assert.equal(roundTrip.furniture.sofa.orientation,'west');
}

// Shared resolver geometry must flow through topology, runtime compilation, Spatial contact, and slot placement.
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.furniture.sofa.orientation='east';
  const resolved=A.resolveFurnitureInstance(doc.furniture.sofa);
  assert.deepEqual(resolved.footprint,[local(9,2),local(9,3)]);
  assert.deepEqual(resolved.slots.map(slot=>slot.position),[local(9,2),local(9,3)]);
  const topology=A.deriveHorizontalTopology(doc,{z:0});
  assert.ok(topology.cells['9,2'].furnitureIds.includes('sofa'));
  assert.ok(topology.cells['9,3'].furnitureIds.includes('sofa'));
  assert.ok(!topology.cells['10,2'].furnitureIds.includes('sofa'));

  doc.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'sofa:right'}};
  doc.residents.zhen.initial.posture={kind:'sitting',slotId:'sofa:right',furnitureId:'sofa'};
  const placement=I.analyzeInitialPlacements(doc);
  assert.deepEqual(placement.hardErrors,[]);
  assert.deepEqual(placement.resolvedPlacements.zhen.position,local(9,3));
  assert.equal(doc.residents.zhen.initial.placement.anchor.id,'sofa:right');

  const state=W.createInitialStateFromAuthoring(doc,20260911);
  assert.deepEqual(state.furniture.sofa.footprint,resolved.footprint.map(({x,y})=>({x,y})),'runtime initializer must consume the same rotated footprint');
  assert.deepEqual(state.furniture.sofa.slots.map(slot=>slot.position),resolved.slots.map(slot=>({x:slot.position.x,y:slot.position.y})),'runtime slots must match authoring resolver geometry');
  const contacts=SP.supportContactNodes(state,'sofa',state.agents.zhen);
  const contactKeys=new Set(contacts.map(node=>node.x+','+node.y));
  assert.ok(contactKeys.has('8,2')&&contactKeys.has('10,2')&&contactKeys.has('8,3')&&contactKeys.has('10,3'),'Spatial contact must surround the rotated vertical footprint');
}

// create/duplicate/move/rotate semantics.
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  let result=M.createFurnitureFromDefinition(doc,{definitionId:'chair-basic',target:local(3,4)});
  assert.equal(result.ok,true,result.issues.map(issue=>issue.code).join(','));
  assert.equal(result.candidate.furniture['chair-basic-1'].orientation,'north','new furniture must explicitly author north');

  const source=clone(A.DEFAULT_WORLD_AUTHORING);
  source.furniture.sofa.orientation='east';
  result=M.duplicateFurniture(source,{sourceId:'sofa',target:local(7,4)});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.furniture['sofa-basic-1'].orientation,'east','duplicate must copy source orientation');

  result=M.moveFurniture(source,{furnitureId:'sofa',target:local(8,3)});
  assert.equal(result.ok,true);
  assert.equal(result.candidate.furniture.sofa.orientation,'east','move must preserve orientation');

  const rotateSource=clone(A.DEFAULT_WORLD_AUTHORING);
  const originBefore=clone(rotateSource.furniture.sofa.origin);
  result=M.rotateFurniture(rotateSource,{furnitureId:'sofa',orientation:'east'});
  assert.equal(result.ok,true,result.issues.map(issue=>issue.code).join(','));
  assert.deepEqual(result.candidate.furniture.sofa.origin,originBefore,'rotation must preserve placement-anchor origin');
  assert.deepEqual(result.meta.preview.footprint,[local(9,2),local(9,3)]);
}

// Explicit support followers rotate; unrelated same-cell entities and Sources do not.
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.entities.containers.syntheticPort={
    id:'syntheticPort',name:'Port follower',portable:true,contents:{},
    position:local(5,2),supportId:'diningTable',
    interactionPorts:[{id:'syntheticPort:port',position:local(5,3),edge:'east'}]
  };
  doc.entities.containers.basket.position=local(5,2);
  const sourceBefore=clone(doc.entities.sources.tap);
  const result=M.rotateFurniture(doc,{furnitureId:'diningTable',orientation:'east'});
  assert.equal(result.ok,true,result.issues.map(issue=>issue.code).join(','));
  const rotated=result.candidate;
  assert.deepEqual(rotated.furniture.diningTable.origin,doc.furniture.diningTable.origin);
  assert.deepEqual(rotated.entities.containers.mealTray.position,local(6,2));
  assert.deepEqual(rotated.entities.containers.plateB.position,local(5,3));
  assert.deepEqual(rotated.entities.containers.syntheticPort.position,local(6,2));
  assert.deepEqual(rotated.entities.containers.syntheticPort.interactionPorts[0].position,local(5,2));
  assert.equal(rotated.entities.containers.syntheticPort.interactionPorts[0].edge,'south');
  assert.deepEqual(rotated.entities.containers.basket.position,local(5,2),'same-cell unrelated entity must not follow');
  assert.deepEqual(rotated.entities.sources.tap,sourceBefore,'current Source authored world facts must remain unchanged');
  assert.deepEqual(doc.entities.containers.mealTray.position,local(5,2),'rotation must not mutate source authoring');
}

// Slot-bound Resident keeps stable references while the resolver moves the slot.
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.residents.zhen.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:'sofa:right'}};
  doc.residents.zhen.initial.posture={kind:'sitting',slotId:'sofa:right',furnitureId:'sofa'};
  const result=M.rotateFurniture(doc,{furnitureId:'sofa',orientation:'east'});
  assert.equal(result.ok,true,result.issues.map(issue=>issue.code).join(','));
  assert.deepEqual(result.candidate.residents.zhen.initial.placement,doc.residents.zhen.initial.placement);
  assert.deepEqual(result.candidate.residents.zhen.initial.posture,doc.residents.zhen.initial.posture);
  const analysis=I.analyzeInitialPlacements(result.candidate);
  assert.deepEqual(analysis.hardErrors,[]);
  assert.deepEqual(analysis.resolvedPlacements.zhen.position,local(9,3));
}

// Invalid rotation is atomic.
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  doc.furniture.sofa.origin=local(10,7);
  doc.furniture.sofa.orientation='north';
  assert.equal(A.validateAuthoring(doc).ok,true);
  const before=fp(doc);
  const result=M.rotateFurniture(doc,{furnitureId:'sofa',orientation:'east'});
  assert.equal(result.ok,false);
  assert.equal(result.candidate,null);
  assert.ok(result.issues.some(issue=>issue.code==='authoring_position_out_of_bounds'));
  assert.equal(fp(doc),before,'rejected rotation must leave source authoring unchanged');
}
{
  const doc=clone(A.DEFAULT_WORLD_AUTHORING);
  const before=fp(doc);
  const result=M.rotateFurniture(doc,{furnitureId:'sofa',orientation:'diagonal'});
  assert.equal(result.ok,false);
  assert.equal(result.issues[0].code,'furniture_orientation_invalid');
  assert.equal(fp(doc),before);
}

console.log('furniture orientation regression: ok');
