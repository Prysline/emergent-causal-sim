import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-step-batch-performance-qa';
fs.mkdirSync(outDir,{recursive:true});

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const pageErrors=[],consoleErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});

await page.addInitScript(()=>{
  const rows={};
  let currentTick=null;
  function row(kind,phase,id){
    const key=[kind,phase,id].join(':');
    return rows[key]||(rows[key]={kind,phase,id,calls:0,totalMs:0,maxMs:0,byTick:{}});
  }
  window.__stepBatchPipelineProbe={
    beginTick(ordinal){currentTick=ordinal;},
    endTick(){currentTick=null;},
    record(kind,phase,id,duration){
      const r=row(kind,phase,id);
      r.calls++;
      r.totalMs+=duration;
      r.maxMs=Math.max(r.maxMs,duration);
      if(currentTick!==null){
        const t=r.byTick[currentTick]||(r.byTick[currentTick]={calls:0,totalMs:0,maxMs:0});
        t.calls++;
        t.totalMs+=duration;
        t.maxMs=Math.max(t.maxMs,duration);
      }
    },
    reset(){for(const key of Object.keys(rows))delete rows[key];currentTick=null;},
    snapshot(){return structuredClone(rows);}
  };
});

await page.route('**/src/ui/core.js',async route=>{
  const response=await route.fetch();
  let body=await response.text();
  const anchor="function stepOne(){E.tick();render();}";
  if(!body.includes(anchor))throw new Error('autoplay performance stepOne instrumentation anchor missing');
  body=body.replace(anchor,"function stepOne(){const __start=performance.now();try{E.tick();render();}finally{const __tick=E.getState()?.tick??null;globalThis.__stepBatchStepOneProbe?.(__start,performance.now(),__tick);if(globalThis.__stepBatchAutoplayTargetTick&&__tick>=globalThis.__stepBatchAutoplayTargetTick)queueMicrotask(()=>document.getElementById('play')?.click());}}");
  await route.fulfill({response,body});
});

await page.route('**/src/runtime-hook-pipeline.js',async route=>{
  const response=await route.fetch();
  let body=await response.text();
  const hookAnchor="for(const entry of hooks.get(phase)||[])entry.handler(ctx);";
  const observerAnchor="for(const entry of observers.get(phase)||[])entry.handler(ctx);";
  const coreAnchor="ctx.result=coreTick(...args);";
  if(!body.includes(hookAnchor)||!body.includes(observerAnchor)||!body.includes(coreAnchor))throw new Error('runtime pipeline instrumentation anchor missing');
  body=body.replace(
    hookAnchor,
    "for(const entry of hooks.get(phase)||[]){const __start=performance.now();try{entry.handler(ctx);}finally{globalThis.__stepBatchPipelineProbe?.record('hook',phase,entry.id,performance.now()-__start);}}"
  );
  body=body.replace(
    observerAnchor,
    "for(const entry of observers.get(phase)||[]){const __start=performance.now();try{entry.handler(ctx);}finally{globalThis.__stepBatchPipelineProbe?.record('observer',phase,entry.id,performance.now()-__start);}}"
  );
  body=body.replace(
    coreAnchor,
    "{const __start=performance.now();try{ctx.result=coreTick(...args);}finally{globalThis.__stepBatchPipelineProbe?.record('core','tick','engine.coreTick',performance.now()-__start);}}"
  );
  await route.fulfill({response,body});
});

function hashText(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){
    h^=text.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return (h>>>0).toString(16).padStart(8,'0');
}

async function settleFrames(count=2){
  await page.evaluate(async count=>{
    for(let i=0;i<count;i++)await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  },count);
}

