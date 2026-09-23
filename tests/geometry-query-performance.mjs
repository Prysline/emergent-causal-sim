import vm from 'node:vm';
import assert from 'node:assert/strict';
import {runtimeProfilePaths,loadRuntimeProfile} from './helpers/test-profiles.mjs';
void loadRuntimeProfile; // declare the canonical runtime-profile contract while source is custom-loaded for instrumentation
import {readRepoFile} from './helpers/production-loader.mjs';

globalThis.window=globalThis;

function edgeKey(from,to){
  const key=p=>p?[(p.spaceId??''),(p.surfaceId??'floor'),(p.z??0),p.x,p.y].join('|'):'?';
  return key(from)+'>'+key(to);
}
function nodeKey(p){
  return p?[(p.spaceId??''),(p.surfaceId??'floor'),(p.z??0),p.x,p.y].join('|'):'?';
}
const store=new Map(),scopedStore=new Map();
let currentScope='unscoped';
function bump(map,name,key){
  let row=map.get(name);
  if(!row){row={calls:0,keys:new Map()};map.set(name,row);}
  row.calls++;
  row.keys.set(String(key),(row.keys.get(String(key))||0)+1);
}
function summarize(map){
  const out={};
  for(const [name,row] of map){
    const top=[...row.keys.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([key,count])=>({key,count}));
    out[name]={
      calls:row.calls,
      uniqueKeys:row.keys.size,
      repeatedCalls:row.calls-row.keys.size,
      repeatRatio:row.calls?Number((row.calls/Math.max(1,row.keys.size)).toFixed(2)):0,
      maxPerKey:top[0]?.count||0,
      top
    };
  }
  return out;
}
globalThis.__geometryPerf={
  track(name,key){
    bump(store,name,key);
    const scopeKey=currentScope+'::'+name;
    bump(scopedStore,scopeKey,key);
  },
  scope(label,fn){
    const previous=currentScope;
    currentScope=label;
    try{return fn();}finally{currentScope=previous;}
  },
  nodeKey,
  edgeKey,
  reset(){store.clear();scopedStore.clear();currentScope='unscoped';},
  snapshot(){
    const out=summarize(store),scoped=summarize(scopedStore);
    const byScope={};
    for(const [compound,row] of Object.entries(scoped)){
      const split=compound.indexOf('::'),scope=compound.slice(0,split),name=compound.slice(split+2);
      if(!byScope[scope])byScope[scope]={};
      byScope[scope][name]=row;
    }
    out._scopes=byScope;
    return out;
  }
};

const paths=runtimeProfilePaths([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js',
  'systems/locomotion.js','crowding-runtime-v1200.js',
  'engine.js'
]);

