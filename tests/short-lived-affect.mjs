import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','systems/action/state.js','systems/intent/state.js','systems/social/state.js','systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js','engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js','systems/memory/runtime.js','systems/appraisal/runtime.js','systems/affect/runtime.js','validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js']);

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId].episodicMemories.find(m=>m.sourceEventId===eventId);

E.reset(1132);
let st=E.getState();
assert.equal(st.version,'11.29.1-slot-interaction-egress');
assert.equal(E.AFFECT_SCHEMA_VERSION,'11.13.2-short-lived-affect');
assert.equal(st.affects,undefined,'v11.13.2 must not add a global affect registry');
for(const a of Object.values(st.agents))assert.deepEqual(a.affect,{valence:0,activation:0,frustration:0,lastUpdatedTick:0,lastDecayTick:0,source:null});
noIssues('reset');

// Positive appraisal creates bounded Agent-private short-lived affect without leaking to a neutral bystander.
E.reset(1312);st=E.getState();
st.agents.zhou.position={x:5,y:5};st.agents.orange.position={x:5,y:6};st.agents.zhen.position={x:6,y:6};st.agents.orange.needs.social=90;
const petId=E.addEvent('老周摸了橘子。','normal',[],{actor:'zhou',target:'orange',action:'petAnimal',position:'5,6'});
const orangeMemory=memoryFor('orange',petId),orangeAffect=st.agents.orange.affect,zhenAffect=st.agents.zhen.affect;
assert.ok(orangeMemory?.appraisal,'target must have historical appraisal first');
assert.ok(orangeAffect.valence>0,'positive goal-congruent appraisal should produce positive short-lived valence');
assert.ok(orangeAffect.activation>0,'relevant appraisal should activate current affect');
assert.equal(orangeAffect.frustration,0,'positive petting should not invent frustration');
assert.deepEqual(orangeAffect.source,{memoryId:orangeMemory.id,sourceEventId:petId,appraisedTick:orangeMemory.appraisal.appraisedTick,appliedTick:0});
assert.deepEqual(zhenAffect,{valence:0,activation:0,frustration:0,lastUpdatedTick:0,lastDecayTick:0,source:null},'bystander must not inherit target affect');
assert.equal(Object.prototype.hasOwnProperty.call(orangeMemory.appraisal,'affect'),false,'historical appraisal must remain separate from current affect');
noIssues('positive private affect');

// Negative audited appraisal raises frustration; repeated related events can push it again but remain bounded.
E.reset(2312);st=E.getState();
st.agents.zhou.position={x:5,y:5};st.agents.orange.position={x:5,y:6};st.agents.zhen.position={x:7,y:5};
const spill1=E.addEvent('老周把水灑在地上。','warn',[],{actor:'zhou',action:'spill',position:'5,5',amount:4});
const first={...st.agents.orange.affect};
assert.ok(first.valence<0,'goal-incongruent spill should produce negative valence');
assert.ok(first.activation>0,'negative spill should activate affect');
assert.ok(first.frustration>0,'negative spill should raise frustration-like affect');
const spill2=E.addEvent('老周又把水灑在同一帶。','warn',[],{actor:'zhou',action:'spill',position:'5,5',amount:3});
const second=st.agents.orange.affect;
assert.ok(second.frustration>first.frustration,'repeated related event should push frustration again');
assert.ok(second.activation>first.activation,'repeated related event should push activation again');
assert.ok(second.frustration<=1&&second.activation<=1&&second.valence>=-1,'affect must remain bounded');
assert.equal(second.source.sourceEventId,spill2,'current affect provenance should point to the latest contributing appraisal');
noIssues('repeated negative affect');

// Re-observing the same memory does not reapply Affect because no new appraisal is formed.
const beforeReobserve=JSON.stringify(st.agents.orange.affect);
E.observeEventForMemories(st,st.causes[spill2],st.tick);
assert.equal(JSON.stringify(st.agents.orange.affect),beforeReobserve,'same-event re-observation must not reapply current affect');
noIssues('no duplicate affect on re-observation');

// With no new appraisal, explicit decay reduces all active magnitudes and eventually clears stale provenance.
const preDecay={...st.agents.orange.affect};
st.tick=1;E.decayAffectState(st,1);
const decayed=st.agents.orange.affect;
assert.ok(Math.abs(decayed.valence)<Math.abs(preDecay.valence),'valence magnitude should decay without new appraisal');
assert.ok(decayed.activation<preDecay.activation,'activation should decay without new appraisal');
assert.ok(decayed.frustration<preDecay.frustration,'frustration should decay without new appraisal');
assert.equal(decayed.lastDecayTick,1);
for(let tick=2;tick<200&&st.agents.orange.affect.source;tick++){st.tick=tick;E.decayAffectState(st,tick);}
assert.deepEqual(st.agents.orange.affect.source,null,'fully decayed affect should clear stale source');
assert.equal(st.agents.orange.affect.valence,0);assert.equal(st.agents.orange.affect.activation,0);assert.equal(st.agents.orange.affect.frustration,0);
noIssues('decay to neutral');

// Affect remains decision-inert in v11.13.2; deliberation influence belongs to later slices.
E.reset(3312);st=E.getState();
st.agents.zhou.position={x:5,y:5};st.agents.zhen.position={x:5,y:6};
const beforeUtility=E.candidateIntents(st,st.agents.zhen).map(x=>[x.intentKind,x.utility]);
E.addEvent('老周在阿真旁邊灑了水。','warn',[],{actor:'zhou',action:'spill',position:'5,6',amount:4});
assert.ok(st.agents.zhen.affect.frustration>0,'scenario must actually create affect before decision-inert assertion');
const afterUtility=E.candidateIntents(st,st.agents.zhen).map(x=>[x.intentKind,x.utility]);
assert.deepEqual(afterUtility,beforeUtility,'v11.13.2 affect must not influence candidate utility');
noIssues('decision inert');

// Integration: tick-driven decay and new appraisal updates stay bounded and validator-clean.
E.reset(4312);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const a of Object.values(st.agents)){
    const f=a.affect;
    assert.ok(f.valence>=-1&&f.valence<=1,`${a.id} valence out of bounds`);
    assert.ok(f.activation>=0&&f.activation<=1,`${a.id} activation out of bounds`);
    assert.ok(f.frustration>=0&&f.frustration<=1,`${a.id} frustration out of bounds`);
    assert.ok(f.lastDecayTick<=st.tick,`${a.id} decay tick ahead of state`);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.13.2 short-lived affect regression: ok');