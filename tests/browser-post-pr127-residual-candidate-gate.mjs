import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-post-pr127-residual-candidate-gate';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});

function attachErrors(page){
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  return {pageErrors,consoleErrors};
}

async function preparePage({memoryReuse=false,winnerCostReuse=false}={}){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=attachErrors(page);

  if(memoryReuse){
    await page.route('**/src/systems/memory/deliberation.js',async route=>{
      const response=await route.fetch();
      let body=await response.text();

      const eligibleOld="return Object.values(st.agents||{}).filter(t=>t.id!==a.id&&!t.offMap&&predicate?.(t)&&(!awakeOnly||!E.isSleeping?.(t))).map(target=>({target,traversalCost:SP.traversalCost(st,a,target.position)})).filter(x=>Number.isFinite(x.traversalCost));";
      const eligibleNew="return Object.values(st.agents||{}).filter(t=>t.id!==a.id&&!t.offMap&&predicate?.(t)&&(!awakeOnly||!E.isSleeping?.(t))).map(target=>({target,route:SP.planRoute(st,a,target.position,{mode:'auto',objective:'traversalCost'})})).filter(x=>Number.isFinite(x.route.traversalCost));";
      const signatureOld="function targetEvaluation(st,a,target,intentKind,baseUtility){";
      const signatureNew="function targetEvaluation(st,a,target,intentKind,baseUtility,routeOverride=null){";
      const routeOld="const route=SP.planRoute(st,a,target.position,{mode:'auto',objective:'traversalCost'}),assoc=targetAssociation(st,a,target.id)";
      const routeNew="const route=routeOverride||SP.planRoute(st,a,target.position,{mode:'auto',objective:'traversalCost'}),assoc=targetAssociation(st,a,target.id)";
      const evalsOld="function targetEvaluations(st,a,intentKind,baseUtility){return eligibleTargets(st,a,intentKind).map(({target})=>targetEvaluation(st,a,target,intentKind,baseUtility)).sort((x,y)=>y.targetPreference-x.targetPreference||y.finalUtility-x.finalUtility||x.traversalCost-y.traversalCost||x.pathDistance-y.pathDistance||String(x.targetAgent).localeCompare(String(y.targetAgent)));}";
      const evalsNew="function targetEvaluations(st,a,intentKind,baseUtility){return eligibleTargets(st,a,intentKind).map(({target,route})=>targetEvaluation(st,a,target,intentKind,baseUtility,route)).sort((x,y)=>y.targetPreference-x.targetPreference||y.finalUtility-x.finalUtility||x.traversalCost-y.traversalCost||x.pathDistance-y.pathDistance||String(x.targetAgent).localeCompare(String(y.targetAgent)));}";

      for(const anchor of [eligibleOld,signatureOld,routeOld,evalsOld]){
        if(!body.includes(anchor))throw new Error('memory reuse candidate anchor missing: '+anchor.slice(0,90));
      }
      body=body.replace(eligibleOld,eligibleNew)
        .replace(signatureOld,signatureNew)
        .replace(routeOld,routeNew)
        .replace(evalsOld,evalsNew);
      await route.fulfill({response,body});
    });
  }

  if(winnerCostReuse){
    await page.route('**/src/spatial-traversal.js',async route=>{
      const response=await route.fetch();
      let body=await response.text();
      const oldBlock="  function bestInteractionPosition(st,a,target,affordance='default'){\n    const C=crowdingRuntime(),positions=interactionPositions(st,target,a,affordance),costs=interactionTraversalCosts(st,a,positions,{mode:locomotionRuntime()?'auto':'walk'});\n    let list=positions.map((p,i)=>({p,d:costs[i],occ:nodeOccupantsAt(st,p,a.id).length})).filter(x=>Number.isFinite(x.d));\n    const current=nodeForAgent(st,a),differentNodeSameXY=x=>localSame(current,x.p)&&!nodeSame(st,current,x.p);if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));\n    list.sort((x,y)=>(C?0:x.occ-y.occ)||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));return list[0]?.p||null;\n  }";
      const newBlock="  function bestInteractionPositionResult(st,a,target,affordance='default'){\n    const C=crowdingRuntime(),positions=interactionPositions(st,target,a,affordance),costs=interactionTraversalCosts(st,a,positions,{mode:locomotionRuntime()?'auto':'walk'});\n    let list=positions.map((p,i)=>({p,d:costs[i],occ:nodeOccupantsAt(st,p,a.id).length})).filter(x=>Number.isFinite(x.d));\n    const current=nodeForAgent(st,a),differentNodeSameXY=x=>localSame(current,x.p)&&!nodeSame(st,current,x.p);if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));\n    list.sort((x,y)=>(C?0:x.occ-y.occ)||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));\n    const winner=list[0];return winner?{position:winner.p,traversalCost:winner.d}:null;\n  }\n  function bestInteractionPosition(st,a,target,affordance='default'){return bestInteractionPositionResult(st,a,target,affordance)?.position||null;\n  }";
      const exportOld="  SP.bestInteractionPosition=bestInteractionPosition;";
      const exportNew="  SP.bestInteractionPosition=bestInteractionPosition;\n  SP.bestInteractionPositionResult=bestInteractionPositionResult;";
      if(!body.includes(oldBlock)||!body.includes(exportOld))throw new Error('winner-cost spatial candidate anchor missing');
      body=body.replace(oldBlock,newBlock).replace(exportOld,exportNew);
      await route.fulfill({response,body});
    });

    await page.route('**/src/engine.js',async route=>{
      const response=await route.fetch();
      let body=await response.text();
      const oldLine="  function targetTraversalCost(a,target,affordance='default'){const p=SP.bestInteractionPosition(state,a,target,affordance);return p?routeBurden(a,p):Infinity;}";
      const newLine="  function targetTraversalCost(a,target,affordance='default'){const result=SP.bestInteractionPositionResult?.(state,a,target,affordance);if(result)return result.traversalCost;const p=SP.bestInteractionPosition(state,a,target,affordance);return p?routeBurden(a,p):Infinity;}";
      if(!body.includes(oldLine))throw new Error('winner-cost engine candidate anchor missing');
      body=body.replace(oldLine,newLine);
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
    for(const name of ['traversalFeasibility','sleepTargets','planRoute','traversalCost','bestInteractionPosition','bestInteractionPositionResult']){
      const original=SP[name];
      if(typeof original!=='function')continue;
      data.queries[name]={calls:0,inside:0,outside:0};
      SP[name]=function(...args){
        const q=data.queries[name];q.calls++;q[data.phase]++;
        return original.apply(this,args);
      };
    }
    globalThis.__postPr127CandidateGate=data;
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
    queries:structuredClone(globalThis.__postPr127CandidateGate.queries)
  }));
  await page.close();
  return {name,...errors,timing,...result};
}

