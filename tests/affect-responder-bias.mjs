import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js','systems/relationship/state.js','systems/physical.js','spatial-passage.js','systems/locomotion.js','crowding-runtime-v1200.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/appraisal/human-social-response.js','systems/relationship/runtime.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js','systems/social/human-response.js','systems/memory/deliberation.js','systems/memory/social-outcome.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js','validation/rules/human-social-response.js','validation/rules/memory-deliberation.js','validation/rules/social-outcome-memory.js','validation/rules/relationship.js','validation/rules/physical-profile.js','validation/rules/locomotion-execution.js','validation/manifest.js'
];
loadRuntimeProfile(files);

const APP_VERSION='11.35.0-affect-responder-bias';
const AFFECT_VERSION='11.35.0-affect-responder-bias';
const E=globalThis.SimEngine,W=globalThis.SimWorld,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const near=(actual,expected,eps=.001,msg='')=>assert.ok(Math.abs(actual-expected)<=eps,`${msg} expected ${expected}, got ${actual}`);
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const eventBy=pred=>E.getState().events.find(pred);
function setAffect(a,valence,frustration,{activation=0,tick=E.getState()?.tick??0}={}){
  const active=Math.abs(valence)+activation+frustration>0;
  a.affect={valence,activation,frustration,lastUpdatedTick:tick,lastDecayTick:tick,source:active?{memoryId:`memory:${a.id}:affect-responder-fixture`,sourceEventId:'affect-responder-fixture',appraisedTick:tick,appliedTick:tick}:null};
  return a.affect;
}
function calm(a,{social=50}={}){Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:8,social});a.traits.social=.5;a.action=null;a.activeIntent=null;a.offMap=false;a.episodicMemories=[];a.relationships={};setAffect(a,0,0);}
function relation(a,b,affinity){a.relationships[b.id]={familiarity:1,affinity,lastUpdatedTick:E.getState().tick};}

E.reset(13500);let st=E.getState();
assert.equal(st.version,APP_VERSION);
assert.equal(E.AFFECT_SCHEMA_VERSION,AFFECT_VERSION);
assert.equal(E.TALK_AFFECT_RESPONSE_CAP,.12);
assert.equal(E.PET_AFFECT_RESPONSE_CAP,.12);
assert.ok(E.listRuntimeHooks('beforeTick').find(x=>x.id==='affect.decay').order<E.listRuntimeHooks('beforeTick').find(x=>x.id==='humanSocial.prepare').order,'Affect decay must precede Human responder preparation');

let human=st.agents.zhen;
setAffect(human,0,0);near(E.affectResponseSignal(human),0);
setAffect(human,.8,0);near(E.affectResponseSignal(human),.8);
setAffect(human,-.4,.7);near(E.affectResponseSignal(human),-1);
setAffect(human,0,0,{activation:1});near(E.affectResponseSignal(human),0,'activation alone must not change response willingness');
setAffect(human,99,0);near(E.affectResponseSignal(human),1);
setAffect(human,-99,99);near(E.affectResponseSignal(human),-1);

E.reset(13501);st=E.getState();let responder=st.agents.zhen,requester=st.agents.zhou;calm(responder,{social:50});calm(requester,{social:70});
const generalTalk=E.baseUtilityForAction(responder,'talk');
let neutralTalk=E.talkResponseEvaluation(responder,requester);
near(neutralTalk.baseScore,.5);near(neutralTalk.affectResponseDelta,0);near(neutralTalk.relationshipResponseDelta,0);near(neutralTalk.finalScore,.5);assert.equal(neutralTalk.response,'brief');
setAffect(responder,1,0);
let positiveTalk=E.talkResponseEvaluation(responder,requester);
near(positiveTalk.affectResponseDelta,.12);near(positiveTalk.finalScore,.62);assert.equal(positiveTalk.response,'engage');
setAffect(responder,-1,1);
let negativeTalk=E.talkResponseEvaluation(responder,requester);
near(negativeTalk.affectResponseDelta,-.12);near(negativeTalk.finalScore,.38);assert.equal(negativeTalk.response,'brief');
assert.equal(E.baseUtilityForAction(responder,'talk'),generalTalk,'Affect responder bias must not change general talk Action utility');

setAffect(responder,1,0);relation(responder,requester,1);
let stackedTalk=E.talkResponseEvaluation(responder,requester);
near(stackedTalk.affectResponseDelta,.12);near(stackedTalk.relationshipResponseDelta,.18);near(stackedTalk.finalScore,.8);
const beforeRequesterMutation=structuredClone(stackedTalk);setAffect(requester,-1,1,{activation:1});
assert.deepEqual(E.talkResponseEvaluation(responder,requester),beforeRequesterMutation,'requester Affect must not enter Human responder scoring');

