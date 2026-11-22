// Opt-in, non-gating browser benchmark for the production completion-aware autoplay path.
// Start the repository's HTTP server at http://127.0.0.1:4173/ first.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const match=/^--([a-z-]+)=(.+)$/.exec(arg);
  if(!match)throw new Error(`Expected --name=value: ${arg}`);
  return [match[1],match[2]];
}));
const count=Number(args.ticks??10);
const intervals=(args.intervals??'700,350,175,87.5').split(',').map(Number);
const selection=args.selection??'both';
const timeoutMs=Number(args['timeout-ms']??Math.max(60000,count*4000));
const seed=Number(args.seed??20260911);
if(!Number.isInteger(count)||count<=0||!Number.isInteger(seed)||!Number.isFinite(timeoutMs)||timeoutMs<1000||!intervals.length||intervals.some(x=>!Number.isFinite(x)||x<=0)||!['both','none','agent'].includes(selection)){
  throw new Error('Invalid --ticks, --intervals, --selection, --timeout-ms, or --seed');
}
const selections=selection==='both'?[false,true]:[selection==='agent'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const percentile=(sorted,q)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))]:null;
const stats=values=>{
  const sorted=values.slice().sort((a,b)=>a-b);
  return {count:sorted.length,mean:sorted.reduce((s,x)=>s+x,0)/(sorted.length||1),p50:percentile(sorted,0.5),p95:percentile(sorted,0.95),max:sorted.at(-1)??null};
};
const outDir='artifacts/browser-autoplay-speed-benchmark';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];

async function openPage(intervalMs,withInspector){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push('pageerror: '+e));
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  await page.addInitScript(()=>{
    const data={records:[],longTasks:[],target:null};
    if(globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){
      const observer=new PerformanceObserver(list=>{
        for(const entry of list.getEntries())data.longTasks.push(entry.duration);
      });
      observer.observe({entryTypes:['longtask']});
    }
    globalThis.__autoplaySpeedProbe={
      start(target){data.target=target;data.records=[];data.longTasks=[];},
      record(before,after,start,tickEnd,renderEnd){
        const row={before,after,startMs:start,tickMs:tickEnd-start,renderMs:renderEnd-tickEnd,completeMs:renderEnd-start,firstFrameMs:null,secondFrameMs:null};
        data.records.push(row);
        requestAnimationFrame(()=>{
          row.firstFrameMs=performance.now();
          requestAnimationFrame(()=>{row.secondFrameMs=performance.now();});
        });
        if(after>=data.target)queueMicrotask(()=>document.getElementById('play')?.click());
      },
      snapshot(){return {records:structuredClone(data.records),longTasks:[...data.longTasks]};}
    };
  });
  await page.route('**/src/ui/core.js',async route=>{
    const response=await route.fetch();
    let body=await response.text();
    const cadence='const AUTOPLAY_INTERVAL_MS=700;';
    const step='function stepOne(){E.tick();render();}';
    assert.equal(body.split(cadence).length,2,'Production autoplay cadence anchor must be unique');
    assert.equal(body.split(step).length,2,'Production stepOne anchor must be unique');
    body=body.replace(cadence,`const AUTOPLAY_INTERVAL_MS=${intervalMs};`);
    body=body.replace(step,`function stepOne(){const __before=E.getState().tick,__start=performance.now();E.tick();const __tickEnd=performance.now();render();const __renderEnd=performance.now();globalThis.__autoplaySpeedProbe.record(__before,E.getState().tick,__start,__tickEnd,__renderEnd);}`);
    await route.fulfill({response,body});
  });
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());
  await page.evaluate(seed=>{document.getElementById('seedInput').value=String(seed);document.getElementById('reset').click();},seed);
  if(withInspector){
    await page.locator('[data-entity="agent:zhen"]').first().click();
    await page.waitForFunction(()=>window.SimUI?.getInspectorSelection?.()?.id==='zhen');
  }
  return {page,errors};
}