async function installInstrumentation(){
  await page.evaluate(()=>{
    const E=window.SimEngine,SP=window.SimSpatial,V=window.SimValidator;
    if(!E||!SP||!V)throw new Error('step batch perf instrumentation requires runtime globals');
    if(window.__stepBatchPerf)return;

    let phase='outsideTick',activeTickOrdinal=null;
    const data={
      ticks:[],
      queries:{},
      domWrites:{},
      longTasks:[],
      longTaskSupported:false,
      stepOne:[]
    };

    function row(store,name){
      return store[name]||(store[name]={calls:0,totalMs:0,maxMs:0,byPhase:{}});
    }
    function record(store,name,duration){
      const r=row(store,name),p=r.byPhase[phase]||(r.byPhase[phase]={calls:0,totalMs:0,maxMs:0});
      r.calls++;
      r.totalMs+=duration;
      r.maxMs=Math.max(r.maxMs,duration);
      p.calls++;
      p.totalMs+=duration;
      p.maxMs=Math.max(p.maxMs,duration);
      if(activeTickOrdinal!==null){
        const t=r.byTick||(r.byTick={});
        const tick=t[activeTickOrdinal]||(t[activeTickOrdinal]={calls:0,totalMs:0,maxMs:0});
        tick.calls++;
        tick.totalMs+=duration;
        tick.maxMs=Math.max(tick.maxMs,duration);
      }
    }
    function wrap(target,name,label){
      const original=target?.[name];
      if(typeof original!=='function')return;
      target[name]=function(...args){
        const start=performance.now();
        try{return original.apply(this,args);}
        finally{record(data.queries,label||name,performance.now()-start);}
      };
    }

    window.__stepBatchStepOneProbe=(start,end,tick)=>{
      const rec={startMs:start,endMs:end,durationMs:end-start,tick,firstTimerOpportunityMs:null,firstFrameMs:null,usableFrameMs:null};
      data.stepOne.push(rec);
      setTimeout(()=>{rec.firstTimerOpportunityMs=performance.now()-start;},0);
      requestAnimationFrame(()=>{
        rec.firstFrameMs=performance.now()-start;
        requestAnimationFrame(()=>{rec.usableFrameMs=performance.now()-start;});
      });
    };

    const originalTick=E.tick;
    E.tick=function(...args){
      const previous=phase,before=E.getState()?.tick??null,start=performance.now();
      activeTickOrdinal=data.ticks.length+1;
      window.__stepBatchPipelineProbe?.beginTick(activeTickOrdinal);
      phase='insideTick';
      try{return originalTick.apply(this,args);}
      finally{
        const after=E.getState()?.tick??null;
        data.ticks.push({before,after,durationMs:performance.now()-start});
        phase=previous;
        activeTickOrdinal=null;
        window.__stepBatchPipelineProbe?.endTick();
      }
    };

    wrap(SP,'planRoute','SP.planRoute');
    wrap(SP,'pathDistances','SP.pathDistances');
    wrap(SP,'traversalFeasibility','SP.traversalFeasibility');
    wrap(SP,'getPassageProfile','SP.getPassageProfile');
    wrap(SP,'restTargets','SP.restTargets');
    wrap(SP,'sleepTargets','SP.sleepTargets');
    wrap(SP,'agentObservation','SP.agentObservation');
    wrap(V,'validateState','SimValidator.validateState');

    const domIds=new Set(['mobileAgentSummary','map','actions','timeline','inspector','worldBadges','runtimeLayerSelect']);
    const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
    if(descriptor?.get&&descriptor?.set&&descriptor.configurable){
      Object.defineProperty(Element.prototype,'innerHTML',{
        configurable:true,
        enumerable:descriptor.enumerable,
        get(){return descriptor.get.call(this);},
        set(value){
          if(!domIds.has(this.id))return descriptor.set.call(this,value);
          const start=performance.now();
          try{return descriptor.set.call(this,value);}
          finally{record(data.domWrites,this.id,performance.now()-start);}
        }
      });
    }

    if(globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){
      data.longTaskSupported=true;
      const observer=new PerformanceObserver(list=>{
        for(const entry of list.getEntries())data.longTasks.push({durationMs:entry.duration,startTime:entry.startTime});
      });
      observer.observe({entryTypes:['longtask']});
    }

    function clearStore(store){for(const key of Object.keys(store))delete store[key];}
    window.__stepBatchPerf={
      reset(){
        data.ticks.length=0;
        clearStore(data.queries);
        clearStore(data.domWrites);
        data.longTasks.length=0;
        data.stepOne.length=0;
        window.__stepBatchAutoplayTargetTick=null;
        window.__stepBatchPipelineProbe?.reset();
      },
      snapshot(){
        return {
          ticks:data.ticks.map(x=>({...x})),
          queries:structuredClone(data.queries),
          domWrites:structuredClone(data.domWrites),
          longTasks:data.longTasks.map(x=>({...x})),
          longTaskSupported:data.longTaskSupported,
          stepOne:data.stepOne.map(x=>({...x})),
          pipeline:window.__stepBatchPipelineProbe?.snapshot?.()||{},
          tick:E.getState()?.tick??null,
          stateJson:JSON.stringify(E.getState())
        };
      }
    };
  });
}

