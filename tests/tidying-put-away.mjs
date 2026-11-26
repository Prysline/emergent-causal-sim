import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';
import {legacyResourceWorld} from './helpers/legacy-resource-world.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
const A=globalThis.SimWorldAuthoring,W=globalThis.SimWorld,E=globalThis.SimEngine,SP=globalThis.SimSpatial,P=globalThis.SimPerception,T=globalThis.SimTidyingState,V=globalThis.SimValidator;
assert.ok(Number(A.VERSION.split('v').pop())>=19,'Tidying requires at least the v19 World Authoring contract');
assert.equal(T.VERSION,'tidying-put-away-v1');
assert.equal(E.TIDYING_VERSION,T.VERSION);
assert.equal(P.VISUAL_AVAILABILITY_VERSION,'perception-visual-availability-v5-exposed-cookware');
assert.equal(E.EMERGENCY_PREEMPTIBLE.has('putAwayObject'),true);

function fixture(){
  // Legacy position/line-of-sight regression must not borrow B's partition.
  const doc=legacyResourceWorld(A);
  // Legacy geometry fixture keeps its original positions, but uses current ordinary Object physical properties.
  doc.entities.objects.bookA.handling.massKg=.5;
  doc.entities.objects.bookA.physicalVolumeCubicMeters=.00264;
  doc.furniture.bookshelfA={id:'bookshelfA',definitionId:'bookshelf-basic',origin:{x:2,y:4,z:0},orientation:'south'};
  doc.objectStorageAssignments=[{id:'storage:bookA',objectId:'bookA',target:{kind:'furniture',id:'bookshelfA'},mode:'contain'}];
  doc.residents.zhen.initial.knownObjectStorageAssignmentIds=['storage:bookA'];
  doc.residents.zhen.initial.placement={mode:'exact',node:{x:5,y:4,z:0}};
  doc.residents.zhen.initial.facing='north';
  return doc;
}
const doc=fixture(),valid=A.validateAuthoring(doc);
assert.equal(valid.ok,true,valid.errors.map(x=>x.code+':'+x.message).join(' | '));
const roundtrip=A.parseAuthoringJSON(A.serializeAuthoring(doc));
assert.deepEqual(roundtrip.objectStorageAssignments,doc.objectStorageAssignments);
assert.deepEqual(roundtrip.residents.zhen.initial.knownObjectStorageAssignmentIds,['storage:bookA']);
for(const [mutate,expected] of [
  [v=>v.objectStorageAssignments.push({...v.objectStorageAssignments[0],id:'another'}),'object_storage_object_invalid'],
  [v=>v.objectStorageAssignments[0].target.id='diningTable','object_storage_containment_unavailable'],
  [v=>v.objectStorageAssignments[0].objectId='missing','object_storage_object_invalid'],
  [v=>v.residents.zhou.initial.knownObjectStorageAssignmentIds=['missing'],'object_storage_known_refs_invalid']
]){
  const bad=fixture();mutate(bad);
  assert.ok(A.validateAuthoring(bad).errors.some(issue=>issue.code===expected),expected);
}

const initialized=W.createInitialStateFromAuthoring(doc,20261018);
assert.deepEqual(initialized.objectStorageAssignments,doc.objectStorageAssignments);
assert.deepEqual(initialized.agents.zhen.knownObjectStorageAssignmentIds,['storage:bookA']);
assert.deepEqual(initialized.agents.zhou.knownObjectStorageAssignmentIds,[]);
assert.equal(initialized.agents.zhen.objectStorageAssignments,undefined);

E.configureResetStateSource('tidying-fixture',seed=>W.createInitialStateFromAuthoring(doc,seed));
for(const posture of ['kneeling','prone']){
  E.reset(20261018);
  const world=E.getState(),actor=world.agents.zhen,book=world.objects.bookA;
  for(const other of Object.values(world.agents))if(other.id!==actor.id)other.offMap=true;
  const standingOption=E.tidyingDecisionOption(world,actor);
  assert.equal(standingOption?.id,'putAwayObject');
  actor.posture={kind:posture,slotId:null,furnitureId:null};
  assert.equal(P.lacksVisualPoseEnvelopeForSupportedLocomotion(actor),true);
  assert.throws(()=>P.classifyObjectPointVisualAvailability(world,actor,book),new RegExp('do not support posture '+posture));
  assert.equal(E.tidyingDecisionOption(world,actor),null,'no unobserved put-away option');
  assert.equal(E.buildAction(actor,standingOption),null,'Action revalidates posture');
  const before=JSON.stringify(book),tick=world.tick;
  E.tick();
  assert.equal(world.tick,tick+1,'real Engine tick continues for '+posture);
  assert.ok(!world.thoughts[actor.id]?.options?.some(x=>x.id==='putAwayObject'));
  assert.equal(JSON.stringify(book),before,'no Object mutation');
  assert.equal(world.events.filter(e=>e.data?.action==='putAwayObject').length,0,'no fabricated Event');
  assert.equal(V.validateState(world).issueCount,0);
}
E.reset(20261018);
const st=E.getState(),a=st.agents.zhen,book=st.objects.bookA;
for(const agent of Object.values(st.agents)){
  Object.assign(agent.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,groomingNeed:0});
  agent.activeIntent=null;agent.action=null;
}
assert.equal(SP.objectLocationState(st,'bookA'),'supported');
assert.ok(P.classifyObjectPointVisualAvailability(st,a,book).visualAvailable,'Book must be visible to the assigned resident');
const opportunity=E.tidyingDecisionOption(st,a);
assert.equal(opportunity?.id,'putAwayObject','Real provider must create the autonomous option');
assert.equal(opportunity.storageAssignmentId,'storage:bookA');
assert.equal(opportunity.observed.observedTick,st.tick);
a.knownObjectStorageAssignmentIds=[];
assert.equal(E.tidyingDecisionOption(st,a),null,'World truth alone must not create private knowledge');
a.knownObjectStorageAssignmentIds=['storage:bookA'];
a.facing='south';
assert.equal(E.tidyingDecisionOption(st,a),null,'Target behind observer must not be globally known as visible');
a.facing='north';
let completed=false;
for(let i=0;i<180;i++){
  E.tick();
  if(book.containedBy==='bookshelfA'){completed=true;break;}
}
assert.equal(completed,true,'Real tick loop must move Object into canonical Furniture containment');
assert.equal(a.held,null);
assert.equal(book.position,undefined);
assert.equal(book.supportId,undefined);
assert.ok(st.events.some(event=>event.data?.action==='putAwayObject'&&event.data.storageAssignmentId==='storage:bookA'));
assert.equal(E.tidyingDecisionOption(st,a),null,'Satisfied storage relation must not repeat the task');
console.log('Tidying / Put-away v1 production regression passed');
