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
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/appraisal/human-social-response.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js','systems/social/human-response.js','systems/memory/deliberation.js','systems/memory/social-outcome.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js','validation/rules/human-social-response.js','validation/rules/memory-deliberation.js','validation/rules/social-outcome-memory.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
function addHuman(st,id,name,position){
  const clone=structuredClone(st.agents.zhou);clone.id=id;clone.name=name;clone.position={...position};clone.action=null;clone.activeIntent=null;clone.episodicMemories=[];clone.observedSocialBids=[];delete clone.pendingInteraction;clone.offMap=false;clone.affect={valence:0,activation:0,frustration:0,lastUpdatedTick:st.tick,lastDecayTick:st.tick,source:null};st.agents[id]=clone;return clone;
}
function calm(a,{social=70}={}){Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:8,social});a.action=null;a.activeIntent=null;a.offMap=false;}
function makeOutcome(st,requester,responder,{context='observedIdle',tick=st.tick}={}){
  st.tick=tick;
  const offerId=E.addEvent(`${requester.name}測試聊天邀請。`,'normal',[],{actor:requester.id,target:responder.id,action:'talkOffer',socialBid:true,bidKind:'talkOffer',bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:true,position:E.positionRef(requester.position)});
  const offer=st.causes[offerId];offer.data.bidId=offerId;
  const waitId=E.addEvent(`${requester.name}沒有得到立即回應。`,'normal',[offerId],{actor:requester.id,action:'socialWaitEnded',bidId:offerId,bidKind:'talkOffer',visibility:'private',owner:requester.id,responderContextObserved:context!=='unobserved'});
  const wait=st.causes[waitId];
  if(context==='sleeping'){wait.data.observedResponderActionKind='sleep';wait.data.observedResponderPosture='lying';}
  else if(context==='highCommitment'){wait.data.observedResponderActionKind='drinkWater';wait.data.observedResponderPosture='standing';}
  else if(context==='observedAction'){wait.data.observedResponderActionKind='wander';wait.data.observedResponderPosture='standing';}
  else if(context==='observedIdle'){wait.data.observedResponderActionKind=null;wait.data.observedResponderPosture='standing';}
  return {offer,wait,memory:E.rememberRequesterSocialOutcome(st,wait)};
}

E.reset(11350);let st=E.getState();
assert.equal(st.version,'11.22.2-editor-furniture-definitions');
assert.equal(E.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION,'11.13.5-requester-social-outcome-memory');
assert.deepEqual(E.SOCIAL_OUTCOME_CONTEXT_CONGRUENCE,{unobserved:-.22,sleeping:-.05,highCommitment:-.12,observedAction:-.28,observedIdle:-.45});
noIssues('reset');

// Real talkOffer -> requester-private timeout produces one private outcome memory, not a fake responder event.
st=E.prepareHumanTalkScenario('talk-no-response',11351);let requester=st.agents.zhou,responder=st.agents.zhen;
for(let i=0;i<8&&!requester.episodicMemories.some(m=>m.episodeKind==='privateSocialOutcome');i++)E.tick();
st=E.getState();requester=st.agents.zhou;responder=st.agents.zhen;
const wait=st.events.find(e=>e.data?.action==='socialWaitEnded'&&e.data?.bidKind==='talkOffer');
const privateMemory=requester.episodicMemories.find(m=>m.episodeKind==='privateSocialOutcome');
assert.ok(wait&&privateMemory,'real no-response lifecycle should form requester-private historical memory');
assert.equal(privateMemory.sourceEventId,wait.id);
assert.equal(privateMemory.observed,undefined,'private outcome must not masquerade as observable world-event projection');
assert.equal(privateMemory.experienced.kind,'socialNoResponse');
assert.equal(privateMemory.experienced.counterpartId,'zhen');
assert.equal(privateMemory.experienced.contextKind,'highCommitment');
assert.equal(privateMemory.appraisal.agency.kind,'unknown','counterpart association must not become causal attribution');
assert.equal(privateMemory.appraisal.goalCongruence,-.12);
assert.equal(requester.affect.source?.memoryId,privateMemory.id,'private outcome appraisal should flow into existing short-lived Affect');
assert.equal(st.events.some(e=>e.data?.responseToBid===privateMemory.experienced.bidId),false,'no-response must remain absence of responder response event at wait end');
assert.equal(st.events.some(e=>['ignoreTalk','rejectedBy','disliked'].includes(e.data?.action)),false,'no-response must not create inferred rejection world events');
assert.ok(E.targetAssociation(st,requester,'zhen').memoryUtilityDelta<0,'private no-response experience should feed existing target-aware deliberation');
noIssues('real no-response memory');

