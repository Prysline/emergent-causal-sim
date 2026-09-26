import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-step-batch-lifecycle-qa';
fs.mkdirSync(outDir,{recursive:true});

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const pageErrors=[],consoleErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});

const seed=20260911;

async function settleFrames(count=2){
  await page.evaluate(async count=>{
    for(let i=0;i<count;i++)await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  },count);
}

async function resetThroughUi(){
  await page.evaluate(seed=>{document.getElementById('seedInput').value=String(seed);},seed);
  await page.click('#reset');
  await page.waitForFunction(()=>window.SimEngine.getState().tick===0);
  await settleFrames(2);
}

async function selectZhen(){
  await page.locator('[data-entity="agent:zhen"]').first().click();
  await page.waitForFunction(()=>window.SimUI?.getInspectorSelection?.()?.id==='zhen');
  await settleFrames(3);
}

async function installProbe(){
  await page.evaluate(()=>{
    if(window.__batchLifecycleProbe)return;
    const E=window.SimEngine;
    const data={rafCount:0,ticks:[],mutations:{mobile:0,map:0,actions:0,timeline:0,inspector:0}};
    let running=true,autoplayStopTick=null;
    function frame(){data.rafCount++;if(running)requestAnimationFrame(frame);}
    requestAnimationFrame(frame);

    const originalTick=E.tick;
    E.tick=function(...args){
      data.ticks.push({before:E.getState().tick,rafCount:data.rafCount});
      const result=originalTick.apply(this,args);
      if(autoplayStopTick!==null&&E.getState().tick>=autoplayStopTick){
        autoplayStopTick=null;
        queueMicrotask(()=>document.getElementById('play')?.click());
      }
      return result;
    };

    const observers=[];
    for(const [key,id] of [['mobile','mobileAgentSummary'],['map','map'],['actions','actions'],['timeline','timeline'],['inspector','inspector']]){
      const host=document.getElementById(id);if(!host)continue;
      const observer=new MutationObserver(records=>{data.mutations[key]+=records.length;});
      observer.observe(host,{childList:true,subtree:true,characterData:true,attributes:true});
      observers.push(observer);
    }

    window.__batchLifecycleProbe={
      snapshot:()=>structuredClone(data),
      reset(){data.ticks.length=0;autoplayStopTick=null;for(const key of Object.keys(data.mutations))data.mutations[key]=0;},
      setAutoplayStopTick(tick){autoplayStopTick=Number(tick);},
      stop(){running=false;autoplayStopTick=null;for(const observer of observers)observer.disconnect();E.tick=originalTick;}
    };
  });
}

function assertFrameBoundaryTicks(snapshot,initialRaf){
  assert.equal(snapshot.ticks.length,10,'manual batch must execute exactly ten complete E.tick calls');
  let previous=initialRaf;
  for(const [index,row] of snapshot.ticks.entries()){
    assert.ok(row.rafCount>previous,`tick ${index+1} must begin after a new animation-frame/event-loop opportunity`);
    previous=row.rafCount;
  }
}

