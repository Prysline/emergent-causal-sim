import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','systems/action/state.js','systems/intent/state.js','systems/social/state.js','systems/memory/state.js','systems/appraisal/state.js','engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js','systems/memory/runtime.js','systems/appraisal/runtime.js','validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js']);

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId].episodicMemories.find(m=>m.sourceEventId===eventId);

E.reset(1131);
let st=E.getState();
assert.equal(st.version,'11.22.1-editor-resident-capabilities');
assert.equal(E.APPRAISAL_SCHEMA_VERSION,'11.13.1-event-appraisal');
assert.equal(st.appraisals,undefined,'v11.13.1 must not add a global appraisal registry');
noIssues('reset');

function petScenario(socialNeed){
  E.reset(1311);const s=E.getState();
  s.agents.zhou.position={x:5,y:5};
  s.agents.orange.position={x:5,y:6};
  s.agents.zhen.position={x:6,y:6};
  s.agents.orange.needs.social=socialNeed;
  const id=E.addEvent('老周摸了橘子。','normal',[],{actor:'zhou',target:'orange',action:'petAnimal',position:'5,6',debugSecret:'must not enter appraisal'});
  return {st:s,id,zhou:memoryFor('zhou',id),orange:memoryFor('orange',id),zhen:memoryFor('zhen',id)};
}

// Focused story A: one canonical event produces separate Agent-private meanings.
let scene=petScenario(90);st=scene.st;
assert.equal(st.events.filter(e=>e.id===scene.id).length,1,'world event must remain canonical');
assert.ok(scene.zhou&&scene.orange&&scene.zhen,'all three nearby awake Agents should remember the event');
assert.notEqual(scene.orange.appraisal,scene.zhou.appraisal,'appraisal objects are Agent-private');
assert.notEqual(scene.orange.appraisal,scene.zhen.appraisal,'appraisal objects are Agent-private');
assert.ok(scene.orange.appraisal.relevance>scene.zhou.appraisal.relevance,'direct social target should find the event more relevant than the actor');
assert.ok(scene.zhou.appraisal.relevance>scene.zhen.appraisal.relevance,'actor self relevance should exceed a bystander baseline');
assert.ok(scene.orange.appraisal.goalCongruence>.5,'high-social target should appraise petting as strongly goal-congruent');
assert.ok(scene.zhen.appraisal.goalCongruence===0,'bystander should not inherit the target emotional meaning');
assert.deepEqual(scene.orange.appraisal.agency,{kind:'other',agentId:'zhou'});
assert.deepEqual(scene.zhou.appraisal.agency,{kind:'self'});
assert.deepEqual(scene.zhen.appraisal.agency,{kind:'other',agentId:'zhou'});
assert.equal(scene.orange.appraisal.ruleId,'petAnimal-v1');
assert.equal(Object.prototype.hasOwnProperty.call(scene.orange.appraisal,'valence'),false);
assert.equal(Object.prototype.hasOwnProperty.call(scene.orange.appraisal,'affect'),false);
assert.equal(JSON.stringify(scene.orange.appraisal).includes('debugSecret'),false,'raw event data must not leak into appraisal');
noIssues('different observers');

// Counterfactual A/B: only social need changes; appraisal changes, not the world event semantics.
const high=petScenario(90).orange.appraisal;
const low=petScenario(10).orange.appraisal;
assert.ok(high.relevance>low.relevance,'higher social need should raise petAnimal relevance');
assert.ok(high.goalCongruence>low.goalCongruence,'higher social need should raise positive goal congruence');

// Unknown actions use conservative role baseline instead of invented semantics.
E.reset(7);st=E.getState();
st.agents.zhou.position={x:5,y:5};st.agents.orange.position={x:5,y:6};
const unknownId=E.addEvent('老周做了一個尚未 audited 的動作。','normal',[],{actor:'zhou',target:'orange',action:'futureUnknownAction',position:'5,6',secretIntent:'unknown'});
const unknown=memoryFor('orange',unknownId);
assert.ok(unknown);
assert.equal(unknown.appraisal.ruleId,'baseline-v1');
assert.equal(unknown.appraisal.goalCongruence,0,'unknown action must not invent positive/negative meaning');
assert.deepEqual(unknown.appraisal.factors.map(f=>f.kind),['directTarget']);
noIssues('unknown baseline');

// Focused story B: audited spill semantics are negative and distance-sensitive without creating Affect.
E.reset(8);st=E.getState();
st.agents.zhou.position={x:5,y:5};st.agents.orange.position={x:5,y:6};st.agents.zhen.position={x:7,y:5};
const spillId=E.addEvent('老周把水灑在地上。','warn',[],{actor:'zhou',action:'spill',position:'5,5',amount:4});
const nearSpill=memoryFor('orange',spillId).appraisal,farSpill=memoryFor('zhen',spillId).appraisal;
assert.ok(nearSpill.relevance>farSpill.relevance,'nearer observer should find a spill more relevant');
assert.ok(nearSpill.goalCongruence<farSpill.goalCongruence,'nearer spill should be more goal-incongruent');
assert.ok(nearSpill.goalCongruence<0);
assert.equal(Object.prototype.hasOwnProperty.call(nearSpill,'fear'),false);
assert.equal(Object.prototype.hasOwnProperty.call(nearSpill,'anger'),false);
noIssues('spill appraisal');

// Historical stability: later needs and re-observation update access metadata only, never rewrite appraisal.
scene=petScenario(85);st=scene.st;
const original=JSON.stringify(scene.orange.appraisal),originalTick=scene.orange.appraisal.appraisedTick;
st.tick=1;st.agents.orange.needs.social=0;
E.observeEventForMemories(st,st.causes[scene.id],1);
const revisited=memoryFor('orange',scene.id);
assert.equal(revisited.lastObservedTick,1);
assert.equal(revisited.appraisal.appraisedTick,originalTick);
assert.equal(JSON.stringify(revisited.appraisal),original,'re-observation must not silently reappraise history');
noIssues('historical stability');

// Appraisal remains decision-inert in v11.13.1.
E.reset(9);st=E.getState();
const beforeUtility=E.candidateIntents(st,st.agents.zhen).map(x=>[x.intentKind,x.utility]);
E.addEvent('附近發生一個只用於 appraisal 的事件。','normal',[],{actor:'zhou',target:'zhen',action:'futureUnknownAction',position:E.positionRef(st.agents.zhen.position)});
const afterUtility=E.candidateIntents(st,st.agents.zhen).map(x=>[x.intentKind,x.utility]);
assert.deepEqual(afterUtility,beforeUtility,'appraisal must not influence deliberation before v11.13.4');
noIssues('decision inert');

// Integration: every new episodic memory gets one bounded historical appraisal and the state remains clean.
E.reset(77);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const a of Object.values(st.agents))for(const m of a.episodicMemories){
    assert.ok(m.appraisal,`${a.id}/${m.id} missing appraisal`);
    assert.equal(m.appraisal.appraisedTick,m.observedTick,`${a.id}/${m.id} was reappraised`);
    assert.ok(m.appraisal.relevance>=0&&m.appraisal.relevance<=1);
    assert.ok(m.appraisal.goalCongruence>=-1&&m.appraisal.goalCongruence<=1);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.13.1 event appraisal regression: ok');
