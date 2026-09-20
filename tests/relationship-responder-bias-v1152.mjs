import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','systems/social/state.js','memory-retention-schema-v1133.js','systems/social/state.js','memory-deliberation-schema-v1134.js','social-outcome-memory-schema-v1135.js','presentation-schema-v1140.js','relationship-schema-v1150.js','systems/physical.js','systems/locomotion.js','crowding-runtime-v1200.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','relationship-runtime-v1150.js','affect-runtime-v1132.js','systems/social/animal-response.js','memory-retention-runtime-v1133.js','systems/social/human-response.js','memory-deliberation-runtime-v1134.js','social-outcome-memory-runtime-v1135.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js','state-validator-v1135.js','state-validator-v1150.js','state-validator-v1160.js','state-validator-v1190.js','state-validator-manifest.js'
];
loadRuntimeProfile(files);

const APP_VERSION='11.22.0-spatial-z-identity';
const RELATIONSHIP_VERSION='11.15.2-relationship-responder-bias';
const E=globalThis.SimEngine,W=globalThis.SimWorld,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const near=(actual,expected,eps=.001,msg='')=>assert.ok(Math.abs(actual-expected)<=eps,`${msg} expected ${expected}, got ${actual}`);
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const eventBy=pred=>E.getState().events.find(pred);
function calm(a,{social=43}={}){Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:8,social});a.traits.social=.5;a.action=null;a.activeIntent=null;a.offMap=false;a.episodicMemories=[];a.relationships={};}
function setRelationship(a,counterpart,{familiarity=1,affinity=0}={}){a.relationships[counterpart.id]={familiarity,affinity,lastUpdatedTick:E.getState().tick};}
function armTalk({affinity=0,seed=11520}={}){
  E.reset(seed);const st=E.getState(),requester=st.agents.zhou,responder=st.agents.zhen,animal=st.agents.orange;
  calm(requester,{social:70});calm(responder,{social:43});if(animal)animal.offMap=true;
  requester.position={x:5,y:5};responder.position={x:5,y:6};
  setRelationship(responder,requester,{familiarity:1,affinity});
  requester.action={kind:'talk',phase:'interact',targetAgent:responder.id,started:st.tick,wait:0};E.ensureIntentForAction?.(st,requester);
  assert.equal(SP.isAtInteraction(st,requester,{kind:'agent',id:responder.id},'social'),true);
  return {st,requester,responder};
}
function armPet({affinity=0,seed=11530}={}){
  E.reset(seed);const st=E.getState(),human=st.agents.zhou,animal=st.agents.orange,bystander=st.agents.zhen;
  calm(human,{social:65});calm(animal,{social:42});if(bystander)bystander.offMap=true;
  human.position={x:5,y:5};animal.position={x:5,y:6};
  setRelationship(animal,human,{familiarity:1,affinity});
  human.action={kind:'petAnimal',phase:'interact',targetAgent:animal.id,started:st.tick,wait:0};E.ensureIntentForAction?.(st,human);
  assert.equal(SP.isAtInteraction(st,human,{kind:'agent',id:animal.id},'social'),true);
  return {st,human,animal};
}

E.reset(11520);let st=E.getState();
assert.equal(st.version,APP_VERSION);
assert.equal(W.RELATIONSHIP_SCHEMA_VERSION,RELATIONSHIP_VERSION);
assert.equal(E.TALK_RELATIONSHIP_RESPONSE_CAP,.18);
assert.equal(E.PET_RELATIONSHIP_RESPONSE_CAP,.18);
noIssues('reset');

// Relationship exposes one directional, unitless signal; responders own how strongly they consume it.
let responder=st.agents.zhen,requester=st.agents.zhou;
calm(responder);calm(requester);
assert.equal(E.relationshipSignal(responder,requester.id),0);
setRelationship(responder,requester,{familiarity:.8,affinity:.5});near(E.relationshipSignal(responder,requester.id),.4);
setRelationship(responder,requester,{familiarity:.8,affinity:-.5});near(E.relationshipSignal(responder,requester.id),-.4);
setRelationship(responder,requester,{familiarity:0,affinity:1});assert.equal(E.relationshipSignal(responder,requester.id),0);
setRelationship(responder,requester,{familiarity:1,affinity:0});assert.equal(E.relationshipSignal(responder,requester.id),0);
setRelationship(responder,requester,{familiarity:99,affinity:99});assert.equal(E.relationshipSignal(responder,requester.id),1);
assert.equal(E.relationshipTargetDelta(responder,requester.id),8,'v11.15.1 target-preference scaling must remain unchanged');

