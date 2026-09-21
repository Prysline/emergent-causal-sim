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
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/appraisal/human-social-response.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js','systems/social/human-response.js','systems/memory/deliberation.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js','validation/rules/human-social-response.js','validation/rules/memory-deliberation.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

function memory(agent,eventId,{tick=0,last=tick,relevance=.8,congruence=0,action='briefTalkReply',actorId='zhou',targetId=agent.id,agencyKind='other',agencyAgentId=actorId}={}){
  const agency=agencyKind==='self'?{kind:'self'}:agencyKind==='environment'?{kind:'environment'}:{kind:'other',agentId:agencyAgentId};
  return {
    id:`memory:${agent.id}:${eventId}`,kind:'episodic',sourceEventId:eventId,observedTick:tick,lastObservedTick:last,
    observed:{action,actorId,targetId,positionRef:'room1|floor|5,5'},
    appraisal:{appraisedTick:tick,ruleId:'v1134-test',relevance:clamp(relevance,0,1),goalCongruence:clamp(congruence,-1,1),agency,factors:[{kind:'fixture',relevanceDelta:relevance,congruenceDelta:congruence}]}
  };
}
function addHuman(st,id,name,position){
  const clone=structuredClone(st.agents.zhou);clone.id=id;clone.name=name;clone.position={...position};clone.action=null;clone.activeIntent=null;clone.episodicMemories=[];clone.affect={valence:0,activation:0,frustration:0,lastUpdatedTick:st.tick,lastDecayTick:st.tick,source:null};clone.observedSocialBids=[];delete clone.pendingInteraction;clone.offMap=false;st.agents[id]=clone;return clone;
}
function calm(a,{social=55}={}){Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:8,social});a.action=null;a.activeIntent=null;a.offMap=false;}
function socialCandidate(st,a){return E.candidateIntents(st,a).find(c=>c.intentKind==='socialize')||null;}

E.reset(11340);let st=E.getState(),a=st.agents.zhen;
assert.equal(st.version,'11.22.1-editor-resident-capabilities');
assert.equal(E.MEMORY_DELIBERATION_SCHEMA_VERSION,'11.13.4-memory-deliberation-influence');
assert.equal(E.MEMORY_DELIBERATION_MAX_DELTA,18);
noIssues('reset');

// Same world/needs/traits/position: negative target-related memories lower only that target's social utility.
st.tick=40;a=st.agents.zhen;const zhou=st.agents.zhou;zhou.position={x:5,y:6};a.position={x:5,y:5};calm(a,{social:65});st.agents.orange.offMap=true;
const mei=addHuman(st,'mei','小梅',{x:7,y:5});calm(mei,{social:30});
let base=E.utilityForIntent(st,a,'socialize'),evals=E.targetEvaluations(st,a,'socialize',base);
assert.equal(evals[0].targetAgent,'zhou','沒有 target memory 時，距離應保留最近目標傾向');
const noMemoryZhou=evals.find(x=>x.targetAgent==='zhou');
a.episodicMemories=[
  memory(a,'neg:1',{tick:35,last:35,relevance:.9,congruence:-.85,actorId:'zhou'}),
  memory(a,'neg:2',{tick:36,last:36,relevance:.85,congruence:-.9,actorId:'zhou'}),
  memory(a,'neg:3',{tick:37,last:37,relevance:.92,congruence:-.8,actorId:'zhou'})
];
evals=E.targetEvaluations(st,a,'socialize',base);const negZhou=evals.find(x=>x.targetAgent==='zhou'),neutralMei=evals.find(x=>x.targetAgent==='mei');
assert.ok(negZhou.memoryUtilityDelta<0&&negZhou.finalUtility<noMemoryZhou.finalUtility,'negative history should lower zhou target utility');
assert.equal(neutralMei.memoryUtilityDelta,0,'unrelated target should remain neutral');
assert.equal(evals[0].targetAgent,'mei','enough negative history may outweigh modest distance and prefer farther target');
assert.ok(E.targetMemoryContributions(st,a,'zhou').length===3);
noIssues('negative target history');

