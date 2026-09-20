import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','social-bid-schema-v1122.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js','memory-retention-schema-v1133.js','human-social-response-schema-v1133a.js','memory-deliberation-schema-v1134.js','social-outcome-memory-schema-v1135.js','presentation-schema-v1140.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','social-bid-runtime-v1122.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js','memory-retention-runtime-v1133.js','human-social-response-runtime-v1133a.js','memory-deliberation-runtime-v1134.js','social-outcome-memory-runtime-v1135.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js','state-validator-v1135.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const memoryRuntimeSource=fs.readFileSync(new URL('../src/memory-runtime-v1130.js',import.meta.url),'utf8');
assert.doesNotMatch(memoryRuntimeSource,/E\.addEvent\s*=/,'Memory runtime must not replace core addEvent');
assert.equal(E.addEvent,E.CORE_ADD_EVENT,'core addEvent ownership must remain stable after Memory loads');
assert.deepEqual(E.listEventCreatedListeners(),[{id:'memory.episodic-observation',order:100}],'Memory must register one named event-created listener');
assert.throws(()=>E.registerEventCreatedListener('memory.episodic-observation',()=>{},200),/duplicate event-created listener/);
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const eventBy=pred=>E.getState().events.find(pred);
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId]?.episodicMemories?.find(m=>m.sourceEventId===eventId)||null;

let mode=null;
let preCaptureSnapshot=null;
let coreBeforeSweep=null;
let coreAfterSweep=null;
let postBeforeHuman=null;
let postAfterHuman=null;
let created=[];

function resetProbes(nextMode){
  mode=nextMode;
  preCaptureSnapshot=null;
  coreBeforeSweep=null;
  coreAfterSweep=null;
  postBeforeHuman=null;
  postAfterHuman=null;
  created=[];
}
function createdFor(agentId,eventId){return created.filter(x=>x.agentId===agentId&&x.sourceEventId===eventId);}
function snapshotMemory(agentId,event){
  const memory=event&&memoryFor(agentId,event.id);
  return event?{
    eventId:event.id,
    eventTick:event.tick,
    hasMemory:!!memory,
    observedTick:memory?.observedTick??null,
    hasAppraisal:!!memory?.appraisal,
    affectSourceEventId:E.getState().agents[agentId]?.affect?.source?.sourceEventId||null
  }:null;
}

E.registerRuntimeHook('beforeTick','test.memory-timing-pre-core',()=>{
  if(mode!=='preCapture')return;
  const offer=eventBy(e=>e.data?.action==='talkOffer');
  if(offer)preCaptureSnapshot=snapshotMemory('zhen',offer);
},350);

E.registerRuntimeHook('afterTick','test.memory-timing-core-before-sweep',()=>{
  if(mode!=='coreLexical')return;
  const groom=eventBy(e=>e.data?.action==='groom'&&e.data?.actor==='orange');
  if(groom)coreBeforeSweep=snapshotMemory('orange',groom);
},450);

E.registerRuntimeHook('afterTick','test.memory-timing-core-after-sweep',()=>{
  if(mode!=='coreLexical')return;
  const groom=eventBy(e=>e.data?.action==='groom'&&e.data?.actor==='orange');
  if(groom)coreAfterSweep=snapshotMemory('orange',groom);
},550);

E.registerRuntimeHook('afterTick','test.memory-timing-post-before-human',()=>{
  if(mode!=='postHuman')return;
  const response=eventBy(e=>['acceptTalk','briefTalkReply','declineTalk'].includes(e.data?.action));
  postBeforeHuman={responseExists:!!response};
},650);

E.registerRuntimeHook('afterTick','test.memory-timing-post-after-human',()=>{
  if(mode!=='postHuman')return;
  const response=eventBy(e=>['acceptTalk','briefTalkReply','declineTalk'].includes(e.data?.action));
  postAfterHuman=response?{...snapshotMemory('zhou',response),action:response.data.action}:null;
},750);

E.registerRuntimeHook('episodicMemoryCreated','test.memory-timing-created-probe',(ctx)=>{
  created.push({
    agentId:ctx.agent.id,
    sourceEventId:ctx.memory.sourceEventId,
    observedTick:ctx.memory.observedTick,
    appraisalRule:ctx.memory.appraisal?.ruleId||null,
    affectSourceEventId:ctx.agent.affect?.source?.sourceEventId||null
  });
},450);

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