// Human talk: same responder state, only responder→requester Relationship changes the response band.
({responder,requester}=armTalk({affinity:0,seed:11521}));
let neutralTalk=E.talkResponseEvaluation(responder,requester);
near(neutralTalk.baseScore,.451);near(neutralTalk.relationshipResponseDelta,0);near(neutralTalk.finalScore,.451);assert.equal(neutralTalk.response,'brief');
const generalTalkUtility=E.baseUtilityForAction(responder,'talk');
setRelationship(responder,requester,{familiarity:1,affinity:1});
let positiveTalk=E.talkResponseEvaluation(responder,requester);
near(positiveTalk.baseScore,neutralTalk.baseScore);near(positiveTalk.relationshipResponseDelta,.18);near(positiveTalk.finalScore,.631);assert.equal(positiveTalk.response,'engage');
assert.ok(E.talkResponseUtility(responder,requester)>E.talkResponseUtility(responder),'positive Relationship may raise responder-specific candidate utility');
assert.equal(E.baseUtilityForAction(responder,'talk'),generalTalkUtility,'Relationship responder bias must not change general talk Action utility');
setRelationship(responder,requester,{familiarity:1,affinity:-1});
let negativeTalk=E.talkResponseEvaluation(responder,requester);
near(negativeTalk.relationshipResponseDelta,-.18);near(negativeTalk.finalScore,.271);assert.equal(negativeTalk.response,'decline');
requester.relationships[responder.id]={familiarity:1,affinity:1,lastUpdatedTick:st.tick};
assert.equal(E.talkResponseFor(responder,requester),'decline','requester→responder Relationship must not leak into responder policy');

// Actual Human flow preserves the same directional counterfactual and does not leak private score decomposition into World Events.
armTalk({affinity:1,seed:11522});E.tick();st=E.getState();
let offer=eventBy(e=>e.data?.action==='talkOffer'),response=eventBy(e=>e.data?.responseToBid===offer?.id&&['acceptTalk','briefTalkReply','declineTalk'].includes(e.data?.action));
assert.equal(response?.data?.action,'acceptTalk');
for(const key of ['responseScore','baseResponseScore','relationshipResponseDelta','relationship','affinity','familiarity'])assert.equal(Object.hasOwn(response.data,key),false,`World Event must not leak ${key}`);
noIssues('positive human response');
armTalk({affinity:-1,seed:11523});E.tick();st=E.getState();
offer=eventBy(e=>e.data?.action==='talkOffer');response=eventBy(e=>e.data?.responseToBid===offer?.id&&['acceptTalk','briefTalkReply','declineTalk'].includes(e.data?.action));
assert.equal(response?.data?.action,'declineTalk');noIssues('negative human response');

// Animal pet response: same animal state, only animal→human Relationship changes accept/tolerate/avoid.
let human,animal;({human,animal}=armPet({affinity:0,seed:11531}));
let neutralPet=E.petResponseEvaluation(animal,human);
near(neutralPet.baseScore,.442);near(neutralPet.relationshipResponseDelta,0);near(neutralPet.finalScore,.442);assert.equal(neutralPet.response,'tolerate');
setRelationship(animal,human,{familiarity:1,affinity:1});
let positivePet=E.petResponseEvaluation(animal,human);
near(positivePet.relationshipResponseDelta,.18);near(positivePet.finalScore,.622);assert.equal(positivePet.response,'accept');
setRelationship(animal,human,{familiarity:1,affinity:-1});
let negativePet=E.petResponseEvaluation(animal,human);
near(negativePet.relationshipResponseDelta,-.18);near(negativePet.finalScore,.262);assert.equal(negativePet.response,'avoid');
human.relationships[animal.id]={familiarity:1,affinity:1,lastUpdatedTick:E.getState().tick};
assert.equal(E.petResponseFor(animal,human),'avoid','human→animal Relationship must not leak into animal responder policy');

// Actual animal flow uses the same bounded response modifier without persisting a responder cache.
armPet({affinity:1,seed:11532});E.tick();st=E.getState();
offer=eventBy(e=>e.data?.action==='petOffer');response=eventBy(e=>e.data?.responseToBid===offer?.id&&['acceptPet','toleratePet','avoidPet'].includes(e.data?.action));
assert.equal(response?.data?.action,'acceptPet');
for(const key of ['responseScore','baseResponseScore','relationshipResponseDelta','relationship','affinity','familiarity'])assert.equal(Object.hasOwn(response.data,key),false,`World Event must not leak ${key}`);
for(const a of Object.values(st.agents)){assert.equal(Object.hasOwn(a,'talkResponseScore'),false);assert.equal(Object.hasOwn(a,'petResponseScore'),false);assert.equal(Object.hasOwn(a,'relationshipResponseDelta'),false);}
noIssues('positive animal response');
armPet({affinity:-1,seed:11533});E.tick();st=E.getState();
offer=eventBy(e=>e.data?.action==='petOffer');response=eventBy(e=>e.data?.responseToBid===offer?.id&&['acceptPet','toleratePet','avoidPet'].includes(e.data?.action));
assert.equal(response?.data?.action,'avoidPet');noIssues('negative animal response');

console.log('v11.15.2 relationship responder bias regression remains valid under v11.20.0');