// Positive target-related history raises preference, still bounded and diminishing.
a.episodicMemories=[
  memory(a,'pos:1',{tick:35,last:35,relevance:.9,congruence:.9,actorId:'zhou',action:'talk'}),
  memory(a,'pos:2',{tick:36,last:36,relevance:.9,congruence:.85,actorId:'zhou',action:'acceptTalk'}),
  memory(a,'pos:3',{tick:37,last:37,relevance:.88,congruence:.9,actorId:'zhou',action:'talk'})
];
const pos=E.targetEvaluations(st,a,'socialize',base).find(x=>x.targetAgent==='zhou');
assert.ok(pos.memoryUtilityDelta>0&&pos.memoryUtilityDelta<=18,'positive history should raise target utility within cap');
assert.ok(pos.association<1,'tanh aggregation should remain diminishing rather than unbounded stacking');
noIssues('positive target history');

// Same-source re-observation is still one memory and cannot double influence.
const one=memory(a,'same-source',{tick:10,last:39,relevance:.9,congruence:-.9,actorId:'zhou'});a.episodicMemories=[one];
const oneDelta=E.targetAssociation(st,a,'zhou').memoryUtilityDelta;one.lastObservedTick=40;
const refreshedDelta=E.targetAssociation(st,a,'zhou').memoryUtilityDelta;
assert.equal(a.episodicMemories.length,1);assert.ok(Math.abs(refreshedDelta)>=Math.abs(oneDelta),'re-observation may refresh recency but must not create a second evidence item');
assert.equal(E.targetMemoryContributions(st,a,'zhou').length,1);

// Self-agency / environment memories about similar events do not become target association.
a.episodicMemories=[
  memory(a,'self',{tick:39,relevance:1,congruence:-1,actorId:a.id,agencyKind:'self'}),
  memory(a,'env',{tick:39,relevance:1,congruence:-1,actorId:null,agencyKind:'environment'})
];
assert.equal(E.targetAssociation(st,a,'zhou').memoryUtilityDelta,0,'non-other agency must not create person-specific association');
noIssues('agency boundary');

// Affect-only changes do not alter deliberation utility; responder scores also stay untouched.
E.reset(21340);st=E.getState();a=st.agents.zhen;calm(a,{social:65});st.agents.orange.offMap=false;
const selfMem=memory(a,'affect-source',{tick:0,last:0,relevance:.5,congruence:-.5,actorId:a.id,agencyKind:'self'});a.episodicMemories=[selfMem];
const beforeCandidate=socialCandidate(st,a),beforeTalkResponse=E.talkEngagementScore(a),beforePetResponse=E.petResponseScore(st.agents.orange);
a.affect={valence:-.8,activation:.9,frustration:.8,lastUpdatedTick:st.tick,lastDecayTick:st.tick,source:{memoryId:selfMem.id,sourceEventId:selfMem.sourceEventId,appraisedTick:selfMem.appraisal.appraisedTick,appliedTick:st.tick}};
const afterCandidate=socialCandidate(st,a);
assert.equal(afterCandidate.utility,beforeCandidate.utility,'Current Affect must remain directly decision-inert in v11.13.4');
assert.equal(E.talkEngagementScore(a),beforeTalkResponse,'Human responder engagement score must not read Memory/Affect');
assert.equal(E.petResponseScore(st.agents.orange),beforePetResponse,'petResponseScore must stay unchanged');
assert.equal(a.relationships,undefined,'v11.13.4 must not create Relationship state');
noIssues('affect and responder-score boundary');

// Strong social need and only one target must not become a hard blacklist.
E.reset(31340);st=E.getState();st.tick=2;a=st.agents.zhen;calm(a,{social:96});st.agents.orange.offMap=true;st.agents.zhou.position={x:5,y:6};a.position={x:5,y:5};
a.episodicMemories=[
  memory(a,'only-neg:1',{tick:0,relevance:1,congruence:-1,actorId:'zhou'}),
  memory(a,'only-neg:2',{tick:1,relevance:1,congruence:-1,actorId:'zhou'}),
  memory(a,'only-neg:3',{tick:2,relevance:1,congruence:-1,actorId:'zhou'})
];
const only=socialCandidate(st,a);assert.ok(only&&only.targetAgent==='zhou'&&only.utility>0,'negative history must remain a bounded preference, not hard blacklist');
noIssues('no hard blacklist');

