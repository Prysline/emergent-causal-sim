import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-coretick-traversal-attribution-probe';
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
    const traversalRows={};
    const queryRows={};
    const scopeRows={};

    function currentPath(){return scopeStack.length?scopeStack.join(' > '):'outside-pipeline';}
    function row(store,key){return store[key]||(store[key]={key,calls:0,totalMs:0,maxMs:0,byTick:{},byAgent:{}});}
    function addMetric(store,key,duration,{tick=null,agentId=null}={}){
      const r=row(store,key);
      r.calls++;
      r.totalMs+=duration;
      r.maxMs=Math.max(r.maxMs,duration);
      if(tick!==null&&tick!==undefined){
        const t=r.byTick[tick]||(r.byTick[tick]={calls:0,totalMs:0,maxMs:0});
        t.calls++;
        t.totalMs+=duration;
        t.maxMs=Math.max(t.maxMs,duration);
      }
      if(agentId){
        const a=r.byAgent[agentId]||(r.byAgent[agentId]={calls:0,totalMs:0,maxMs:0});
        a.calls++;
        a.totalMs+=duration;
        a.maxMs=Math.max(a.maxMs,duration);
      }
    }
    function scoped(label,fn,{agentId=null,record=true}={}){
      scopeStack.push(label);
      const start=performance.now();
      try{return fn();}
      finally{
        const duration=performance.now()-start;
        if(record)addMetric(scopeRows,currentPath(),duration,{tick:globalThis.SimEngine?.getState?.()?.tick??null,agentId});
        const popped=scopeStack.pop();
        if(popped!==label)throw new Error(`core traversal probe scope mismatch: expected ${label}, got ${popped}`);
      }
    }
    function callerChain(){
      const lines=String(new Error().stack||'').split('\n').slice(2);
      const frames=[];
      for(const line of lines){
        if(!/\/src\//.test(line))continue;
        const match=line.trim().match(/^at\s+([^\s(]+)/);
        const name=match?.[1]||'anonymous';
        if(name.includes('__coreTraversalAttributionProbe'))continue;
        frames.push(name);
        if(frames.length>=4)break;
      }
      return frames.join(' > ')||'unknown-caller';
    }
    function agentIdFrom(name,args){
      let value=null;
      if(['planRoute','pathDistance','traversalCost','pathDistances'].includes(name))value=args[1];
      else if(['bestInteractionPosition','bestSlotApproachNode','restTargets','sleepTargets'].includes(name))value=name==='bestSlotApproachNode'?args[2]:args[1];
      if(typeof value==='string')return value;
      return value?.id||null;
    }
    function queryDetail(name,args){
      if(name==='planRoute')return args[3]?.objective||'traversalCost';
      if(name==='pathDistance'||name==='pathDistances')return 'pathDistance';
      if(name==='traversalCost')return 'traversalCost';
      if(name==='bestInteractionPosition')return `affordance:${args[3]||'default'}`;
      if(name==='bestSlotApproachNode')return `objective:${args[3]?.objective||'traversalCost'}`;
      return 'query';
    }

    globalThis.__coreTraversalAttributionProbe={
      scoped,
      wrapQuery(target,name){
        const original=target?.[name];
        if(typeof original!=='function')return;
        target[name]=function(...args){
          const agentId=agentIdFrom(name,args),caller=callerChain(),detail=queryDetail(name,args);
          const label=`SP.${name}[${detail}] <- ${caller}${agentId?` @${agentId}`:''}`;
          const start=performance.now();
          return scoped(label,()=>{
            try{return original.apply(this,args);}
            finally{addMetric(queryRows,currentPath(),performance.now()-start,{tick:globalThis.SimEngine?.getState?.()?.tick??null,agentId});}
          },{agentId,record:false});
        };
      },
      wrapTraversal(target){
        const original=target?.traversalFeasibility;
        if(typeof original!=='function')throw new Error('missing SP.traversalFeasibility');
        target.traversalFeasibility=function(...args){
          const start=performance.now();
          try{return original.apply(this,args);}
          finally{
            const agentId=args[1]?.id||null,tick=globalThis.SimEngine?.getState?.()?.tick??null;
            addMetric(traversalRows,currentPath(),performance.now()-start,{tick,agentId});
          }
        };
      },
      reset(){
        for(const store of [traversalRows,queryRows,scopeRows])for(const key of Object.keys(store))delete store[key];
        scopeStack.length=0;
      },
      snapshot(){return structuredClone({traversalRows,queryRows,scopeRows,scopeDepth:scopeStack.length});}
    };
  });

  await page.route('**/src/runtime-hook-pipeline.js',async route=>{
    const response=await route.fetch();
    let body=await response.text();
    const hookAnchor="for(const entry of hooks.get(phase)||[])entry.handler(ctx);";
    const observerAnchor="for(const entry of observers.get(phase)||[])entry.handler(ctx);";
    const coreAnchor="ctx.result=coreTick(...args);";
    if(!body.includes(hookAnchor)||!body.includes(observerAnchor)||!body.includes(coreAnchor))throw new Error('runtime pipeline attribution anchors missing');
    body=body.replace(
      hookAnchor,
      "for(const entry of hooks.get(phase)||[])globalThis.__coreTraversalAttributionProbe.scoped('hook:'+phase+':'+entry.id,()=>entry.handler(ctx));"
    );
    body=body.replace(
      observerAnchor,
      "for(const entry of observers.get(phase)||[])globalThis.__coreTraversalAttributionProbe.scoped('observer:'+phase+':'+entry.id,()=>entry.handler(ctx));"
    );
    body=body.replace(
      coreAnchor,
      "ctx.result=globalThis.__coreTraversalAttributionProbe.scoped('core:engine.coreTick',()=>coreTick(...args));"
    );
    await route.fulfill({response,body});
  });

  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());

  await page.evaluate(()=>{
    const SP=window.SimSpatial,probe=globalThis.__coreTraversalAttributionProbe;
    if(!SP||!probe)throw new Error('core traversal attribution probe requires SimSpatial + probe');
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
    probe:globalThis.__coreTraversalAttributionProbe.snapshot()
  }));
  await page.close();
  return {...errors,timing,...result};
}

