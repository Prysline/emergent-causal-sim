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

assert.equal(SP.isAtInteraction(st,human,{kind:'object',id:'cupB'},'pickup'),false,'seated Human is not already in ground contact with the dropped cup');
const preEgressResult=SP.bestInteractionPositionResult(st,human,{kind:'object',id:'cupB'},'pickup');
assert.ok(preEgressResult,'slot-aware target ranking must resolve a reachable pickup witness before the actor leaves the Slot');
assert.equal(preEgressResult.requiredPosture,'kneeling');
const preEgressGoal=preEgressResult.position;
const expectedEgress=SP.bestSlotEgressNode(st,slot,human,preEgressGoal,{mode:'auto',objective:'traversalCost'});
assert.ok(expectedEgress,'target-aware Slot egress winner must exist');

E.tick();

assert.equal(human.posture.kind,'standing','an interaction action must leave its furniture slot before route execution');
assert.ok(SP.nodeSame(st,human.position,expectedEgress),'execution must leave through the same target-compatible egress assumed by ranking');
assert.equal(human.posture.slotId,null);
assert.equal(human.posture.furnitureId,null);
assert.equal(human.action?.wait,0,'standing up for interaction must not be recorded as an unreachable-target wait');
assert.equal(cup.supportId,undefined,'dropped portable cup must remain detached from its former support');
assert.ok(SP.nodeSame(st,cup.position,SP.normalizeNode(st,{x:4,y:5,z:0},'floor')));

const postEgressResult=SP.bestInteractionPositionResult(st,human,{kind:'object',id:'cupB'},'pickup');
assert.ok(postEgressResult,'after slot egress the same production pickup query must remain reachable');
assert.equal(postEgressResult.requiredPosture,'kneeling');

for(let i=0;i<20&&human.held!=='cupB';i++)E.tick();
assert.equal(human.held,'cupB','the interaction lifecycle must continue from slot egress to actually picking up the dropped cup');
assert.equal(human.posture.kind,'kneeling','ground pickup must execute the same terminal low posture required by the interaction witness');
assert.equal(human.action?.wait,0,'successful post-egress routing must not accumulate unreachable-target waits');

E.reset(20260913);
{
  const st2=E.getState(),human2=st2.agents.zhen,cup2=st2.containers.cupB,slot2=SP.getSlot(st2,'chairNW:seat');
  st2.agents.zhou.offMap=true;
  st2.agents.orange.offMap=true;

  human2.position={...slot2.position};
  human2.posture={kind:'sitting',slotId:slot2.id,furnitureId:slot2.furnitureId};
  human2.locomotion={mode:null,phase:'idle'};
  human2.held='cupB';
  delete cup2.supportId;
  cup2.position={...slot2.position};
  cup2.contents={water:5};
  human2.action={
    kind:'drinkWater',
    phase:'toVessel',
    started:st2.tick,
    wait:0,
    resource:'water',
    container:'cupB'
  };

  assert.equal(SP.isAtInteraction(st2,human2,{kind:'object',id:'cupB'},'pickup'),true,'a held target is already interactable from the current Slot posture');
  E.tick();
  assert.equal(human2.posture.kind,'sitting','already-valid interaction must not force Slot egress');
  assert.equal(human2.posture.slotId,slot2.id);
  assert.equal(human2.action?.phase,'take','the action should advance directly when interaction is already valid');
  assert.equal(human2.action?.wait,0);
}

E.reset(20260914);
{
  const st3=E.getState(),human3=st3.agents.zhen,cup3=st3.containers.cupB;
  st3.agents.zhou.offMap=true;
  st3.agents.orange.offMap=true;
  delete cup3.supportId;
  cup3.position={...human3.position};
  cup3.contents={water:5};
  human3.posture={kind:'standing',slotId:null,furnitureId:null};
  human3.locomotion={mode:null,phase:'idle'};
  human3.action={kind:'drinkWater',phase:'toVessel',started:st3.tick,wait:0,resource:'water',container:'cupB'};

  assert.equal(SP.isAtInteraction(st3,human3,{kind:'object',id:'cupB'},'pickup'),false,'standing at the same Floor node is not yet ground-contact ready');
  E.tick();
  assert.equal(human3.posture.kind,'kneeling','same-node execution must perform the required terminal posture transition instead of looping at the goal');
  assert.equal(human3.action?.phase,'toVessel','posture transition consumes the execution tick before the pickup phase advances');
  assert.equal(human3.held,null);
  E.tick();
  assert.equal(human3.action?.phase,'take','after the canonical posture transition the same pickup witness becomes satisfied');
}

console.log('slot posture -> ground pickup interaction regression: ok');