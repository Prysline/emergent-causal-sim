import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const files=[
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js','interruption-schema-v1123.js','deliberation-schema-v1124.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js','memory-retention-schema-v1133.js','human-social-response-schema-v1133a.js',
  'engine.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js','intent-runtime-v1123.js','intent-runtime-v1124.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js','memory-retention-runtime-v1133.js','human-social-response-runtime-v1133a.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js'
];
for(const file of files)vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const latestAction=action=>E.getState().events.find(e=>e.data?.action===action);
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId].episodicMemories.find(m=>m.sourceEventId===eventId);

function armDirectTalk(social,{seed=11331,thirst=18}={}){
  E.reset(seed);const st=E.getState(),requester=st.agents.zhou,responder=st.agents.zhen,cat=st.agents.orange;
  requester.position={x:5,y:5};responder.position={x:5,y:6};cat.offMap=true;
  requester.action=null;requester.activeIntent=null;responder.action=null;responder.activeIntent=null;
  Object.assign(requester.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:70});
  Object.assign(responder.needs,{hunger:18,thirst,fatigue:18,sleepNeed:18,social});
  requester.action={kind:'talk',phase:'interact',targetAgent:responder.id,started:st.tick,wait:0};
  E.installActionKind?.(requester.action);E.ensureIntentForAction?.(st,requester);
  assert.equal(SP.isAtInteraction(st,requester,{kind:'agent',id:responder.id},'social'),true,'fixture must begin in social range');
  return st;
}

// Same responder traits, only social need changed: the engagement band is deterministic.
E.reset(11330);let st=E.getState(),responder=st.agents.zhen;
responder.needs.social=0;assert.equal(E.talkResponseFor(responder),'decline');
responder.needs.social=35;assert.equal(E.talkResponseFor(responder),'brief');
responder.needs.social=90;assert.equal(E.talkResponseFor(responder),'engage');
const scoreBefore=E.talkEngagementScore(responder),utilityBefore=E.talkResponseUtility(responder);
responder.affect={valence:-1,activation:1,frustration:1,lastUpdatedTick:0,lastDecayTick:0,source:null};
assert.equal(E.talkEngagementScore(responder),scoreBefore,'Current Affect must not enter v11.13.3a talk response scoring');
assert.equal(E.talkResponseUtility(responder),utilityBefore,'Current Affect must not enter response priority utility');
noIssues('deterministic human response bands');

// Engage: talk is no longer unilateral. Offer first, responder accepts, only then full talk occurs.
st=armDirectTalk(90,{seed:21331});E.tick();st=E.getState();
assert.equal(st.version,'11.13.3a-human-social-response');
const engageOffer=latestAction('talkOffer');
assert.ok(engageOffer?.data?.socialBid,'engage fixture must create observable talkOffer');
assert.equal(engageOffer.data.bidKind,'talkOffer');assert.equal(engageOffer.data.bidFrom,'zhou');assert.equal(engageOffer.data.bidTo,'zhen');
assert.equal(st.events.some(e=>e.data?.action==='talk'&&e.data?.responseToBid===engageOffer.id),false,'offer tick must not already force full talk');
E.tick();st=E.getState();
const accept=st.events.find(e=>e.data?.action==='acceptTalk'&&e.data?.responseToBid===engageOffer.id);
const talk=st.events.find(e=>e.data?.action==='talk'&&e.data?.responseToBid===engageOffer.id);
assert.ok(accept,'high-social responder should explicitly accept');assert.ok(talk,'accept must produce one full talk');
assert.equal(talk.data.talkResponse,'engage');
const requesterAcceptMemory=memoryFor('zhou',accept.id),responderTalkMemory=memoryFor('zhen',talk.id);
assert.ok(requesterAcceptMemory?.appraisal?.goalCongruence>0,'requester should appraise explicit acceptance positively');
assert.ok(responderTalkMemory?.appraisal?.goalCongruence>0,'responder should appraise full conversation positively');
noIssues('engage flow');

// Brief reply and explicit decline remain different world facts, but first-pass requester appraisal is the same shallow rejection strength.
st=armDirectTalk(35,{seed:31331});E.tick();const briefOffer=latestAction('talkOffer');E.tick();st=E.getState();
const brief=st.events.find(e=>e.data?.action==='briefTalkReply'&&e.data?.responseToBid===briefOffer.id);
assert.ok(brief,'mid-social responder should give a brief reply');
assert.equal(st.events.some(e=>e.data?.action==='talk'&&e.data?.responseToBid===briefOffer.id),false,'brief reply must not create full talk');
const briefMemory=memoryFor('zhou',brief.id);assert.equal(briefMemory?.appraisal?.ruleId,'briefTalkReply-v1');
assert.ok(briefMemory.appraisal.goalCongruence<0,'brief non-continuation is a shallow negative outcome for requester');
noIssues('brief reply flow');

