import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-soft-reconsideration-performance-probe';
fs.mkdirSync(outDir,{recursive:true});

const browser=await chromium.launch({headless:true});

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

function attachErrors(page){
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  return {pageErrors,consoleErrors};
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
    const rows={};
    const stack=[];
    const hook={calls:0,totalMs:0,maxMs:0,byTick:{}};

    function row(reason,ok){
      return rows[reason]||(rows[reason]={
        reason,
        ok,
        calls:0,
        postEligibilityMs:0,
        postEligibilityMaxMs:0,
        candidateCalls:0,
        candidateMs:0,
        candidateMaxMs:0,
        queries:{},
        byTick:{}
      });
    }

    function current(){return stack[stack.length-1]||null;}

    window.__softReconsiderationProbe={
      begin(meta){
        const r=row(meta.reason,meta.ok);
        r.calls++;
        const t=r.byTick[meta.tick]||(r.byTick[meta.tick]={calls:0,postEligibilityMs:0,candidateCalls:0,candidateMs:0,queries:{}});
        t.calls++;
        stack.push({...meta,start:performance.now()});
      },
      end(){
        const ctx=stack.pop();
        if(!ctx)throw new Error('soft reconsideration probe stack underflow');
        const duration=performance.now()-ctx.start;
        const r=row(ctx.reason,ctx.ok);
        r.postEligibilityMs+=duration;
        r.postEligibilityMaxMs=Math.max(r.postEligibilityMaxMs,duration);
        const t=r.byTick[ctx.tick];
        t.postEligibilityMs+=duration;
      },
      recordCandidate(duration){
        const ctx=current();if(!ctx)return;
        const r=row(ctx.reason,ctx.ok);
        r.candidateCalls++;
        r.candidateMs+=duration;
        r.candidateMaxMs=Math.max(r.candidateMaxMs,duration);
        const t=r.byTick[ctx.tick];
        t.candidateCalls++;
        t.candidateMs+=duration;
      },
      recordQuery(name,duration){
        const ctx=current();if(!ctx)return;
        const r=row(ctx.reason,ctx.ok);
        const q=r.queries[name]||(r.queries[name]={calls:0,totalMs:0,maxMs:0});
        q.calls++;
        q.totalMs+=duration;
        q.maxMs=Math.max(q.maxMs,duration);
        const t=r.byTick[ctx.tick];
        const tq=t.queries[name]||(t.queries[name]={calls:0,totalMs:0,maxMs:0});
        tq.calls++;
        tq.totalMs+=duration;
        tq.maxMs=Math.max(tq.maxMs,duration);
      },
      recordHook(tick,duration){
        hook.calls++;
        hook.totalMs+=duration;
        hook.maxMs=Math.max(hook.maxMs,duration);
        const t=hook.byTick[tick]||(hook.byTick[tick]={calls:0,totalMs:0,maxMs:0});
        t.calls++;
        t.totalMs+=duration;
        t.maxMs=Math.max(t.maxMs,duration);
      },
      reset(){
        for(const key of Object.keys(rows))delete rows[key];
        stack.length=0;
        hook.calls=0;hook.totalMs=0;hook.maxMs=0;hook.byTick={};
      },
      snapshot(){return structuredClone({rows,hook});}
    };
  });

  await page.route('**/src/systems/intent/deliberation.js',async route=>{
    const response=await route.fetch();
    let body=await response.text();

    const snapshotAnchor=`  function reconsiderationSnapshot(st,a){
    const intent=a.activeIntent,eligibility=softEligible(st,a),commitment=derivedCommitmentCost(st,a),baseCurrentUtility=intent?utilityForIntent(st,a,intent.kind,{intent}):0;
    const adjustCurrent=window.SimMemoryDeliberation?.adjustCurrentIntentUtility;
    const currentUtility=adjustCurrent&&intent?adjustCurrent(st,a,intent,baseCurrentUtility):baseCurrentUtility;
    const candidates=candidateIntents(st,a).filter(c=>!sameCurrentCandidate(st,a,intent,c)),best=candidates[0]||null,threshold=currentUtility+SOFT_SWITCH_MARGIN+(Number.isFinite(commitment)?commitment:0);
    return {...eligibility,currentUtility,commitmentCost:commitment,switchMargin:SOFT_SWITCH_MARGIN,switchThreshold:threshold,bestChallenger:best};
  }`;

    const snapshotReplacement=`  function reconsiderationSnapshot(st,a){
    const intent=a.activeIntent,eligibility=softEligible(st,a),__probe=globalThis.__softReconsiderationProbe;
    __probe?.begin({agentId:a.id,tick:st.tick,ok:eligibility.ok,reason:eligibility.reason});
    try{
      const commitment=derivedCommitmentCost(st,a),baseCurrentUtility=intent?utilityForIntent(st,a,intent.kind,{intent}):0;
      const adjustCurrent=window.SimMemoryDeliberation?.adjustCurrentIntentUtility;
      const currentUtility=adjustCurrent&&intent?adjustCurrent(st,a,intent,baseCurrentUtility):baseCurrentUtility;
      const __candidateStart=performance.now();
      const candidates=candidateIntents(st,a).filter(c=>!sameCurrentCandidate(st,a,intent,c));
      __probe?.recordCandidate(performance.now()-__candidateStart);
      const best=candidates[0]||null,threshold=currentUtility+SOFT_SWITCH_MARGIN+(Number.isFinite(commitment)?commitment:0);
      return {...eligibility,currentUtility,commitmentCost:commitment,switchMargin:SOFT_SWITCH_MARGIN,switchThreshold:threshold,bestChallenger:best};
    }finally{__probe?.end();}
  }`;

    const applyAnchor=`  function applySoftReconsiderations(st){for(const a of Object.values(st.agents||{}))applySoftReconsideration(st,a);}`;
    const applyReplacement=`  function applySoftReconsiderations(st){const __start=performance.now();try{for(const a of Object.values(st.agents||{}))applySoftReconsideration(st,a);}finally{globalThis.__softReconsiderationProbe?.recordHook(st.tick,performance.now()-__start);}}`;

    if(!body.includes(snapshotAnchor))throw new Error('soft reconsideration snapshot instrumentation anchor missing');
    if(!body.includes(applyAnchor))throw new Error('soft reconsideration hook instrumentation anchor missing');
    body=body.replace(snapshotAnchor,snapshotReplacement).replace(applyAnchor,applyReplacement);
    await route.fulfill({response,body});
  });

  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());

  await page.evaluate(()=>{
    const SP=window.SimSpatial,probe=window.__softReconsiderationProbe;
    if(!SP||!probe)throw new Error('soft reconsideration performance probe requires SimSpatial + probe');
    for(const [name,label] of [
      ['pathDistance','SP.pathDistance'],
      ['pathDistances','SP.pathDistances'],
      ['planRoute','SP.planRoute'],
      ['traversalFeasibility','SP.traversalFeasibility'],
      ['sleepTargets','SP.sleepTargets']
    ]){
      const original=SP[name];
      if(typeof original!=='function')continue;
      SP[name]=function(...args){
        const start=performance.now();
        try{return original.apply(this,args);}
        finally{probe.recordQuery(label,performance.now()-start);}
      };
    }
    probe.reset();
  });

  const timing=await clickStep10(page);
  await settleFrames(page,1);
  const result=await page.evaluate(()=>({
    stateJson:JSON.stringify(window.SimEngine.getState()),
    probe:window.__softReconsiderationProbe.snapshot()
  }));
  await page.close();
  return {...errors,timing,...result};
}