async function openCase({selected=false}={}){
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());
  if(selected){
    const agent=page.locator('[data-entity="agent:zhen"]').first();
    await agent.click();
    await page.waitForFunction(()=>window.SimUI?.getInspectorSelection?.()?.id==='zhen');
    await settleFrames(2);
  }
  await installInstrumentation();
  await page.evaluate(()=>window.__stepBatchPerf.reset());
}

async function clickWithFrames(id,expectedTicks=1){
  return page.evaluate(async ({id,expectedTicks})=>{
    const E=window.SimEngine,start=performance.now(),startTick=E.getState().tick,targetTick=startTick+expectedTicks;
    let firstTimerAt=null;
    const firstTimerPromise=new Promise(resolve=>setTimeout(()=>{firstTimerAt=performance.now();resolve();},0));
    document.getElementById(id).click();
    const handlerReturn=performance.now();
    const completed=()=>E.getState().tick===targetTick&&document.querySelector('.workspace')?.getAttribute('aria-busy')!=='true';
    const completionPromise=new Promise(resolve=>{
      const poll=()=>{if(completed())resolve(performance.now());else setTimeout(poll,0);};
      poll();
    });
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    const firstFrame=performance.now();
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    const secondFrame=performance.now();
    const completionAt=await completionPromise;
    await firstTimerPromise;
    return {
      handlerMs:handlerReturn-start,
      firstTimerOpportunityMs:firstTimerAt-start,
      firstFrameMs:firstFrame-start,
      usableFrameMs:secondFrame-start,
      totalCompletionMs:completionAt-start
    };
  },{id,expectedTicks});
}

async function runCase(mode,selected){
  await openCase({selected});
  const startTick=await page.evaluate(()=>window.SimEngine.getState().tick);
  const interactions=[];
  if(mode==='single'){
    interactions.push(await clickWithFrames('step',1));
  }else if(mode==='tenSingles'){
    for(let i=0;i<10;i++)interactions.push(await clickWithFrames('step',1));
  }else if(mode==='batch10'){
    interactions.push(await clickWithFrames('step10',10));
  }else throw new Error('unknown step performance mode: '+mode);
  await settleFrames(1);
  const snapshot=await page.evaluate(()=>window.__stepBatchPerf.snapshot());
  return {
    mode,
    selected,
    startTick,
    interactions,
    metrics:snapshot
  };
}

async function runAutoplayReference(ticks=3){
  await openCase({selected:false});
  return page.evaluate(ticks=>{
    const E=window.SimEngine;
    for(let i=0;i<ticks;i++)E.tick();
    return {tick:E.getState().tick,stateJson:JSON.stringify(E.getState()),rng:E.getState().rngState};
  },ticks);
}

async function runAutoplayCase(selected,ticks=3){
  await openCase({selected});
  const startTick=await page.evaluate(()=>window.SimEngine.getState().tick);
  const targetTick=startTick+ticks;
  await page.evaluate(targetTick=>{window.__stepBatchAutoplayTargetTick=targetTick;},targetTick);
  const start=performance.now();
  const handlerMs=await page.evaluate(()=>{
    const start=performance.now();
    document.getElementById('play').click();
    return performance.now()-start;
  });
  await page.waitForFunction(targetTick=>window.SimEngine.getState().tick===targetTick&&document.getElementById('play').textContent.includes('開始'),targetTick,{timeout:60000});
  const totalCompletionMs=performance.now()-start;
  await settleFrames(3);
  const metrics=await page.evaluate(()=>window.__stepBatchPerf.snapshot());
  return {mode:'autoplay',selected,startTick,targetTick,handlerMs,totalCompletionMs,metrics};
}