const patches={
  'src/spatial.js':[
    ["const approach=runtime.bestSlotApproachNode?.(st,slot,a,{mode:'walk',objective:'traversalCost'})||null;","const approach=globalThis.__geometryPerf.scope('slotApproach',()=>runtime.bestSlotApproachNode?.(st,slot,a,{mode:'walk',objective:'traversalCost'})||null);"],
    ["const approach=runtime.bestSlotApproachNode?.(st,slot,a,{mode:'walk',objective:'traversalCost'})||null;","const approach=globalThis.__geometryPerf.scope('slotApproach',()=>runtime.bestSlotApproachNode?.(st,slot,a,{mode:'walk',objective:'traversalCost'})||null);"],
    ["const distances=targetPathDistances(st,a,pending.map(target=>target.position),runtime);","const distances=globalThis.__geometryPerf.scope('pathDistances',()=>targetPathDistances(st,a,pending.map(target=>target.position),runtime));"],
    ["const distances=targetPathDistances(st,a,pending.map(target=>target.position),runtime);","const distances=globalThis.__geometryPerf.scope('pathDistances',()=>targetPathDistances(st,a,pending.map(target=>target.position),runtime));"]
  ],
  'src/spatial-traversal.js':[
    ['function furnitureSolids(st,z){',"function furnitureSolids(st,z){globalThis.__geometryPerf.track('furnitureSolids',String(z));"],
    ['function floorGeometry(st,p){',"function floorGeometry(st,p){globalThis.__geometryPerf.track('floorGeometry',globalThis.__geometryPerf.nodeKey(p));"],
    ["function bestSlotApproachNode(st,slotOrId,aOrId=null,{mode='walk',objective='traversalCost'}={}){","function bestSlotApproachNode(st,slotOrId,aOrId=null,{mode='walk',objective='traversalCost'}={}){globalThis.__geometryPerf.track('bestSlotApproachCall',typeof slotOrId==='string'?slotOrId:(slotOrId?.id||'?'));"],
    ["function routeStateSearch(st,start,aOrId=null,options={}){","function routeStateSearch(st,start,aOrId=null,options={}){globalThis.__geometryPerf.track('routeStateSearchCall',(options.objective||'traversalCost')+'|'+(options.trackPath?'trackPath':'batch'));"],
    ["function pathDistances(st,aOrId,targets,{mode=null}={}){","function pathDistances(st,aOrId,targets,{mode=null}={}){globalThis.__geometryPerf.track('pathDistancesCall',Array.isArray(targets)?targets.length:0);"],
    ["function planRoute(st,aOrId,goal,{mode=null,objective='traversalCost'}={}){","function planRoute(st,aOrId,goal,{mode=null,objective='traversalCost'}={}){globalThis.__geometryPerf.track('planRouteCall',objective+'|'+globalThis.__geometryPerf.nodeKey(goal));"]
  ],
  'src/furniture-definitions.js':[
    ['function analyzeFloorTile(solids,x,y,layerZ){',"function analyzeFloorTile(solids,x,y,layerZ){globalThis.__geometryPerf.track('analyzeFloorTile',[layerZ,x,y].join('|'));"],
    ['function envelopeFitsTile(solids,x,y,layerZ,clearanceHeight,clearanceWidth){',"function envelopeFitsTile(solids,x,y,layerZ,clearanceHeight,clearanceWidth){globalThis.__geometryPerf.track('envelopeFitsTile',[layerZ,x,y,Number(clearanceHeight).toFixed(6),Number(clearanceWidth).toFixed(6)].join('|'));"],
    ['function edgeClearanceOptions(solids,from,to,layerZ){',"function edgeClearanceOptions(solids,from,to,layerZ){globalThis.__geometryPerf.track('edgeClearanceOptions',globalThis.__geometryPerf.edgeKey(from,to));"]
  ],
  'src/spatial-passage.js':[
    ['function getPassageProfile(st,from,to){',"function getPassageProfile(st,from,to){globalThis.__geometryPerf.track('getPassageProfile',globalThis.__geometryPerf.edgeKey(from,to));"],
    ['function traversalFeasibility(st,agent,from,to){',"function traversalFeasibility(st,agent,from,to){globalThis.__geometryPerf.track('traversalFeasibility',(agent?.kind||agent?.id||'?')+'|'+globalThis.__geometryPerf.edgeKey(from,to));"]
  ]
};

for(const path of paths){
  let source=readRepoFile(path);
  for(const [from,to] of patches[path]||[]){
    assert.ok(source.includes(from),'geometry instrumentation anchor missing: '+path+' :: '+from);
    source=source.replace(from,to);
  }
  vm.runInThisContext(source,{filename:path});
}

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;

function isolate(st,agent){
  for(const other of Object.values(st.agents||{}))if(other.id!==agent.id)other.offMap=true;
}
function measureHumanRoute(){
  E.reset(20260911);
  const st=E.getState(),agent=st.agents.zhen;
  isolate(st,agent);
  const goal=SP.normalizeNode(st,st.exits.frontExit.access,'floor');
  globalThis.__geometryPerf.reset();
  const route=SP.planRoute(st,agent,goal,{mode:'auto',objective:'traversalCost'});
  assert.ok(route.pathDistance>0&&Number.isFinite(route.traversalCost),'Human route diagnostic fixture must produce a real route');
  return {pathDistance:route.pathDistance,metrics:globalThis.__geometryPerf.snapshot()};
}
function measureHumanRest(){
  E.reset(20260911);
  const st=E.getState(),agent=st.agents.zhen;
  isolate(st,agent);
  globalThis.__geometryPerf.reset();
  const targets=SP.restTargets(st,agent);
  assert.ok(targets.length>0,'Human rest diagnostic fixture must produce targets');
  return {targetCount:targets.length,metrics:globalThis.__geometryPerf.snapshot()};
}
function measureHumanSleep(){
  E.reset(20260911);
  const st=E.getState(),agent=st.agents.zhen;
  isolate(st,agent);
  globalThis.__geometryPerf.reset();
  const targets=SP.sleepTargets(st,agent);
  assert.ok(targets.length>0,'Human sleep diagnostic fixture must produce targets');
  return {targetCount:targets.length,metrics:globalThis.__geometryPerf.snapshot()};
}
function measureCatRest(){
  E.reset(20260911);
  const st=E.getState(),agent=st.agents.orange;
  isolate(st,agent);
  globalThis.__geometryPerf.reset();
  const targets=SP.restTargets(st,agent);
  assert.ok(targets.filter(target=>target.kind==='floor').length>20,'Cat rest diagnostic fixture must retain broad floor candidate coverage');
  return {targetCount:targets.length,floorTargetCount:targets.filter(target=>target.kind==='floor').length,metrics:globalThis.__geometryPerf.snapshot()};
}

