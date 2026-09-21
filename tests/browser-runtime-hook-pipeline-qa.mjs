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
      afterObservers:E.listRuntimeObservers('afterTick'),
      resetObservers:E.listRuntimeObservers('afterReset'),
      finalized:E.isRuntimeHookRegistryFinalized(),
      tick:E.getState().tick
    };
  });

  assert.equal(snapshot.pipelineVersion,'runtime-hook-pipeline-2');
  assert.equal(snapshot.tickOwned,true,'all browser/UI scripts must leave E.tick owned by the runtime pipeline');
  assert.equal(snapshot.resetOwned,true,'all browser/UI scripts must leave E.reset owned by the runtime pipeline');
  assert.equal(snapshot.finalized,true,'simulation runtime schedule must already be finalized in the browser');
  assert.equal(snapshot.after.at(-1)?.id,'socialOutcome.process','simulation afterTick manifest must end before Presentation observers');
  assert.equal(snapshot.reset.at(-1)?.id,'memoryRetention.normalize-reset','simulation afterReset manifest must end before Presentation observers');
  assert.deepEqual(snapshot.afterObservers.map(x=>x.id),['uiObservability.render-mobile-summary','residentView.schedule','relationshipView.schedule'],'Presentation observers must retain explicit relative order after simulation hooks');
  assert.deepEqual(snapshot.resetObservers.map(x=>x.id),['uiObservability.reset','residentView.reset','relationshipView.reset'],'Presentation reset observers must retain explicit relative order after simulation normalization');

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