function assertCase(result,expectedTicks){
  assert.equal(result.metrics.tick,result.startTick+expectedTicks,result.mode+' must advance exact tick count');
  assert.equal(result.metrics.ticks.length,expectedTicks,result.mode+' instrumentation must see every E.tick call');
  assert.ok(result.metrics.ticks.every(x=>Number.isFinite(x.durationMs)&&x.durationMs>=0),result.mode+' tick durations must be finite');
  assert.ok(result.interactions.every(x=>Number.isFinite(x.handlerMs)&&Number.isFinite(x.firstTimerOpportunityMs)&&Number.isFinite(x.firstFrameMs)&&Number.isFinite(x.usableFrameMs)&&Number.isFinite(x.totalCompletionMs)),result.mode+' interaction timing must include handler, first timer, first/usable frame, and total completion');
  assert.ok((result.metrics.domWrites.map?.calls??0)>=1,result.mode+' must include the final map render');
}

function reportCase(result){
  const stateJson=result.metrics.stateJson;
  const {stateJson:_,...metrics}=result.metrics;
  const tickDurations=metrics.ticks.map(x=>x.durationMs);
  return {
    mode:result.mode,
    selected:result.selected,
    startTick:result.startTick,
    interactions:result.interactions,
    metrics,
    summary:{
      tickTotalMs:tickDurations.reduce((sum,x)=>sum+x,0),
      tickMaxMs:Math.max(0,...tickDurations),
      tickMeanMs:tickDurations.length?tickDurations.reduce((sum,x)=>sum+x,0)/tickDurations.length:0,
      stateHash:hashText(stateJson),
      stateBytes:Buffer.byteLength(stateJson)
    }
  };
}