E.reset(13502);st=E.getState();const initiator=st.agents.zhen;calm(initiator,{social:70});st.agents.zhou.position={x:5,y:6};initiator.position={x:5,y:5};st.agents.orange.offMap=true;
const base=E.utilityForIntent(st,initiator,'socialize');
const rankingBefore=E.targetEvaluations(st,initiator,'socialize',base).map(x=>({targetAgent:x.targetAgent,targetPreference:x.targetPreference,finalUtility:x.finalUtility}));
setAffect(initiator,-1,1,{activation:1});
const rankingAfter=E.targetEvaluations(st,initiator,'socialize',base).map(x=>({targetAgent:x.targetAgent,targetPreference:x.targetPreference,finalUtility:x.finalUtility}));
assert.deepEqual(rankingAfter,rankingBefore,'Current Affect must not alter initiator social target ranking');

E.reset(13503);st=E.getState();const animal=st.agents.orange;human=st.agents.zhou;calm(animal,{social:50});calm(human,{social:65});
let neutralPet=E.petResponseEvaluation(animal,human);
near(neutralPet.baseScore,.5);near(neutralPet.affectResponseDelta,0);near(neutralPet.finalScore,.5);assert.equal(neutralPet.response,'tolerate');
setAffect(animal,1,0);
let positivePet=E.petResponseEvaluation(animal,human);
near(positivePet.affectResponseDelta,.12);near(positivePet.finalScore,.62);assert.equal(positivePet.response,'accept');
setAffect(animal,-1,1);
let negativePet=E.petResponseEvaluation(animal,human);
near(negativePet.affectResponseDelta,-.12);near(negativePet.finalScore,.38);assert.equal(negativePet.response,'tolerate');
relation(animal,human,-1);
let stackedPet=E.petResponseEvaluation(animal,human);
near(stackedPet.affectResponseDelta,-.12);near(stackedPet.relationshipResponseDelta,-.18);near(stackedPet.finalScore,.2);assert.equal(stackedPet.response,'avoid');
const petBeforeRequesterMutation=structuredClone(stackedPet);setAffect(human,1,0,{activation:1});
assert.deepEqual(E.petResponseEvaluation(animal,human),petBeforeRequesterMutation,'requester Affect must not enter animal responder scoring');

E.reset(13504);st=E.getState();requester=st.agents.zhou;responder=st.agents.zhen;const cat=st.agents.orange;cat.offMap=true;
calm(requester,{social:70});calm(responder,{social:52});requester.position={x:5,y:5};responder.position={x:5,y:6};
setAffect(responder,1,0);requester.action={kind:'talk',phase:'interact',targetAgent:responder.id,started:st.tick,wait:0};E.ensureIntentForAction?.(st,requester);
assert.equal(SP.isAtInteraction(st,requester,{kind:'agent',id:responder.id},'social'),true);
E.tick();st=E.getState();
let offer=eventBy(e=>e.data?.action==='talkOffer'),response=eventBy(e=>e.data?.responseToBid===offer?.id&&['acceptTalk','briefTalkReply','declineTalk'].includes(e.data?.action));
assert.equal(response?.data?.action,'acceptTalk','decayed positive Current Affect should still cross this focused engage threshold');
for(const key of ['responseScore','baseResponseScore','finalScore','affectResponseSignal','affectResponseDelta','relationshipResponseDelta','affect','valence','frustration','activation'])assert.equal(Object.hasOwn(response.data,key),false,`World Event must not leak ${key}`);
for(const a of Object.values(st.agents))for(const key of ['affectResponseSignal','affectResponseDelta','talkResponseScore','petResponseScore'])assert.equal(Object.hasOwn(a,key),false,`${a.id} must not persist ${key}`);
noIssues('actual human affect responder flow');

E.reset(13505);st=E.getState();human=st.agents.zhou;const pet=st.agents.orange;const bystander=st.agents.zhen;bystander.offMap=true;
calm(human,{social:65});calm(pet,{social:33});human.position={x:5,y:5};pet.position={x:5,y:6};setAffect(pet,-1,1);
human.action={kind:'petAnimal',phase:'interact',targetAgent:pet.id,started:st.tick,wait:0};E.ensureIntentForAction?.(st,human);
E.tick();st=E.getState();
offer=eventBy(e=>e.data?.action==='petOffer');response=eventBy(e=>e.data?.responseToBid===offer?.id&&['acceptPet','toleratePet','avoidPet'].includes(e.data?.action));
assert.equal(response?.data?.action,'avoidPet','negative Current Affect should cross this focused avoid threshold');
for(const key of ['responseScore','baseResponseScore','finalScore','affectResponseSignal','affectResponseDelta','relationshipResponseDelta','affect','valence','frustration','activation'])assert.equal(Object.hasOwn(response.data,key),false,`World Event must not leak ${key}`);
noIssues('actual animal affect responder flow');

console.log('Affect responder bias regression: ok');
