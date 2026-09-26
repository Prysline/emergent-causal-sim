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
let servedProbe='current';

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
  const validationAnchor="function validation(){return V.validateState(st());}";
  const renderAnchor="function render(){const s=st();normalizeCurrentZ();$('clock').textContent=`第 ${s.day} 天 ${E.timeStr()}`;$('tickLabel').textContent=`Tick ${s.tick}・Seed ${s.seed}`;renderLayerControl();renderBadges();renderMap();renderActions();renderTimeline();renderInspector();}";
  const stepAnchor="function stepOne(){E.tick();render();}";
  const toggleAnchor="  function togglePlay(){";
  const intervalAnchor="    $('play').textContent='⏸ 暫停';timer=setInterval(stepOne,700);syncControlState();return true;";
  if(!body.includes(validationAnchor)||!body.includes(renderAnchor)||!body.includes(stepAnchor)||!body.includes(toggleAnchor)||!body.includes(intervalAnchor))throw new Error('core performance diagnostic anchor missing');

  if(servedProbe==='validatorReuse'||servedProbe==='combined'){
    body=body.replace(validationAnchor,"let __renderValidationSnapshot=null;function validation(){return __renderValidationSnapshot??V.validateState(st());}");
    body=body.replace(renderAnchor,"function render(){const __diagStart=performance.now();__renderValidationSnapshot=V.validateState(st());try{const s=st();normalizeCurrentZ();$('clock').textContent=`第 ${s.day} 天 ${E.timeStr()}`;$('tickLabel').textContent=`Tick ${s.tick}・Seed ${s.seed}`;renderLayerControl();renderBadges();renderMap();renderActions();renderTimeline();renderInspector();}finally{__renderValidationSnapshot=null;globalThis.__perfRenderRecord?.(__diagStart,performance.now(),E.getState()?.tick??null);}}");
  }else{
    body=body.replace(renderAnchor,"function render(){const __diagStart=performance.now();try{const s=st();normalizeCurrentZ();$('clock').textContent=`第 ${s.day} 天 ${E.timeStr()}`;$('tickLabel').textContent=`Tick ${s.tick}・Seed ${s.seed}`;renderLayerControl();renderBadges();renderMap();renderActions();renderTimeline();renderInspector();}finally{globalThis.__perfRenderRecord?.(__diagStart,performance.now(),E.getState()?.tick??null);}}");
  }

  body=body.replace(stepAnchor,"function stepOne(){const __diagStart=performance.now();try{E.tick();render();}finally{globalThis.__perfStepOneRecord?.(__diagStart,performance.now(),E.getState()?.tick??null);if(globalThis.__diagAutoTargetTick&&E.getState()?.tick>=globalThis.__diagAutoTargetTick&&timer){clearInterval(timer);timer=null;$('play').textContent='▶ 開始';syncControlState();globalThis.__diagAutoStopReached=true;}}}");

  if(servedProbe==='completionAware'||servedProbe==='combined'){
    body=body.replace(toggleAnchor,"  function scheduleCompletionAwarePlay(){\n    timer=setTimeout(()=>{\n      if(!timer)return;\n      stepOne();\n      if(!timer)return;\n      requestAnimationFrame(()=>requestAnimationFrame(()=>{if(timer)scheduleCompletionAwarePlay();}));\n    },700);\n  }\n  function togglePlay(){");
    body=body.replace(intervalAnchor,"    $('play').textContent='⏸ 暫停';scheduleCompletionAwarePlay();syncControlState();return true;");
  }
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
      stepOne:[],
      renders:[],
      callerStacks:{}
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
        const start=performance.now(),resolvedLabel=label||name;
        if(resolvedLabel==='SP.traversalFeasibility'&&window.__perfCollectCallerStacks){
          const stack=String(new Error().stack||'').split('\n').slice(2,8).join(' | ')
            .replace(/http:\/\/127\.0\.0\.1:4173\//g,'')
            .replace(/:\d+:\d+/g,':#:#');
          const key=phase+' | '+stack;
          data.callerStacks[key]=(data.callerStacks[key]||0)+1;
        }
        try{return original.apply(this,args);}
        finally{record(data.queries,resolvedLabel,performance.now()-start);}
      };
    }

    window.__perfStepOneRecord=(start,end,tick)=>{
      const rec={startMs:start,endMs:end,durationMs:end-start,tick,firstTimerOpportunityMs:null,firstFrameMs:null,usableFrameMs:null};
      data.stepOne.push(rec);
      setTimeout(()=>{rec.firstTimerOpportunityMs=performance.now()-start;},0);
      requestAnimationFrame(()=>{
        rec.firstFrameMs=performance.now()-start;
        requestAnimationFrame(()=>{rec.usableFrameMs=performance.now()-start;});
      });
    };
    window.__perfRenderRecord=(start,end,tick)=>data.renders.push({startMs:start,endMs:end,durationMs:end-start,tick});

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
        data.renders.length=0;
        for(const key of Object.keys(data.callerStacks))delete data.callerStacks[key];
        window.__perfCollectCallerStacks=false;
        window.__diagAutoTargetTick=null;
        window.__diagAutoStopReached=false;
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
          renders:data.renders.map(x=>({...x})),
          callerStacks:structuredClone(data.callerStacks),
          pipeline:window.__stepBatchPipelineProbe?.snapshot?.()||{},
          tick:E.getState()?.tick??null,
          presentationJson:JSON.stringify(Object.fromEntries(['worldBadges','map','actions','timeline','inspector','runtimeLayerSelect'].map(id=>[id,document.getElementById(id)?.innerHTML||'']))),
          stateJson:JSON.stringify(E.getState())
        };
      }
    };
  });
}

