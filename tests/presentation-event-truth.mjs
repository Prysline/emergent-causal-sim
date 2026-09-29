import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const CURRENT_VERSION='11.36.1-map-posture-selection';
const files=[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','systems/physical.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js','systems/relationship/state.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/appraisal/human-social-response.js','systems/relationship/runtime.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js','systems/social/human-response.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js','validation/rules/human-social-response.js','validation/rules/relationship.js','validation/rules/physical-profile.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

const coreSource=fs.readFileSync(new URL('../src/ui/core.js',import.meta.url),'utf8');
const classifierStart=coreSource.indexOf('function isSummaryEvent');
const classifierEnd=coreSource.indexOf('function renderTimeline',classifierStart);
assert.ok(classifierStart>=0&&classifierEnd>classifierStart,'summary classifier source missing');
const classifierSource=coreSource.slice(classifierStart,classifierEnd);
assert.doesNotMatch(classifierSource,/\.text\b/,'summary classification must not reverse-parse event.text');
assert.match(classifierSource,/SUMMARY_ACTIONS\.has\(e\?\.data\?\.action\)/,'summary classification must use structured event action');
assert.match(coreSource,/const SUMMARY_ACTIONS=new Set/,'summary event policy must be explicit structured Presentation policy');

const producerSources=[
  fs.readFileSync(new URL('../src/engine.js',import.meta.url),'utf8'),
  fs.readFileSync(new URL('../src/systems/social/human-response.js',import.meta.url),'utf8'),
  fs.readFileSync(new URL('../src/systems/social/animal-response.js',import.meta.url),'utf8')
].join('\n');
for(const phrase of ['蹲下來','主動走去找','主動跑到','蹭了蹭','走近','手一晃','低頭吃','覺得這裡太吵','沒有找到合適座位','注意到對方正在找自己聊天','暫時找不到能接近']){
  assert.ok(!producerSources.includes(phrase),`unsupported narrative claim remains: ${phrase}`);
}
assert.match(producerSources,/開始準備\$\{ZH\[choice\.id\]\|\|choice\.id\}/,'initial provisional plan text must not claim a final decision');
assert.match(producerSources,/\$\{a\.name\}放棄目前的行動。/,'abort event text must stay conservative while structured reason is absent');

function armDirectTalk(){
  E.reset(21352);const st=E.getState(),requester=st.agents.zhou,responder=st.agents.zhen,cat=st.agents.orange;
  requester.position={x:5,y:5};responder.position={x:5,y:6};cat.offMap=true;
  Object.assign(requester.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:70});
  Object.assign(responder.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:90});
  requester.action={kind:'talk',phase:'interact',targetAgent:responder.id,started:st.tick,wait:0};
  E.ensureIntentForAction?.(st,requester);
  assert.equal(SP.isAtInteraction(st,requester,{kind:'agent',id:responder.id},'social'),true);
  E.tick();return E.getState();
}

let st=armDirectTalk();
assert.equal(st.version,CURRENT_VERSION);
let offer=st.events.find(e=>e.data?.action==='talkOffer');
assert.ok(offer,'talkOffer must be emitted');
assert.equal(offer.text,`${st.agents.zhou.name}向${st.agents.zhen.name}發出聊天邀請。`);
assert.equal(offer.data.socialBid,true);assert.equal(offer.data.bidKind,'talkOffer');assert.equal(offer.data.interactionKind,'talk');
noIssues('structured talk offer wording');

function armDirectPet(social=90){
  E.reset(31352);const st=E.getState(),human=st.agents.zhou,cat=st.agents.orange,bystander=st.agents.zhen;
  human.position={x:5,y:5};cat.position={x:5,y:6};bystander.offMap=true;
  Object.assign(human.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:65});
  Object.assign(cat.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,groomingNeed:20,social});
  human.action={kind:'petAnimal',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};
  E.ensureIntentForAction?.(st,human);
  assert.equal(SP.isAtInteraction(st,human,{kind:'agent',id:cat.id},'social'),true);
  E.tick();return E.getState();
}

st=armDirectPet();
const petOffer=st.events.find(e=>e.data?.action==='petOffer'),accept=st.events.find(e=>e.data?.action==='acceptPet'&&e.data?.responseToBid===petOffer?.id),pet=st.events.find(e=>e.data?.action==='petAnimal'&&e.data?.petOfferId===petOffer?.id);
assert.ok(petOffer&&accept&&pet,'accepted pet flow must keep structured offer/response/outcome chain');
assert.equal(petOffer.text,`${st.agents.zhou.name}向${st.agents.orange.name}發出撫摸邀請。`);
assert.equal(accept.text,`${st.agents.orange.name}接受了${st.agents.zhou.name}的撫摸邀請。`);
assert.equal(pet.text,`${st.agents.zhou.name}摸了摸${st.agents.orange.name}。`);
assert.equal(pet.data.petResponse,'accept');assert.deepEqual(pet.causeIds,[petOffer.id,accept.id]);
noIssues('structured pet wording');

function putToSleep(st,a,slotId,sleepTicks=0){
  const slot=SP.getSlot(st,slotId);assert.ok(slot?.canSleep,`${slotId} must be sleepable`);
  a.position={...slot.position};a.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  a.action={kind:'sleep',phase:'sleeping',sleepTicks,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};
  return slot;
}

E.reset(41352);
st=E.getState();
{
  const human=st.agents.zhen,cat=st.agents.orange;st.agents.zhou.offMap=true;
  human.position={x:9,y:3};cat.needs.sleepNeed=100;putToSleep(st,cat,'sofa:left',0);
  human.action={kind:'petAnimal',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};
  E.tick();
  const sleepingPet=st.events.find(e=>e.data?.action==='petAnimal');
  assert.equal(sleepingPet?.text,`${human.name}摸了摸${cat.name}。`);
  assert.equal(sleepingPet.data.stimulusKind,'touch');
  assert.ok(!/蹲|走去找|輕輕/.test(sleepingPet.text));
  noIssues('sleeping pet wording');
}

E.reset(51352);
st=E.getState();
{
  const human=st.agents.zhen,cat=st.agents.orange;st.agents.zhou.offMap=true;
  human.needs.sleepNeed=70;human.traits.sleepRecoveryRate=0;
  const slot=putToSleep(st,human,'bed:left',0),contactNode=SP.slotApproachNodes(st,slot,cat,'walk')[0];
  assert.ok(contactNode,'sleep slot must expose a contact node');
  cat.position={...contactNode};cat.action={kind:'seekHuman',phase:'interact',targetAgent:human.id,started:st.tick,wait:0};
  E.tick();
  const contact=st.events.find(e=>e.data?.action==='seekHuman');
  assert.equal(contact?.text,`${cat.name}向${human.name}發起親近互動。`);
  assert.equal(contact.data.socialBid,true);assert.equal(contact.data.bidKind,'animalAffection');assert.equal(contact.data.interactionKind,'socialAffection');
  assert.equal(cat.activeIntent?.kind,'awaitResponse');
  const disturbance=st.events.find(e=>e.data?.action==='sleepDisturbance'&&e.data?.target===human.id);
  if(disturbance)assert.ok(!disturbance.text.includes('沒有得到立即回應'),'World disturbance text must not absorb requester-private no-response truth');
  noIssues('seekHuman wording and private boundary');
}

console.log('Presentation event truth regression: ok');