try{
  const results={};
  for(const selected of [false,true]){
    const suffix=selected?'agent':'none';
    results['single_'+suffix]=await runCase('single',selected);
    results['tenSingles_'+suffix]=await runCase('tenSingles',selected);
    results['batch10_'+suffix]=await runCase('batch10',selected);
  }

  for(const [name,result] of Object.entries(results))assertCase(result,result.mode==='single'?1:10);

  const autoplayReference=await runAutoplayReference(3);
  const autoplayResults={};
  for(const selected of [false,true]){
    const suffix=selected?'agent':'none';
    const result=await runAutoplayCase(selected,3);
    autoplayResults[suffix]=result;
    assert.equal(result.metrics.tick,result.targetTick,'autoplay must advance exactly the requested production tick count');
    assert.equal(result.metrics.ticks.length,3,'autoplay instrumentation must see exactly three E.tick calls');
    assert.equal(result.metrics.stepOne.length,3,'autoplay must record exactly three complete stepOne callbacks');
    assert.ok(result.metrics.stepOne.every(x=>Number.isFinite(x.durationMs)&&Number.isFinite(x.firstTimerOpportunityMs)&&Number.isFinite(x.firstFrameMs)&&Number.isFinite(x.usableFrameMs)),'autoplay callbacks must expose callback and frame/timer timing');
    for(let i=1;i<result.metrics.stepOne.length;i++){
      const prior=result.metrics.stepOne[i-1],next=result.metrics.stepOne[i];
      assert.ok(next.startMs>=prior.endMs,'autoplay callbacks must never overlap');
      assert.ok(prior.startMs+prior.usableFrameMs<=next.startMs,'each completed autoplay callback must expose a usable two-frame browser opportunity before the next callback starts');
    }
    assert.equal(result.metrics.stateJson,autoplayReference.stateJson,'autoplay must preserve canonical state parity with the same number of direct ticks');
  }
  assert.equal(autoplayResults.none.metrics.stateJson,autoplayResults.agent.metrics.stateJson,'Agent Inspector selection must remain simulation-state inert during autoplay');

  assert.equal(
    results.tenSingles_none.metrics.stateJson,
    results.batch10_none.metrics.stateJson,
    '10 yielded single-step clicks and one step10 batch must preserve identical simulation state'
  );
  assert.equal(
    results.tenSingles_agent.metrics.stateJson,
    results.batch10_agent.metrics.stateJson,
    'Inspector-open stepping must preserve identical simulation state across yielded singles and step10'
  );
  assert.equal(
    results.batch10_none.metrics.stateJson,
    results.batch10_agent.metrics.stateJson,
    'opening an Agent Inspector must remain simulation-state inert during step10'
  );
  assert.equal(
    results.single_none.metrics.stateJson,
    results.single_agent.metrics.stateJson,
    'opening an Agent Inspector must remain simulation-state inert during one step'
  );

  const queryPhaseCalls=(result,name,phase)=>result.metrics.queries?.[name]?.byPhase?.[phase]?.calls??0;
  assert.equal(queryPhaseCalls(results.single_none,'SimValidator.validateState','outsideTick'),1,'one no-selection render must validate exactly once');
  assert.equal(queryPhaseCalls(results.single_agent,'SimValidator.validateState','outsideTick'),1,'opening Agent Inspector must not add a second validation pass');
  assert.equal(results.single_none.metrics.stateJson,results.single_agent.metrics.stateJson,'render-scoped validation reuse must remain simulation-state inert');
  const feasibilityCounts={
    singleInside:queryPhaseCalls(results.single_none,'SP.traversalFeasibility','insideTick'),
    singleOutside:queryPhaseCalls(results.single_none,'SP.traversalFeasibility','outsideTick'),
    batch10Inside:queryPhaseCalls(results.batch10_none,'SP.traversalFeasibility','insideTick'),
    batch10Outside:queryPhaseCalls(results.batch10_none,'SP.traversalFeasibility','outsideTick')
  };
  console.log('STEP_BATCH_FEASIBILITY_COUNTS '+JSON.stringify(feasibilityCounts));
  const compactQueryCounts=result=>Object.fromEntries(
    ['SP.planRoute','SP.pathDistances','SP.traversalFeasibility','SP.getPassageProfile','SP.agentObservation']
      .map(name=>[name,{
        inside:queryPhaseCalls(result,name,'insideTick'),
        outside:queryPhaseCalls(result,name,'outsideTick')
      }])
  );
  console.log('STEP_BATCH_QUERY_COUNTS '+JSON.stringify({
    singleNone:compactQueryCounts(results.single_none),
    batch10None:compactQueryCounts(results.batch10_none)
  }));
  assert.equal(feasibilityCounts.singleInside,8621,'render-scoped validation reuse must not change the measured single-tick simulation feasibility baseline');
  assert.equal(feasibilityCounts.singleOutside,3802,'one no-selection render must retain the measured one-pass outside-tick feasibility baseline');
  assert.equal(feasibilityCounts.batch10Inside,25253,'render-scoped validation reuse must not change the measured step(10) inside-tick feasibility baseline');
  assert.equal(feasibilityCounts.batch10Outside,3877,'render-scoped validation reuse must retain the measured step(10) outside-tick baseline');

  await openCase({selected:false});
  await page.locator('#showThoughts').click();
  await settleFrames(2);
  const directInspectorSnapshot=await page.evaluate(()=>window.__stepBatchPerf.snapshot());
  assert.equal(
    directInspectorSnapshot.queries?.['SimValidator.validateState']?.byPhase?.outsideTick?.calls??0,
    1,
    'direct no-selection Inspector refresh must perform one fallback validation instead of requiring a full-render snapshot'
  );

  assert.deepEqual(pageErrors,[],'step batch perf QA must have no page errors');
  assert.deepEqual(consoleErrors,[],'step batch perf QA must have no console errors');

  const report={
    generatedAt:new Date().toISOString(),
    note:'11.31.1 completion-aware autoplay profile: single/step10 deterministic workload baselines remain unchanged; dedicated autoplay measures complete callbacks, Long Tasks, timer/frame opportunities, query composition, and exact canonical-state parity. Wall-clock remains secondary and runner-dependent.',
    cases:Object.fromEntries(Object.entries(results).map(([name,result])=>[name,reportCase(result)])),
    autoplay:Object.fromEntries(Object.entries(autoplayResults).map(([name,result])=>[name,{
      mode:result.mode,selected:result.selected,startTick:result.startTick,targetTick:result.targetTick,
      handlerMs:result.handlerMs,totalCompletionMs:result.totalCompletionMs,
      metrics:{...result.metrics,stateJson:undefined},
      summary:{stateHash:hashText(result.metrics.stateJson),stateBytes:Buffer.byteLength(result.metrics.stateJson)}
    }])),
    pageErrors,
    consoleErrors
  };
  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  console.log('STEP_BATCH_PERF_METRICS '+JSON.stringify(report));
  console.log('Step batch performance QA: measurement + deterministic parity ok');
} finally {
  await browser.close();
}