// Soft reconsideration must compare current target and challenger with the same memory adjustment and may switch same intent to another target.
E.reset(41340);st=E.getState();st.tick=20;a=st.agents.zhen;calm(a,{social:75});a.position={x:5,y:5};st.agents.zhou.position={x:5,y:6};st.agents.orange.offMap=true;addHuman(st,'mei','小梅',{x:7,y:5});
a.episodicMemories=[
  memory(a,'switch-neg:1',{tick:18,relevance:1,congruence:-1,actorId:'zhou'}),
  memory(a,'switch-neg:2',{tick:18,relevance:1,congruence:-1,actorId:'zhou'}),
  memory(a,'switch-pos:1',{tick:18,relevance:1,congruence:1,actorId:'mei'}),
  memory(a,'switch-pos:2',{tick:18,relevance:1,congruence:1,actorId:'mei'})
];
a.action={kind:'talk',phase:'move',targetAgent:'zhou',started:0,wait:0};
a.activeIntent={id:'intent:zhen:0:socialize:test',kind:'socialize',createdTick:0,lifecycle:'actionBound',source:{type:'test'}};a.action.intentId=a.activeIntent.id;
const snap=E.reconsiderationSnapshot(st,a);
assert.equal(snap.bestChallenger?.intentKind,'socialize');assert.equal(snap.bestChallenger?.targetAgent,'mei');
assert.ok(snap.bestChallenger.utility>snap.currentUtility,'same-intent alternate target should be a real challenger');
assert.equal(E.applySoftReconsideration(st,a),true,'strong target-specific evidence should be able to cross hysteresis normally');
assert.equal(a.action.targetAgent,'mei');
noIssues('same-intent target reconsideration');

// Initial core deliberation must preserve the memory-selected target into Action rather than reselect nearest in startAction.
E.reset(51340);st=E.getState();a=st.agents.zhen;calm(a,{social:98});a.position={x:2,y:5};st.agents.zhou.position={x:4,y:5};st.agents.orange.offMap=true;addHuman(st,'mei','小梅',{x:7,y:5});
a.episodicMemories=[
  memory(a,'initial-neg:1',{tick:0,relevance:1,congruence:-1,actorId:'zhou'}),
  memory(a,'initial-neg:2',{tick:0,relevance:1,congruence:-1,actorId:'zhou'}),
  memory(a,'initial-neg:3',{tick:0,relevance:1,congruence:-1,actorId:'zhou'})
];
E.tick();
assert.equal(E.actionKind(a.action),'talk','high social need should still choose a social action in this focused setup');
assert.equal(a.action.targetAgent,'mei','initial deliberation must carry the memory-selected target into Action');
assert.equal(st.thoughts.zhen.pick.targetAgent,'mei','Recent Decision should agree with actual target');
noIssues('initial target-aware deliberation');

