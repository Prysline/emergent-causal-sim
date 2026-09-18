import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const files=[
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js','interruption-schema-v1123.js','deliberation-schema-v1124.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js','memory-retention-schema-v1133.js','human-social-response-schema-v1133a.js','memory-deliberation-schema-v1134.js','social-outcome-memory-schema-v1135.js','presentation-schema-v1140.js','relationship-schema-v1150.js','physical-schema-v1160.js','physical-runtime-v1160.js','locomotion-schema-v1190.js','locomotion-runtime-v1190.js',
  'engine.js','runtime-hook-pipeline.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js','intent-runtime-v1123.js','intent-runtime-v1124.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','relationship-runtime-v1150.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js','memory-retention-runtime-v1133.js','human-social-response-runtime-v1133a.js','memory-deliberation-runtime-v1134.js','social-outcome-memory-runtime-v1135.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js','state-validator-v1135.js','state-validator-v1150.js','state-validator-v1160.js','state-validator-v1190.js','state-validator-manifest.js'
];
for(const file of files)vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

const APP_VERSION='11.19.0-locomotion-execution-posture';
const RELATIONSHIP_VERSION='11.15.2-relationship-responder-bias';
const E=globalThis.SimEngine,V=globalThis.SimValidator,W=globalThis.SimWorld;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const clone=x=>structuredClone(x);
function relation(a,id){return a.relationships?.[id]||null;}
function calm(a,{social=60}={}){Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:8,social});a.action=null;a.activeIntent=null;a.offMap=false;}
function runUntil(predicate,max=12){for(let i=0;i<max;i++){if(predicate())return true;E.tick();}return predicate();}

E.reset(11500);let st=E.getState();
assert.equal(st.version,APP_VERSION);
assert.equal(W.RELATIONSHIP_SCHEMA_VERSION,RELATIONSHIP_VERSION);
assert.equal(E.RELATIONSHIP_SCHEMA_VERSION,RELATIONSHIP_VERSION);
assert.equal(W.RELATIONSHIP_MIN_RELEVANCE,.15);
assert.equal(W.RELATIONSHIP_FAMILIARITY_RATE,.08);
assert.equal(W.RELATIONSHIP_AFFINITY_RATE,.10);
assert.equal(W.RELATIONSHIP_TARGET_CAP,8);
for(const a of Object.values(st.agents))assert.deepEqual(a.relationships,{},'new state must start without invented relationship history');
assert.deepEqual(E.listRuntimeHooks('episodicMemoryCreated'),[
  {id:'appraisal.base',order:100},
  {id:'appraisal.social-response',order:200},
  {id:'appraisal.human-social',order:300},
  {id:'relationship.consolidate',order:350},
  {id:'affect.from-appraisal',order:400}
]);
noIssues('reset');

// Full Human↔Human conversation consolidates once per participant, from the appraisal that represents each participant's own outcome.
st=E.prepareHumanTalkScenario('talk-engage',11501);
assert.ok(runUntil(()=>E.getState().events.some(e=>e.data?.action==='talk'),10),'engage scenario should complete a talk encounter');
st=E.getState();let requester=st.agents.zhou,responder=st.agents.zhen;
const requesterRel=clone(relation(requester,'zhen')),responderRel=clone(relation(responder,'zhou'));
assert.ok(requesterRel&&responderRel,'both direct participants should consolidate directional relationship state');
assert.ok(requesterRel.familiarity>0&&requesterRel.affinity>0,'requester should consolidate the accepted invitation positively');
assert.ok(responderRel.familiarity>0&&responderRel.affinity>0,'responder should consolidate the completed conversation positively');
assert.notDeepEqual(requesterRel,responderRel,'directional relationships may differ because each participant appraises a different outcome');
const acceptEvent=st.events.find(e=>e.data?.action==='acceptTalk'&&e.data?.target==='zhou');
assert.ok(acceptEvent,'full talk should have an acceptTalk response event');
E.observeEventForMemories(st,acceptEvent,st.tick);
assert.deepEqual(relation(requester,'zhen'),requesterRel,'re-observing the same source event must not consolidate Relationship twice');
noIssues('full talk directional consolidation');

