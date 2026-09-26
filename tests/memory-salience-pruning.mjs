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
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

function memory(agent,eventId,{tick=0,last=tick,relevance=.1,congruence=0,action='spill',actorId=agent.id,targetId=null}={}){
  const agency=actorId===agent.id?{kind:'self'}:actorId?{kind:'other',agentId:actorId}:{kind:'environment'};
  return {
    id:`memory:${agent.id}:${eventId}`,kind:'episodic',sourceEventId:eventId,observedTick:tick,lastObservedTick:last,
    observed:{action,actorId,targetId,positionRef:'5,5'},
    appraisal:{appraisedTick:tick,ruleId:'v1133-test',relevance:clamp(relevance,0,1),goalCongruence:clamp(congruence,-1,1),agency,factors:[{kind:'fixture',relevanceDelta:relevance,congruenceDelta:congruence}]}
  };
}

E.reset(1133);let st=E.getState(),a=st.agents.zhou;
assert.equal(st.version,'11.30.0-metric-route-locomotion');
assert.equal(E.MEMORY_RETENTION_SCHEMA_VERSION,'11.13.3-memory-salience-pruning');
assert.equal(E.MAX_EPISODIC_MEMORIES,64);
noIssues('reset');

// Derived salience favors relevance and historical affect impact without persisting a second truth.
st.tick=100;a=st.agents.zhou;
const low=memory(a,'event:low',{tick:10,last:10,relevance:.08,congruence:0,action:'groom'});
const high=memory(a,'event:high',{tick:10,last:10,relevance:.92,congruence:-.9,action:'spill'});
a.episodicMemories=[low,high];
const lowC=E.memoryRetentionComponents(st,a,low),highC=E.memoryRetentionComponents(st,a,high);
assert.ok(highC.score>lowC.score,'high relevance / affect-impact memory should outrank low filler');
assert.ok(highC.affectImpact>lowC.affectImpact);
for(const m of a.episodicMemories)for(const key of ['salience','retentionScore','importance','retentionProtected'])assert.equal(Object.prototype.hasOwnProperty.call(m,key),false,`${key} must remain derived`);
noIssues('derived salience only');

// Repetition is based on distinct canonical events with the same observable signature, not duplicate source memories.
E.reset(2133);st=E.getState();st.tick=40;a=st.agents.zhou;
const repeated=[];
for(let i=0;i<4;i++)repeated.push(memory(a,`repeat:${i}`,{tick:10+i,last:10+i,relevance:.7,congruence:.4,action:'petCat',actorId:'zhou',targetId:'orange'}));
const unique=memory(a,'unique',{tick:10,last:10,relevance:.7,congruence:.4,action:'spill',actorId:'zhou',targetId:null});
a.episodicMemories=[...repeated,unique];
const repeatedC=E.memoryRetentionComponents(st,a,repeated[0]),uniqueC=E.memoryRetentionComponents(st,a,unique);
assert.ok(repeatedC.recurrence>0,'distinct related important events should earn recurrence bonus');
assert.equal(uniqueC.recurrence,0,'unrepeated event should have no recurrence bonus');
assert.ok(repeatedC.score>uniqueC.score,'bounded recurrence should improve retention score');
noIssues('distinct-event recurrence');

// Capacity pressure evicts low-salience filler before high-salience memories.
E.reset(3133);st=E.getState();st.tick=200;a=st.agents.zhou;
a.episodicMemories=[];
for(let i=0;i<64;i++)a.episodicMemories.push(memory(a,`filler:${String(i).padStart(2,'0')}`,{tick:i,last:i,relevance:.04,congruence:0,action:i%2?'groom':'wander'}));
const importantA=memory(a,'important:a',{tick:20,last:20,relevance:.95,congruence:.9,action:'petCat',actorId:'zhou',targetId:'orange'});
const importantB=memory(a,'important:b',{tick:21,last:21,relevance:.9,congruence:-.95,action:'spill',actorId:'zhou'});
a.episodicMemories.push(importantA,importantB);
const removed=E.pruneAgentMemoriesBySalience(st,a);
assert.equal(a.episodicMemories.length,E.MAX_EPISODIC_MEMORIES);
assert.equal(removed.length,2);
assert.ok(a.episodicMemories.includes(importantA)&&a.episodicMemories.includes(importantB),'important memories should survive capacity pressure');
assert.ok(removed.every(m=>m.sourceEventId.startsWith('filler:')),'low filler should be evicted first');
noIssues('salience eviction');

// Active Affect source provenance is protected until Affect returns to neutral.
E.reset(4133);st=E.getState();st.tick=120;a=st.agents.zhou;
a.episodicMemories=[];
const protectedMemory=memory(a,'protected-source',{tick:0,last:0,relevance:.01,congruence:0,action:'groom'});
a.episodicMemories.push(protectedMemory);
for(let i=0;i<64;i++)a.episodicMemories.push(memory(a,`medium:${i}`,{tick:20+i,last:20+i,relevance:.45,congruence:.2,action:'spill'}));
a.affect={valence:-.4,activation:.5,frustration:.35,lastUpdatedTick:120,lastDecayTick:120,source:{memoryId:protectedMemory.id,sourceEventId:protectedMemory.sourceEventId,appraisedTick:protectedMemory.appraisal.appraisedTick,appliedTick:120}};
E.pruneAgentMemoriesBySalience(st,a);
assert.ok(a.episodicMemories.includes(protectedMemory),'active Affect source memory must survive pruning');
assert.equal(a.episodicMemories.length,64);
assert.equal(E.isMemoryRetentionProtected(a,protectedMemory),true);
noIssues('active affect source protected');