// Initial plan event is provisional private-cognition provenance: same-tick correction normalizes exactly that canonical event, not a decoy or a second event.
E.reset(56340);st=E.getState();st.tick=42;a=st.agents.zhen;calm(a,{social:60});a.position={x:5,y:5};st.agents.zhou.position={x:5,y:6};st.agents.orange.offMap=true;
a.episodicMemories=[
  memory(a,'plan-pos:1',{tick:40,last:40,relevance:1,congruence:1,actorId:'zhou',action:'talk'}),
  memory(a,'plan-pos:2',{tick:41,last:41,relevance:1,congruence:1,actorId:'zhou',action:'acceptTalk'}),
  memory(a,'plan-pos:3',{tick:42,last:42,relevance:1,congruence:1,actorId:'zhou',action:'talk'})
];
const oldPick={id:'wander',score:20},socialPick={id:'talk',score:10};
a.action=E.buildAction(a,oldPick);a.activeIntent=null;st.thoughts[a.id]={options:[oldPick,socialPick],pick:oldPick,tick:st.tick};
const creationSnapshots=[];
E.registerEventCreatedListener('test.initial-plan-provisional',({event})=>{if(event.data?.actor===a.id&&event.data?.phase==='plan')creationSnapshots.push({id:event.id,tick:event.tick,type:event.type,action:event.data.action,planLifecycle:event.data.planLifecycle});},900);
const currentPlanId=E.addEvent(`${a.name}決定${E.ZH?.wander||'wander'}。`,'system',[],{actor:a.id,action:'wander',phase:'plan',planLifecycle:'initialProvisional',position:E.positionRef(a.position)}),currentPlan=st.causes[currentPlanId];
st.tick=41;
const olderPlanId=E.addEvent(`${a.name}決定${E.ZH?.wander||'wander'}。`,'system',[],{actor:a.id,action:'wander',phase:'plan',planLifecycle:'initialProvisional',position:E.positionRef(a.position)}),olderPlan=st.causes[olderPlanId];
st.tick=42;
const normalDecoyId=E.addEvent('decoy plan event','normal',[],{actor:a.id,action:'wander',phase:'plan',planLifecycle:'initialProvisional',position:E.positionRef(a.position)}),normalDecoy=st.causes[normalDecoyId];
const eventCountBeforeCorrection=st.events.length;
assert.equal(E.episodicPolicyForEvent(st,currentPlan).episodic,false,'initial plan event must remain non-episodic private cognition');
assert.equal(E.episodicPolicyForEvent(st,normalDecoy).episodic,false,'plan phase remains non-episodic even for non-system decoy fixtures');
E.adjustInitialDeliberation(st,[a.id]);
assert.equal(E.actionKind(a.action),'talk','positive target history should make the correction choose talk');
assert.equal(a.action.targetAgent,'zhou','corrected social action should keep the memory-selected target');
assert.equal(st.events.length,eventCountBeforeCorrection,'correction must normalize one canonical plan event rather than append a second correction event');
assert.equal(st.causes[currentPlanId],currentPlan,'canonical plan cause identity must remain stable across normalization');
assert.equal(currentPlan.data.action,'talk','same-tick provisional system plan must normalize to the final adopted action');
assert.equal(currentPlan.data.planLifecycle,'initialProvisional','lifecycle marker records provisional-origin provenance after normalization');
assert.equal(olderPlan.data.action,'wander','an older same-actor plan event must not be rewritten');
assert.equal(normalDecoy.data.action,'wander','a same-tick non-system plan-shaped event must not be rewritten');
assert.equal(creationSnapshots.find(x=>x.id===currentPlanId)?.action,'wander','event-created consumers see the explicitly provisional creation payload before same-tick normalization');
assert.equal(creationSnapshots.find(x=>x.id===currentPlanId)?.planLifecycle,'initialProvisional');
for(const agent of Object.values(st.agents)){
  assert.equal((agent.episodicMemories||[]).some(m=>[currentPlanId,olderPlanId,normalDecoyId].includes(m.sourceEventId)),false,'plan lifecycle events must not become episodic memories');
}
const engineSource=fs.readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');
assert.ok(engineSource.includes("phase:'plan',planLifecycle:'initialProvisional'"),'core initial plan producer must label provisional lifecycle explicitly');
const memoryDeliberationSource=fs.readFileSync(new URL('../src/systems/memory/deliberation.js',import.meta.url),'utf8');
assert.ok(memoryDeliberationSource.includes("x.tick===st.tick&&x.type==='system'"),'plan normalization must be restricted to same-tick system event provenance');
assert.ok(memoryDeliberationSource.includes("x.data?.planLifecycle==='initialProvisional'"),'plan normalization must require the explicit provisional lifecycle marker');
noIssues('initial plan provisional normalization contract');

// Long-run integration remains bounded and stores no memory influence mirrors.
E.reset(61340);
const forbidden=['memoryPreference','socialMemoryBias','targetAssociation','memoryUtilityDelta','targetPreference','accessPenalty','memoryInfluenceScore'];
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const agent of Object.values(st.agents)){
    assert.ok((agent.episodicMemories||[]).length<=E.MAX_EPISODIC_MEMORIES);
    for(const key of forbidden)assert.equal(Object.prototype.hasOwnProperty.call(agent,key),false,`${agent.id} persisted ${key}`);
    for(const m of agent.episodicMemories||[])for(const key of forbidden)assert.equal(Object.prototype.hasOwnProperty.call(m,key),false,`${agent.id} memory persisted ${key}`);
  }
  if(i%25===0)noIssues(`tick ${i+1}`);
}
noIssues('500 tick integration');

console.log('v11.13.4 memory → deliberation influence regression: ok');
