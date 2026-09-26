import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','systems/locomotion.js','crowding-runtime-v1200.js','engine.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,C=globalThis.SimCrowding;
assert.equal(SP.VERSION,'11.30.0-metric-route-locomotion');

function zOf(p){return SP.zOf?SP.zOf(p):(p?.z??0);}
function localSame(a,b){return !!a&&!!b&&a.x===b.x&&a.y===b.y&&zOf(a)===zOf(b);}
function legacyBest(st,a,target,affordance){
  const positions=SP.interactionPositions(st,target,a,affordance);
  let list=positions.map(p=>({
    p,
    d:SP.traversalCost(st,a,p),
    occ:SP.nodeOccupantsAt(st,p,a.id).length
  })).filter(x=>Number.isFinite(x.d));
  const current=SP.nodeForAgent(st,a);
  const differentNodeSameXY=x=>localSame(current,x.p)&&!SP.nodeSame(st,current,x.p);
  if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));
  list.sort((x,y)=>(C?0:x.occ-y.occ)||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));
  return list[0]?.p||null;
}
function counted(st,a,target,affordance,fn){
  const original=SP.traversalFeasibility;
  let calls=0;
  SP.traversalFeasibility=(...args)=>{calls++;return original(...args);};
  try{return {value:fn(st,a,target,affordance),calls};}
  finally{SP.traversalFeasibility=original;}
}

E.reset(20260925);
const st=E.getState(),a=st.agents.zhen;
st.agents.orange.offMap=true;

const cases=[
  [{kind:'object',id:'mealTray'},'serve'],
  [{kind:'object',id:'mealTray'},'eatFrom'],
  [{kind:'object',id:'plateB'},'eatFrom']
];

let standaloneCalls=0,batchedCalls=0;
for(const [target,affordance] of cases){
  const positions=SP.interactionPositions(st,target,a,affordance);
  assert.ok(positions.length>=2,`${target.id}/${affordance} fixture must expose multiple interaction positions`);

  const floorCandidate=positions.find(p=>(p.surfaceId||'floor')==='floor');
  if(floorCandidate){
    st.agents.zhou.offMap=false;
    st.agents.zhou.position={...floorCandidate};
    st.agents.zhou.action=null;
    st.agents.zhou.locomotion={mode:null,phase:'idle'};
  }

  const legacy=counted(st,a,target,affordance,legacyBest);
  const batch=counted(st,a,target,affordance,(state,agent,tgt,aff)=>SP.bestInteractionPosition(state,agent,tgt,aff));
  const rich=counted(st,a,target,affordance,(state,agent,tgt,aff)=>SP.bestInteractionPositionResult(state,agent,tgt,aff));
  assert.ok(legacy.value,`${target.id}/${affordance} legacy scorer must find a reachable interaction position`);
  assert.ok(batch.value,`${target.id}/${affordance} batched scorer must find a reachable interaction position`);
  assert.ok(rich.value,`${target.id}/${affordance} richer scorer must find a reachable interaction result`);
  assert.ok(SP.nodeSame(st,batch.value,legacy.value),`${target.id}/${affordance} batching must preserve the legacy traversal-cost winner and tie-break semantics`);
  assert.ok(SP.nodeSame(st,rich.value.position,batch.value),`${target.id}/${affordance} richer result position must exactly match the position-only API`);
  assert.equal(rich.value.traversalCost,SP.traversalCost(st,a,rich.value.position),`${target.id}/${affordance} richer traversalCost must equal canonical winner re-query`);
  assert.equal(Object.hasOwn(batch.value,'position'),false,`${target.id}/${affordance} position-only API must not change return shape`);
  assert.equal(rich.calls,batch.calls,`${target.id}/${affordance} richer result must reuse the same batched winner search without extra feasibility work`);
  assert.ok(batch.calls<legacy.calls,`${target.id}/${affordance} must use fewer traversal-feasibility queries than independent per-position routes (${batch.calls} < ${legacy.calls})`);
  standaloneCalls+=legacy.calls;
  batchedCalls+=batch.calls;
}

assert.ok(batchedCalls<standaloneCalls,'interaction-position batching must reduce aggregate traversal-feasibility work');
const missingTarget={kind:'object',id:'missing-interaction-target'};
assert.equal(SP.bestInteractionPosition(st,a,missingTarget,'pickup'),null,'position-only API must preserve missing/unreachable null behavior');
assert.equal(SP.bestInteractionPositionResult(st,a,missingTarget,'pickup'),null,'richer API must preserve missing/unreachable null behavior');
console.log('INTERACTION_POSITION_BATCHING '+JSON.stringify({standaloneCalls,batchedCalls,reduction:standaloneCalls-batchedCalls}));
console.log('interaction-position multi-goal traversal-cost batching regression: ok');