a.affect={valence:0,activation:0,frustration:0,lastUpdatedTick:120,lastDecayTick:120,source:null};
a.episodicMemories.push(memory(a,'new-important',{tick:120,last:120,relevance:1,congruence:1,action:'petCat',actorId:'zhou',targetId:'orange'}));
E.pruneAgentMemoriesBySalience(st,a);
assert.equal(a.episodicMemories.includes(protectedMemory),false,'neutral Affect should release retention protection so old low-salience source can leave');
noIssues('affect protection releases');

// Exact ties are deterministic: older access, older observation, then stable memory id.
E.reset(5133);st=E.getState();st.tick=100;a=st.agents.zhou;a.episodicMemories=[];
for(let i=0;i<63;i++)a.episodicMemories.push(memory(a,`stable-high:${i}`,{tick:20+i,last:20+i,relevance:.9,congruence:.8,action:'petCat',targetId:'orange'}));
const tieA=memory(a,'tie:a',{tick:1,last:1,relevance:.05,congruence:0,action:'groom'}),tieB=memory(a,'tie:b',{tick:1,last:1,relevance:.05,congruence:0,action:'groom'});
a.episodicMemories.push(tieA,tieB);
const tieRemoved=E.pruneAgentMemoriesBySalience(st,a);
assert.equal(tieRemoved.length,1);assert.equal(tieRemoved[0].id,tieA.id,'stable id should deterministically break exact ties');
noIssues('deterministic tie break');

// Re-observing the same source only refreshes access metadata; it never creates a second memory or fake recurrence.
E.reset(6133);st=E.getState();st.agents.zhou.position={x:5,y:5};
const eventId=E.addEvent('重複看見同一個測試事件。','warn',[],{actor:'zhou',action:'spill',position:'5,5'});
a=st.agents.zhou;const original=a.episodicMemories.find(m=>m.sourceEventId===eventId);assert.ok(original);
const countBefore=a.episodicMemories.length;st.tick=1;E.observeEventForMemories(st,st.causes[eventId],1);
assert.equal(a.episodicMemories.length,countBefore);assert.equal(original.lastObservedTick,1);
assert.equal(a.episodicMemories.filter(m=>m.sourceEventId===eventId).length,1);
noIssues('same source stays deduped');

// A new emotional memory is fully appraised / applied before capacity pruning, so retention can inspect its actual historical context.
E.reset(7133);st=E.getState();st.tick=80;a=st.agents.zhou;a.position={x:5,y:5};a.episodicMemories=[];
for(let i=0;i<64;i++)a.episodicMemories.push(memory(a,`pressure:${i}`,{tick:i,last:i,relevance:.3,congruence:0,action:'groom'}));
const strongId=E.addEvent('強烈且直接相關的測試事件。','warn',[],{actor:'zhou',target:'zhou',action:'spill',position:'5,5'});
const strong=a.episodicMemories.find(m=>m.sourceEventId===strongId);
assert.ok(strong,'new event must survive long enough to be appraised before pruning');
assert.ok(strong.appraisal,'new memory should already have historical appraisal when retention runs');
assert.equal(a.affect.source?.memoryId,strong.id,'Affect update should occur before retention and protect the active source');
assert.ok(a.episodicMemories.length<=64);
noIssues('hook before pruning');

// Retention remains decision-inert; only the bounded hot set changes.
E.reset(8133);st=E.getState();a=st.agents.zhen;
const beforeUtility=E.candidateIntents(st,a).map(x=>[x.intentKind,x.utility]);
a.episodicMemories=[];for(let i=0;i<70;i++)a.episodicMemories.push(memory(a,`decision:${i}`,{tick:0,last:0,relevance:i===69?1:.01,congruence:i===69?1:0,action:'groom',actorId:'zhen'}));
E.pruneAgentMemoriesBySalience(st,a);
const afterUtility=E.candidateIntents(st,a).map(x=>[x.intentKind,x.utility]);
assert.deepEqual(afterUtility,beforeUtility,'v11.13.3 memory retention must not influence deliberation utility');
noIssues('decision inert');

// Integration: bounded, validator-clean, no persistent salience mirrors, and active Affect never points at a pruned memory.
E.reset(9133);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const agent of Object.values(st.agents)){
    assert.ok(agent.episodicMemories.length<=E.MAX_EPISODIC_MEMORIES,`${agent.id} exceeded episodic memory cap`);
    for(const m of agent.episodicMemories)for(const key of ['salience','retentionScore','importance','retentionProtected'])assert.equal(Object.prototype.hasOwnProperty.call(m,key),false,`${agent.id} persisted ${key}`);
    const active=Math.abs(Number(agent.affect?.valence)||0)+(Number(agent.affect?.activation)||0)+(Number(agent.affect?.frustration)||0)>0;
    if(active&&agent.affect?.source?.memoryId)assert.ok(agent.episodicMemories.some(m=>m.id===agent.affect.source.memoryId),`${agent.id} lost active Affect source memory`);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.13.3 memory salience / pruning regression: ok');
