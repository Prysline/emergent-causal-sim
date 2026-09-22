import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','systems/action/state.js','systems/intent/state.js','systems/social/state.js','engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js']);

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const eventsByAction=action=>E.getState().events.filter(e=>e.data?.action===action);
function bind(a,kind,intentKind,extra={}){
  a.action={kind,phase:'start',started:E.getState().tick,wait:0,...extra};
  a.activeIntent={id:`intent:${a.id}:${E.getState().tick}:${intentKind}`,kind:intentKind,createdTick:E.getState().tick,lifecycle:'actionBound',source:{type:'test',tick:E.getState().tick}};
  a.action.intentId=a.activeIntent.id;
  return a.activeIntent.id;
}

E.reset(20260911);
let st=E.getState();
assert.equal(st.version,'11.27.2-room-value-legacy-removal');
assert.equal(E.INTERRUPTION_SCHEMA_VERSION,'11.12.3-replan-preemption');
noIssues('reset');

// Hard Action failure does not automatically destroy a still-valid Intent.
// Orange's original water source becomes unusable, but another drinkable water container exists.
E.reset(20260911);st=E.getState();
let cat=st.agents.orange;
cat.needs.thirst=72;cat.needs.hunger=10;cat.needs.sleepNeed=20;cat.needs.social=10;
st.containers.waterBucket.contents.water=0;
st.containers.cupB.contents.water=18;
const drinkIntentId=bind(cat,'drinkWater','drinkWater',{phase:'move',targetObject:'waterBucket',resource:'water'});
E.tick();st=E.getState();cat=st.agents.orange;
assert.equal(cat.action,null,'failed concrete water plan should abort its Action first');
assert.equal(cat.activeIntent?.id,drinkIntentId,'same Intent identity should survive a replan-worthy Action abort');
assert.equal(cat.activeIntent?.kind,'drinkWater');
assert.equal(cat.activeIntent?.lifecycle,'open');
assert.equal(cat.activeIntent?.replanCount,1);
const replanEvent=eventsByAction('replanAction')[0];
assert.ok(replanEvent,'hard plan failure should produce structured replanAction observability');
assert.ok(replanEvent.causeIds.length,'replanAction should point back to the abort event');
noIssues('hard abort keeps valid Intent');

E.tick();st=E.getState();cat=st.agents.orange;
assert.equal(cat.activeIntent?.id,drinkIntentId,'replanning should keep the same Intent id');
assert.equal(cat.activeIntent?.lifecycle,'actionBound');
assert.equal(cat.action?.kind,'drinkWater');
assert.equal(cat.action?.intentId,drinkIntentId);
assert.equal(cat.action?.targetObject,'cupB','replan should choose the remaining drinkable water container');
assert.ok(eventsByAction('actionReplanned').some(e=>e.data?.intentId===drinkIntentId));
noIssues('replanned Action linked to same Intent');

// Emergency needs may preempt low/medium commitment actions and must clean transient ownership.
E.reset(20260911);st=E.getState();
let human=st.agents.zhen;
human.needs.thirst=99;human.needs.hunger=20;human.needs.sleepNeed=20;
bind(human,'wander','explore',{phase:'move',targetTile:{x:2,y:6},oneShot:true});
st.reservations['test:owned']=human.id;
human.held='cupB';delete st.containers.cupB.supportId;
E.tick();st=E.getState();human=st.agents.zhen;
const preempt=eventsByAction('intentPreempt')[0];
assert.ok(preempt,'extreme thirst should preempt wander');
assert.equal(preempt.data.emergencyNeed,'thirst');
assert.equal(preempt.data.priorActionKind,'wander');
assert.equal(human.activeIntent?.kind,'drinkWater');
assert.equal(human.activeIntent?.source?.type,'emergency');
assert.equal(human.action?.kind,'drinkWater');
assert.equal(st.reservations['test:owned'],undefined,'preemption must release prior Action reservations');
assert.equal(human.held,null,'preemption cleanup must release an unexpectedly held container like core abort cleanup');
assert.deepEqual(st.containers.cupB.position,human.position,'released held container should remain at the physical interruption position');
noIssues('emergency preemption cleanup');