async function openCase({selected=false,probe='current',collectCallers=false}={}){
  servedProbe=probe;
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());
  if(selected){
    const agent=page.locator('[data-entity="agent:zhen"]').first();
    await agent.click();
    await page.waitForFunction(()=>window.SimUI?.getInspectorSelection?.()?.id==='zhen');
    await settleFrames(2);
  }
  await installInstrumentation();
  await page.evaluate(({collectCallers})=>{window.__stepBatchPerf.reset();window.__perfCollectCallerStacks=collectCallers;},{collectCallers});
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

async function runCase(mode,selected,probe='current',collectCallers=false){
  await openCase({selected,probe,collectCallers});
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
    probe,
    selected,
    startTick,
    interactions,
    metrics:snapshot
  };
}

async function runAutoplayCase(probe,selected,ticks=3){
  await openCase({selected,probe});
  const startTick=await page.evaluate(()=>window.SimEngine.getState().tick);
  const targetTick=startTick+ticks;
  await page.evaluate(targetTick=>{window.__diagAutoTargetTick=targetTick;window.__diagAutoStopReached=false;},targetTick);
  const start=performance.now();
  const handlerMs=await page.evaluate(()=>{
    const start=performance.now();
    document.getElementById('play').click();
    return performance.now()-start;
  });
  await page.waitForFunction(()=>window.__diagAutoStopReached===true,null,{timeout:60000});
  const totalCompletionMs=performance.now()-start;
  await settleFrames(3);
  const snapshot=await page.evaluate(()=>window.__stepBatchPerf.snapshot());
  return {mode:'autoplay',probe,selected,startTick,targetTick,handlerMs,totalCompletionMs,metrics:snapshot};
}

