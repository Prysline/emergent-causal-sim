import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','engine.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/physical-profile.js'
]);

const A=globalThis.SimWorldAuthoring;
const E=globalThis.SimEngine;
const O=globalThis.SimObjectHandling;
const R=globalThis.SimResources;
const P=globalThis.SimPhysical;
const SP=globalThis.SimSpatial;
const V=globalThis.SimValidator;
const AC=globalThis.SimAgentCarry;

assert.equal(A.VERSION,'world-authoring-v15');
assert.equal(O.VERSION,'object-handling-v1');
assert.equal(R.VERSION,'11.56.0-resource-container-capability');
assert.equal(P.VERSION,'11.56.0-physical-object-handling');
assert.equal(SP.NEARBY_PLACEMENT_VERSION,'nearby-placement-v2-object-release');
assert.equal(AC.VERSION,'11.46.0-sleep-carry-integration','Agent Carry semantics/generation must remain independent from Object unification');
assert.equal(Object.hasOwn(A.DEFAULT_WORLD_AUTHORING.entities,'containers'),false,'authoring must not retain a canonical containers collection');

const expectedObjects=['bookA','mealTray','plateA','plateB','foodPantry','basket','waterBucket','cupA','cupB','alcoholBottle'];
assert.deepEqual(Object.keys(A.DEFAULT_WORLD_AUTHORING.entities.objects).sort(),expectedObjects.sort());
assert.equal(A.DEFAULT_WORLD_AUTHORING.entities.objects.bookA.resourceContainer,undefined);
for(const id of expectedObjects.filter(id=>id!=='bookA')){
  assert.equal(A.DEFAULT_WORLD_AUTHORING.entities.objects[id].resourceContainer,true,id+' must be an Object with Resource-container capability');
}

E.reset(20261011);
const st=E.getState(),human=st.agents.zhen,book=st.objects.bookA,cup=st.objects.cupA;
assert.equal(Object.hasOwn(st,'containers'),false,'runtime must not retain state.containers as canonical truth or alias');
assert.ok(st.agentCarries&&typeof st.agentCarries==='object','Agent Carry truth must remain state.agentCarries');
assert.equal(R.resolveContainer(st,'bookA'),null,'ordinary Object must not be promoted into Resource semantics');
assert.equal(R.resolveContainer(st,'cupA'),cup,'Resource-container capability Object must remain visible to Resources');
assert.equal(O.canHoldObject(st,human,'bookA'),true,'ordinary portable Object must be legal for Agent.held');
assert.equal(O.canHoldObject(st,human,'cupA'),true,'Resource-container Object must use the same generic hold authority');

const contact=SP.supportContactNodes(st,'diningTable',human)[0];
assert.ok(contact,'fixture must expose a canonical dining-table support-contact node');
human.position={...contact};
human.posture={kind:'standing',slotId:null,furnitureId:null};

human.held='bookA';
delete book.supportId;
assert.ok(SP.nodeSame(st,SP.objectNode(st,'bookA'),SP.nodeForAgent(st,human)),'held ordinary Object effective location must follow holder');
assert.equal(P.getEffectiveTraversalEnvelope(st,human,'walk').carriedObjectId,'bookA');
assert.equal(R.effectiveCarryLoad(st,human),0,'ordinary Object carry must not fabricate Resource-derived load');
assert.deepEqual(R.getCarriedHandlingRisk(st,human,{tilt:1,impact:1,oscillation:1}),{contentsLoss:0,containerDrop:0},'ordinary Object must not receive spill/drop Resource handling semantics');
book.supportId='diningTable';
let validation=V.validateState(st);
assert.ok(validation.issues.some(issue=>issue.code==='held_object_support_conflict'),'holder + support must remain explicitly illegal for any held Object');
delete book.supportId;
const bookRelease=SP.releaseHeldObjectNearby(st,human);
assert.equal(human.held,null);
assert.equal(bookRelease.objectId,'bookA');
assert.equal(book.supportId,bookRelease.supportId||undefined);
assert.ok(SP.nodeSame(st,SP.objectNode(st,'bookA'),bookRelease.node),'released ordinary Object must resolve to canonical placement node');

const cupContentsBefore={...cup.contents};
human.held='cupA';
delete cup.supportId;
assert.ok(SP.nodeSame(st,SP.objectNode(st,'cupA'),SP.nodeForAgent(st,human)),'held Resource-container Object effective location must follow holder through the same relation');
assert.ok(R.effectiveCarryLoad(st,human)>0,'Resource-container Object keeps Resource-derived carried load');
const cupRisk=R.getCarriedHandlingRisk(st,human,{tilt:.2,impact:.2,oscillation:.2});
assert.ok(cupRisk.contentsLoss>=0&&cupRisk.containerDrop>=0,'Resource-container capability keeps Resources handling-risk behavior');
const cupRelease=SP.releaseHeldObjectNearby(st,human);
assert.equal(human.held,null);
assert.equal(cupRelease.objectId,'cupA');
assert.deepEqual(cup.contents,cupContentsBefore,'ontology release migration must not mutate Resource contents');
assert.ok(SP.nodeSame(st,SP.objectNode(st,'cupA'),cupRelease.node),'Resource-container Object must use the same intentional placement owner');

validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(issue=>issue.code+': '+issue.message).join(' | '));
console.log('Object unification regression: ok');
