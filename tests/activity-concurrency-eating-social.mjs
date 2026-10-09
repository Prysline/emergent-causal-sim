import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const noIssues=label=>{const result=V.validateState(E.getState());assert.equal(result.issueCount,0,`${label}: ${result.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const eventBy=predicate=>E.getState().events.find(predicate);

function armEating({seed=15100,withRequester=false,responderSocial=90}={}){
  E.reset(seed);
  const st=E.getState(),requester=st.agents.zhou,responder=st.agents.zhen,cat=st.agents.orange,plate=st.containers.plateA;
  cat.offMap=true;
  requester.offMap=false;responder.offMap=false;
  requester.position={x:5,y:5};responder.position={x:5,y:6};
  requester.action=null;requester.activeIntent=null;responder.action=null;responder.activeIntent=null;
  Object.assign(requester.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:70});
  Object.assign(responder.needs,{hunger:70,thirst:18,fatigue:18,sleepNeed:18,social:responderSocial});
  plate.contents={food:6};delete plate.supportId;plate.position={...responder.position};responder.held=plate.id;
  responder.action={kind:'eat',phase:'eatingPlate',container:plate.id,started:st.tick,wait:0};
  E.ensureIntentForAction?.(st,responder);
  if(withRequester){
    requester.action={kind:'talk',phase:'interact',targetAgent:responder.id,started:st.tick,wait:0};
    E.ensureIntentForAction?.(st,requester);
    assert.equal(SP.isAtInteraction(st,requester,{kind:'agent',id:responder.id},'social'),true);
  }
  return {st,requester,responder,plate};
}

{
  const {responder,plate}=armEating({seed:15101});
  const originalAction=responder.action;
  E.tick();
  assert.equal(E.amountAt(plate.id,'food'),0,'baseline eating must keep its existing one-tick completion behavior');
  assert.equal(responder.action,null,'baseline eating must still complete normally');
  assert.notEqual(originalAction,null);
  noIssues('baseline');
}

{
  const {st,responder,plate}=armEating({seed:15102});
  const scheduled=E.scheduleTransientExecution(st,responder,{kind:'socialListening',sourceId:'listening-regression',executionTick:st.tick+1});
  assert.equal(scheduled.scheduled,true);
  assert.equal(scheduled.record.compatibility.primaryProgressScale,1,'listening v1 must not reduce eating progress');
  E.tick();
  assert.equal(E.amountAt(plate.id,'food'),0,'listening-compatible execution must leave baseline eating progress unchanged');
  assert.equal(responder.action,null);
  assert.equal(E.transientExecutionFor(E.getState(),responder),null,'the listening transient must settle after its execution tick');
  noIssues('listening');
}

{
  const {responder,plate}=armEating({seed:15103,withRequester:true,responderSocial:90});
  const originalAction=responder.action;
  E.tick();
  const offer=eventBy(e=>e.data?.action==='talkOffer'&&e.data?.target===responder.id);
  const response=offer&&eventBy(e=>e.data?.action==='acceptTalk'&&e.data?.responseToBid===offer.id);
  const talk=offer&&eventBy(e=>e.data?.action==='talk'&&e.data?.talkOfferId===offer.id);
  assert.ok(offer?.data?.socialBid,'speaking must originate from the canonical talkOffer World Event');
  assert.ok(response,'compatible speaking must still create the responder-owned canonical response event');
  assert.ok(talk,'engaged response must still create the canonical talk outcome');
  assert.equal(talk.data.talkResponseEventId,response.id);
  assert.equal(E.amountAt(plate.id,'food'),6,'speaking must pause only this tick of eating progress');
  assert.equal(responder.action,originalAction,'speaking must preserve the ongoing primary eating Action identity');
  assert.equal(responder.action.phase,'eatingPlate');
  assert.equal(responder.activeIntent?.kind,'satisfyHunger','speaking must not replace the primary eating Intent');
  assert.equal(E.transientExecutionFor(E.getState(),responder),null,'the speaking transient must settle after its execution tick');
  noIssues('speaking');

  E.tick();
  assert.equal(E.amountAt(plate.id,'food'),0,'after the transient, the existing eating Action must resume remaining progress');
  assert.equal(responder.action,null,'the original eating lifecycle may complete after resuming');
  noIssues('continuation');
}

{
  E.reset(15104);
  const st=E.getState(),sleeper=st.agents.zhen;
  sleeper.action={kind:'sleep',phase:'sleeping',sleepTicks:3,started:st.tick,wait:0};
  const compatibility=E.activityCompatibilityFor(sleeper,'socialSpeaking');
  assert.equal(compatibility.allowed,false);
  assert.equal(compatibility.requiresTransition,true,'sleeping + speaking must require a formal transition');
  const scheduled=E.scheduleTransientExecution(st,sleeper,{kind:'socialSpeaking',sourceId:'sleep-incompatible',executionTick:st.tick+1});
  assert.equal(scheduled.scheduled,false);
  assert.equal(scheduled.reason,'transition-required');
}

{
  const rules=E.listActivityCompatibility();
  assert.deepEqual(rules.map(rule=>[rule.id,rule.primaryProgressScale]),[
    ['humanSocial.eat-listening',1],
    ['humanSocial.eat-speaking',0]
  ]);
  assert.equal(Object.hasOwn(E.getState().agents.zhen,'conversation'),false,'the slice must not create persistent Conversation truth');
}

console.log('Activity concurrency eating + social regression: ok');
