import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js','interruption-schema-v1123.js','deliberation-schema-v1124.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js','memory-retention-schema-v1133.js','human-social-response-schema-v1133a.js','memory-deliberation-schema-v1134.js','social-outcome-memory-schema-v1135.js','presentation-schema-v1140.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js','intent-runtime-v1123.js','intent-runtime-v1124.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js','memory-retention-runtime-v1133.js','human-social-response-runtime-v1133a.js','memory-deliberation-runtime-v1134.js','social-outcome-memory-runtime-v1135.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js','state-validator-v1135.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId]?.episodicMemories?.find(m=>m.sourceEventId===eventId)||null;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

let beforePetResolve=null;
let afterPetResolve=null;
let created=[];

function responseEvent(){
  return E.getState().events.find(e=>['acceptPet','toleratePet','avoidPet'].includes(e.data?.action));
}
function snapshotRequester(event){
  const memory=event&&memoryFor('zhou',event.id);
  return event?{
    eventId:event.id,
    eventTick:event.tick,
    action:event.data?.action||null,
    hasMemory:!!memory,
    observedTick:memory?.observedTick??null,
    appraisalRule:memory?.appraisal?.ruleId||null,
    affectSourceEventId:E.getState().agents.zhou?.affect?.source?.sourceEventId||null
  }:null;
}

E.registerRuntimeHook('afterTick','test.pet-timing-before-resolve',()=>{
  const event=responseEvent();
  beforePetResolve={responseExists:!!event,offerExists:E.getState().events.some(e=>e.data?.action==='petOffer')};
},550);

E.registerRuntimeHook('afterTick','test.pet-timing-after-resolve',()=>{
  const event=responseEvent();
  afterPetResolve=event?snapshotRequester(event):null;
},650);

E.registerRuntimeHook('episodicMemoryCreated','test.pet-timing-created-probe',(ctx)=>{
  created.push({
    agentId:ctx.agent.id,
    sourceEventId:ctx.memory.sourceEventId,
    appraisalRule:ctx.memory.appraisal?.ruleId||null,
    affectSourceEventId:ctx.agent.affect?.source?.sourceEventId||null
  });
},450);

E.reset(45500);let st=E.getState();
const human=st.agents.zhou,cat=st.agents.orange,bystander=st.agents.zhen;
human.position={x:5,y:5};cat.position={x:5,y:6};bystander.position={x:7,y:5};
Object.assign(human.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:65});
Object.assign(cat.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,groomingNeed:20,social:5});
human.action={kind:'petAnimal',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};
E.ensureIntentForAction?.(st,human);
assert.equal(SP.isAtInteraction(st,human,{kind:'agent',id:cat.id},'social'),true,'fixture must begin in social range');

E.tick();st=E.getState();
const offer=st.events.find(e=>e.data?.action==='petOffer');
const response=st.events.find(e=>e.data?.responseToBid===offer?.id&&['acceptPet','toleratePet','avoidPet'].includes(e.data?.action));
assert.ok(offer&&response,'low-social pet fixture must produce petOffer and avoidPet response');
assert.equal(response.data.action,'avoidPet','fixture must stay on deterministic avoid path');
assert.deepEqual(beforePetResolve,{responseExists:false,offerExists:false},'pet offer/response must not exist before socialResponse.resolve-pet-offers at 600');
assert.ok(afterPetResolve,'probe after order 600 must see the pet response');
assert.equal(afterPetResolve.eventId,response.id);
assert.equal(afterPetResolve.action,'avoidPet');
assert.equal(afterPetResolve.hasMemory,true,'requester Memory must exist immediately after pet response resolution');
assert.equal(afterPetResolve.appraisalRule,'avoidPet-v1','requester Appraisal must complete before afterTick 650');
assert.equal(afterPetResolve.eventTick,1);
assert.equal(afterPetResolve.observedTick,response.tick,'pet response Memory must preserve event creation tick');
assert.equal(afterPetResolve.affectSourceEventId,response.id,'requester Affect must already reflect the response before Memory→Deliberation 800');
const requesterCreated=created.filter(x=>x.agentId==='zhou'&&x.sourceEventId===response.id);
assert.equal(requesterCreated.length,1,'pet response must create exactly one requester episode');
assert.equal(requesterCreated[0].appraisalRule,'avoidPet-v1');
assert.equal(requesterCreated[0].affectSourceEventId,response.id);
noIssues('pet response observation timing');

console.log('Pet response observation timing regression: ok');