st=armDirectTalk(0,{seed:41331});E.tick();const declineOffer=latestAction('talkOffer');E.tick();st=E.getState();
const decline=st.events.find(e=>e.data?.action==='declineTalk'&&e.data?.responseToBid===declineOffer.id);
assert.ok(decline,'low-social responder should explicitly decline');
assert.equal(st.events.some(e=>e.data?.action==='talk'&&e.data?.responseToBid===declineOffer.id),false,'decline must not create full talk');
const declineMemory=memoryFor('zhou',decline.id);assert.equal(declineMemory?.appraisal?.ruleId,'declineTalk-v1');
assert.equal(declineMemory.appraisal.goalCongruence,briefMemory.appraisal.goalCongruence,'brief reply and explicit decline must not be given a fixed damage ranking in v11.13.3a');
assert.equal(declineMemory.appraisal.relevance,briefMemory.appraisal.relevance,'first-pass shallow rejection strength should match');
for(const e of [brief,decline])for(const key of ['responseScore','socialNeed','socialTrait','affect','relationship','intentionalIgnore'])assert.equal(Object.prototype.hasOwnProperty.call(e.data,key),false,`world response must not leak ${key}`);
noIssues('decline flow');

// No response is absence, not an implicit decline. A stronger physiological candidate can keep the responder occupied past requester patience.
st=armDirectTalk(80,{seed:51331,thirst:95});E.tick();const noResponseOffer=latestAction('talkOffer');
for(let i=0;i<5&&!latestAction('socialWaitEnded');i++)E.tick();st=E.getState();
const waitEnded=st.events.find(e=>e.data?.action==='socialWaitEnded'&&e.data?.bidId===noResponseOffer.id);
assert.ok(waitEnded,'requester should eventually stop waiting when no response event arrives');
assert.equal(st.events.some(e=>e.data?.responseToBid===noResponseOffer.id&&['acceptTalk','briefTalkReply','declineTalk'].includes(e.data?.action)),false,'no response must not be converted into explicit decline');
assert.equal(waitEnded.data.visibility,'private');assert.equal(waitEnded.data.bidKind,'talkOffer');
for(const key of ['ignored','intentionalIgnore','disliked','rejectedBy'])assert.equal(Object.prototype.hasOwnProperty.call(waitEnded.data,key),false,`ambiguous absence must not infer ${key}`);
assert.equal(memoryFor('zhou',waitEnded.id),undefined,'private socialWaitEnded must stay outside episodic world memory');
noIssues('ambiguous no-response flow');

// Context weighting is derived from what requester could observe, not persisted as emotional damage or intent.
const weightUnknown=E.noResponseInterpretationWeight({data:{action:'socialWaitEnded',bidKind:'talkOffer',responderContextObserved:false}});
const weightSleep=E.noResponseInterpretationWeight({data:{action:'socialWaitEnded',bidKind:'talkOffer',responderContextObserved:true,observedResponderActionKind:'sleep',observedResponderPosture:'lying'}});
const weightBusy=E.noResponseInterpretationWeight({data:{action:'socialWaitEnded',bidKind:'talkOffer',responderContextObserved:true,observedResponderActionKind:'eat',observedResponderPosture:'standing'}});
const weightOccupied=E.noResponseInterpretationWeight({data:{action:'socialWaitEnded',bidKind:'talkOffer',responderContextObserved:true,observedResponderActionKind:'wander',observedResponderPosture:'standing'}});
const weightIdle=E.noResponseInterpretationWeight({data:{action:'socialWaitEnded',bidKind:'talkOffer',responderContextObserved:true,observedResponderActionKind:null,observedResponderPosture:'standing'}});
assert.ok(weightSleep<weightBusy&&weightBusy<weightOccupied&&weightOccupied<weightIdle,'observable context should increase ambiguous no-response negativity from sleeping/busy toward idle');
assert.ok(weightSleep<weightUnknown&&weightUnknown<weightIdle,'unknown cause remains ambiguous rather than maximally negative');

// 500-tick integration: state stays bounded/validator-clean and no private response cache appears.
E.reset(61331);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const a of Object.values(st.agents))for(const key of ['talkResponseDecision','talkResponseScore','talkResponseUtility','socialResponsePriority','ignoredBy'])assert.equal(Object.prototype.hasOwnProperty.call(a,key),false);
  noIssues(`tick ${i+1}`);
}

console.log('v11.13.3a human social response agency regression: ok');