// 1) Tick-external exported E.addEvent is synchronously observed today.
resetProbes('direct');
E.reset(45100);let st=E.getState();
st.agents.zhou.position={x:5,y:5};st.agents.orange.position={x:5,y:6};st.agents.zhen.offMap=true;
const directId=E.addEvent('老周在事件觀察 timing 測試中灑出了一些水。','warn',[],{actor:'zhou',action:'spill',position:'5,5',amount:4});
const directEvent=st.causes[directId],directMemory=memoryFor('orange',directId),directCreated=createdFor('orange',directId);
assert.ok(directMemory,'direct exported event must synchronously form observable Memory');
assert.equal(directEvent.tick,0);
assert.equal(directMemory.observedTick,directEvent.tick,'direct observation must preserve event creation tick');
assert.ok(directMemory.appraisal,'direct observation must synchronously complete Appraisal');
assert.equal(directCreated.length,1,'direct event must create one orange episode');
assert.equal(directCreated[0].affectSourceEventId,directId,'Affect must already be applied before the post-creation probe runs');
const directAffectBefore=JSON.stringify(st.agents.orange.affect);
E.observeEventForMemories(st,directEvent,st.tick);
assert.equal(createdFor('orange',directId).length,1,'re-observing the same source event must not create another episode/appraisal');
assert.equal(JSON.stringify(st.agents.orange.affect),directAffectBefore,'same-event re-observation must not reapply Affect');
noIssues('direct exported event');

// 2) beforeTick 300 talkOffer is synchronously observed before core execution.
resetProbes('preCapture');
armDirectTalk(80,{seed:45200,thirst:95});
E.tick();st=E.getState();
const preOffer=eventBy(e=>e.data?.action==='talkOffer');
assert.ok(preOffer&&preCaptureSnapshot,'talkOffer probe must see the offer after humanSocial.prepare and before core execution');
assert.equal(preCaptureSnapshot.eventId,preOffer.id);
assert.equal(preCaptureSnapshot.hasMemory,true,'pre-core exported event must be synchronously observed through the event-created listener');
assert.equal(preCaptureSnapshot.eventTick,0,'pre-core talkOffer is created before core increments state.tick');
assert.equal(preCaptureSnapshot.observedTick,preCaptureSnapshot.eventTick,'pre-capture Memory must preserve creation tick');
assert.equal(createdFor('zhen',preOffer.id).length,1,'event-created delivery must create exactly one talkOffer episode');
assert.equal(st.tick,1);
noIssues('pre-core exported event');

// 3) Core lexical event exists before memory.process-events and becomes Memory only after the sweep.
resetProbes('coreLexical');
E.reset(45300);st=E.getState();
for(const id of ['zhou','zhen'])st.agents[id].offMap=true;
const cat=st.agents.orange;cat.offMap=false;cat.position={x:5,y:5};cat.action=null;cat.activeIntent=null;
Object.assign(cat.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,groomingNeed:100});
cat.action={kind:'groom',phase:'start',started:st.tick,wait:0};
E.ensureIntentForAction?.(st,cat);
E.tick();st=E.getState();
const groomEvent=eventBy(e=>e.data?.action==='groom'&&e.data?.actor==='orange');
assert.ok(groomEvent,'core tick must emit the groom world event');
assert.ok(coreBeforeSweep&&coreAfterSweep,'both core timing probes must observe the groom event');
assert.equal(coreBeforeSweep.hasMemory,false,'core lexical event must not gain Memory before memory.process-events');
assert.equal(coreAfterSweep.hasMemory,true,'memory.process-events must observe the core lexical event');
assert.equal(coreAfterSweep.eventTick,1);
assert.equal(coreAfterSweep.observedTick,coreAfterSweep.eventTick,'sweep observation must preserve the current core event tick');
assert.equal(createdFor('orange',groomEvent.id).length,1,'core lexical event must create exactly one episode');
noIssues('core lexical sweep event');

// 4) afterTick 700 Human response is absent at 650, then synchronously observed before Memory→Deliberation 800.
resetProbes('postHuman');
armDirectTalk(90,{seed:45400,thirst:18});
E.tick();st=E.getState();
const postOffer=eventBy(e=>e.data?.action==='talkOffer');
const response=eventBy(e=>e.data?.responseToBid===postOffer?.id&&['acceptTalk','briefTalkReply','declineTalk'].includes(e.data?.action));
assert.ok(postOffer&&response,'engage scenario must produce talkOffer and responder event');
assert.deepEqual(postBeforeHuman,{responseExists:false},'Human response must not exist before humanSocial.resolve at 700');
assert.ok(postAfterHuman,'probe after humanSocial.resolve must see responder event');
assert.equal(postAfterHuman.eventId,response.id);
assert.equal(postAfterHuman.action,'acceptTalk');
assert.equal(postAfterHuman.hasMemory,true,'post-process exported response must synchronously form requester Memory');
assert.equal(postAfterHuman.hasAppraisal,true,'response Memory must synchronously complete Appraisal before order 800');
assert.equal(postAfterHuman.eventTick,1);
assert.equal(postAfterHuman.observedTick,postAfterHuman.eventTick,'post-process response Memory must preserve creation tick');
const responseCreated=createdFor('zhou',response.id);
assert.equal(responseCreated.length,1,'responder event must create one requester episode');
assert.equal(responseCreated[0].appraisalRule,'acceptTalk-v1');
assert.equal(responseCreated[0].affectSourceEventId,response.id,'Affect must be applied in the episodicMemoryCreated branch before afterTick 750');
noIssues('post-process exported response');

console.log('Memory event observation timing regression: ok');