function sumQueryCalls(row){
  return Object.values(row.queries||{}).reduce((sum,q)=>sum+(q.calls||0),0);
}

try{
  const baseline=await runBaseline();
  const measured=await runInstrumented();

  assert.equal(baseline.timing.after,baseline.timing.before+10,'baseline step10 must advance exactly 10 ticks');
  assert.equal(measured.timing.after,measured.timing.before+10,'instrumented step10 must advance exactly 10 ticks');
  assert.equal(measured.stateJson,baseline.stateJson,'focused instrumentation must preserve exact canonical simulation state');
  assert.deepEqual(baseline.pageErrors,[],'baseline probe must have no page errors');
  assert.deepEqual(baseline.consoleErrors,[],'baseline probe must have no console errors');
  assert.deepEqual(measured.pageErrors,[],'instrumented probe must have no page errors');
  assert.deepEqual(measured.consoleErrors,[],'instrumented probe must have no console errors');

  const rows=Object.values(measured.probe.rows);
  const totalSnapshots=rows.reduce((sum,r)=>sum+r.calls,0);
  const ineligibleRows=rows.filter(r=>!r.ok);
  const eligibleRows=rows.filter(r=>r.ok);
  const ineligibleSnapshots=ineligibleRows.reduce((sum,r)=>sum+r.calls,0);
  const eligibleSnapshots=eligibleRows.reduce((sum,r)=>sum+r.calls,0);
  const totalCandidateCalls=rows.reduce((sum,r)=>sum+r.candidateCalls,0);
  const avoidableCandidateCalls=ineligibleRows.reduce((sum,r)=>sum+r.candidateCalls,0);
  const totalPostEligibilityMs=rows.reduce((sum,r)=>sum+r.postEligibilityMs,0);
  const ineligiblePostEligibilityMs=ineligibleRows.reduce((sum,r)=>sum+r.postEligibilityMs,0);
  const totalQueryCalls=rows.reduce((sum,r)=>sum+sumQueryCalls(r),0);
  const avoidableQueryCalls=ineligibleRows.reduce((sum,r)=>sum+sumQueryCalls(r),0);

  assert.ok(totalSnapshots>0,'probe must observe reconsideration snapshots');
  assert.equal(totalCandidateCalls,totalSnapshots,'current production path should construct candidates for every reconsideration snapshot');

  const summary={
    baselineHandlerMs:baseline.timing.handlerMs,
    instrumentedHandlerMs:measured.timing.handlerMs,
    softHook:measured.probe.hook,
    totalSnapshots,
    eligibleSnapshots,
    ineligibleSnapshots,
    ineligibleSnapshotShare:totalSnapshots?ineligibleSnapshots/totalSnapshots:0,
    totalCandidateCalls,
    avoidableCandidateCalls,
    avoidableCandidateShare:totalCandidateCalls?avoidableCandidateCalls/totalCandidateCalls:0,
    totalPostEligibilityMs,
    ineligiblePostEligibilityMs,
    ineligiblePostEligibilityShare:totalPostEligibilityMs?ineligiblePostEligibilityMs/totalPostEligibilityMs:0,
    totalQueryCalls,
    avoidableQueryCalls,
    avoidableQueryShare:totalQueryCalls?avoidableQueryCalls/totalQueryCalls:0
  };

  const report={
    generatedAt:new Date().toISOString(),
    note:'Perf-2A diagnostic only. Avoidable means work observed after softEligible returned ok=false on the current production apply path; no production short-circuit is applied by this test.',
    summary,
    reasons:measured.probe.rows,
    baseline:{timing:baseline.timing},
    measured:{timing:measured.timing},
    pageErrors:{baseline:baseline.pageErrors,measured:measured.pageErrors},
    consoleErrors:{baseline:baseline.consoleErrors,measured:measured.consoleErrors}
  };

  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  console.log('SOFT_RECONSIDERATION_PERF_PROBE '+JSON.stringify(report));
  console.log('Soft reconsideration performance probe: diagnostic + state parity ok');
} finally {
  await browser.close();
}
