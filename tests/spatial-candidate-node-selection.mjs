import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','systems/resources.js','systems/agent-carry.js',
  'spatial.js','spatial-traversal.js','systems/physical.js','spatial-passage.js','systems/locomotion.js','engine.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;
E.reset(14600);
const st=E.getState(),a=st.agents.zhen;
const candidates=[
  SP.normalizeNode(st,{x:1,y:1}),
  SP.normalizeNode(st,{x:2,y:1}),
  SP.normalizeNode(st,{x:3,y:1})
].filter(Boolean);
assert.equal(candidates.length,3,'fixture must expose three normalized candidate nodes');

const originalPlanRoute=SP.planRoute;
const keyFor=node=>SP.nodeKey(st,node);
const profiles=new Map([
  [keyFor(candidates[0]),{traversalCost:5,pathDistance:3}],
  [keyFor(candidates[1]),{traversalCost:5,pathDistance:2}],
  [keyFor(candidates[2]),{traversalCost:5,pathDistance:2}]
]);
SP.planRoute=(_st,_agent,node,{objective}={})=>{
  const p=profiles.get(keyFor(node));
  if(!p)return {traversalCost:Infinity,pathDistance:Infinity,decisionScore:Infinity};
  return {...p,decisionScore:objective==='weighted'?p.traversalCost:p.traversalCost,path:[node],steps:[]};
};
try{
  let winner=SP.bestCandidateNodeResult(st,a,[candidates[0],candidates[2],candidates[1]],{objective:'traversalCost'});
  const tied=[candidates[1],candidates[2]].sort((x,y)=>keyFor(x).localeCompare(keyFor(y)));
  assert.ok(SP.nodeSame(st,winner.node,tied[0]),'canonical winner must use pathDistance before stable node identity');
  assert.equal(winner.objectiveValue,5);
  assert.equal(winner.pathDistance,2);

  profiles.get(keyFor(candidates[0])).traversalCost=4;
  winner=SP.bestCandidateNodeResult(st,a,[candidates[1],candidates[0]],{objective:'traversalCost'});
  assert.ok(SP.nodeSame(st,winner.node,candidates[0]),'primary objective must win before pathDistance');

  profiles.get(keyFor(candidates[0])).traversalCost=5;
  profiles.get(keyFor(candidates[0])).pathDistance=1;
  winner=SP.bestCandidateNodeResult(st,a,[candidates[0],candidates[0],candidates[1]],{objective:'traversalCost'});
  assert.ok(SP.nodeSame(st,winner.node,candidates[0]),'duplicate candidate identities must not create a second ranking truth');

  assert.throws(()=>SP.bestCandidateNodeResult(st,a,candidates,{objective:'unknown'}),/Unsupported candidate-node objective/);
}finally{
  SP.planRoute=originalPlanRoute;
}

console.log('spatial canonical candidate-node selection regression: ok');
