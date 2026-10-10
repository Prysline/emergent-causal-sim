import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;

function calm(a,{social=0}={}){
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social});
  a.action=null;a.activeIntent=null;a.offMap=false;
  a.posture={kind:'standing',slotId:null,furnitureId:null};
}
function withSocialQueryCount(run){
  const original=SP.bestInteractionPositionResult;
  let calls=0;
  SP.bestInteractionPositionResult=function(st,a,target,affordance='default'){
    if(affordance==='social'&&target?.kind==='agent')calls++;
    return original.call(this,st,a,target,affordance);
  };
  try{return {value:run(),calls};}
  finally{SP.bestInteractionPositionResult=original;}
}

// Standalone utilityForIntent remains a complete availability oracle. candidateIntents may
// reuse only the target it already resolved inside the same deliberation call.
E.reset(20260911);
{
  const st=E.getState(),actor=st.agents.zhen,target=st.agents.zhou;
  st.agents.orange.offMap=true;
  calm(actor,{social:80});calm(target);
  actor.position={x:5,y:5};target.position={x:7,y:5};

  const standalone=withSocialQueryCount(()=>E.utilityForIntent(st,actor,'socialize'));
  assert.equal(standalone.value,E.baseUtilityForAction(actor,'talk'),'standalone socialize utility must keep canonical availability semantics');
  assert.equal(standalone.calls,1,'standalone socialize utility must still resolve its own social availability');

  const beforeJson=JSON.stringify(st),rngBefore=st.rngState;
  const candidates=withSocialQueryCount(()=>E.candidateIntents(st,actor));
  const social=candidates.value.find(c=>c.intentKind==='socialize');
  assert.equal(social?.targetAgent,target.id,'candidateIntents must keep the canonical nearest reachable Human target');
  assert.equal(candidates.calls,1,'candidateIntents must reuse the Human social target instead of repeating the same availability query');
  assert.equal(JSON.stringify(st),beforeJson,'candidate generation must remain state-neutral');
  assert.equal(st.rngState,rngBefore,'candidate generation must remain RNG-neutral');
}

// Animal social ineligibility must be checked before route work. This is an execution-cost
// invariant only; the existing >14 eligibility threshold is unchanged.
E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,human=st.agents.zhou;
  st.agents.zhen.offMap=true;
  calm(cat,{social:0});calm(human);
  cat.position={x:5,y:5};human.position={x:7,y:5};
  const low=withSocialQueryCount(()=>E.candidateIntents(st,cat));
  assert.equal(low.value.some(c=>c.intentKind==='seekSocialContact'),false);
  assert.equal(low.calls,0,'ineligible animal social Need must not trigger nearest-Human route queries');
}

// Eligible animal social candidates likewise reuse the already resolved Human target once.
E.reset(20260911);
{
  const st=E.getState(),cat=st.agents.orange,human=st.agents.zhou;
  st.agents.zhen.offMap=true;
  calm(cat,{social:80});calm(human);
  cat.position={x:5,y:5};human.position={x:7,y:5};

  const standalone=withSocialQueryCount(()=>E.utilityForIntent(st,cat,'seekSocialContact'));
  assert.equal(standalone.value,E.baseUtilityForAction(cat,'seekHuman'),'standalone animal social utility must retain canonical availability semantics');
  assert.equal(standalone.calls,1,'standalone animal social utility must still resolve its own Human availability');

  const candidates=withSocialQueryCount(()=>E.candidateIntents(st,cat));
  const social=candidates.value.find(c=>c.intentKind==='seekSocialContact');
  assert.equal(social?.targetAgent,human.id,'eligible animal social candidate must keep the canonical reachable Human target');
  assert.equal(candidates.calls,1,'candidateIntents must reuse the animal social target instead of repeating the availability query');
}

console.log('Intent social availability query reuse regression: ok');