// A requester-private open wait can be preempted by its own emergency without informing/cancelling anyone else.
E.reset(20260911);st=E.getState();cat=st.agents.orange;
const bidId=E.addEvent('橘子發出一次測試用社交邀請。','good',[],{actor:'orange',target:'zhou',action:'seekHuman',socialBid:true,bidKind:'animalAffection',bidFrom:'orange',bidTo:'zhou',perceivedByTarget:false});
st.causes[bidId].data.bidId=bidId;
cat.activeIntent={id:`intent:orange:0:awaitResponse:${bidId}`,kind:'awaitResponse',createdTick:0,lifecycle:'open',source:{type:'socialBid',bidId},patienceUntilTick:20};
cat.needs.thirst=99;
E.tick();st=E.getState();cat=st.agents.orange;
assert.equal(cat.activeIntent?.kind,'drinkWater','requester emergency should replace its own private waiting Intent');
assert.equal(cat.activeIntent?.source?.type,'emergency');
assert.equal(eventsByAction('socialWaitEnded').some(e=>e.data?.bidId===bidId),false,'emergency preemption is not a patience timeout');
assert.ok(eventsByAction('intentPreempt').some(e=>e.data?.priorIntentId?.includes('awaitResponse')));
noIssues('emergency preempts private waiter');

// Conservative first-stage policy protects high/atomic workflows from generic emergency switching.
E.reset(20260911);st=E.getState();human=st.agents.zhen;
human.needs.thirst=99;human.needs.hunger=80;human.needs.sleepNeed=20;
const eatIntentId=bind(human,'eat','satisfyHunger',{phase:'prepare'});
E.tick();st=E.getState();human=st.agents.zhen;
assert.equal(eventsByAction('intentPreempt').length,0,'eat workflow should not be emergency-preempted by the conservative v11.12.3 policy');
assert.equal(human.activeIntent?.id,eatIntentId);
assert.equal(human.activeIntent?.kind,'satisfyHunger');
noIssues('protected workflow remains stable');

// Requester timeout remains private: v11.12.3 must not reinterpret it as a responder hard invalidation.
E.reset(41);st=E.getState();
const requester=st.agents.orange,responder=st.agents.zhou;
const socialBidId=E.addEvent('橘子發出一次測試用社交邀請。','good',[],{actor:'orange',target:'zhou',action:'seekHuman',socialBid:true,bidKind:'animalAffection',bidFrom:'orange',bidTo:'zhou',perceivedByTarget:true});
st.causes[socialBidId].data.bidId=socialBidId;
requester.activeIntent={id:`intent:orange:0:awaitResponse:${socialBidId}`,kind:'awaitResponse',createdTick:0,lifecycle:'open',source:{type:'socialBid',bidId:socialBidId},patienceUntilTick:1};
responder.observedSocialBids=[{bidId:socialBidId,observedTick:0,expiresTick:6}];
responder.activeIntent={id:`intent:zhou:0:respondSocialBid:${socialBidId}`,kind:'respondSocialBid',createdTick:0,lifecycle:'actionBound',source:{type:'socialBid',bidId:socialBidId,observedTick:0}};
responder.action={kind:'petAnimal',phase:'move',started:0,wait:0,targetAgent:'orange',intentId:responder.activeIntent.id};
responder.position={x:10,y:6};requester.position={x:2,y:6};
E.tick();st=E.getState();
assert.equal(requester.activeIntent,null,'requester patience should still end privately');
assert.equal(st.agents.zhou.activeIntent?.kind,'respondSocialBid','requester timeout must not hard-invalidate responder Intent');
assert.equal(st.agents.zhou.action?.kind,'petAnimal');
noIssues('private timeout is not remote invalidation');

// Long-run integration preserves all previous lifecycle invariants.
E.reset(77);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const a of Object.values(st.agents)){
    if(a.action){
      assert.equal(a.activeIntent?.lifecycle,'actionBound',`${a.name} action must have actionBound Intent at tick ${st.tick}`);
      assert.equal(a.action.intentId,a.activeIntent?.id,`${a.name} Action/Intent linkage mismatch at tick ${st.tick}`);
    }
    if(a.activeIntent?.lifecycle==='open')assert.equal(a.action,null,`${a.name} open Intent must not persist an Action at tick ${st.tick}`);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.12.3 hard replan + emergency preemption regression: ok');