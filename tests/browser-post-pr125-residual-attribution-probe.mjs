import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-post-pr125-residual-attribution-probe';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});

function attachErrors(page){
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  return {pageErrors,consoleErrors};
}

async function settleFrames(page,count=2){
  await page.evaluate(async count=>{
    for(let i=0;i<count;i++)await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  },count);
}

async function clickStep10(page){
  return page.evaluate(async()=>{
    const before=window.SimEngine.getState().tick;
    const start=performance.now();
    document.getElementById('step10').click();
    const handlerMs=performance.now()-start;
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    return {before,after:window.SimEngine.getState().tick,handlerMs};
  });
}

async function runBaseline(){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=attachErrors(page);
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());
  const timing=await clickStep10(page);
  await settleFrames(page,1);
  const stateJson=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));
  await page.close();
  return {...errors,timing,stateJson};
}

async function runInstrumented(){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=attachErrors(page);

  await page.addInitScript(()=>{
    const scopeStack=[];
    const queryStack=[];
    const traversalRows={};
    const queryInstances=[];
    const routeObservations=[];
    let querySeq=0;

    function state(){return globalThis.SimEngine?.getState?.()||null;}
    function tick(){return state()?.tick??null;}
    function agentById(id){return id?state()?.agents?.[id]||null:null;}
    function posKey(p){
      if(!p)return '?';
      return [
        p.spaceId||'?',
        p.surfaceId||'floor',
        Number.isFinite(p.x)?p.x:'?',
        Number.isFinite(p.y)?p.y:'?',
        Number.isFinite(p.z)?p.z:0
      ].join('|');
    }
    function currentScopePath(){return scopeStack.length?scopeStack.join(' > '):'outside-pipeline';}
    function pipelineBucket(){
      const first=scopeStack[0]||'outside-pipeline';
      if(first==='core:engine.coreTick')return 'engine.coreTick';
      if(first.startsWith('hook:'))return first.slice(5);
      if(first.startsWith('observer:'))return first.slice(9);
      return 'outside-pipeline';
    }
    function workPhase(){
      for(let i=scopeStack.length-1;i>=0;i--){
        const s=scopeStack[i];
        if(s.startsWith('agent-decision:'))return 'decision-construction';
        if(s.startsWith('agent-execution:'))return 'action-execution';
      }
      const first=scopeStack[0]||'';
      if(first.startsWith('hook:'))return first.slice(5);
      if(first.startsWith('observer:'))return first.slice(9);
      return first==='core:engine.coreTick'?'core-other':'outside-pipeline';
    }
    function callerChain(){
      const lines=String(new Error().stack||'').split('\n').slice(2);
      const frames=[];
      for(const line of lines){
        if(!/\/src\//.test(line))continue;
        const match=line.trim().match(/^at\s+([^\s(]+)/);
        const name=match?.[1]||'anonymous';
        if(name.includes('__postPr125ResidualProbe'))continue;
        frames.push(name);
        if(frames.length>=5)break;
      }
      return frames.join(' > ')||'unknown-caller';
    }
    function scoped(label,fn){
      scopeStack.push(label);
      try{return fn();}
      finally{
        const popped=scopeStack.pop();
        if(popped!==label)throw new Error('residual attribution scope mismatch: expected '+label+', got '+popped);
      }
    }
    function queryAgentId(name,args){
      let value=null;
      if(['planRoute','pathDistance','traversalCost','pathDistances'].includes(name))value=args[1];
      else if(name==='bestSlotApproachNode')value=args[2];
      else if(['bestInteractionPosition','restTargets','sleepTargets'].includes(name))value=args[1];
      if(typeof value==='string')return value;
      return value?.id||null;
    }
    function queryObjective(name,args){
      if(name==='planRoute')return args[3]?.objective||'traversalCost';
      if(name==='pathDistance'||name==='pathDistances')return 'pathDistance';
      if(name==='traversalCost'||name==='bestInteractionPosition'||name==='bestSlotApproachNode')return 'traversalCost';
      return null;
    }
    function queryGoal(name,args){
      if(['planRoute','pathDistance','traversalCost'].includes(name))return args[2]||null;
      return null;
    }
    function actionSnapshot(agentId){
      const a=agentById(agentId);
      return {
        actionKind:a?.action?.kind||'none',
        actionPhase:a?.action?.phase||'none',
        posture:a?.posture?.kind||'none'
      };
    }
    function routeObservation(kind,agentId,goal,objective,caller,queryId){
      if(!agentId||!goal||!objective)return;
      const a=agentById(agentId);
      const start=a?.position||null;
      const t=tick();
      const startKey=posKey(start),goalKey=posKey(goal);
      routeObservations.push({
        kind,queryId,tick:t,agentId,objective,
        start:startKey,goal:goalKey,
        endpointKey:[t,agentId,startKey,goalKey].join('|'),
        routeKey:[t,agentId,startKey,goalKey,objective].join('|'),
        pipeline:pipelineBucket(),workPhase:workPhase(),caller,
        ...actionSnapshot(agentId)
      });
    }
    function wrapQuery(target,name){
      const original=target?.[name];
      if(typeof original!=='function')return;
      target[name]=function(...args){
        const agentId=queryAgentId(name,args);
        const caller=callerChain();
        const parent=queryStack[queryStack.length-1]||null;
        const ctx={
          id:++querySeq,name,agentId,caller,parentId:parent?.id||null,
          tick:tick(),pipeline:pipelineBucket(),workPhase:workPhase(),
          objective:queryObjective(name,args),feasibilityCalls:0,
          start:posKey(agentById(agentId)?.position),
          goal:posKey(queryGoal(name,args)),
          ...actionSnapshot(agentId)
        };
        queryStack.push(ctx);
        if(['planRoute','pathDistance','traversalCost'].includes(name)){
          routeObservation(name,agentId,queryGoal(name,args),ctx.objective,caller,ctx.id);
        }
        if(name==='pathDistances'){
          for(const goal of Array.isArray(args[2])?args[2]:[])routeObservation('pathDistances:target',agentId,goal,'pathDistance',caller,ctx.id);
        }
        const start=performance.now();
        try{
          const value=original.apply(this,args);
          if(name==='bestInteractionPosition'&&value)routeObservation('bestInteractionPosition:winner',agentId,value,'traversalCost',caller,ctx.id);
          if(name==='bestSlotApproachNode'&&value)routeObservation('bestSlotApproachNode:winner',agentId,value,ctx.objective||'traversalCost',caller,ctx.id);
          return value;
        } finally {
          ctx.totalMs=performance.now()-start;
          queryInstances.push({...ctx});
          const popped=queryStack.pop();
          if(popped!==ctx)throw new Error('residual attribution query mismatch: expected '+ctx.id+', got '+popped?.id);
        }
      };
    }
    function wrapTraversal(target){
      const original=target?.traversalFeasibility;
      if(typeof original!=='function')throw new Error('missing SP.traversalFeasibility');
      target.traversalFeasibility=function(...args){
        const root=queryStack[0]||null,top=queryStack[queryStack.length-1]||null;
        for(const q of queryStack)q.feasibilityCalls++;
        const agentId=args[1]?.id||root?.agentId||null;
        const snap=actionSnapshot(agentId);
        const key=[
          pipelineBucket(),
          workPhase(),
          root?.name||'no-public-query',
          top?.name||'no-public-query',
          agentId||'unknown',
          snap.actionKind,
          snap.actionPhase,
          root?.caller||'unknown-caller'
        ].join(' || ');
        const r=traversalRows[key]||(traversalRows[key]={
          key,calls:0,pipeline:pipelineBucket(),workPhase:workPhase(),
          rootQuery:root?.name||'no-public-query',topQuery:top?.name||'no-public-query',
          agentId:agentId||'unknown',...snap,caller:root?.caller||'unknown-caller',byTick:{}
        });
        r.calls++;
        const t=tick();
        r.byTick[t]=(r.byTick[t]||0)+1;
        return original.apply(this,args);
      };
    }

    globalThis.__postPr125ResidualProbe={
      scoped,wrapQuery,wrapTraversal,
      reset(){
        for(const key of Object.keys(traversalRows))delete traversalRows[key];
        queryInstances.length=0;routeObservations.length=0;querySeq=0;scopeStack.length=0;queryStack.length=0;
      },
      snapshot(){
        return structuredClone({
          traversalRows,queryInstances,routeObservations,
          scopeDepth:scopeStack.length,queryDepth:queryStack.length
        });
      }
    };
  });

  await page.route('**/src/runtime-hook-pipeline.js',async route=>{
    const response=await route.fetch();
    let body=await response.text();
    const hookAnchor="for(const entry of hooks.get(phase)||[])entry.handler(ctx);";
    const observerAnchor="for(const entry of observers.get(phase)||[])entry.handler(ctx);";
    const coreAnchor="ctx.result=coreTick(...args);";
    if(!body.includes(hookAnchor)||!body.includes(observerAnchor)||!body.includes(coreAnchor))throw new Error('runtime pipeline attribution anchors missing');
    body=body.replace(hookAnchor,"for(const entry of hooks.get(phase)||[])globalThis.__postPr125ResidualProbe.scoped('hook:'+phase+':'+entry.id,()=>entry.handler(ctx));");
    body=body.replace(observerAnchor,"for(const entry of observers.get(phase)||[])globalThis.__postPr125ResidualProbe.scoped('observer:'+phase+':'+entry.id,()=>entry.handler(ctx));");
    body=body.replace(coreAnchor,"ctx.result=globalThis.__postPr125ResidualProbe.scoped('core:engine.coreTick',()=>coreTick(...args));");
    await route.fulfill({response,body});
  });

  await page.route('**/src/engine.js',async route=>{
    const response=await route.fetch();
    let body=await response.text();
    const anchor="if(!a.action){const c=choose(a);if(c)startAction(a,c);continue;}stepAction(a);";
    const replacement="if(!a.action){globalThis.__postPr125ResidualProbe.scoped('agent-decision:'+a.id,()=>{const c=choose(a);if(c)startAction(a,c);});continue;}globalThis.__postPr125ResidualProbe.scoped('agent-execution:'+a.id,()=>stepAction(a));";
    if(!body.includes(anchor))throw new Error('engine decision/execution attribution anchor missing');
    body=body.replace(anchor,replacement);
    await route.fulfill({response,body});
  });

  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());

  await page.evaluate(()=>{
    const SP=window.SimSpatial,probe=globalThis.__postPr125ResidualProbe;
    if(!SP||!probe)throw new Error('residual attribution probe requires SimSpatial + probe');
    for(const name of [
      'planRoute',
      'pathDistance',
      'traversalCost',
      'pathDistances',
      'bestInteractionPosition',
      'bestSlotApproachNode',
      'restTargets',
      'sleepTargets'
    ])probe.wrapQuery(SP,name);
    probe.wrapTraversal(SP);
    probe.reset();
  });

  const timing=await clickStep10(page);
  await settleFrames(page,1);
  const result=await page.evaluate(()=>({
    stateJson:JSON.stringify(window.SimEngine.getState()),
    probe:globalThis.__postPr125ResidualProbe.snapshot()
  }));
  await page.close();
  return {...errors,timing,...result};
}

function add(map,key,value=1){map[key]=(map[key]||0)+value;}
function summarizeTraversal(rows){
  const out={
    total:0,byPipeline:{},byWorkPhase:{},byRootQuery:{},byTopQuery:{},
    byAgent:{},byActionPhase:{},byCaller:{},byTick:{}
  };
  for(const r of Object.values(rows||{})){
    out.total+=r.calls;
    add(out.byPipeline,r.pipeline,r.calls);
    add(out.byWorkPhase,r.workPhase,r.calls);
    add(out.byRootQuery,r.rootQuery,r.calls);
    add(out.byTopQuery,r.topQuery,r.calls);
    add(out.byAgent,r.agentId,r.calls);
    add(out.byActionPhase,[r.agentId,r.actionKind,r.actionPhase,r.workPhase].join('|'),r.calls);
    add(out.byCaller,r.rootQuery+' <- '+r.caller,r.calls);
    for(const [tick,calls] of Object.entries(r.byTick||{}))add(out.byTick,tick,calls);
  }
  return out;
}
function sortedEntries(map,limit=30){return Object.entries(map||{}).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit).map(([key,calls])=>({key,calls}));}
function summarizeQueries(instances){
  const byName={},byRootName={},byAgent={},topInstances=[];
  for(const q of instances||[]){
    add(byName,q.name,1);
    if(!q.parentId)add(byRootName,q.name,1);
    if(q.agentId)add(byAgent,q.agentId,1);
    topInstances.push(q);
  }
  topInstances.sort((a,b)=>b.feasibilityCalls-a.feasibilityCalls||b.totalMs-a.totalMs);
  return {
    total:instances.length,
    byName:sortedEntries(byName),
    byRootName:sortedEntries(byRootName),
    byAgent:sortedEntries(byAgent),
    topInstances:topInstances.slice(0,30)
  };
}
function duplicateGroups(observations){
  const exact=new Map(),endpoint=new Map();
  for(const o of observations||[]){
    if(!exact.has(o.routeKey))exact.set(o.routeKey,[]);
    exact.get(o.routeKey).push(o);
    if(!endpoint.has(o.endpointKey))endpoint.set(o.endpointKey,[]);
    endpoint.get(o.endpointKey).push(o);
  }
  function groups(source,requireKinds=false){
    const out=[];
    for(const [key,list] of source){
      const kinds=[...new Set(list.map(x=>x.kind))];
      if(list.length<2||(requireKinds&&kinds.length<2))continue;
      out.push({
        key,count:list.length,kinds,
        agentId:list[0].agentId,tick:list[0].tick,
        objective:list[0].objective||null,
        pipeline:[...new Set(list.map(x=>x.pipeline))],
        workPhase:[...new Set(list.map(x=>x.workPhase))],
        callers:[...new Set(list.map(x=>x.caller))],
        actionPhases:[...new Set(list.map(x=>[x.actionKind,x.actionPhase].join('|')))]
      });
    }
    return out.sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key)).slice(0,40);
  }
  return {
    exactSameObjective:groups(exact,true),
    sameEndpointAnyObjective:groups(endpoint,true)
  };
}
function focusedDuplicateCounts(observations){
  const exact=new Map();
  for(const o of observations||[]){
    if(!exact.has(o.routeKey))exact.set(o.routeKey,[]);
    exact.get(o.routeKey).push(o);
  }
  const pairs={
    memoryTraversalThenPlanRoute:{groups:0,observations:0},
    interactionWinnerThenTraversalCost:{groups:0,observations:0},
    slotWinnerThenOtherSearch:{groups:0,observations:0}
  };
  for(const list of exact.values()){
    const kinds=new Set(list.map(x=>x.kind));
    if(kinds.has('traversalCost')&&kinds.has('planRoute')&&list.some(x=>x.pipeline.includes('memoryDeliberation.correct-initial'))){
      pairs.memoryTraversalThenPlanRoute.groups++;
      pairs.memoryTraversalThenPlanRoute.observations+=list.length;
    }
    if(kinds.has('bestInteractionPosition:winner')&&kinds.has('traversalCost')){
      pairs.interactionWinnerThenTraversalCost.groups++;
      pairs.interactionWinnerThenTraversalCost.observations+=list.length;
    }
    if(kinds.has('bestSlotApproachNode:winner')&&(kinds.has('traversalCost')||kinds.has('planRoute'))){
      pairs.slotWinnerThenOtherSearch.groups++;
      pairs.slotWinnerThenOtherSearch.observations+=list.length;
    }
  }
  return pairs;
}