// Brief response: requester gets a mild negative affinity trace; responder only becomes more familiar because its actor-side appraisal is neutral.
st=E.prepareHumanTalkScenario('talk-brief',11502);
assert.ok(runUntil(()=>E.getState().events.some(e=>e.data?.action==='briefTalkReply'),10),'brief scenario should resolve');
st=E.getState();requester=st.agents.zhou;responder=st.agents.zhen;
assert.ok(relation(requester,'zhen')?.familiarity>0);
assert.ok(relation(requester,'zhen')?.affinity<0,'requester brief-reply outcome should consolidate mildly negative affinity');
assert.ok(relation(responder,'zhou')?.familiarity>0,'responder still gains direct familiarity from the encounter');
assert.equal(relation(responder,'zhou')?.affinity,0,'choosing a brief reply must not invent a negative feeling in the responder');
noIssues('brief reply asymmetric consolidation');

// avoidPet proves the same observable event may push the two directions differently.
st=E.preparePetResponseScenario('pet-avoid',11503);
assert.ok(runUntil(()=>E.getState().events.some(e=>e.data?.action==='avoidPet'),6),'pet avoid scenario should resolve');
st=E.getState();const human=st.agents.zhou,cat=st.agents.orange;
assert.ok(relation(human,'orange')?.familiarity>0&&relation(cat,'zhou')?.familiarity>0);
assert.ok(relation(human,'orange')?.affinity<0,'human target should consolidate the declined pet attempt negatively');
assert.ok(relation(cat,'zhou')?.affinity>0,'animal actor may consolidate successful boundary maintenance positively');
noIssues('avoidPet directional appraisal');

// Requester-private no-response updates only requester→counterpart, and repeated processing of the same wait event is exactly-once.
st=E.prepareHumanTalkScenario('talk-no-response',11504);
assert.ok(runUntil(()=>E.getState().agents.zhou.episodicMemories.some(m=>m.episodeKind==='privateSocialOutcome'),10),'no-response should form private outcome memory');
st=E.getState();requester=st.agents.zhou;responder=st.agents.zhen;
const privateMemory=requester.episodicMemories.find(m=>m.episodeKind==='privateSocialOutcome');
const waitEvent=st.causes?.[privateMemory.sourceEventId];
const privateRel=clone(relation(requester,'zhen'));
assert.ok(privateRel?.familiarity>0,'private no-response should leave a very small familiarity trace');
assert.ok(privateRel?.affinity<0,'private no-response may consolidate its bounded negative historical appraisal');
assert.equal(relation(responder,'zhou'),null,'requester timeout must not remotely modify responder relationship state');
E.rememberRequesterSocialOutcome(st,waitEvent);
assert.deepEqual(relation(requester,'zhen'),privateRel,'same private source must not consolidate twice');
noIssues('private no-response relationship boundary');

// Proposal-only and unrelated episodes are not audited relationship evidence even when they have an appraisal.
E.reset(11505);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;requester.position={x:5,y:5};responder.position={x:5,y:6};calm(requester);calm(responder);st.agents.orange.offMap=true;
const offerId=E.addEvent('測試聊天邀請','normal',[],{actor:'zhen',target:'zhou',action:'talkOffer',socialBid:true,bidKind:'talkOffer',interactionKind:'talk',expectsResponse:true,bidFrom:'zhen',bidTo:'zhou',perceivedByTarget:true,position:E.positionRef(requester.position)});
st.causes[offerId].data.bidId=offerId;
assert.ok(requester.episodicMemories.some(m=>m.sourceEventId===offerId)&&responder.episodicMemories.some(m=>m.sourceEventId===offerId),'proposal can still be episodic memory');
assert.equal(relation(requester,'zhou'),null);assert.equal(relation(responder,'zhen'),null);
const spillId=E.addEvent('測試打翻','normal',[],{actor:'zhou',action:'spill',position:E.positionRef(responder.position)});
assert.ok(responder.episodicMemories.some(m=>m.sourceEventId===spillId));
assert.equal(relation(requester,'zhou'),null,'non-relational agency must not become relationship evidence');
assert.equal(relation(responder,'zhen'),null);
noIssues('audited evidence gate');

