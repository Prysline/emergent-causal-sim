import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-interaction-position-batch-probe';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});

function attachErrors(page){
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  return {pageErrors,consoleErrors};
}

async function preparePage({candidate=false}={}){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=attachErrors(page);
  if(candidate){
    await page.route('**/src/spatial-traversal.js',async route=>{
      const response=await route.fetch();
      let body=await response.text();
      const anchor=`  function bestInteractionPosition(st,a,target,affordance='default'){
    const C=crowdingRuntime();let list=interactionPositions(st,target,a,affordance).map(p=>({p,d:pathCost(st,a,p),occ:nodeOccupantsAt(st,p,a.id).length})).filter(x=>Number.isFinite(x.d));
    const current=nodeForAgent(st,a),differentNodeSameXY=x=>localSame(current,x.p)&&!nodeSame(st,current,x.p);if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));
    list.sort((x,y)=>(C?0:x.occ-y.occ)||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));return list[0]?.p||null;
  }`;
      const replacement=`  function interactionTraversalCosts(st,aOrId,targets,{mode=null}={}){
    return withGeometrySnapshot(st,()=>{
      const list=Array.isArray(targets)?targets:[],out=list.map(()=>Infinity),a=agentFor(st,aOrId),requested=resolvedRequestedMode(mode);
      if(!a||!list.length)return out;
      const s=normalizeNode(st,a.position);availableModes(a,requested);if(!s||!nodeLocomotionAccessible(st,s,a))return out;
      const goals=new Map();
      for(let i=0;i<list.length;i++){
        const g=normalizeNode(st,list[i]);if(!g||!nodeLocomotionAccessible(st,g,a))continue;
        if(nodeSame(st,s,g)){out[i]=0;continue;}
        const key=nodeKey(st,g),indices=goals.get(key)||[];indices.push(i);goals.set(key,indices);
      }
      if(!goals.size)return out;
      routeStateSearch(st,s,a,{objective:'traversalCost',mode:requested,onSettle:(node,_mode,best)=>{
        const key=nodeKey(st,node),indices=goals.get(key);if(!indices)return false;
        for(const i of indices)out[i]=best.primary;goals.delete(key);return goals.size===0;
      }});
      return out;
    });
  }
  function bestInteractionPosition(st,a,target,affordance='default'){
    const C=crowdingRuntime(),positions=interactionPositions(st,target,a,affordance),costs=interactionTraversalCosts(st,a,positions,{mode:locomotionRuntime()?'auto':'walk'});
    let list=positions.map((p,i)=>({p,d:costs[i],occ:nodeOccupantsAt(st,p,a.id).length})).filter(x=>Number.isFinite(x.d));
    const current=nodeForAgent(st,a),differentNodeSameXY=x=>localSame(current,x.p)&&!nodeSame(st,current,x.p);if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));
    list.sort((x,y)=>(C?0:x.occ-y.occ)||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));return list[0]?.p||null;
  }`;
      if(!body.includes(anchor))throw new Error('bestInteractionPosition candidate probe anchor missing');
      body=body.replace(anchor,replacement);
      await route.fulfill({response,body});
    });
  }
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());
  await page.evaluate(()=>{
    const E=window.SimEngine,SP=window.SimSpatial;
    const data={phase:'outsideTick',queries:{traversalFeasibility:{calls:0,totalMs:0,insideTick:0,outsideTick:0},bestInteractionPosition:{calls:0,totalMs:0,insideTick:0,outsideTick:0}}};
    const core=E.tick;
    E.tick=function(...args){const prev=data.phase;data.phase='insideTick';try{return core.apply(this,args);}finally{data.phase=prev;}};
    for(const name of ['traversalFeasibility','bestInteractionPosition']){
      const original=SP[name];
      SP[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{
        const q=data.queries[name];q.calls++;q.totalMs+=performance.now()-start;q[data.phase]++;
      }};
    }
    window.__interactionBatchProbe=data;
  });
  return {page,errors};
}

async function runCase(candidate){
  const {page,errors}=await preparePage({candidate});
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
    queries:structuredClone(window.__interactionBatchProbe.queries)
  }));
  await page.close();
  return {...errors,timing,...result};
}

try{
  const baseline=await runCase(false);
  const candidate=await runCase(true);
  assert.equal(baseline.timing.after,baseline.timing.before+10,'baseline must advance exactly 10 ticks');
  assert.equal(candidate.timing.after,candidate.timing.before+10,'candidate must advance exactly 10 ticks');
  assert.equal(candidate.stateJson,baseline.stateJson,'batched interaction-position hypothesis must preserve exact canonical simulation state');
  assert.deepEqual(baseline.pageErrors,[],'baseline must have no page errors');
  assert.deepEqual(baseline.consoleErrors,[],'baseline must have no console errors');
  assert.deepEqual(candidate.pageErrors,[],'candidate must have no page errors');
  assert.deepEqual(candidate.consoleErrors,[],'candidate must have no console errors');
  assert.equal(candidate.queries.bestInteractionPosition.insideTick,baseline.queries.bestInteractionPosition.insideTick,'candidate must preserve bestInteractionPosition call count');
  assert.ok(candidate.queries.traversalFeasibility.insideTick<baseline.queries.traversalFeasibility.insideTick,'candidate should reduce inside-tick traversal feasibility calls');

  const report={
    generatedAt:new Date().toISOString(),
    note:'Test-served hypothesis only: batch traversalCost scoring across interaction positions inside one bestInteractionPosition call. No production source is changed by this test.',
    baseline:{timing:baseline.timing,queries:baseline.queries},
    candidate:{timing:candidate.timing,queries:candidate.queries},
    delta:{
      handlerMs:candidate.timing.handlerMs-baseline.timing.handlerMs,
      insideTraversalCalls:candidate.queries.traversalFeasibility.insideTick-baseline.queries.traversalFeasibility.insideTick,
      totalTraversalCalls:candidate.queries.traversalFeasibility.calls-baseline.queries.traversalFeasibility.calls
    },
    pageErrors:{baseline:baseline.pageErrors,candidate:candidate.pageErrors},
    consoleErrors:{baseline:baseline.consoleErrors,candidate:candidate.consoleErrors}
  };
  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  console.log('INTERACTION_POSITION_BATCH_PROBE '+JSON.stringify(report));
  console.log('Interaction position batch probe: hypothesis + exact state parity ok');
} finally {
  await browser.close();
}
