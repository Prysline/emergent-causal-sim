import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});

try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'load'});
  await page.waitForFunction(()=>window.SimEngine?.UI_RESIDENT_VIEW_VERSION&&window.SimEngine?.UI_RELATIONSHIP_VERSION&&window.SimEngine?.UI_OBSERVABILITY_CONTROLS_VERSION);

  const snapshot=await page.evaluate(()=>{
    const E=window.SimEngine;
    return {
      pipelineVersion:E.RUNTIME_HOOK_PIPELINE_VERSION,
      tickOwned:E.tick===E.RUNTIME_PIPELINE_TICK,
      resetOwned:E.reset===E.RUNTIME_PIPELINE_RESET,
      before:E.listRuntimeHooks('beforeTick'),
      after:E.listRuntimeHooks('afterTick'),
      reset:E.listRuntimeHooks('afterReset'),
      tick:E.getState().tick
    };
  });

  assert.equal(snapshot.pipelineVersion,'runtime-hook-pipeline-1');
  assert.equal(snapshot.tickOwned,true,'all browser/UI scripts must leave E.tick owned by the runtime pipeline');
  assert.equal(snapshot.resetOwned,true,'all browser/UI scripts must leave E.reset owned by the runtime pipeline');
  assert.deepEqual(snapshot.after.slice(-3).map(x=>x.id),['uiObservability.render-mobile-summary','residentView.schedule','relationshipView.schedule'],'presentation hooks must run after simulation hooks in explicit order');
  assert.deepEqual(snapshot.reset.slice(-3).map(x=>x.id),['uiObservability.reset','residentView.reset','relationshipView.reset'],'presentation reset hooks must run after simulation normalization in explicit order');

  await page.locator('#step').click();
  await page.waitForFunction(tick=>window.SimEngine.getState().tick===tick+1,snapshot.tick);
  const afterStep=await page.evaluate(()=>({
    tick:window.SimEngine.getState().tick,
    tickOwned:window.SimEngine.tick===window.SimEngine.RUNTIME_PIPELINE_TICK,
    resetOwned:window.SimEngine.reset===window.SimEngine.RUNTIME_PIPELINE_RESET
  }));
  assert.equal(afterStep.tick,snapshot.tick+1,'single-step control must still advance exactly one tick');
  assert.equal(afterStep.tickOwned,true);
  assert.equal(afterStep.resetOwned,true);
  assert.deepEqual(errors,[],'browser pipeline QA must have no page/console errors');

  console.log('Browser runtime hook pipeline QA: ok');
} finally {
  await browser.close();
}
