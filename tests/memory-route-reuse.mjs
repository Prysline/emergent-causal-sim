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
const originalBestInteractionPositionResult=SP.bestInteractionPositionResult;
const originalTraversalCost=SP.traversalCost;
let planRouteCalls=0,interactionWinnerCalls=0,traversalCostCalls=0;
SP.planRoute=function(...args){planRouteCalls++;return originalPlanRoute.apply(this,args);};
SP.bestInteractionPositionResult=function(...args){interactionWinnerCalls++;return originalBestInteractionPositionResult.apply(this,args);};
SP.traversalCost=function(...args){traversalCostCalls++;return originalTraversalCost.apply(this,args);};

let actual;
try{
  actual=E.targetEvaluations(st,a,'socialize',base);
  assert.deepEqual(actual,oracle,'Interaction Geometry route reuse must preserve target metrics and candidate ordering');
  assert.equal(interactionWinnerCalls,candidates.length,'each eligible social target must resolve one canonical interaction-position winner');
  assert.equal(planRouteCalls,candidates.length,'targetEvaluations must compute one full metric route to each resolved interaction position');
  assert.equal(traversalCostCalls,0,'targetEvaluations must reuse the interaction winner cost instead of querying a target anchor traversalCost');
  assert.equal(JSON.stringify(st),beforeJson,'route reuse must preserve exact canonical state');
  assert.equal(st.rngState,rngBefore,'route reuse must remain RNG-neutral');

  for(const target of candidates){
    const winner=originalBestInteractionPositionResult(st,a,{kind:'agent',id:target.id},'social');
    assert.ok(winner,'fixture social target must expose Interaction Geometry');
    assert.notEqual(winner.position,null);
  }
  assert.equal(JSON.stringify(st),beforeJson,'interaction-position verification must remain state-neutral');
  assert.equal(st.rngState,rngBefore,'interaction-position verification must remain RNG-neutral');
} finally {
  SP.planRoute=originalPlanRoute;
  SP.bestInteractionPositionResult=originalBestInteractionPositionResult;
  SP.traversalCost=originalTraversalCost;
}

console.log('Memory route reuse regression: ok');
