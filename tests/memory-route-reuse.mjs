import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js',
  'spatial.js','spatial-traversal.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js','systems/relationship/state.js',
  'engine.js','runtime-hook-pipeline.js',
  'systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js',
  'systems/intent/replanning.js','systems/intent/deliberation.js',
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/affect/runtime.js',
  'systems/memory/retention.js','systems/relationship/runtime.js','systems/memory/deliberation.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;

function calm(a,{social=70}={}){
  Object.assign(a.needs,{hunger:8,thirst:8,fatigue:8,sleepNeed:8,social});
  a.action=null;a.activeIntent=null;a.offMap=false;
}
function addHuman(st,id,name,position){
  const clone=structuredClone(st.agents.zhou);
  clone.id=id;clone.name=name;clone.position={...position};
  clone.action=null;clone.activeIntent=null;clone.episodicMemories=[];
  clone.observedSocialBids=[];delete clone.pendingInteraction;clone.offMap=false;
  st.agents[id]=clone;
  return clone;
}
function sortEvaluations(list){
  return list.sort((x,y)=>
    y.targetPreference-x.targetPreference||
    y.finalUtility-x.finalUtility||
    x.traversalCost-y.traversalCost||
    x.pathDistance-y.pathDistance||
    String(x.targetAgent).localeCompare(String(y.targetAgent))
  );
}

E.reset(20260926);
const st=E.getState(),a=st.agents.zhen,zhou=st.agents.zhou;
calm(a,{social:76});calm(zhou,{social:35});
a.position={x:5,y:5};zhou.position={x:5,y:6};
st.agents.orange.offMap=true;
const mei=addHuman(st,'mei','小梅',{x:7,y:5});calm(mei,{social:35});

const base=E.utilityForIntent(st,a,'socialize');
const candidates=[zhou,mei];
const beforeJson=JSON.stringify(st),rngBefore=st.rngState;

// Direct targetEvaluation remains the semantic oracle: each target computes
// its own current traversal-cost route and all derived route metrics.
const oracle=sortEvaluations(candidates.map(target=>
  E.targetEvaluation(st,a,target,'socialize',base)
));
assert.equal(JSON.stringify(st),beforeJson,'direct target evaluation must remain state-neutral');
assert.equal(st.rngState,rngBefore,'direct target evaluation must remain RNG-neutral');

const originalPlanRoute=SP.planRoute;
const originalTraversalCost=SP.traversalCost;
let planRouteCalls=0,traversalCostCalls=0;
SP.planRoute=function(...args){planRouteCalls++;return originalPlanRoute.apply(this,args);};
SP.traversalCost=function(...args){traversalCostCalls++;return originalTraversalCost.apply(this,args);};

let actual;
try{
  actual=E.targetEvaluations(st,a,'socialize',base);
  assert.deepEqual(actual,oracle,'route reuse must preserve target metrics and candidate ordering');
  assert.equal(planRouteCalls,candidates.length,'targetEvaluations must compute one full route per eligible target');
  assert.equal(traversalCostCalls,0,'targetEvaluations must not run a separate reachability traversalCost query');
  assert.equal(JSON.stringify(st),beforeJson,'route reuse must preserve exact canonical state');
  assert.equal(st.rngState,rngBefore,'route reuse must remain RNG-neutral');

  // Model the former production shape: one traversalCost reachability query,
  // followed by targetEvaluation (which performs the same planRoute again).
  planRouteCalls=0;traversalCostCalls=0;
  const legacy=sortEvaluations(candidates
    .map(target=>({target,traversalCost:SP.traversalCost(st,a,target.position)}))
    .filter(x=>Number.isFinite(x.traversalCost))
    .map(({target})=>E.targetEvaluation(st,a,target,'socialize',base)));
  assert.deepEqual(legacy,actual,'focused legacy shape and production reuse must be semantically identical');
  assert.equal(traversalCostCalls,candidates.length,'legacy fixture must execute one reachability traversalCost per target');
  assert.equal(planRouteCalls,candidates.length,'legacy fixture must execute one evaluation planRoute per target');
  assert.equal(traversalCostCalls,candidates.length,'legacy fixture must contain one additional reachability route query per target');
  assert.equal(JSON.stringify(st),beforeJson,'legacy comparison must also remain state-neutral');
  assert.equal(st.rngState,rngBefore,'legacy comparison must remain RNG-neutral');
} finally {
  SP.planRoute=originalPlanRoute;
  SP.traversalCost=originalTraversalCost;
}

console.log('Memory route reuse regression: ok');