const report={
  humanRoute:measureHumanRoute(),
  humanRest:measureHumanRest(),
  humanSleep:measureHumanSleep(),
  catRest:measureCatRest()
};

const humanRouteAnalyze=report.humanRoute.metrics.analyzeFloorTile;
const humanRouteFit=report.humanRoute.metrics.envelopeFitsTile;
const humanRestAnalyze=report.humanRest.metrics.analyzeFloorTile;
const humanRestFit=report.humanRest.metrics.envelopeFitsTile;
const catRestAnalyze=report.catRest.metrics.analyzeFloorTile;
const catRestFit=report.catRest.metrics.envelopeFitsTile;

assert.ok(humanRouteAnalyze.calls<=100,`single-route floor analysis regressed to ${humanRouteAnalyze.calls} calls`);
assert.ok(humanRouteAnalyze.repeatRatio<2,`single-route floor analysis repeat ratio regressed to ${humanRouteAnalyze.repeatRatio}`);
assert.ok(humanRouteFit.calls<=220,`single-route envelope fit regressed to ${humanRouteFit.calls} calls`);
assert.equal(humanRouteFit.repeatedCalls,0,'single-route envelope fit should be memoized exactly by tile + envelope');

assert.ok(humanRestAnalyze.calls<=600,`Human rest floor analysis regressed to ${humanRestAnalyze.calls} calls`);
assert.ok(humanRestFit.calls<=1400,`Human rest envelope fit regressed to ${humanRestFit.calls} calls`);
assert.ok(catRestAnalyze.calls<=360,`Cat rest floor analysis regressed to ${catRestAnalyze.calls} calls`);
assert.ok(catRestFit.calls<=280,`Cat rest envelope fit regressed to ${catRestFit.calls} calls`);

const humanRestScopes=report.humanRest.metrics._scopes;
const humanSleepScopes=report.humanSleep.metrics._scopes;
const catRestScopes=report.catRest.metrics._scopes;

assert.ok(humanRestScopes.slotApproach.analyzeFloorTile.calls<=60,`Human rest slot-approach floor analysis regressed to ${humanRestScopes.slotApproach.analyzeFloorTile.calls}`);
assert.ok(humanRestScopes.slotApproach.envelopeFitsTile.calls<=170,`Human rest slot-approach envelope fit regressed to ${humanRestScopes.slotApproach.envelopeFitsTile.calls}`);
assert.ok(humanRestScopes.slotApproach.traversalFeasibility.calls<=130,`Human rest slot-approach feasibility regressed to ${humanRestScopes.slotApproach.traversalFeasibility.calls}`);
assert.ok(humanRestScopes.slotApproach.edgeClearanceOptions.calls<=120,`Human rest slot-approach edge clearance regressed to ${humanRestScopes.slotApproach.edgeClearanceOptions.calls}`);
assert.ok(humanRestScopes.pathDistances.traversalFeasibility.calls<=30,`Human rest batch distance feasibility regressed to ${humanRestScopes.pathDistances.traversalFeasibility.calls}`);

assert.ok(humanSleepScopes.slotApproach.traversalFeasibility.calls<=80,`Human sleep slot-approach feasibility regressed to ${humanSleepScopes.slotApproach.traversalFeasibility.calls}`);
assert.ok(humanSleepScopes.pathDistances.traversalFeasibility.calls<=12,`Human sleep batch distance feasibility regressed to ${humanSleepScopes.pathDistances.traversalFeasibility.calls}`);

assert.ok(catRestScopes.slotApproach.traversalFeasibility.calls<=220,`Cat rest slot-approach feasibility regressed to ${catRestScopes.slotApproach.traversalFeasibility.calls}`);
assert.ok(catRestScopes.pathDistances.traversalFeasibility.calls<=30,`Cat rest batch distance feasibility regressed to ${catRestScopes.pathDistances.traversalFeasibility.calls}`);

console.log('TARGET_SELECTION_SCOPE_METRICS '+JSON.stringify({
  humanRest:{
    slotApproachFeasibility:humanRestScopes.slotApproach.traversalFeasibility.calls,
    slotApproachEdgeClearance:humanRestScopes.slotApproach.edgeClearanceOptions.calls,
    pathDistanceFeasibility:humanRestScopes.pathDistances.traversalFeasibility.calls
  },
  humanSleep:{
    slotApproachFeasibility:humanSleepScopes.slotApproach.traversalFeasibility.calls,
    pathDistanceFeasibility:humanSleepScopes.pathDistances.traversalFeasibility.calls
  },
  catRest:{
    slotApproachFeasibility:catRestScopes.slotApproach.traversalFeasibility.calls,
    pathDistanceFeasibility:catRestScopes.pathDistances.traversalFeasibility.calls
  }
}));
console.log('Furniture geometry / target-selection query performance regression: ok');
