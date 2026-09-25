import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','systems/locomotion.js','engine.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;

E.reset(20260912);
const st=E.getState(),human=st.agents.zhen,cup=st.containers.cupB,slot=SP.getSlot(st,'chairNW:seat');
assert.ok(slot,'default-world dining chair slot must exist');

st.agents.zhou.offMap=true;
st.agents.orange.offMap=true;

human.position={...slot.position};
human.posture={kind:'sitting',slotId:slot.id,furnitureId:slot.furnitureId};
human.locomotion={mode:null,phase:'idle'};

delete cup.supportId;
cup.position={...SP.normalizeNode(st,{x:4,y:5,z:0},'floor')};
cup.contents={water:3.1};

human.action={
  kind:'drinkWater',
  phase:'toVessel',
  started:st.tick,
  wait:0,
  resource:'water',
  container:'cupB'
};

assert.equal(SP.isAtInteraction(st,human,{kind:'object',id:'cupB'},'pickup'),false,'seated Human is not already in pickup reach of the dropped cup');
assert.equal(SP.bestInteractionPosition(st,human,{kind:'object',id:'cupB'},'pickup'),null,'current regression fixture must reproduce the slot-origin route failure');

E.tick();

assert.equal(human.posture.kind,'standing','an interaction action must leave its furniture slot before route selection');
assert.equal(human.posture.slotId,null);
assert.equal(human.posture.furnitureId,null);
assert.equal(human.action?.wait,0,'standing up for interaction must not be recorded as an unreachable-target wait');
assert.equal(cup.supportId,undefined,'dropped portable cup must remain detached from its former support');
assert.ok(SP.nodeSame(st,cup.position,SP.normalizeNode(st,{x:4,y:5,z:0},'floor')));

console.log('slot posture -> general object interaction egress regression: ok');
