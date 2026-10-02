import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js'
]);

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

E.reset(43001);
let st=E.getState(),observer=st.agents.zhen,target=st.agents.zhou;
assert.equal(st.version,'11.44.0-sleep-slot-conflict');
observer.position={x:5,y:5};target.position={x:5,y:6};
target.action={kind:'rest',phase:'resting',started:st.tick,wait:0,restTicks:0,targetFatigue:0,restTarget:{kind:'standing',position:{...target.position},quality:.18,posture:'standing'}};
E.reconcileIntents(st);
let obs=E.observeAgentContext(st,observer,target);
assert.deepEqual(obs,{observable:true,targetId:target.id,observedTick:st.tick,observedAgentKind:'human',observedActionKind:'rest',observedPosture:'standing'});
target.position={x:10,y:6};
assert.equal(E.observeAgentContext(st,observer,target).observable,false);
target.position={x:5,y:6};observer.action={kind:'sleep',phase:'sleeping',sleepTicks:0,started:st.tick};
assert.equal(E.observeAgentContext(st,observer,target).reason,'observer-sleeping');
observer.action=null;

const busyAction=target.action,responderIntentBefore=target.activeIntent;
const attention=E.performAttentionInteraction(observer,target,{stimulus:{kind:'sound',intensity:24}});
assert.equal(attention.performed,true);
const ev=st.causes[attention.eventId];
assert.equal(ev.data.action,'attentionStimulus');
assert.equal(ev.data.interactionPurpose,'gainAttention');
assert.equal(ev.data.stimulusKind,'sound');
assert.equal(ev.data.stimulusIntensity,24);
assert.equal(Object.hasOwn(ev.data,'attentionCaptured'),false);
assert.equal(Object.hasOwn(ev.data,'requestUnderstood'),false);
assert.equal(Object.hasOwn(ev.data,'requestAccepted'),false);
assert.equal(target.action,busyAction,'attention stimulus must not overwrite responder agency or current work');
assert.equal(observer.activeIntent,null,'standalone attention must not fabricate requester wait state');
assert.equal(target.activeIntent,responderIntentBefore,'standalone attention must preserve the responder existing intent instead of fabricating a response intent');
noIssues('awake busy attention');

E.reset(43002);st=E.getState();observer=st.agents.zhen;target=st.agents.zhou;
observer.position={x:7,y:4};const slot=SP.getSlot(st,'bed:left');target.position={...slot.position};target.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
target.needs.sleepNeed=100;target.action={kind:'sleep',phase:'sleeping',sleepTicks:0,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};
E.reconcileIntents(st);
const low=E.performAttentionInteraction(observer,target,{stimulus:{kind:'sound',intensity:0}});
assert.equal(low.performed,true);
assert.equal(E.isSleeping(target),true,'zero-intensity attention must not magically wake a deeply sleeping responder');
assert.ok(st.events.some(e=>e.data?.action==='sleepDisturbance'&&e.causeIds?.includes(low.eventId)));
assert.equal(Object.hasOwn(st.causes[low.eventId].data,'requestUnderstood'),false);
assert.equal(Object.hasOwn(st.causes[low.eventId].data,'requestAccepted'),false);
noIssues('sleeping attention remains separate from response');

E.reset(43003);st=E.getState();observer=st.agents.orange;target=st.agents.zhou;
observer.position={x:4,y:6};target.position={x:4,y:6};
const bidId=E.addEvent('test bid','normal',[],{actor:observer.id,target:target.id,action:'seekHuman',socialBid:true,bidKind:'animalAffection',interactionKind:'socialAffection',expectsResponse:true,bidFrom:observer.id,bidTo:target.id,perceivedByTarget:true});
st.causes[bidId].data.bidId=bidId;
observer.activeIntent={id:`intent:${observer.id}:0:awaitResponse:${bidId}`,kind:'awaitResponse',createdTick:0,lifecycle:'open',source:{type:'socialBid',bidId},patienceUntilTick:0};
target.action={kind:'rest',phase:'resting',started:0,wait:0,restTicks:0,targetFatigue:0,restTarget:{kind:'standing',position:{...target.position},quality:.18,posture:'standing'}};
E.tick();
const ended=st.events.find(e=>e.data?.action==='socialWaitEnded'&&e.data?.bidId===bidId);
assert.ok(ended);
assert.equal(ended.data.responderContextObserved,true);
assert.equal(ended.data.observedResponderActionKind,'rest');
assert.equal(ended.data.observedResponderPosture,'standing');
assert.equal(ended.data.intentionalIgnore,undefined);
assert.equal(ended.data.rejected,undefined);
noIssues('social wait consumes shared observation');

console.log('Attention + Agent-context observation regression: ok');