try{
  const baseline=await runBaseline();
  const measured=await runInstrumented();

  assert.equal(baseline.timing.after,baseline.timing.before+10,'baseline step10 must advance exactly 10 ticks');
  assert.equal(measured.timing.after,measured.timing.before+10,'instrumented step10 must advance exactly 10 ticks');
  assert.equal(measured.stateJson,baseline.stateJson,'residual attribution instrumentation must preserve exact canonical simulation state');
  assert.equal(measured.probe.scopeDepth,0,'attribution scope stack must be empty after step10');
  assert.equal(measured.probe.queryDepth,0,'attribution query stack must be empty after step10');
  assert.deepEqual(baseline.pageErrors,[],'baseline run must have no page errors');
  assert.deepEqual(baseline.consoleErrors,[],'baseline run must have no console errors');
  assert.deepEqual(measured.pageErrors,[],'instrumented run must have no page errors');
  assert.deepEqual(measured.consoleErrors,[],'instrumented run must have no console errors');

  const traversal=summarizeTraversal(measured.probe.traversalRows);
  assert.ok(traversal.total>0,'probe must observe traversal feasibility work');
  const duplicates=duplicateGroups(measured.probe.routeObservations);
  const report={
    generatedAt:new Date().toISOString(),
    note:'Test-only post-PR #125 residual attribution. Query count + exact state parity are primary evidence; instrumented timing is diagnostic only.',
    baseline:{timing:baseline.timing},
    measured:{timing:measured.timing},
    summary:{
      traversalTotal:traversal.total,
      byPipeline:sortedEntries(traversal.byPipeline),
      byWorkPhase:sortedEntries(traversal.byWorkPhase),
      byRootQuery:sortedEntries(traversal.byRootQuery),
      byTopQuery:sortedEntries(traversal.byTopQuery),
      byAgent:sortedEntries(traversal.byAgent),
      byActionPhase:sortedEntries(traversal.byActionPhase),
      byCaller:sortedEntries(traversal.byCaller),
      byTick:sortedEntries(traversal.byTick),
      queries:summarizeQueries(measured.probe.queryInstances),
      duplicateCounts:focusedDuplicateCounts(measured.probe.routeObservations),
      exactDuplicateGroups:duplicates.exactSameObjective.slice(0,20),
      endpointDuplicateGroups:duplicates.sameEndpointAnyObjective.slice(0,20)
    },
    traversalRows:measured.probe.traversalRows,
    queryInstances:measured.probe.queryInstances,
    routeObservations:measured.probe.routeObservations,
    pageErrors:{baseline:baseline.pageErrors,measured:measured.pageErrors},
    consoleErrors:{baseline:baseline.consoleErrors,measured:measured.consoleErrors}
  };
  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  const compact={
    traversalTotal:report.summary.traversalTotal,
    byPipeline:report.summary.byPipeline,
    byWorkPhase:report.summary.byWorkPhase,
    byRootQuery:report.summary.byRootQuery,
    byAgent:report.summary.byAgent,
    byActionPhase:report.summary.byActionPhase.slice(0,20),
    byCaller:report.summary.byCaller.slice(0,20),
    queries:{
      total:report.summary.queries.total,
      byName:report.summary.queries.byName,
      byRootName:report.summary.queries.byRootName,
      topInstances:report.summary.queries.topInstances.slice(0,15)
    },
    duplicateCounts:report.summary.duplicateCounts,
    exactDuplicateGroups:report.summary.exactDuplicateGroups.slice(0,12),
    endpointDuplicateGroups:report.summary.endpointDuplicateGroups.slice(0,12),
    handlerMs:{baseline:baseline.timing.handlerMs,measured:measured.timing.handlerMs}
  };
  console.log('POST_PR125_RESIDUAL_ATTRIBUTION '+JSON.stringify(compact));
  console.log('Post-PR125 residual attribution probe: exact state parity ok');
} finally {
  await browser.close();
}