try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());

  const lifecycle=await page.evaluate(()=>({
    tickOwned:window.SimEngine.tick===window.SimEngine.RUNTIME_PIPELINE_TICK,
    resetOwned:window.SimEngine.reset===window.SimEngine.RUNTIME_PIPELINE_RESET,
    afterObservers:window.SimEngine.listRuntimeObservers('afterTick').map(x=>x.id),
    resetObservers:window.SimEngine.listRuntimeObservers('afterReset').map(x=>x.id)
  }));
  assert.equal(lifecycle.tickOwned,true,'Perf-4 must not replace runtime-pipeline tick ownership');
  assert.equal(lifecycle.resetOwned,true,'Perf-4 must not replace runtime-pipeline reset ownership');
  assert.deepEqual(lifecycle.afterObservers,['uiObservability.render-mobile-summary','residentView.schedule','relationshipView.schedule']);
  assert.deepEqual(lifecycle.resetObservers,['uiObservability.reset','residentView.reset','relationshipView.reset']);

  const reference=await page.evaluate(seed=>{
    const E=window.SimEngine;
    E.reset(seed);
    const resetStateJson=JSON.stringify(E.getState()),resetRng=E.getState().rngState;
    for(let i=0;i<10;i++)E.tick();
    return {
      stateJson:JSON.stringify(E.getState()),
      rng:E.getState().rngState,
      tick:E.getState().tick,
      resetStateJson,
      resetRng
    };
  },seed);
  assert.equal(reference.tick,10);

  await resetThroughUi();
  await selectZhen();
  await installProbe();
  await page.evaluate(()=>window.__batchLifecycleProbe.reset());

  const start=await page.evaluate(()=>{
    const E=window.SimEngine,workspace=document.querySelector('.workspace'),probe=window.__batchLifecycleProbe.snapshot();
    const startTick=E.getState().tick;
    document.getElementById('step10').click();
    return {
      startTick,
      afterClickTick:E.getState().tick,
      initialRaf:probe.rafCount,
      busy:workspace?.getAttribute('aria-busy'),
      inert:workspace?.inert,
      stepDisabled:document.getElementById('step').disabled,
      step10Disabled:document.getElementById('step10').disabled,
      playDisabled:document.getElementById('play').disabled,
      resetDisabled:document.getElementById('reset').disabled,
      layerDisabled:document.getElementById('runtimeLayerSelect').disabled,
      thoughtsDisabled:document.getElementById('showThoughts').disabled,
      scenarioDisabled:document.getElementById('loadSocialScenario').disabled,
      scenarioSelectDisabled:document.getElementById('socialScenario').disabled,
      progress:document.getElementById('step10').textContent
    };
  });
  assert.equal(start.afterClickTick,start.startTick,'batch click must return before the first tick');
  assert.equal(start.busy,'true','workspace must expose aria-busy immediately');
  assert.equal(start.inert,true,'simulation-dependent workspace must be inert during a manual batch');
  assert.equal(start.stepDisabled,true);
  assert.equal(start.step10Disabled,true);
  assert.equal(start.playDisabled,true);
  assert.equal(start.resetDisabled,false,'reset must remain available during a manual batch');
  assert.equal(start.layerDisabled,true);
  assert.equal(start.thoughtsDisabled,true);
  assert.equal(start.scenarioDisabled,true);
  assert.equal(start.scenarioSelectDisabled,true);
  assert.equal(start.progress,'執行中 0/10');

  const firstOpportunity=await page.evaluate(()=>new Promise(resolve=>setTimeout(()=>resolve({
    tick:window.SimEngine.getState().tick,
    busy:document.querySelector('.workspace')?.getAttribute('aria-busy')
  }),0)));
  assert.equal(firstOpportunity.tick,start.startTick,'there must be an event-loop opportunity before the first tick');
  assert.equal(firstOpportunity.busy,'true');

  await page.waitForFunction(startTick=>{
    const tick=window.SimEngine.getState().tick;
    return tick>=startTick+1&&tick<startTick+10&&document.querySelector('.workspace')?.getAttribute('aria-busy')==='true';
  },start.startTick);

  const intermediate=await page.evaluate(()=>({
    tick:window.SimEngine.getState().tick,
    mutations:window.__batchLifecycleProbe.snapshot().mutations,
    tickLabel:document.getElementById('tickLabel').textContent,
    progress:document.getElementById('step10').textContent,
    mobileText:document.getElementById('mobileAgentSummary')?.textContent||'',
    inspectorText:document.getElementById('inspector')?.textContent||''
  }));
  assert.ok(intermediate.tick>start.startTick&&intermediate.tick<start.startTick+10);
  assert.equal(intermediate.mutations.mobile,0,'mobile summary must not refresh an intermediate batch state');
  assert.equal(intermediate.mutations.map,0,'map must retain the pre-batch complete presentation snapshot');
  assert.equal(intermediate.mutations.actions,0,'action cards must retain the pre-batch complete presentation snapshot');
  assert.equal(intermediate.mutations.timeline,0,'timeline must retain the pre-batch complete presentation snapshot');
  assert.equal(intermediate.mutations.inspector,0,'Resident/Relationship/core Inspector must not expose intermediate state');
  assert.match(intermediate.tickLabel,/Tick 0/,'core tick label must remain on the pre-batch snapshot until final render');
  assert.match(intermediate.progress,/^執行中 [1-9]\/10$/);

  await page.evaluate(()=>{
    document.getElementById('step').click();
    document.getElementById('step10').click();
    document.getElementById('play').click();
  });

  await page.waitForFunction(startTick=>
    window.SimEngine.getState().tick===startTick+10&&
    document.querySelector('.workspace')?.getAttribute('aria-busy')!=='true'
  ,start.startTick);
  await settleFrames(3);

  const completed=await page.evaluate(()=>({
    stateJson:JSON.stringify(window.SimEngine.getState()),
    rng:window.SimEngine.getState().rngState,
    tick:window.SimEngine.getState().tick,
    selection:window.SimUI.getInspectorSelection?.(),
    busy:document.querySelector('.workspace')?.getAttribute('aria-busy')||null,
    inert:document.querySelector('.workspace')?.inert,
    tickLabel:document.getElementById('tickLabel').textContent,
    progress:document.getElementById('step10').textContent,
    controls:{
      step:document.getElementById('step').disabled,
      step10:document.getElementById('step10').disabled,
      play:document.getElementById('play').disabled,
      reset:document.getElementById('reset').disabled,
      thoughts:document.getElementById('showThoughts').disabled,
      scenario:document.getElementById('loadSocialScenario').disabled
    },
    probe:window.__batchLifecycleProbe.snapshot()
  }));
  assert.equal(completed.tick,10,'duplicate manual controls must not create an extra tick source');
  assert.equal(completed.stateJson,reference.stateJson,'async manual batch must preserve exact canonical state parity');
  assert.equal(completed.rng,reference.rng,'async manual batch must preserve exact RNG parity');
  assert.equal(completed.selection?.id,'zhen','normal batch completion must preserve Inspector selection');
  assert.equal(completed.busy,null);
  assert.equal(completed.inert,false);
  assert.match(completed.tickLabel,/Tick 10/,'final core render must project the final canonical tick');
  assert.equal(completed.progress,'10 步');
  assert.deepEqual(completed.controls,{step:false,step10:false,play:false,reset:false,thoughts:false,scenario:false});
  assert.ok(completed.probe.mutations.mobile>0,'final tick must refresh mobile summary');
  assert.ok(completed.probe.mutations.map>0,'final completion must perform one core map refresh');
  assert.ok(completed.probe.mutations.inspector>0,'final completion must refresh the selected Inspector');
  assertFrameBoundaryTicks(completed.probe,start.initialRaf);

  await resetThroughUi();
  await selectZhen();
  await page.evaluate(()=>window.__batchLifecycleProbe.reset());
  const cancelStart=await page.evaluate(()=>{
    const startTick=window.SimEngine.getState().tick;
    document.getElementById('step10').click();
    return startTick;
  });
  await page.waitForFunction(startTick=>
    window.SimEngine.getState().tick>startTick&&
    window.SimEngine.getState().tick<startTick+10&&
    document.querySelector('.workspace')?.getAttribute('aria-busy')==='true'
  ,cancelStart);
  await page.click('#reset');
  await page.waitForFunction(()=>window.SimEngine.getState().tick===0&&document.querySelector('.workspace')?.getAttribute('aria-busy')!=='true');
  await settleFrames(3);
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,40)));
  const cancelled=await page.evaluate(()=>({
    stateJson:JSON.stringify(window.SimEngine.getState()),
    rng:window.SimEngine.getState().rngState,
    tick:window.SimEngine.getState().tick,
    selection:window.SimUI.getInspectorSelection?.(),
    busy:document.querySelector('.workspace')?.getAttribute('aria-busy')||null,
    progress:document.getElementById('step10').textContent,
    tickLabel:document.getElementById('tickLabel').textContent
  }));
  assert.equal(cancelled.stateJson,reference.resetStateJson,'mid-batch reset must return to canonical reset state');
  assert.equal(cancelled.rng,reference.resetRng);
  assert.equal(cancelled.tick,0,'stale batch continuation must not execute after reset');
  assert.equal(cancelled.selection,null,'reset must retain the existing selection-clearing contract');
  assert.equal(cancelled.busy,null);
  assert.equal(cancelled.progress,'10 步');
  assert.match(cancelled.tickLabel,/Tick 0/,'stale batch continuation must not perform a final render');

  const autoplayReference=await page.evaluate(seed=>{
    const E=window.SimEngine;
    E.reset(seed);
    E.tick();
    E.tick();
    return {stateJson:JSON.stringify(E.getState()),rng:E.getState().rngState,tick:E.getState().tick};
  },seed);
  assert.equal(autoplayReference.tick,2);

  await resetThroughUi();
  await page.evaluate(()=>window.__batchLifecycleProbe.reset());
  const autoplayInitialRaf=await page.evaluate(()=>window.__batchLifecycleProbe.snapshot().rafCount);
  await page.evaluate(()=>window.__batchLifecycleProbe.setAutoplayStopTick(2));
  await page.click('#play');
  const autoplay=await page.evaluate(()=>({
    step:document.getElementById('step').disabled,
    step10:document.getElementById('step10').disabled,
    play:document.getElementById('play').disabled,
    reset:document.getElementById('reset').disabled,
    playText:document.getElementById('play').textContent
  }));
  assert.equal(autoplay.step,true,'autoplay must disable manual single-step');
  assert.equal(autoplay.step10,true,'autoplay must disable manual batch-step');
  assert.equal(autoplay.play,false,'play must remain available as pause during autoplay');
  assert.equal(autoplay.reset,false);
  assert.match(autoplay.playText,/暫停/);
  await page.waitForFunction(()=>window.SimEngine.getState().tick===2&&document.getElementById('play').textContent.includes('開始'));
  await settleFrames(2);
  const autoplayCompleted=await page.evaluate(()=>({
    tick:window.SimEngine.getState().tick,
    rng:window.SimEngine.getState().rngState,
    stateJson:JSON.stringify(window.SimEngine.getState()),
    probe:window.__batchLifecycleProbe.snapshot(),
    playText:document.getElementById('play').textContent
  }));
  assert.equal(autoplayCompleted.tick,2,'autoplay pause must stop at the observed target tick without an overdue catch-up tick');
  assert.equal(autoplayCompleted.probe.ticks.length,2,'autoplay must execute exactly two complete E.tick calls in the lifecycle probe');
  assert.ok(autoplayCompleted.probe.ticks[0].rafCount>=autoplayInitialRaf,'first autoplay tick may begin after the initial delay without requiring a new frame assertion');
  assert.ok(autoplayCompleted.probe.ticks[1].rafCount>autoplayCompleted.probe.ticks[0].rafCount,'a browser animation-frame opportunity must occur between autoplay tick callbacks');
  assert.equal(autoplayCompleted.stateJson,autoplayReference.stateJson,'completion-aware autoplay must preserve canonical state parity for the same tick count');
  assert.equal(autoplayCompleted.rng,autoplayReference.rng,'completion-aware autoplay must preserve RNG parity for the same tick count');
  assert.match(autoplayCompleted.playText,/開始/);
  const pausedTick=autoplayCompleted.tick;
  await page.waitForTimeout(850);
  assert.equal(await page.evaluate(()=>window.SimEngine.getState().tick),pausedTick,'autoplay pause must stop the only active tick source');

  await resetThroughUi();
  await page.click('#play');
  await page.click('#reset');
  await page.waitForTimeout(850);
  const resetAutoplay=await page.evaluate(()=>({
    tick:window.SimEngine.getState().tick,
    playText:document.getElementById('play').textContent,
    stepDisabled:document.getElementById('step').disabled,
    step10Disabled:document.getElementById('step10').disabled
  }));
  assert.equal(resetAutoplay.tick,0,'reset must cancel the pending autoplay callback');
  assert.match(resetAutoplay.playText,/開始/);
  assert.equal(resetAutoplay.stepDisabled,false);
  assert.equal(resetAutoplay.step10Disabled,false);

  assert.deepEqual(pageErrors,[],'batch lifecycle QA must have no page errors');
  assert.deepEqual(consoleErrors,[],'batch lifecycle QA must have no console errors');

  const report={generatedAt:new Date().toISOString(),reference:{tick:reference.tick,rng:reference.rng},completed:{tick:completed.tick,mutations:completed.probe.mutations,ticks:completed.probe.ticks},cancelled:{tick:cancelled.tick},autoplay:{tick:autoplayCompleted.tick,ticks:autoplayCompleted.probe.ticks},pageErrors,consoleErrors};
  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  console.log('Batch-step lifecycle QA: atomic ticks + yielding + cancellation + presentation parity ok');
} finally {
  await page.evaluate(()=>window.__batchLifecycleProbe?.stop?.()).catch(()=>{});
  await browser.close();
}
