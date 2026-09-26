import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-post-pr125-candidate-probe';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});

function attachErrors(page){
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  return {pageErrors,consoleErrors};
}

async function preparePage({sleepReorder=false,memoryReuse=false}={}){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=attachErrors(page);

  if(sleepReorder){
    await page.route('**/src/engine.js',async route=>{
      const response=await route.fetch();
      let body=await response.text();
      const oldCondition="if(!SP.sleepTargets(state,a).length||a.needs.sleepNeed<p.minimumSleepNeed||propensity<p.sleepOpportunityThreshold)return null;";
      const newCondition="if(a.needs.sleepNeed<p.minimumSleepNeed||propensity<p.sleepOpportunityThreshold||!SP.sleepTargets(state,a).length)return null;";
      if(!body.includes(oldCondition))throw new Error('sleep reorder candidate anchor missing');
      body=body.replace(oldCondition,newCondition);
      await route.fulfill({response,body});
    });
  }

  if(memoryReuse){
    await page.route('**/src/systems/memory/deliberation.js',async route=>{
      const response=await route.fetch();
      let body=await response.text();
      const eligibleOld="return Object.values(st.agents||{}).filter(t=>t.id!==a.id&&!t.offMap&&predicate?.(t)&&(!awakeOnly||!E.isSleeping?.(t))).map(target=>({target,traversalCost:SP.traversalCost(st,a,target.position)})).filter(x=>Number.isFinite(x.traversalCost));";
      const eligibleNew="return Object.values(st.agents||{}).filter(t=>t.id!==a.id&&!t.offMap&&predicate?.(t)&&(!awakeOnly||!E.isSleeping?.(t))).map(target=>({target,route:SP.planRoute(st,a,target.position,{mode:'auto',objective:'traversalCost'})})).filter(x=>Number.isFinite(x.route.traversalCost));";
      const evaluationOld="function targetEvaluation(st,a,target,intentKind,baseUtility){\\n    const route=SP.planRoute(st,a,target.position,{mode:'auto',objective:'traversalCost'}),assoc=targetAssociation(st,a,target.id),relationshipTargetDelta=round(E.relationshipTargetDelta?.(a,target.id)||0),accessPenalty=Math.min(Math.max(0,route.traversalCost)*ACCESS_COST_WEIGHT,ACCESS_COST_CAP);";
      const evaluationNew="function targetEvaluation(st,a,target,intentKind,baseUtility,routeOverride=null){\\n    const route=routeOverride||SP.planRoute(st,a,target.position,{mode:'auto',objective:'traversalCost'}),assoc=targetAssociation(st,a,target.id),relationshipTargetDelta=round(E.relationshipTargetDelta?.(a,target.id)||0),accessPenalty=Math.min(Math.max(0,route.traversalCost)*ACCESS_COST_WEIGHT,ACCESS_COST_CAP);";
      const evaluationsOld="function targetEvaluations(st,a,intentKind,baseUtility){return eligibleTargets(st,a,intentKind).map(({target})=>targetEvaluation(st,a,target,intentKind,baseUtility)).sort((x,y)=>y.targetPreference-x.targetPreference||y.finalUtility-x.finalUtility||x.traversalCost-y.traversalCost||x.pathDistance-y.pathDistance||String(x.targetAgent).localeCompare(String(y.targetAgent)));}";
      const evaluationsNew="function targetEvaluations(st,a,intentKind,baseUtility){return eligibleTargets(st,a,intentKind).map(({target,route})=>targetEvaluation(st,a,target,intentKind,baseUtility,route)).sort((x,y)=>y.targetPreference-x.targetPreference||y.finalUtility-x.finalUtility||x.traversalCost-y.traversalCost||x.pathDistance-y.pathDistance||String(x.targetAgent).localeCompare(String(y.targetAgent)));}";
      for(const anchor of [eligibleOld,evaluationOld,evaluationsOld])if(!body.includes(anchor))throw new Error('memory reuse candidate anchor missing');
      body=body.replace(eligibleOld,eligibleNew).replace(evaluationOld,evaluationNew).replace(evaluationsOld,evaluationsNew);
      await route.fulfill({response,body});
    });
  }

  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());
  await page.evaluate(()=>{
    const E=window.SimEngine,SP=window.SimSpatial;
    const data={phase:'outside',queries:{}};
    const originalTick=E.tick;
    E.tick=function(...args){
      const previous=data.phase;data.phase='inside';
      try{return originalTick.apply(this,args);}
      finally{data.phase=previous;}
    };
    for(const name of ['traversalFeasibility','sleepTargets','planRoute','traversalCost','bestInteractionPosition']){
      const original=SP[name];
      if(typeof original!=='function')continue;
      data.queries[name]={calls:0,inside:0,outside:0};
      SP[name]=function(...args){
        const q=data.queries[name];q.calls++;q[data.phase]++;
        return original.apply(this,args);
      };
    }
    globalThis.__postPr125CandidateProbe=data;
  });
  return {page,errors};
}

async function runCase(name,options){
  const {page,errors}=await preparePage(options);
  const timing=await page.evaluate(async()=>{
    const before=window.SimEngine.getState().tick,start=performance.now();
    document.getElementById('step10').click();
    const handlerMs=performance.now()-start;
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    return {before,after:window.SimEngine.getState().tick,handlerMs};
  });
  const result=await page.evaluate(()=>({
    stateJson:JSON.stringify(window.SimEngine.getState()),
    queries:structuredClone(globalThis.__postPr125CandidateProbe.queries)
  }));
  await page.close();
  return {name,...errors,timing,...result};
}

function delta(candidate,baseline){
  const out={handlerMs:candidate.timing.handlerMs-baseline.timing.handlerMs,queries:{}};
  for(const name of Object.keys(baseline.queries)){
    out.queries[name]={
      inside:candidate.queries[name].inside-baseline.queries[name].inside,
      outside:candidate.queries[name].outside-baseline.queries[name].outside,
      total:candidate.queries[name].calls-baseline.queries[name].calls
    };
  }
  return out;
}

try{
  const baseline=await runCase('baseline',{});
  const sleep=await runCase('sleep-eligibility-reorder',{sleepReorder:true});
  const memory=await runCase('memory-route-reuse',{memoryReuse:true});
  const combined=await runCase('sleep-plus-memory',{sleepReorder:true,memoryReuse:true});

  for(const result of [baseline,sleep,memory,combined]){
    assert.equal(result.timing.after,result.timing.before+10,result.name+' must advance exactly 10 ticks');
    assert.deepEqual(result.pageErrors,[],result.name+' must have no page errors');
    assert.deepEqual(result.consoleErrors,[],result.name+' must have no console errors');
  }
  for(const result of [sleep,memory,combined])assert.equal(result.stateJson,baseline.stateJson,result.name+' must preserve exact canonical simulation state');

  const report={
    generatedAt:new Date().toISOString(),
    note:'Test-served isolated candidates only. No production source is committed. Query-count + exact state parity are primary evidence.',
    baseline:{timing:baseline.timing,queries:baseline.queries},
    sleep:{timing:sleep.timing,queries:sleep.queries,delta:delta(sleep,baseline)},
    memory:{timing:memory.timing,queries:memory.queries,delta:delta(memory,baseline)},
    combined:{timing:combined.timing,queries:combined.queries,delta:delta(combined,baseline)}
  };
  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  console.log('POST_PR125_CANDIDATE_PROBE '+JSON.stringify(report));
  console.log('Post-PR125 candidate probe: isolated what-if + exact state parity ok');
} finally {
  await browser.close();
}
