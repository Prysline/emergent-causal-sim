import vm from 'node:vm';
import assert from 'node:assert/strict';
import {runtimeProfilePaths} from './helpers/test-profiles.mjs';
import {readRepoFile} from './helpers/production-loader.mjs';

globalThis.window=globalThis;

function edgeKey(from,to){
  const key=p=>p?[(p.spaceId??''),(p.surfaceId??'floor'),(p.z??0),p.x,p.y].join('|'):'?';
  return key(from)+'>'+key(to);
}
function nodeKey(p){
  return p?[(p.spaceId??''),(p.surfaceId??'floor'),(p.z??0),p.x,p.y].join('|'):'?';
}
const store=new Map();
globalThis.__geometryPerf={
  track(name,key){
    let row=store.get(name);
    if(!row){row={calls:0,keys:new Map()};store.set(name,row);}
    row.calls++;
    row.keys.set(String(key),(row.keys.get(String(key))||0)+1);
  },
  nodeKey,
  edgeKey,
  reset(){store.clear();},
  snapshot(){
    const out={};
    for(const [name,row] of store){
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
};

const paths=runtimeProfilePaths([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js',
  'systems/locomotion.js','crowding-runtime-v1200.js',
  'engine.js'
]);

const patches={
  'src/spatial-traversal.js':[
    ['function furnitureSolids(st,z){',"function furnitureSolids(st,z){globalThis.__geometryPerf.track('furnitureSolids',String(z));"],
    ['function floorGeometry(st,p){',"function floorGeometry(st,p){globalThis.__geometryPerf.track('floorGeometry',globalThis.__geometryPerf.nodeKey(p));"]
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
  catRest:measureCatRest()
};
assert.fail('GEOMETRY_QUERY_METRICS '+JSON.stringify(report));
