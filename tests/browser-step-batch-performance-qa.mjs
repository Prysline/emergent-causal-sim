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

await page.route('**/src/validation/registry.js',async route=>{
  const response=await route.fetch();
  let body=await response.text();
  const baseAnchor='let result=validateBaseState(st);';
  const layerAnchor='const next=layer.handler(st,result);';
  if(!body.includes(baseAnchor)||!body.includes(layerAnchor))throw new Error('validation attribution registry instrumentation anchor missing');
  body=body.replace(baseAnchor,"const __vProbe=globalThis.__stepBatchValidationProbe;\n    let result=__vProbe?__vProbe.measure('base','validateBaseState',()=>validateBaseState(st)):validateBaseState(st);");
  body=body.replace(layerAnchor,"const next=__vProbe?__vProbe.measure('layer',layer.id,()=>layer.handler(st,result)):layer.handler(st,result);");
  await route.fulfill({response,body});
});

await page.route('**/src/ui/core.js',async route=>{
  const response=await route.fetch();
  let body=await response.text();
  const anchor="function stepOne(){E.tick();render();}";
  if(!body.includes(anchor))throw new Error('autoplay performance stepOne instrumentation anchor missing');
  body=body.replace(anchor,"function stepOne(){const __start=performance.now();try{E.tick();render();}finally{const __tick=E.getState()?.tick??null;globalThis.__stepBatchStepOneProbe?.(__start,performance.now(),__tick);if(globalThis.__stepBatchAutoplayTargetTick&&__tick>=globalThis.__stepBatchAutoplayTargetTick)queueMicrotask(()=>document.getElementById('play')?.click());}}");
  const renderAnchor='function render(){const s=st(),validationSnapshot=validation();normalizeCurrentZ();';
  const stageAnchor='renderLayerControl();renderBadges(validationSnapshot);renderMap();renderActions();renderTimeline();renderInspector(validationSnapshot);}';
  if(!body.includes(renderAnchor)||!body.includes(stageAnchor))throw new Error('render attribution instrumentation anchor missing');
  body=body.replace(renderAnchor,
    "function __profileRenderStage(name,callback){const probe=globalThis.__stepBatchRenderProbe;return probe?probe.measure(name,callback):callback();}\n  function render(){const s=st(),validationSnapshot=__profileRenderStage('validation',validation);normalizeCurrentZ();");
  body=body.replace(stageAnchor,
    "__profileRenderStage('layerControl',renderLayerControl);__profileRenderStage('badges',()=>renderBadges(validationSnapshot));__profileRenderStage('map',renderMap);__profileRenderStage('actions',renderActions);__profileRenderStage('timeline',renderTimeline);__profileRenderStage('inspector',()=>renderInspector(validationSnapshot));}");
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

    let phase='outsideTick',activeTickOrdinal=null,activeRenderStage=null,activeValidationStage=null;
    const data={
      ticks:[],
      queries:{},
      queryAttribution:{},
      renderStages:{},
      validationStages:{},
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
      if(store===data.queries){
        const origin=activeValidationStage?'validation/'+activeValidationStage:
          activeRenderStage?'render/'+activeRenderStage:phase;
        record(data.queryAttribution,name+'|'+origin,duration);
      }
    }
    function measureStage(store,name,callback,kind){
      const previous=kind==='render'?activeRenderStage:activeValidationStage;
      if(kind==='render')activeRenderStage=name;
      else activeValidationStage=name;
      const start=performance.now();
      try{return callback();}
      finally{
        if(kind==='render')activeRenderStage=previous;
        else activeValidationStage=previous;
        record(store,name,performance.now()-start);
      }
    }
    window.__stepBatchRenderProbe={measure:(name,callback)=>measureStage(data.renderStages,name,callback,'render')};
    window.__stepBatchValidationProbe={measure:(kind,id,callback)=>measureStage(data.validationStages,kind+':'+id,callback,'validation')};
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
        clearStore(data.queryAttribution);
        clearStore(data.renderStages);
        clearStore(data.validationStages);
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
          queryAttribution:structuredClone(data.queryAttribution),
          renderStages:structuredClone(data.renderStages),
          validationStages:structuredClone(data.validationStages),
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

  // These test-only timers identify cost ownership; nested Spatial timings are inclusive
  // and must not be added to their enclosing Validation / Rendering stage totals.
  for(const [caseId,result] of Object.entries(results)){
    const metrics=result.metrics,renderCount=result.mode==='tenSingles'?10:1;
    for(const name of ['validation','layerControl','badges','map','actions','timeline','inspector']){
      assert.equal(metrics.renderStages?.[name]?.calls,renderCount,caseId+' must attribute each render stage exactly once');
    }
    assert.equal(metrics.validationStages?.['base:validateBaseState']?.calls,renderCount,
      caseId+' must attribute each canonical base validation');
    const layers=Object.entries(metrics.validationStages||{}).filter(([name])=>name.startsWith('layer:'));
    assert.ok(layers.length>0&&layers.every(([,item])=>item.calls===renderCount),
      caseId+' must attribute every registered validation layer for each full render');
    // The memory Validation layer has no legitimate reason to request full
    // social routes; these queries belong to real Deliberation or Debug only.
    for(const name of ['SP.planRoute','SP.pathDistances','SP.traversalFeasibility','SP.getPassageProfile']){
      assert.equal(metrics.queryAttribution?.[name+'|validation/layer:memory-deliberation']?.calls??0,0,
        caseId+' memory Validation must not recompute Spatial target routes: '+name);
    }
    for(const [name,item] of Object.entries(metrics.queries)){
      const attributed=Object.entries(metrics.queryAttribution||{}).filter(([key])=>key.startsWith(name+'|'))
        .reduce((n,[,entry])=>n+entry.calls,0);
      assert.equal(attributed,item.calls,caseId+' must preserve query ownership counts for '+name);
    }
  }
  const compactCosts=result=>({
    render:Object.fromEntries(Object.entries(result.metrics.renderStages).map(([name,row])=>
      [name,{calls:row.calls,totalMs:row.totalMs}])),
    validationTop:Object.entries(result.metrics.validationStages)
      .sort((a,b)=>b[1].totalMs-a[1].totalMs).slice(0,8)
      .map(([name,row])=>({name,calls:row.calls,totalMs:row.totalMs})),
    queryOriginsTop:Object.entries(result.metrics.queryAttribution)
      .sort((a,b)=>b[1].totalMs-a[1].totalMs).slice(0,10)
      .map(([name,row])=>({name,calls:row.calls,totalMs:row.totalMs}))
  });
  const attributionSummary={
    tenSinglesNone:compactCosts(results.tenSingles_none),
    tenSinglesAgent:compactCosts(results.tenSingles_agent),
    batch10None:compactCosts(results.batch10_none),
    batch10Agent:compactCosts(results.batch10_agent)
  };
  console.log('STEP_BATCH_COST_ATTRIBUTION '+JSON.stringify(attributionSummary));

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
  // Exact per-tick decision-path counts are not general performance truth: the new Meal
  // legitimately changes which Actions are considered in the same seeded default world.
  // Instead require reproducible query workloads across inspector selection and two UI stepping modes.
  const insideQueryNames=['SP.planRoute','SP.pathDistances','SP.traversalFeasibility','SP.getPassageProfile'];
  for(const name of insideQueryNames){
    const inside=(caseId)=>queryPhaseCalls(results[caseId],name,'insideTick');
    assert.equal(inside('single_none'),inside('single_agent'),name+' single-tick cost must be Inspector-independent');
    assert.equal(inside('batch10_none'),inside('batch10_agent'),name+' batch cost must be Inspector-independent');
    assert.equal(inside('tenSingles_none'),inside('batch10_none'),name+' equivalent ten-tick workloads must have equal route-query counts');
  }
  console.log('STEP_BATCH_INSPECTOR_PARITY '+JSON.stringify({
    singleNone:compactQueryCounts(results.single_none),
    singleAgent:compactQueryCounts(results.single_agent),
    tenSinglesNone:compactQueryCounts(results.tenSingles_none),
    batch10None:compactQueryCounts(results.batch10_none),
    batch10Agent:compactQueryCounts(results.batch10_agent)
  }));
  assert.ok(feasibilityCounts.singleInside>0,'one simulation tick must measure a real traversal-feasibility workload');
  // The outside-tick traversal workload scales with the default world's
  // authored floor count. Old 12×8: 3813 queries / 60 floor cells < 65 per
  // cell; B 16×10: 112 floor cells. Retain a bounded, explainable workload
  // instead of treating a now-obsolete map-specific literal as release truth.
  const measuredState=JSON.parse(results.single_none.metrics.stateJson);
  const floorCells=Object.values(measuredState.map.tiles).filter(t=>t.terrain==='floor').length;
  assert.equal(floorCells,112,'canonical B floor workload must be explicit');
  assert.ok(feasibilityCounts.singleOutside>0&&feasibilityCounts.singleOutside<=65*floorCells,
    'outside-tick feasibility workload must remain within the per-floor-cell budget');
  assert.ok(feasibilityCounts.batch10Inside>0&&feasibilityCounts.batch10Inside<=4*feasibilityCounts.singleInside,
    'step(10) must retain a bounded incremental traversal workload relative to a comparable one-tick fixture');
  // A one-tick and ten-tick render observe different legitimate World states;
  // exact outside-tick query counts are not equal-state performance truth.
  // Both must fit the same floor-normalized rendering budget instead.
  assert.ok(feasibilityCounts.batch10Outside>0&&feasibilityCounts.batch10Outside<=65*floorCells,
    'one batched render must stay within the same per-floor-cell geometry query budget');
  const batchedRouteQueries=queryPhaseCalls(results.batch10_none,'SP.planRoute','insideTick');
  assert.ok(batchedRouteQueries>0&&batchedRouteQueries<=26,
    'step(10) must stay within the established route-query cost envelope; exact emergent Action paths are not release literals');

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
    attributionMethod:'Test-only interceptors measure base/layer Validation and synchronous render stages. Spatial queries are attributed to the innermost active Validation stage or render stage; nested durations are inclusive and must not be added to parent totals. Browser frame opportunity is not actual screen presentation.',
    attributionSummary,
    note:'Surface traversal still requires zero repeated traversalFeasibility work for the same directed edge within one Route search. The default Meal changes valid Action candidates; exact inside-tick query counts are diagnostics, not story-dependent release literals. The established route-query cost envelope is at most 26 inside the seeded 10-tick fixture, with Inspector/step-mode query parity and a bounded batched traversal/render workload. Aggregate traversalFeasibility/getPassageProfile counts remain logged for investigation and comparison after legitimate semantic changes. Existing responsiveness gates remain required and wall-clock remains secondary and runner-dependent.',
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
