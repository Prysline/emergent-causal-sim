import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-debug-replay-p1-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const pageErrors=[],consoleErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
const seed=20260911;

async function settleFrames(count=2){
  await page.evaluate(async count=>{for(let i=0;i<count;i++)await new Promise(resolve=>requestAnimationFrame(resolve));},count);
}
async function reset(){
  await page.evaluate(seed=>{document.getElementById('seedInput').value=String(seed);},seed);
  await page.click('#reset');
  await page.waitForFunction(()=>window.SimEngine.getState().tick===0);
  await settleFrames();
}
async function setRun(mode,value){
  await page.selectOption('#debugRunMode',mode);
  await page.fill('#debugRunValue',String(value));
  await page.click('#debugRunStart');
}
async function waitRunComplete(targetTick){
  await page.waitForFunction(targetTick=>window.SimEngine.getState().tick===targetTick&&document.querySelector('.workspace')?.getAttribute('aria-busy')!=='true',targetTick);
  await settleFrames(2);
}
async function snapshot(){
  return page.evaluate(()=>({
    tick:window.SimEngine.getState().tick,
    day:window.SimEngine.getState().day,
    minute:window.SimEngine.getState().minute,
    rng:window.SimEngine.getState().rngState,
    stateJson:JSON.stringify(window.SimEngine.getState()),
    tickLabel:document.getElementById('tickLabel').textContent,
    clock:document.getElementById('clock').textContent,
    status:document.getElementById('debugRunStatus')?.textContent||'',
    busy:document.querySelector('.workspace')?.getAttribute('aria-busy')||null,
    controls:{
      step:document.getElementById('step').disabled,
      step10:document.getElementById('step10').disabled,
      play:document.getElementById('play').disabled,
      reset:document.getElementById('reset').disabled,
      mode:document.getElementById('debugRunMode').disabled,
      value:document.getElementById('debugRunValue').disabled,
      run:document.getElementById('debugRunStart').disabled
    }
  }));
}

try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.()&&window.SimEngine?.UI_OBSERVABILITY_CONTROLS_VERSION==='11.48.0-debug-replay-p1');

  const reference25=await page.evaluate(seed=>{
    const E=window.SimEngine;E.reset(seed);for(let i=0;i<25;i++)E.tick();
    return {tick:E.getState().tick,rng:E.getState().rngState,stateJson:JSON.stringify(E.getState())};
  },seed);
  assert.equal(reference25.tick,25);

  await reset();
  await setRun('count',25);
  await page.waitForFunction(()=>window.SimEngine.getState().tick>0&&window.SimEngine.getState().tick<25);
  const intermediate=await snapshot();
  assert.equal(intermediate.busy,'true','Run N must expose a busy workspace while intermediate ticks execute');
  assert.match(intermediate.tickLabel,/Tick 0/,'intermediate canonical ticks must not leak into the core projection before final render');
  assert.equal(intermediate.controls.reset,false,'Reset must remain available during Debug Replay');
  assert.equal(intermediate.controls.step,true);
  assert.equal(intermediate.controls.step10,true);
  assert.equal(intermediate.controls.play,true);
  assert.equal(intermediate.controls.mode,true);
  assert.equal(intermediate.controls.value,true);
  assert.equal(intermediate.controls.run,true);
  await waitRunComplete(25);
  const run25=await snapshot();
  assert.equal(run25.stateJson,reference25.stateJson,'Run N must preserve exact canonical state parity with direct E.tick calls');
  assert.equal(run25.rng,reference25.rng,'Run N must preserve RNG parity');
  assert.match(run25.tickLabel,/Tick 25/);
  assert.match(run25.status,/完成：Tick 25/);
  assert.deepEqual(run25.controls,{step:false,step10:false,play:false,reset:false,mode:false,value:false,run:false});

  await reset();
  await page.click('#step');
  await page.click('#step');
  assert.equal((await snapshot()).tick,2);
  await setRun('tick',11);
  await waitRunComplete(11);
  const toTick=await snapshot();
  assert.equal(toTick.tick,11,'Run to tick must stop exactly on the requested target');
  assert.match(toTick.status,/完成：Tick 11/);
  await page.waitForTimeout(60);
  assert.equal((await snapshot()).tick,11,'Run to tick must not leave an overdue continuation');

  await reset();
  await setRun('time','12:10');
  await waitRunComplete(5);
  const toTime=await snapshot();
  assert.equal(toTime.day,1);
  assert.equal(toTime.minute,12*60+10);
  assert.match(toTime.clock,/12:10/,'Run to simulation time must project the exact target time');

  await reset();
  await setRun('time','12:03');
  await page.waitForTimeout(50);
  const invalidTime=await snapshot();
  assert.equal(invalidTime.tick,0,'an unreachable simulation time must not execute any tick');
  assert.match(invalidTime.status,/無法.*精確抵達/,'unreachable simulation time must be rejected explicitly instead of rounded');

  await page.fill('#debugRunValue','0');
  await page.selectOption('#debugRunMode','tick');
  await page.click('#debugRunStart');
  await page.waitForTimeout(30);
  const invalidTick=await snapshot();
  assert.equal(invalidTick.tick,0);
  assert.match(invalidTick.status,/必須大於目前 tick/,'current or past target tick must be rejected');

  await reset();
  await setRun('count',80);
  await page.waitForFunction(()=>window.SimEngine.getState().tick>0&&window.SimEngine.getState().tick<80);
  await page.click('#reset');
  await page.waitForFunction(()=>window.SimEngine.getState().tick===0&&document.querySelector('.workspace')?.getAttribute('aria-busy')!=='true');
  await page.waitForTimeout(100);
  const cancelled=await snapshot();
  assert.equal(cancelled.tick,0,'Reset must cancel a running fast-forward without stale continuation');
  assert.match(cancelled.tickLabel,/Tick 0/,'cancelled continuation must not perform a stale final render');

  const reference10=await page.evaluate(seed=>{const E=window.SimEngine;E.reset(seed);for(let i=0;i<10;i++)E.tick();return JSON.stringify(E.getState());},seed);
  await reset();
  await page.click('#step10');
  await waitRunComplete(10);
  const step10=await snapshot();
  assert.equal(step10.stateJson,reference10,'legacy 10-step shortcut must reuse the generic controller without changing canonical results');

  assert.deepEqual(pageErrors,[],'Debug Replay P1 QA must have no page errors');
  assert.deepEqual(consoleErrors,[],'Debug Replay P1 QA must have no console errors');
  const report={run25:{tick:run25.tick,rng:run25.rng},toTick:{tick:toTick.tick},toTime:{day:toTime.day,minute:toTime.minute},invalidTime:{tick:invalidTime.tick,status:invalidTime.status},cancelled:{tick:cancelled.tick},step10:{tick:step10.tick},pageErrors,consoleErrors};
  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  await page.screenshot({path:outDir+'/debug-replay-p1.png',fullPage:true});
  console.log('Debug Replay P1 browser QA: Run N + target tick/time + exact rejection + cancellation parity ok');
} finally {
  await browser.close();
}