// Observable context changes appraisal strength; counterpart never becomes agency.
E.reset(21350);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;requester.position={x:5,y:5};responder.position={x:5,y:6};calm(requester,{social:70});calm(responder,{social:20});st.agents.orange.offMap=true;
const sleeping=makeOutcome(st,requester,responder,{context:'sleeping',tick:10}).memory;
const idle=makeOutcome(st,requester,responder,{context:'observedIdle',tick:11}).memory;
assert.equal(sleeping.appraisal.goalCongruence,-.05);
assert.equal(idle.appraisal.goalCongruence,-.45);
assert.ok(Math.abs(idle.appraisal.goalCongruence)>Math.abs(sleeping.appraisal.goalCongruence),'visible idle no-response should be appraised more negatively than visible sleep');
assert.equal(sleeping.appraisal.agency.kind,'unknown');assert.equal(idle.appraisal.agency.kind,'unknown');
assert.equal(E.memorySignature(sleeping),'privateSocialOutcome|socialNoResponse|zhou');
noIssues('observable context bands');

// Unobservable responder private state must not change requester interpretation.
E.reset(31350);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;requester.position={x:5,y:5};responder.position={x:5,y:6};calm(requester,{social:60});calm(responder,{social:20});st.agents.orange.offMap=true;
responder.activeIntent={id:'private-a',kind:'socialize',createdTick:0,lifecycle:'open',source:{type:'test'}};
const aMemory=makeOutcome(st,requester,responder,{context:'unobserved',tick:20}).memory;
responder.activeIntent={id:'private-b',kind:'satisfyThirst',createdTick:0,lifecycle:'open',source:{type:'test'}};
const bMemory=makeOutcome(st,requester,responder,{context:'unobserved',tick:21}).memory;
assert.equal(aMemory.appraisal.goalCongruence,bMemory.appraisal.goalCongruence);
assert.equal(aMemory.appraisal.relevance,bMemory.appraisal.relevance);
assert.equal(aMemory.experienced.observedResponderActionKind,null);assert.equal(bMemory.experienced.observedResponderActionKind,null);
responder.activeIntent=null;
noIssues('private-state counterfactual');

// If an observable response already exists at wait end, no-response private memory must not form.
E.reset(41350);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;requester.position={x:5,y:5};responder.position={x:5,y:6};calm(requester);calm(responder);st.agents.orange.offMap=true;
const offerId=E.addEvent('offer','normal',[],{actor:'zhen',target:'zhou',action:'talkOffer',socialBid:true,bidKind:'talkOffer',bidFrom:'zhen',bidTo:'zhou',perceivedByTarget:true});st.causes[offerId].data.bidId=offerId;
E.addEvent('brief','normal',[offerId],{actor:'zhou',target:'zhen',action:'briefTalkReply',responseToBid:offerId,talkResponse:'brief'});
const waitId=E.addEvent('wait','normal',[offerId],{actor:'zhen',action:'socialWaitEnded',bidId:offerId,bidKind:'talkOffer',visibility:'private',owner:'zhen',responderContextObserved:true,observedResponderActionKind:null,observedResponderPosture:'standing'});
assert.equal(E.rememberRequesterSocialOutcome(st,st.causes[waitId]),null,'observable response present at wait end must block no-response private memory');
assert.equal(requester.episodicMemories.some(m=>m.episodeKind==='privateSocialOutcome'&&m.experienced?.bidId===offerId),false);
noIssues('response-before-wait-end exclusion');