async function runAutoplayLifecycleProbe(probe){
  await openCase({selected:false,probe});
  const startTick=await page.evaluate(()=>window.SimEngine.getState().tick);
  await page.locator('#play').click();
  const active=await page.evaluate(()=>({
    stepDisabled:document.getElementById('step').disabled,
    step10Disabled:document.getElementById('step10').disabled,
    playText:document.getElementById('play').textContent
  }));
  await page.locator('#play').click();
  await page.waitForTimeout(850);
  const pausedTick=await page.evaluate(()=>window.SimEngine.getState().tick);
  await page.locator('#play').click();
  await page.locator('#reset').click();
  await page.waitForTimeout(850);
  const resetTick=await page.evaluate(()=>window.SimEngine.getState().tick);
  await page.locator('#step').click();
  const manualTick=await page.evaluate(()=>window.SimEngine.getState().tick);
  return {probe,startTick,active,pausedTick,resetTick,manualTick};
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
    probe:result.probe,
    selected:result.selected,
    startTick:result.startTick,
    interactions:result.interactions,
    metrics,
    summary:{
      tickTotalMs:tickDurations.reduce((sum,x)=>sum+x,0),
      tickMaxMs:Math.max(0,...tickDurations),
      tickMeanMs:tickDurations.length?tickDurations.reduce((sum,x)=>sum+x,0)/tickDurations.length:0,
      stateHash:hashText(stateJson),
      validateCalls:metrics.queries?.['SimValidator.validateState']?.calls??0,
      renderTotalMs:metrics.renders?.reduce((sum,x)=>sum+x.durationMs,0)??0,
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

  const validatorProbe={};
  for(const selected of [false,true]){
    const suffix=selected?'agent':'none';
    validatorProbe['current_'+suffix]=results['single_'+suffix];
    validatorProbe['reuse_'+suffix]=await runCase('single',selected,'validatorReuse');
    assertCase(validatorProbe['reuse_'+suffix],1);
  }
  assert.equal(queryPhaseCalls(validatorProbe.current_none,'SimValidator.validateState','outsideTick'),2,'current no-selection render must show duplicate validation');
  assert.equal(queryPhaseCalls(validatorProbe.reuse_none,'SimValidator.validateState','outsideTick'),1,'render-scoped snapshot must reduce no-selection validation to one call');
  assert.equal(queryPhaseCalls(validatorProbe.current_agent,'SimValidator.validateState','outsideTick'),1,'current selected Agent render must validate once');
  assert.equal(queryPhaseCalls(validatorProbe.reuse_agent,'SimValidator.validateState','outsideTick'),1,'render-scoped snapshot must not add selected-Agent validation calls');
  for(const suffix of ['none','agent']){
    assert.equal(validatorProbe['current_'+suffix].metrics.stateJson,validatorProbe['reuse_'+suffix].metrics.stateJson,'validator reuse must preserve canonical simulation state for '+suffix);
    assert.equal(validatorProbe['current_'+suffix].metrics.presentationJson,validatorProbe['reuse_'+suffix].metrics.presentationJson,'validator reuse must preserve rendered content for '+suffix);
  }

  const autoplayProbe={};
  for(const selected of [false,true]){
    const suffix=selected?'agent':'none';
    autoplayProbe['current_'+suffix]=await runAutoplayCase('current',selected,3);
    autoplayProbe['completion_'+suffix]=await runAutoplayCase('completionAware',selected,3);
    for(const key of ['current_'+suffix,'completion_'+suffix]){
      const result=autoplayProbe[key];
      assert.equal(result.metrics.tick,result.targetTick,key+' autoplay must advance exact target ticks');
      assert.equal(result.metrics.ticks.length,3,key+' autoplay instrumentation must see exactly three ticks');
      assert.equal(result.metrics.stepOne.length,3,key+' autoplay must record exactly three stepOne callbacks');
      assert.ok(result.metrics.stepOne.every(x=>Number.isFinite(x.durationMs)&&Number.isFinite(x.firstFrameMs)&&Number.isFinite(x.usableFrameMs)&&Number.isFinite(x.firstTimerOpportunityMs)),key+' autoplay callback records must include callback + frame/timer timings');
    }
    assert.equal(autoplayProbe['current_'+suffix].metrics.stateJson,autoplayProbe['completion_'+suffix].metrics.stateJson,'completion-aware autoplay must preserve canonical state/RNG parity for '+suffix);
  }
  assert.equal(autoplayProbe.current_none.metrics.stateJson,autoplayProbe.current_agent.metrics.stateJson,'Inspector selection must remain simulation-state inert during current autoplay');
  assert.equal(autoplayProbe.completion_none.metrics.stateJson,autoplayProbe.completion_agent.metrics.stateJson,'Inspector selection must remain simulation-state inert during completion-aware autoplay');

  const lifecycleCurrent=await runAutoplayLifecycleProbe('current');
  const lifecycleCompletion=await runAutoplayLifecycleProbe('completionAware');
  for(const lifecycle of [lifecycleCurrent,lifecycleCompletion]){
    assert.equal(lifecycle.active.stepDisabled,true,lifecycle.probe+' autoplay must disable manual step');
    assert.equal(lifecycle.active.step10Disabled,true,lifecycle.probe+' autoplay must disable step10');
    assert.ok(lifecycle.active.playText.includes('暫停'),lifecycle.probe+' autoplay play control must become pause');
    assert.equal(lifecycle.pausedTick,lifecycle.startTick,lifecycle.probe+' pause-before-first-callback must prevent ticks');
    assert.equal(lifecycle.resetTick,0,lifecycle.probe+' reset must cancel pending autoplay callback');
    assert.equal(lifecycle.manualTick,1,lifecycle.probe+' manual step must work after reset cancellation');
  }

  const callerAttribution=await runCase('single',false,'current',true);
  assertCase(callerAttribution,1);
  assert.equal(queryPhaseCalls(callerAttribution,'SP.traversalFeasibility','insideTick'),8621,'caller-attribution single tick must preserve Slice 4 feasibility count');
  const callerTop=Object.entries(callerAttribution.metrics.callerStacks)
    .filter(([key])=>key.startsWith('insideTick | '))
    .sort((a,b)=>b[1]-a[1])
    .slice(0,30)
    .map(([stack,calls])=>({calls,stack}));

  console.log('PERF_REVALIDATION_VALIDATOR_PROBE '+JSON.stringify(Object.fromEntries(Object.entries(validatorProbe).map(([name,r])=>[name,{
    validateOutside:queryPhaseCalls(r,'SimValidator.validateState','outsideTick'),
    feasibilityOutside:queryPhaseCalls(r,'SP.traversalFeasibility','outsideTick'),
    planRouteOutside:queryPhaseCalls(r,'SP.planRoute','outsideTick'),
    handler:r.interactions[0]?.handlerMs,
    usableFrame:r.interactions[0]?.usableFrameMs,
    renderMs:r.metrics.renders.reduce((sum,x)=>sum+x.durationMs,0),
    stateHash:hashText(r.metrics.stateJson)
  }]))));
  console.log('PERF_REVALIDATION_AUTOPLAY_PROBE '+JSON.stringify(Object.fromEntries(Object.entries(autoplayProbe).map(([name,r])=>[name,{
    handlerMs:r.handlerMs,
    totalCompletionMs:r.totalCompletionMs,
    stepOne:r.metrics.stepOne,
    longTasks:r.metrics.longTasks,
    tickDurations:r.metrics.ticks.map(x=>x.durationMs),
    validateCalls:r.metrics.queries?.['SimValidator.validateState']?.calls??0,
    stateHash:hashText(r.metrics.stateJson)
  }]))));
  console.log('PERF_REVALIDATION_LIFECYCLE '+JSON.stringify({current:lifecycleCurrent,completionAware:lifecycleCompletion}));
  console.log('PERF_REVALIDATION_CALLER_ATTRIBUTION '+JSON.stringify(callerTop));
  const feasibilityCounts={
    singleInside:queryPhaseCalls(results.single_none,'SP.traversalFeasibility','insideTick'),
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
  assert.equal(feasibilityCounts.singleInside,8621,'8-direction Slice 4 must retain the measured single-tick feasibility baseline');
  assert.equal(feasibilityCounts.batch10Inside,25253,'8-direction Slice 4 must retain the measured step(10) inside-tick feasibility baseline');
  assert.equal(feasibilityCounts.batch10Outside,6898,'8-direction Slice 4 must retain the measured outside-tick feasibility baseline');

  assert.deepEqual(pageErrors,[],'step batch perf QA must have no page errors');
  assert.deepEqual(consoleErrors,[],'step batch perf QA must have no console errors');

  const report={
    generatedAt:new Date().toISOString(),
    note:'Post-Slice-4 performance revalidation diagnostic. Deterministic query counts + exact state/RNG parity remain correctness/workload evidence; latency, Long Task, callback-to-frame opportunity, render-scoped Validator reuse, and completion-aware autoplay are measured as responsiveness evidence without brittle CI timing thresholds.',
    cases:Object.fromEntries(Object.entries(results).map(([name,result])=>[name,reportCase(result)])),
    diagnostics:{
      validatorProbe:Object.fromEntries(Object.entries(validatorProbe).map(([name,result])=>[name,reportCase(result)])),
      autoplayProbe:Object.fromEntries(Object.entries(autoplayProbe).map(([name,result])=>[name,{
        mode:result.mode,probe:result.probe,selected:result.selected,startTick:result.startTick,targetTick:result.targetTick,
        handlerMs:result.handlerMs,totalCompletionMs:result.totalCompletionMs,
        metrics:{...result.metrics,stateJson:undefined},
        summary:{stateHash:hashText(result.metrics.stateJson),stateBytes:Buffer.byteLength(result.metrics.stateJson)}
      }])),
      lifecycle:{current:lifecycleCurrent,completionAware:lifecycleCompletion},
      callerAttributionTop:callerTop
    },
    pageErrors,
    consoleErrors
  };
  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  console.log('STEP_BATCH_PERF_METRICS '+JSON.stringify(report));
  console.log('Step batch performance QA: measurement + deterministic parity ok');
} finally {
  await browser.close();
}