try{
  const reference=await browser.newPage();
  await reference.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await reference.waitForFunction(()=>window.SimEngine?.getState?.());
  const stateReference=await reference.evaluate(({seed,count})=>{
    const E=window.SimEngine;
    E.reset(seed);
    for(let i=0;i<count;i++)E.tick();
    return {stateJson:JSON.stringify(E.getState()),rng:E.getState().rngState,tick:E.getState().tick};
  },{seed,count});
  assert.equal(stateReference.tick,count);
  await reference.close();

  for(const intervalMs of intervals){
    for(const withInspector of selections){
      const {page,errors}=await openPage(intervalMs,withInspector);
      try{
        const initial=await page.evaluate(count=>{
          const E=window.SimEngine,startTick=E.getState().tick;
          globalThis.__autoplaySpeedProbe.start(startTick+count);
          const startMs=performance.now();
          document.getElementById('play').click();
          return {startTick,targetTick:startTick+count,startMs};
        },count);
        await page.waitForFunction(target=>window.SimEngine.getState().tick===target&&document.getElementById('play').textContent.includes('開始'),initial.targetTick,{timeout:timeoutMs});
        await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>requestAnimationFrame(resolve));});
        const observed=await page.evaluate(()=>({
          endMs:performance.now(),
          probe:globalThis.__autoplaySpeedProbe.snapshot(),
          stateJson:JSON.stringify(window.SimEngine.getState()),
          rng:window.SimEngine.getState().rngState,
          tick:window.SimEngine.getState().tick
        }));
        const records=observed.probe.records;
        assert.equal(observed.tick,initial.targetTick,'Autoplay must stop on exact target');
        assert.equal(records.length,count,'Every tick must execute full stepOne/render');
        for(let i=0;i<records.length;i++){
          assert.equal(records[i].after,records[i].before+1,'No tick may skip');
          if(i){
            assert.ok(records[i].startMs>=records[i-1].secondFrameMs,'Next tick must follow two frame opportunities');
            assert.ok(records[i].startMs>=records[i-1].startMs,'Tick callbacks cannot overlap');
          }
          assert.ok(Number.isFinite(records[i].tickMs)&&Number.isFinite(records[i].renderMs),'All durations must be finite');
          assert.ok(Number.isFinite(records[i].firstFrameMs)&&Number.isFinite(records[i].secondFrameMs),'Each completed tick must expose two browser frame opportunities');
        }
        assert.equal(observed.stateJson,stateReference.stateJson,'Exact canonical state parity');
        assert.equal(observed.rng,stateReference.rng,'Exact RNG parity');
        assert.deepEqual(errors,[],'Browser errors must be absent');
        const startIntervals=records.slice(1).map((r,i)=>r.startMs-records[i].startMs);
        const elapsedMs=observed.endMs-initial.startMs;
        const meanCadenceMs=startIntervals.length?stats(startIntervals).mean:null;
        const result={intervalMs,targetSpeedX:700/intervalMs,withInspector,count,seed,
          measuredSpeedX:meanCadenceMs===null?null:700/meanCadenceMs,meanCadenceMs,elapsedMs,
          engineTickMs:stats(records.map(r=>r.tickMs)),renderSyncMs:stats(records.map(r=>r.renderMs)),
          completeStepMs:stats(records.map(r=>r.completeMs)),startToStartMs:stats(startIntervals),
          frameOpportunityLatenciesMs:stats(records.map(r=>r.secondFrameMs-r.startMs)),
          longTasks:stats(observed.probe.longTasks),stateSha256:hash(observed.stateJson),
          samples:records,notes:'requestAnimationFrame opportunities are not proof of physical display paint'};
        results.push(result);
        console.log('AUTOPLAY_SPEED_CASE '+JSON.stringify({intervalMs,withInspector,count,targetSpeedX:result.targetSpeedX,measuredSpeedX:result.measuredSpeedX,meanCadenceMs,engineTickMs:result.engineTickMs.mean,renderSyncMs:result.renderSyncMs.mean,elapsedMs}));
        // Reset must invalidate the old autoplay context; no stale continuation is permitted.
        await page.evaluate(()=>document.getElementById('reset').click());
        await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>requestAnimationFrame(resolve));});
        assert.equal(await page.evaluate(()=>window.SimEngine.getState().tick),0,'No stale tick after reset');
      }finally{await page.close();}
    }
  }
  const report={generatedAt:new Date().toISOString(),headless:true,browserVersion:browser.version(),platform:process.platform,nodeVersion:process.version,viewport:{width:1440,height:900},seed,count,intervals,selections,referenceHash:hash(stateReference.stateJson),results};
  fs.writeFileSync(`${outDir}/result.json`,JSON.stringify(report,null,2));
  console.log('Autoplay speed benchmark complete: '+`${outDir}/result.json`);
}finally{await browser.close();}