// A response that arrives after requester patience ended is a later experience; it must not erase the earlier wait-end memory.
E.reset(46350);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;requester.position={x:5,y:5};responder.position={x:5,y:6};calm(requester);calm(responder);st.agents.orange.offMap=true;
const late=makeOutcome(st,requester,responder,{context:'observedAction',tick:10});
assert.ok(late.memory,'wait-end should form private outcome before late response exists');
st.tick=11;
E.addEvent('late brief','normal',[late.offer.id],{actor:'zhou',target:'zhen',action:'briefTalkReply',responseToBid:late.offer.id,talkResponse:'brief'});
assert.ok(requester.episodicMemories.includes(late.memory),'late response must not retroactively erase requester wait-end history');
assert.equal(late.memory.observedTick,10);
noIssues('late response coexistence');

// Repeated distinct no-response episodes may lower one target preference enough to prefer a farther neutral target, without hard blacklist.
E.reset(51350);st=E.getState();st.tick=30;requester=st.agents.zhen;responder=st.agents.zhou;requester.position={x:5,y:5};responder.position={x:5,y:6};calm(requester,{social:95});calm(responder);st.agents.orange.offMap=true;const mei=addHuman(st,'mei','小梅',{x:7,y:5});calm(mei,{social:20});
makeOutcome(st,requester,responder,{context:'observedIdle',tick:30});makeOutcome(st,requester,responder,{context:'observedIdle',tick:31});makeOutcome(st,requester,responder,{context:'observedIdle',tick:32});
const assoc=E.targetAssociation(st,requester,'zhou');const base=E.utilityForIntent(st,requester,'socialize'),evals=E.targetEvaluations(st,requester,'socialize',base);
assert.equal(assoc.contributions.length,3);assert.ok(assoc.memoryUtilityDelta<0);
assert.equal(evals[0].targetAgent,'mei','repeated no-response experience may outweigh a modest distance difference');
assert.ok(evals.find(x=>x.targetAgent==='zhou').finalUtility>0,'negative experience must remain bounded rather than hard blacklist');
noIssues('repeated outcome target influence');

// Private outcomes share the same 64-memory bounded retention store and recurrence stays counterpart-specific.
E.reset(61350);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;requester.position={x:5,y:5};responder.position={x:5,y:6};calm(requester,{social:60});calm(responder);st.agents.orange.offMap=true;
for(let i=0;i<70;i++)makeOutcome(st,requester,responder,{context:i%2?'unobserved':'observedAction',tick:i});
assert.ok(requester.episodicMemories.length<=E.MAX_EPISODIC_MEMORIES,'private outcomes must use the same bounded episodic store');
assert.equal(Object.prototype.hasOwnProperty.call(requester,'socialOutcomeMemories'),false);
assert.ok(requester.episodicMemories.some(m=>m.episodeKind==='privateSocialOutcome'));
noIssues('bounded shared retention');

// Long-run integration remains validator-clean and adds no relationship-like mirrors.
E.reset(71350);const forbidden=['socialOutcomeMemories','noResponseMemories','rejectionScore','ignoredBy','socialOutcomeScore','relationshipScore'];
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const agent of Object.values(st.agents||{})){
    assert.ok((agent.episodicMemories||[]).length<=E.MAX_EPISODIC_MEMORIES);
    for(const key of forbidden)assert.equal(Object.prototype.hasOwnProperty.call(agent,key),false,`${agent.id} persisted ${key}`);
  }
  if(i%25===0)noIssues(`tick ${i+1}`);
}
noIssues('500 tick integration');
console.log('v11.13.5 requester-experienced social outcome memory regression: ok');
