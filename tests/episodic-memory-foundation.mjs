import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','systems/action/state.js','systems/intent/state.js','systems/social/state.js','systems/memory/state.js','engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js','systems/memory/runtime.js','validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js']);

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const memories=id=>E.getState().agents[id].episodicMemories;

E.reset(1130);
let st=E.getState();
assert.equal(st.version,'11.27.0-furniture-orientation');
assert.equal(E.MEMORY_SCHEMA_VERSION,'11.13.0-episodic-memory-foundation');
assert.equal(E.MAX_EPISODIC_MEMORIES,64);
assert.equal(E.EPISODIC_OBSERVATION_RANGE,4);
for(const a of Object.values(st.agents))assert.deepEqual(a.episodicMemories,[]);
noIssues('reset');

// Focused causal story: one canonical world event, separate Agent-local memories, and a far observer gets nothing.
E.reset(1);st=E.getState();
st.agents.zhou.position={x:5,y:5};
st.agents.orange.position={x:5,y:6};
st.agents.zhen.position={x:1,y:1};
const spillId=E.addEvent('老周在測試中灑出了一些水。','warn',[],{actor:'zhou',action:'spill',resource:'water',amount:3,position:'5,5',debugSecret:'not observable'});
const spill=st.causes[spillId];
assert.ok(spill,'canonical event should exist exactly once');
assert.equal(st.events.filter(e=>e.id===spillId).length,1);
assert.equal(memories('zhou').length,1,'actor should remember own observable action');
assert.equal(memories('orange').length,1,'nearby awake observer should remember the event');
assert.equal(memories('zhen').length,0,'far observer must not gain the memory');
const zhouMemory=memories('zhou')[0],orangeMemory=memories('orange')[0];
assert.equal(zhouMemory.sourceEventId,spillId);
assert.equal(orangeMemory.sourceEventId,spillId);
assert.notEqual(zhouMemory.id,orangeMemory.id,'each Agent owns a separate memory entity');
assert.equal(zhouMemory.id,`memory:zhou:${spillId}`);
assert.equal(orangeMemory.id,`memory:orange:${spillId}`);
assert.deepEqual(Object.keys(orangeMemory.observed).sort(),['action','actorId','positionRef','targetId']);
assert.deepEqual(orangeMemory.observed,{action:'spill',actorId:'zhou',targetId:null,positionRef:'5,5'});
assert.equal(Object.prototype.hasOwnProperty.call(orangeMemory,'text'),false);
assert.equal(Object.prototype.hasOwnProperty.call(orangeMemory,'data'),false);
assert.equal(Object.prototype.hasOwnProperty.call(orangeMemory.observed,'debugSecret'),false,'event.data must not be copied wholesale into memory');
noIssues('focused observer boundary');

// Re-processing the same world event updates access metadata instead of duplicating the episode.
st.tick=1;
E.observeEventForMemories(st,spill,1);
assert.equal(memories('orange').length,1);
assert.equal(memories('orange')[0].observedTick,0);
assert.equal(memories('orange')[0].lastObservedTick,1);
noIssues('same event dedupe');

// Plan / private cognition is not converted into bystander episodic memory.
const beforePrivate=memories('orange').length;
E.addEvent('老周決定做一件事。','system',[],{actor:'zhou',action:'wander',phase:'plan',position:'5,5'});
E.addEvent('老周內心改變了主意。','normal',[],{actor:'zhou',action:'intentReconsider',position:'5,5',priorIntentId:'intent:zhou:0:explore',priorIntentKind:'explore',priorActionKind:'wander',intentId:'intent:zhou:1:satisfyHunger:soft',intentKind:'satisfyHunger',nextActionKind:'eat',challengerIntentKind:'satisfyHunger',currentUtility:10,challengerUtility:30,switchMargin:14,commitmentCost:2,switchThreshold:26});
E.addEvent('老周停止等待。','normal',[],{actor:'zhou',action:'socialWaitEnded',visibility:'private',owner:'zhou',position:'5,5'});
assert.equal(memories('orange').length,beforePrivate);
assert.equal(memories('zhou').length,1,'private/plan events should not become v11.13.0 world-event memories either');
noIssues('private cognition excluded');

// Memory is inert in v11.13.0: adding an episode alone does not change decision utility.
E.reset(2);st=E.getState();
const human=st.agents.zhen;
const beforeUtility=E.candidateIntents(st,human).map(x=>[x.intentKind,x.utility]);
E.addEvent('附近發生一個不改變 world state 的測試事件。','normal',[],{actor:'zhou',action:'groom',position:E.positionRef(human.position)});
assert.ok(memories('zhen').length>0);
const afterUtility=E.candidateIntents(st,human).map(x=>[x.intentKind,x.utility]);
assert.deepEqual(afterUtility,beforeUtility,'memory must not influence deliberation before v11.13.4');
noIssues('memory is decision-inert');

// Provenance may leave the hot cause graph; the immutable minimal snapshot remains usable.
E.reset(3);st=E.getState();st.agents.zhou.position={x:5,y:5};
const oldId=E.addEvent('一個之後會離開 hot cause state 的事件。','warn',[],{actor:'zhou',action:'spill',position:'5,5'});
const oldMemory=memories('zhou').find(m=>m.sourceEventId===oldId);assert.ok(oldMemory);
for(let i=0;i<420;i++)E.addEvent(`history filler ${i}`,'system',[],{index:i});
assert.equal(st.causes[oldId],undefined,'source event should be allowed to leave hot cause storage');
const surviving=memories('zhou').find(m=>m.sourceEventId===oldId);assert.ok(surviving,'memory snapshot should survive source-event pruning');
assert.equal(surviving.observed.action,'spill');
assert.equal(surviving.observed.positionRef,'5,5');
noIssues('snapshot survives event pruning');

// Fixed FIFO cap keeps v11.13.0 hot memory bounded without prematurely adding salience logic.
E.reset(4);st=E.getState();st.agents.zhou.position={x:5,y:5};
const created=[];
for(let i=0;i<70;i++)created.push(E.addEvent(`bounded memory ${i}`,'normal',[],{actor:'zhou',action:'spill',position:'5,5'}));
assert.equal(memories('zhou').length,E.MAX_EPISODIC_MEMORIES);
assert.deepEqual(memories('zhou').map(m=>m.sourceEventId),created.slice(-E.MAX_EPISODIC_MEMORIES));
assert.equal(memories('zhou').some(m=>m.sourceEventId===created[0]),false,'FIFO should discard the oldest episode first');
noIssues('fixed memory cap');

// Integration: memory remains bounded and validator-clean during normal simulation.
E.reset(77);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const a of Object.values(st.agents)){
    assert.ok(Array.isArray(a.episodicMemories));
    assert.ok(a.episodicMemories.length<=E.MAX_EPISODIC_MEMORIES,`${a.id} exceeded episodic memory cap`);
    assert.equal(new Set(a.episodicMemories.map(m=>m.sourceEventId)).size,a.episodicMemories.length,`${a.id} duplicated a source event`);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.13.0 episodic memory foundation regression: ok');