// Relationship is consolidated persistent slow state, not a recomputation from the current hot-memory set.
st=E.prepareHumanTalkScenario('talk-engage',11506);assert.ok(runUntil(()=>E.getState().events.some(e=>e.data?.action==='talk'),10));st=E.getState();requester=st.agents.zhou;
const consolidated=clone(relation(requester,'zhen'));assert.ok(consolidated);
requester.affect={valence:0,activation:0,frustration:0,lastUpdatedTick:st.tick,lastDecayTick:st.tick,source:null};
requester.episodicMemories=[];
assert.deepEqual(relation(requester,'zhen'),consolidated,'pruning/clearing episodic memory must not erase already consolidated relationship state');
noIssues('relationship survives memory pruning');

// Relationship remains separate from Memory association itself. Base/no-counterpart responder helpers remain relationship-neutral;
// v11.15.2 explicit-counterpart responder influence is covered by its focused regression.
E.reset(11507);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;const animal=st.agents.orange;calm(requester,{social:90});calm(responder,{social:55});calm(animal,{social:55});
const talkScoreBefore=E.talkEngagementScore(responder),petScoreBefore=E.petResponseScore(animal),assocBefore=clone(E.targetAssociation(st,requester,'zhou'));
requester.relationships.zhou={familiarity:.92,affinity:-.88,lastUpdatedTick:st.tick};
responder.relationships.zhen={familiarity:.90,affinity:.84,lastUpdatedTick:st.tick};
animal.relationships.zhen={familiarity:.95,affinity:-.90,lastUpdatedTick:st.tick};
assert.equal(E.talkEngagementScore(responder),talkScoreBefore,'base/no-counterpart Human response helper must remain relationship-neutral');
assert.equal(E.petResponseScore(animal),petScoreBefore,'base/no-counterpart animal response helper must remain relationship-neutral');
assert.deepEqual(E.targetAssociation(st,requester,'zhou'),assocBefore,'Relationship must not alter the Memory association calculation');
assert.ok(E.relationshipTargetDelta(requester,'zhou')<0,'Relationship target preference remains a separate derived delta');
noIssues('base responder helper and memory-association boundary');

// Bounded state and forbidden mirror fields remain clean during integration.
E.reset(11508);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  assert.equal(st.version,APP_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(st,'pairRelationships'),false);
  for(const a of Object.values(st.agents||{})){
    assert.ok(a.relationships&&typeof a.relationships==='object'&&!Array.isArray(a.relationships));
    for(const [otherId,r] of Object.entries(a.relationships)){
      assert.notEqual(otherId,a.id);
      assert.ok(r.familiarity>=0&&r.familiarity<=1);
      assert.ok(r.affinity>=-1&&r.affinity<=1);
      for(const forbidden of ['trust','love','hate','friendshipScore','relationshipScore','confidence','history','evidenceIds','memoryIds','lastEvidenceMemoryId','preferredTarget','relationshipResponseDelta'])assert.equal(Object.prototype.hasOwnProperty.call(r,forbidden),false,`${a.id}->${otherId} persisted ${forbidden}`);
    }
  }
  if(i%25===0)noIssues(`tick ${i+1}`);
}
noIssues('500 tick integration');
console.log('v11.15 Relationship foundation regression: ok under v11.19.0 app marker');
