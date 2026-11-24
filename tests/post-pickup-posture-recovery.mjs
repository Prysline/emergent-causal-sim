// A: Real Engine-tick regression for pickup-triggered posture recovery.
// This focused test stays independent of Food R4-A1's shared Engine/CI writer.
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js',
  'spatial.js','spatial-traversal.js','systems/physical.js','spatial-passage.js',
  'systems/locomotion.js','engine.js',
  'validation/registry.js','validation/rules/spatial-node.js',
  'validation/rules/physical-profile.js','validation/rules/locomotion-execution.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

function fixture(seed){
  E.reset(seed);
  const st=E.getState(),actor=st.agents.zhen,object=st.objects.waterBucket;
  for(const other of Object.values(st.agents))if(other.id!==actor.id)other.offMap=true;
  Object.assign(actor.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0});
  actor.position={...floor(st,5,5)};
  actor.posture={kind:'kneeling',slotId:null,furnitureId:null};
  actor.locomotion={mode:null,phase:'idle'};
  actor.held=null;actor.action=null;actor.activeIntent=null;
  object.position={...actor.position};object.contents={water:0};
  delete object.supportId;delete object.containedBy;
  return {st,actor,object};
}
function armRestock(st,actor){
  actor.action={kind:'restockContainer',phase:'toContainer',started:st.tick,wait:0,
    destinationId:'waterBucket',sourceId:'tap',sourceKind:'source',resource:'water',strategy:'carryContainer'};
}
function takeFromCurrentFloor(f){
  const {st,actor,object}=f;
  assert.equal(SP.objectNode(st,object.id).surfaceId,'floor');
  assert.equal(SP.isAtInteraction(st,actor,{kind:'object',id:object.id},'pickup'),true);
  armRestock(st,actor);
  E.tick();assert.equal(actor.action?.phase,'takeContainer');
  E.tick();assert.equal(actor.held,object.id,'real Engine Action must hold the picked-up object');
  assert.equal(actor.action?.phase,'toSource');
  assert.equal(actor.posture.kind,'kneeling','pickup itself must not grant a free standing transition');
  assert.equal(object.supportId,undefined,'held object may not retain Surface support truth');
  return f;
}

// Open floor: the next tick pays a locomotion posture transition; the restock
// Action must not execute its following phase during that same transition tick.
{
  const f=takeFromCurrentFloor(fixture(20261124)),{st,actor}=f;
  assert.equal(SP.floorNodeFitsMode(st,actor.position,actor,'walk'),true,
    'positive fixture must allow standing with the currently held object');
  E.tick();
  assert.equal(actor.posture.kind,'standing','Human must recover standing after ground pickup');
  assert.deepEqual(actor.locomotion,{mode:'walk',phase:'transition'},
    'recovery must use the canonical one-tick walk posture transition');
  assert.equal(actor.action?.phase,'toSource','the follow-on Action phase must not run for free');
  E.tick();
  assert.equal(actor.action?.phase,'fill','the pre-existing restock flow must resume after recovery');
  const validation=V.validateState(st);
  assert.equal(validation.issueCount,0,validation.issues.map(x=>x.code+':'+x.message).join(' | '));
}

// A roof low enough to allow kneeling but not standing must not trigger an
// illegal posture update. Pickup and the original Action remain authoritative.
{
  const f=fixture(20261125),{st,actor}=f;
  st.furniture.postureTestRoof={id:'postureTestRoof',name:'低屋簷',
    footprint:[{x:5,y:5}],displayAt:{x:5,y:5},slots:[],
    spatial:{solids:[{key:'roof',layerZ:0,
      bounds:{x:5,y:5,z:1.16,width:1,depth:1,height:.08}}]}};
  assert.equal(SP.floorNodeFitsMode(st,actor.position,actor,'kneelCrawl'),true,
    'negative fixture still needs a legitimate kneeling pickup stance');
  assert.equal(SP.floorNodeFitsMode(st,actor.position,actor,'walk'),false);
  takeFromCurrentFloor(f);
  E.tick();
  assert.equal(actor.posture.kind,'kneeling','standing cannot be forced into a low roof');
  assert.equal(actor.held,'waterBucket','failed recovery cannot drop or duplicate the object');
  assert.notEqual(actor.action,null,'failed recovery must not abort the original Action');
}

// Supported object pickup must not gain a gratuitous recovery transition.
{
  const {st,actor,object}=fixture(20261126);
  const support=SP.supportSurfaceForFurniture(st,'diningTable');
  assert.ok(support?.surface?.cells?.length,'fixture requires the canonical dining table Surface');
  object.position={...support.surface.cells[0]};object.supportId='diningTable';
  actor.position={...floor(st,5,1)};
  actor.posture={kind:'standing',slotId:null,furnitureId:null};
  assert.equal(SP.isAtInteraction(st,actor,{kind:'object',id:object.id},'pickup'),true,
    'supported pickup must use the actual nearby Surface cell contact');
  armRestock(st,actor);
  E.tick();assert.equal(actor.action?.phase,'takeContainer');
  E.tick();assert.equal(actor.held,object.id);
  assert.equal(actor.posture.kind,'standing');
  E.tick();
  assert.equal(actor.posture.kind,'standing');
  assert.notDeepEqual(actor.locomotion,{mode:'walk',phase:'transition'},
    'ordinary supported pickup must not add an unrelated standing recovery tick');
}

console.log('post-pickup posture recovery production tick regression passed');
