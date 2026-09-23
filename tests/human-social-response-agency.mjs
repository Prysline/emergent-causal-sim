import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/appraisal/human-social-response.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js','systems/social/human-response.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js','validation/rules/human-social-response.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const eventBy=(pred)=>E.getState().events.find(pred);
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId].episodicMemories.find(m=>m.sourceEventId===eventId);

function armDirectTalk(social,{seed=11331,thirst=18}={}){
  E.reset(seed);const st=E.getState(),requester=st.agents.zhou,responder=st.agents.zhen,cat=st.agents.orange;
  requester.position={x:5,y:5};responder.position={x:5,y:6};cat.offMap=true;
  requester.action=null;requester.activeIntent=null;responder.action=null;responder.activeIntent=null;
  Object.assign(requester.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:70});
  Object.assign(responder.needs,{hunger:18,thirst,fatigue:18,sleepNeed:18,social});
  requester.action={kind:'talk',phase:'interact',targetAgent:responder.id,started:st.tick,wait:0};
  E.ensureIntentForAction?.(st,requester);
  assert.equal(SP.isAtInteraction(st,requester,{kind:'agent',id:responder.id},'social'),true);
  return st;
}

E.reset(11330);let st=E.getState(),responder=st.agents.zhen;
responder.needs.social=0;assert.equal(E.talkResponseFor(responder),'decline');
responder.needs.social=35;assert.equal(E.talkResponseFor(responder),'brief');
responder.needs.social=90;assert.equal(E.talkResponseFor(responder),'engage');
const scoreBefore=E.talkEngagementScore(responder),utilityBefore=E.talkResponseUtility(responder),neutral=structuredClone(responder.affect);
responder.affect={valence:-1,activation:1,frustration:1,lastUpdatedTick:0,lastDecayTick:0,source:null};
assert.equal(E.talkEngagementScore(responder),scoreBefore);assert.equal(E.talkResponseUtility(responder),utilityBefore);
responder.affect=neutral;noIssues('response bands');

armDirectTalk(90,{seed:21331});E.tick();st=E.getState();
assert.equal(st.version,'11.28.1-furniture-facing-semantics');
const engageOffer=eventBy(e=>e.data?.action==='talkOffer'),accept=eventBy(e=>e.data?.action==='acceptTalk'&&e.data?.responseToBid===engageOffer?.id),talk=eventBy(e=>e.data?.action==='talk'&&e.data?.talkOfferId===engageOffer?.id);
assert.ok(engageOffer?.data?.socialBid);assert.ok(accept);assert.ok(talk);
assert.equal(talk.data.talkResponseEventId,accept.id);assert.equal(talk.data.talkResponse,'engage');assert.equal(Object.hasOwn(talk.data,'responseToBid'),false,'full talk is an outcome, not a second responder event');
assert.ok(memoryFor('zhou',accept.id)?.appraisal?.goalCongruence>0);assert.ok(memoryFor('zhen',talk.id)?.appraisal?.goalCongruence>0);noIssues('engage');

armDirectTalk(35,{seed:31331});E.tick();st=E.getState();
const briefOffer=eventBy(e=>e.data?.action==='talkOffer'),brief=eventBy(e=>e.data?.action==='briefTalkReply'&&e.data?.responseToBid===briefOffer?.id);
assert.ok(brief);assert.equal(st.events.some(e=>e.data?.action==='talk'&&e.data?.talkOfferId===briefOffer.id),false);
const briefMemory=memoryFor('zhou',brief.id);assert.equal(briefMemory?.appraisal?.ruleId,'briefTalkReply-v1');assert.ok(briefMemory.appraisal.goalCongruence<0);noIssues('brief');

armDirectTalk(0,{seed:41331});E.tick();st=E.getState();
const declineOffer=eventBy(e=>e.data?.action==='talkOffer'),decline=eventBy(e=>e.data?.action==='declineTalk'&&e.data?.responseToBid===declineOffer?.id);
assert.ok(decline);assert.equal(st.events.some(e=>e.data?.action==='talk'&&e.data?.talkOfferId===declineOffer.id),false);
const declineMemory=memoryFor('zhou',decline.id);assert.equal(declineMemory?.appraisal?.ruleId,'declineTalk-v1');
assert.equal(declineMemory.appraisal.goalCongruence,briefMemory.appraisal.goalCongruence);assert.equal(declineMemory.appraisal.relevance,briefMemory.appraisal.relevance);
for(const e of [brief,decline])for(const key of ['responseScore','socialNeed','socialTrait','affect','relationship','intentionalIgnore'])assert.equal(Object.hasOwn(e.data,key),false);noIssues('decline');

armDirectTalk(80,{seed:51331,thirst:95});E.tick();st=E.getState();const noResponseOffer=eventBy(e=>e.data?.action==='talkOffer');assert.ok(noResponseOffer);
for(let i=0;i<5&&!eventBy(e=>e.data?.action==='socialWaitEnded'&&e.data?.bidId===noResponseOffer.id);i++)E.tick();st=E.getState();
const waitEnded=eventBy(e=>e.data?.action==='socialWaitEnded'&&e.data?.bidId===noResponseOffer.id);assert.ok(waitEnded);
assert.equal(st.events.some(e=>e.data?.responseToBid===noResponseOffer.id&&['acceptTalk','briefTalkReply','declineTalk'].includes(e.data?.action)),false);
assert.equal(waitEnded.data.visibility,'private');assert.equal(waitEnded.data.bidKind,'talkOffer');
for(const key of ['ignored','intentionalIgnore','disliked','rejectedBy'])assert.equal(Object.hasOwn(waitEnded.data,key),false);
assert.equal(memoryFor('zhou',waitEnded.id),undefined);noIssues('no response');

const weight=(kind,observed=true,posture='standing')=>E.noResponseInterpretationWeight({data:{action:'socialWaitEnded',bidKind:'talkOffer',responderContextObserved:observed,observedResponderActionKind:kind,observedResponderPosture:posture}});
assert.ok(weight('sleep',true,'lying')<weight('eat')&&weight('eat')<weight('wander')&&weight('wander')<weight(null));
assert.ok(weight('sleep',true,'lying')<weight(null,false)&&weight(null,false)<weight(null));

E.reset(61331);for(let i=0;i<500;i++){E.tick();for(const a of Object.values(E.getState().agents))for(const key of ['talkResponseDecision','talkResponseScore','talkResponseUtility','socialResponsePriority','ignoredBy'])assert.equal(Object.hasOwn(a,key),false);noIssues(`tick ${i+1}`);}
console.log('v11.13.3a human social response agency regression: ok');
