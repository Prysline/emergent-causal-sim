import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadInitialStateProfile(['world-authoring.js','world-initializer.js','world.js','systems/perception/visual-orientation.js','spatial.js']);

const A=globalThis.SimWorldAuthoring,W=globalThis.SimWorld,P=globalThis.SimPerception;
assert.equal(P.VISUAL_ORIENTATION_VERSION,'perception-visual-orientation-v1');
assert.strictEqual(P.FACING_DIRECTIONS,W.AGENT_FACING_DIRECTIONS,'Perception must consume the canonical Agent facing representation');
assert.strictEqual(P.FACING_DIRECTIONS,A.AGENT_FACING_DIRECTIONS,'Perception must not create a second direction authority');

const st=W.createInitialState(49),observer=st.agents.zhen;
observer.facing='north';
const snapshot=P.captureVisualOrientationSnapshot(st,observer);
assert.deepEqual(snapshot,{observerId:'zhen',snapshotTick:st.tick,facing:'north'});
assert.ok(Object.isFrozen(snapshot));
assert.equal(P.visualOrientation(observer),'north');

const origin={x:0,y:0};
const cases=[
  [{x:0,y:-5},'north',0,'direct'],
  [{x:5,y:-5},'northEast',45,'direct'],
  [{x:5,y:0},'east',90,'peripheral'],
  [{x:5,y:5},'southEast',135,'unavailable'],
  [{x:0,y:5},'south',180,'unavailable'],
  [{x:-5,y:0},'west',90,'peripheral'],
  [{x:-5,y:-5},'northWest',45,'direct']
];
for(const [target,targetDirection,relativeBearing,visualClass] of cases){
  const result=P.classifyVisualBearing(snapshot,origin,target);
  assert.deepEqual(result,{observerId:'zhen',snapshotTick:st.tick,facing:'north',targetDirection,relativeBearing,visualClass});
  assert.ok(Object.isFrozen(result));
}

assert.equal(P.directionToward(origin,{x:10,y:-1}),'east','metric bearing must use the nearest 45-degree octant, not only coordinate signs');
assert.equal(P.directionToward(origin,{x:1,y:-10}),'north');
assert.equal(P.visualFieldClass(0),'direct');
assert.equal(P.visualFieldClass(45),'direct');
assert.equal(P.visualFieldClass(90),'peripheral');
assert.equal(P.visualFieldClass(135),'unavailable');
assert.equal(P.visualFieldClass(180),'unavailable');

observer.facing='east';
assert.equal(snapshot.facing,'north','a later canonical turn must not rewrite an already captured tick orientation snapshot');
assert.equal(P.classifyVisualBearing(snapshot,origin,{x:0,y:-5}).visualClass,'direct','same-tick classification must remain tied to the captured facing snapshot');
const laterSnapshot=P.captureVisualOrientationSnapshot(st,observer);
assert.equal(laterSnapshot.facing,'east','a newly captured snapshot may read current canonical facing; the later runtime perception owner must enforce tick-start snapshot timing');

assert.equal(P.classifyVisualBearing(snapshot,origin,{x:0,y:-1000}).visualClass,'direct','this slice must not silently add range attenuation or a maximum horizon');
assert.throws(()=>P.visualOrientation({...observer,facing:'up'}),/Invalid Agent\.facing/);
assert.throws(()=>P.classifyVisualBearing(snapshot,origin,origin),/distinct observer and target representative positions/);
assert.throws(()=>P.visualFieldClass(30),/Invalid 8-direction visual relative bearing/);

console.log('perception visual orientation: ok');
