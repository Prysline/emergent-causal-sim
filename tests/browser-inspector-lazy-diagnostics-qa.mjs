import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});

try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimUI?.isStarted?.()&&window.SimEngine?.getState?.());
  await page.locator('[data-entity="agent:zhen"]').first().click();
  await page.waitForFunction(()=>document.querySelector('[data-v1140-resident-root]')&&window.SimUI?.getInspectorSelection?.()?.id==='zhen');

  await page.evaluate(()=>{
    const E=window.SimEngine,original=E.reconsiderationSnapshot;
    if(typeof original!=='function')throw new Error('Inspector lazy diagnostics requires canonical reconsiderationSnapshot');
    window.__inspectorLazyProbe={calls:0,original};
    E.reconsiderationSnapshot=function(...args){
      window.__inspectorLazyProbe.calls++;
      return original.apply(this,args);
    };
  });

  assert.equal(await page.evaluate(()=>window.SimUI.isInspectorDebugMode()),false,'Resident mode must not be Debug mode');
  const firstTick=await page.evaluate(()=>window.SimEngine.getState().tick);
  await page.click('#step');
  assert.equal(await page.evaluate(()=>window.SimEngine.getState().tick),firstTick+1);
  assert.equal(await page.evaluate(()=>window.__inspectorLazyProbe.calls),0,'Resident mode must not run hidden current-derived intent route diagnostics');
  const beforeDebug=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));

  await page.click('[data-v1140-mode="debug"]');
  await page.waitForFunction(()=>window.SimUI.isInspectorDebugMode()&&document.querySelector('[data-v1121-intent][data-current-derived="true"]'));
  assert.ok(await page.evaluate(()=>window.__inspectorLazyProbe.calls)>0,'Debug entry must calculate fresh current-derived reconsideration diagnostics');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.SimEngine.getState())),beforeDebug,'Inspecting Debug must not mutate canonical state');
  assert.equal(await page.locator('[data-v1140-resident-root]').count(),1,'Inspector must retain one canonical presentation shell');

  const debugCalls=await page.evaluate(()=>window.__inspectorLazyProbe.calls);
  await page.click('#step');
  assert.ok(await page.evaluate(()=>window.__inspectorLazyProbe.calls)>debugCalls,'Visible Debug diagnostics must refresh on a new tick');
  const debugAfterTick=await page.evaluate(()=>JSON.stringify(window.SimEngine.getState()));

  await page.click('[data-v1140-mode="resident"]');
  assert.equal(await page.evaluate(()=>window.SimUI.isInspectorDebugMode()),false);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.SimEngine.getState())),debugAfterTick,'Returning to Resident must not mutate canonical state');
  const residentCalls=await page.evaluate(()=>window.__inspectorLazyProbe.calls);
  await page.click('#step');
  assert.equal(await page.evaluate(()=>window.__inspectorLazyProbe.calls),residentCalls,'Returning to Resident must stop hidden route diagnostic work');
  assert.ok((await page.locator('[data-v1140-resident-view]').innerText()).includes('阿真'),'Resident presentation remains visible and fresh');
  assert.deepEqual(errors,[],'Inspector optimization must not introduce browser errors');

  console.log('Inspector lazy diagnostic regression: ok');
}finally{
  await page.evaluate(()=>{
    if(window.__inspectorLazyProbe){
      window.SimEngine.reconsiderationSnapshot=window.__inspectorLazyProbe.original;
      delete window.__inspectorLazyProbe;
    }
  }).catch(()=>{});
  await browser.close();
}