function totals(rows){
  return Object.values(rows||{}).reduce((out,r)=>{
    out.calls+=r.calls||0;
    out.totalMs+=r.totalMs||0;
    out.maxMs=Math.max(out.maxMs,r.maxMs||0);
    return out;
  },{calls:0,totalMs:0,maxMs:0});
}
function topRows(rows,limit=30){
  return Object.values(rows||{}).sort((a,b)=>b.calls-a.calls||b.totalMs-a.totalMs).slice(0,limit);
}
function pipelineBucket(key){
  if(key.startsWith('core:engine.coreTick'))return 'core';
  if(key.startsWith('hook:'))return 'hook';
  if(key.startsWith('observer:'))return 'observer';
  return 'outside';
}
function bucketTotals(rows){
  const out={core:{calls:0,totalMs:0},hook:{calls:0,totalMs:0},observer:{calls:0,totalMs:0},outside:{calls:0,totalMs:0}};
  for(const r of Object.values(rows||{})){
    const b=out[pipelineBucket(r.key)];
    b.calls+=r.calls||0;
    b.totalMs+=r.totalMs||0;
  }
  return out;
}

try{
  const baseline=await runBaseline();
  const measured=await runInstrumented();

  assert.equal(baseline.timing.after,baseline.timing.before+10,'baseline step10 must advance exactly 10 ticks');
  assert.equal(measured.timing.after,measured.timing.before+10,'instrumented step10 must advance exactly 10 ticks');
  assert.equal(measured.stateJson,baseline.stateJson,'core traversal attribution instrumentation must preserve exact canonical simulation state');
  assert.equal(measured.probe.scopeDepth,0,'attribution scope stack must be empty after step10');
  assert.deepEqual(baseline.pageErrors,[],'baseline attribution run must have no page errors');
  assert.deepEqual(baseline.consoleErrors,[],'baseline attribution run must have no console errors');
  assert.deepEqual(measured.pageErrors,[],'instrumented attribution run must have no page errors');
  assert.deepEqual(measured.consoleErrors,[],'instrumented attribution run must have no console errors');

  const traversal=totals(measured.probe.traversalRows),byPipeline=bucketTotals(measured.probe.traversalRows);
  assert.ok(traversal.calls>0,'attribution probe must observe traversal feasibility work');
  assert.ok(byPipeline.core.calls>0,'attribution probe must observe traversal feasibility inside engine.coreTick');

  const report={
    generatedAt:new Date().toISOString(),
    note:'Test-only post-Perf-2A attribution. Timing is diagnostic; caller scopes are synchronous and never persist into simulation state.',
    baseline:{timing:baseline.timing},
    measured:{timing:measured.timing},
    summary:{
      traversal,
      traversalByPipeline:byPipeline,
      queries:totals(measured.probe.queryRows),
      topTraversalScopes:topRows(measured.probe.traversalRows),
      topQueryScopes:topRows(measured.probe.queryRows),
      topPipelineScopes:topRows(measured.probe.scopeRows)
    },
    traversalRows:measured.probe.traversalRows,
    queryRows:measured.probe.queryRows,
    scopeRows:measured.probe.scopeRows,
    pageErrors:{baseline:baseline.pageErrors,measured:measured.pageErrors},
    consoleErrors:{baseline:baseline.consoleErrors,measured:measured.consoleErrors}
  };

  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  console.log('CORETICK_TRAVERSAL_ATTRIBUTION '+JSON.stringify(report));
  console.log('CoreTick traversal attribution probe: diagnostic + state parity ok');
} finally {
  await browser.close();
}