function delta(candidate,baseline){
  const names=new Set([...Object.keys(baseline.queries),...Object.keys(candidate.queries)]);
  const queries={};
  for(const name of names){
    const a=baseline.queries[name]||{calls:0,inside:0,outside:0};
    const b=candidate.queries[name]||{calls:0,inside:0,outside:0};
    queries[name]={inside:b.inside-a.inside,outside:b.outside-a.outside,total:b.calls-a.calls};
  }
  return {handlerMs:candidate.timing.handlerMs-baseline.timing.handlerMs,queries};
}

try{
  const baseline=await runCase('baseline',{});
  const memory=await runCase('memory-route-reuse',{memoryReuse:true});
  const winner=await runCase('interaction-winner-cost-reuse',{winnerCostReuse:true});
  const combined=await runCase('memory-plus-winner',{memoryReuse:true,winnerCostReuse:true});

  for(const result of [baseline,memory,winner,combined]){
    assert.equal(result.timing.after,result.timing.before+10,result.name+' must advance exactly 10 ticks');
    assert.deepEqual(result.pageErrors,[],result.name+' must have no page errors');
    assert.deepEqual(result.consoleErrors,[],result.name+' must have no console errors');
  }
  for(const result of [memory,winner,combined]){
    assert.equal(result.stateJson,baseline.stateJson,result.name+' must preserve exact canonical simulation state');
  }

  assert.equal(baseline.queries.traversalFeasibility.inside,20181,'post-PR127 baseline must remain 20,181 inside-tick feasibility calls');

  const report={
    generatedAt:new Date().toISOString(),
    note:'Test-served post-PR127 candidate gate. No production source is committed; deterministic query delta + exact state parity are primary evidence.',
    baseline:{timing:baseline.timing,queries:baseline.queries},
    memory:{timing:memory.timing,queries:memory.queries,delta:delta(memory,baseline)},
    winner:{timing:winner.timing,queries:winner.queries,delta:delta(winner,baseline)},
    combined:{timing:combined.timing,queries:combined.queries,delta:delta(combined,baseline)}
  };
  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  console.log('POST_PR127_RESIDUAL_CANDIDATE_GATE '+JSON.stringify(report));
  console.log('Post-PR127 residual candidate gate: exact state parity ok');
} finally {
  await browser.close();
}
