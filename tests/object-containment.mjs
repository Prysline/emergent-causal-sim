import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'spatial-candidate-selection.js','spatial-observability.js','systems/physical.js','spatial-passage.js','engine.js',
  'editor-authoring-mutations.js','editor-ordinary-object-authoring.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/physical-profile.js'
]);

const A=globalThis.SimWorldAuthoring;
const D=globalThis.SimFurnitureDefinitions;
const E=globalThis.SimEngine;
const M=globalThis.SimEditorAuthoringMutations;
const SP=globalThis.SimSpatial;
const V=globalThis.SimValidator;
const W=globalThis.SimWorld;

assert.equal(A.VERSION,'world-authoring-v15');
assert.equal(D.VERSION,'furniture-definitions-v13');
assert.equal(SP.PICKUP_INTERACTION_VERSION,'pickup-interaction-v2-containment');
assert.equal(SP.OBSERVABILITY_VERSION,'11.58.0-spatial-containment-observability');
assert.equal(globalThis.SimEditorOrdinaryObjectAuthoring.VERSION,'editor-ordinary-object-authoring-v3');
assert.equal(A.DEFAULT_WORLD_AUTHORING.entities.objects.bookA.containedBy,undefined,'default readable book must not start inside a Bookshelf');
assert.equal(Object.values(A.DEFAULT_WORLD_AUTHORING.entities.objects).some(object=>object.containedBy),false,'default map must not ship with pre-contained Objects');

const bookshelfDef=D.getDefinition('bookshelf-basic');
assert.equal(bookshelfDef.objectContainment,true);
assert.equal(D.getDefinition('dining-table').objectContainment,undefined);

function fixture(){
  const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
  authored.furniture.bookshelfA={id:'bookshelfA',definitionId:'bookshelf-basic',origin:{x:2,y:4,z:0},orientation:'south'};
  authored.entities.objects.containedBook={
    id:'containedBook',name:'收納測試書',icon:'📘',portable:true,
    handling:{carryGeometry:{width:.22,height:.04,length:.30},handsRequired:1},
    affordances:['read'],interactions:{read:{mode:'supportReach'}},containedBy:'bookshelfA'
  };
  return authored;
}

const authored=fixture();
let report=A.validateAuthoring(authored);
assert.equal(report.ok,true,report.errors.map(x=>x.code+': '+x.message).join(' | '));
const roundTrip=A.parseAuthoringJSON(A.serializeAuthoring(authored));
assert.deepEqual(roundTrip.entities.objects.containedBook,authored.entities.objects.containedBook,'contained Object must round-trip without a fake position');

for(const [mutate,code] of [
  [doc=>{doc.entities.objects.containedBook.position={x:2,y:4,z:0};},'authoring_contained_object_position_conflict'],
  [doc=>{doc.entities.objects.containedBook.supportId='diningTable';},'authoring_contained_object_support_conflict'],
  [doc=>{doc.entities.objects.containedBook.containedBy='diningTable';},'authoring_object_container_capability_missing'],
  [doc=>{doc.entities.objects.containedBook.containedBy='missing';},'authoring_object_container_missing']
]){
  const bad=fixture();mutate(bad);const result=A.validateAuthoring(bad);
  assert.ok(result.errors.some(issue=>issue.code===code),code+' must be explicit');
}

const blockedDelete=M.deleteFurniture(authored,{furnitureId:'bookshelfA'});
assert.equal(blockedDelete.ok,false,'referenced Bookshelf must not be deleted');
assert.equal(blockedDelete.issues[0].code,'furniture_delete_blocked');
assert.ok(blockedDelete.meta.blockers.some(item=>item.ownerId==='containedBook'&&item.referenceKind==='containedBy'));
const empty=fixture();delete empty.entities.objects.containedBook;
assert.equal(M.deleteFurniture(empty,{furnitureId:'bookshelfA'}).ok,true,'empty Bookshelf must remain deletable');

E.configureResetStateSource('object-containment-fixture',seed=>W.createInitialStateFromAuthoring(authored,seed));
E.reset(20261012);
const st=E.getState(),human=st.agents.zhen,book=st.objects.containedBook;
const furniturePosition=SP.furniturePosition(st,'bookshelfA');
assert.equal(SP.objectLocationState(st,'containedBook'),'contained');
assert.equal(book.position,undefined);
assert.deepEqual(SP.objectPosition(st,'containedBook'),furniturePosition);
assert.ok(SP.nodeSame(st,SP.objectNode(st,'containedBook'),SP.normalizeNode(st,furniturePosition,'floor')));
assert.equal(SP.objectObservation(st,'containedBook').containedBy,'bookshelfA');

const furnitureGeometry=SP.interactionGeometry(st,{kind:'furniture',id:'bookshelfA'},human,'pickup');
const containedGeometry=SP.interactionGeometry(st,{kind:'object',id:'containedBook'},human,'pickup');
assert.equal(containedGeometry.mode,'furnitureReach');
assert.equal(containedGeometry.containedBy,'bookshelfA');
assert.deepEqual(containedGeometry.positions,furnitureGeometry.positions,'contained pickup must reuse Furniture interaction geometry');
assert.ok(containedGeometry.positions.length,'Bookshelf fixture must expose an interaction position');
const containedReadGeometry=SP.interactionGeometry(st,{kind:'object',id:'containedBook'},human,'read');
assert.equal(containedReadGeometry.mode,'none','contained Object affordances other than pickup must remain unavailable until the Object is taken out');
assert.equal(containedReadGeometry.positions.length,0);
assert.equal(containedReadGeometry.containedBy,'bookshelfA');
human.position={...containedGeometry.positions[0]};
human.posture={kind:'standing',slotId:null,furnitureId:null};

assert.equal(E.takeContainedObject(human,'containedBook'),true);
assert.equal(human.held,'containedBook');
assert.equal(book.containedBy,undefined);
assert.equal(SP.objectLocationState(st,'containedBook'),'held');
assert.ok(SP.nodeSame(st,SP.objectNode(st,'containedBook'),SP.nodeForAgent(st,human)));

assert.equal(E.containHeldObject(human,'bookshelfA'),true);
assert.equal(human.held,null);
assert.equal(book.containedBy,'bookshelfA');
assert.equal(book.position,undefined);
assert.equal(book.supportId,undefined);
assert.equal(SP.objectLocationState(st,'containedBook'),'contained');

human.held='containedBook';
let validation=V.validateState(st);
assert.ok(validation.issues.some(issue=>issue.code==='held_object_containment_conflict'));
human.held=null;
book.supportId='diningTable';
validation=V.validateState(st);
assert.ok(validation.issues.some(issue=>issue.code==='contained_object_support_conflict'));
delete book.supportId;
book.position={x:2,y:4,z:0};
validation=V.validateState(st);
assert.ok(validation.issues.some(issue=>issue.code==='contained_object_position_conflict'));
delete book.position;

assert.equal(E.takeContainedObject(human,'containedBook'),true);
const release=SP.releaseHeldObjectNearby(st,human);
assert.ok(release);
assert.equal(book.containedBy,undefined,'release must establish Free / Supported truth and clear containment');
assert.ok(book.position,'release must restore a canonical position');

validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(issue=>issue.code+': '+issue.message).join(' | '));
console.log('Object containment regression: ok');
