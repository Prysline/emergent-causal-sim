import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-post-pr129-decision-gate';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});

function attachErrors(page){
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  return {pageErrors,consoleErrors};
}

async function preparePage({winnerCostReuse=false,yieldedStep=false}={}){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=attachErrors(page);

  if(winnerCostReuse){
    await page.route('**/src/spatial-traversal.js',async route=>{
      const response=await route.fetch();
      let body=await response.text();
      const oldBlock="  function bestInteractionPosition(st,a,target,affordance='default'){\n    const C=crowdingRuntime(),positions=interactionPositions(st,target,a,affordance),costs=interactionTraversalCosts(st,a,positions,{mode:locomotionRuntime()?'auto':'walk'});\n    let list=positions.map((p,i)=>({p,d:costs[i],occ:nodeOccupantsAt(st,p,a.id).length})).filter(x=>Number.isFinite(x.d));\n    const current=nodeForAgent(st,a),differentNodeSameXY=x=>localSame(current,x.p)&&!nodeSame(st,current,x.p);if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));\n    list.sort((x,y)=>(C?0:x.occ-y.occ)||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));return list[0]?.p||null;\n  }";
      const newBlock="  function bestInteractionPositionResult(st,a,target,affordance='default'){\n    const C=crowdingRuntime(),positions=interactionPositions(st,target,a,affordance),costs=interactionTraversalCosts(st,a,positions,{mode:locomotionRuntime()?'auto':'walk'});\n    let list=positions.map((p,i)=>({p,d:costs[i],occ:nodeOccupantsAt(st,p,a.id).length})).filter(x=>Number.isFinite(x.d));\n    const current=nodeForAgent(st,a),differentNodeSameXY=x=>localSame(current,x.p)&&!nodeSame(st,current,x.p);if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));\n    list.sort((x,y)=>(C?0:x.occ-y.occ)||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));\n    const winner=list[0];return winner?{position:winner.p,traversalCost:winner.d}:null;\n  }\n  function bestInteractionPosition(st,a,target,affordance='default'){return bestInteractionPositionResult(st,a,target,affordance)?.position||null;\n  }";
      const exportOld="  SP.bestInteractionPosition=bestInteractionPosition;";
      const exportNew="  SP.bestInteractionPosition=bestInteractionPosition;\n  SP.bestInteractionPositionResult=bestInteractionPositionResult;";
      if(!body.includes(oldBlock)||!body.includes(exportOld))throw new Error('winner-result spatial candidate anchor missing');
      body=body.replace(oldBlock,newBlock).replace(exportOld,exportNew);
      await route.fulfill({response,body});
    });

    await page.route('**/src/engine.js',async route=>{
      const response=await route.fetch();
      let body=await response.text();
      const oldLine="  function targetTraversalCost(a,target,affordance='default'){const p=SP.bestInteractionPosition(state,a,target,affordance);return p?routeBurden(a,p):Infinity;}";
      const newLine="  function targetTraversalCost(a,target,affordance='default'){if(typeof SP.bestInteractionPositionResult==='function'){const result=SP.bestInteractionPositionResult(state,a,target,affordance);return result?.traversalCost??Infinity;}const p=SP.bestInteractionPosition(state,a,target,affordance);return p?routeBurden(a,p):Infinity;}";
      if(!body.includes(oldLine))throw new Error('winner-result engine candidate anchor missing');
      body=body.replace(oldLine,newLine);
      await route.fulfill({response,body});
    });
  }

  if(yieldedStep){
    await page.route('**/src/ui/core.js',async route=>{
      const response=await route.fetch();
      let body=await response.text();
      const oldStep="  function step(n=1){for(let i=0;i<n;i++)E.tick();render();}";
      const newStep="  async function step(n=1){for(let i=0;i<n;i++){E.tick();if(i<n-1)await new Promise(resolve=>setTimeout(resolve,0));}render();}";
      if(!body.includes(oldStep))throw new Error('yielded-step candidate anchor missing');
      body=body.replace(oldStep,newStep);
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
    globalThis.__postPr129DecisionGate=data;
  });
  return {page,errors};
}

async function runCase(name,options,stepCount=10){
  const {page,errors}=await preparePage(options);
  const timing=await page.evaluate(async stepCount=>{
    const before=window.SimEngine.getState().tick,target=before+stepCount,start=performance.now();
    let timerOpportunityMs=null,firstFrameMs=null;
    const timerOpportunity=new Promise(resolve=>setTimeout(()=>{timerOpportunityMs=performance.now()-start;resolve();},0));
    const firstFrame=new Promise(resolve=>requestAnimationFrame(()=>{firstFrameMs=performance.now()-start;resolve();}));
    document.getElementById(stepCount===1?'step':'step10').click();
    const handlerMs=performance.now()-start;
    while(window.SimEngine.getState().tick<target)await new Promise(resolve=>setTimeout(resolve,0));
    const completionMs=performance.now()-start;
    await timerOpportunity;
    await firstFrame;
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    return {before,after:window.SimEngine.getState().tick,handlerMs,timerOpportunityMs,firstFrameMs,completionMs,stepCount};
  },stepCount);
  const result=await page.evaluate(()=>({
    stateJson:JSON.stringify(window.SimEngine.getState()),
    queries:structuredClone(globalThis.__postPr129DecisionGate.queries)
  }));
  await page.close();
  return {name,stepCount,...errors,timing,...result};
}

function delta(candidate,baseline){
  const names=new Set([...Object.keys(baseline.queries),...Object.keys(candidate.queries)]);
  const queries={};
  for(const name of names){
    const a=baseline.queries[name]||{calls:0,inside:0,outside:0};
    const b=candidate.queries[name]||{calls:0,inside:0,outside:0};
    queries[name]={inside:b.inside-a.inside,outside:b.outside-a.outside,total:b.calls-a.calls};
  }
  return {
    handlerMs:candidate.timing.handlerMs-baseline.timing.handlerMs,
    timerOpportunityMs:candidate.timing.timerOpportunityMs-baseline.timing.timerOpportunityMs,
    firstFrameMs:candidate.timing.firstFrameMs-baseline.timing.firstFrameMs,
    completionMs:candidate.timing.completionMs-baseline.timing.completionMs,
    queries
  };
}

try{
  const singleBaseline=await runCase('single-baseline',{},1);
  const singleWinner=await runCase('single-winner-result',{winnerCostReuse:true},1);

  const baseline=await runCase('baseline',{});
  const winner=await runCase('winner-result',{winnerCostReuse:true});
  const yielded=await runCase('yield-every-tick',{yieldedStep:true});
  const winnerYielded=await runCase('winner-result-plus-yield',{winnerCostReuse:true,yieldedStep:true});

  for(const result of [singleBaseline,singleWinner,baseline,winner,yielded,winnerYielded]){
    assert.equal(result.timing.after,result.timing.before+result.stepCount,result.name+' must advance exactly the requested tick count');
    assert.deepEqual(result.pageErrors,[],result.name+' must have no page errors');
    assert.deepEqual(result.consoleErrors,[],result.name+' must have no console errors');
  }
  assert.equal(singleWinner.stateJson,singleBaseline.stateJson,'winner-result must preserve exact canonical single-tick state');
  for(const result of [winner,yielded,winnerYielded])assert.equal(result.stateJson,baseline.stateJson,result.name+' must preserve exact canonical 10-tick state');

  assert.equal(singleBaseline.queries.traversalFeasibility.inside,6313,'post-PR129 single-tick baseline must remain 6,313 inside-tick feasibility calls');
  assert.equal(baseline.queries.traversalFeasibility.inside,18559,'post-PR129 step(10) baseline must remain 18,559 inside-tick feasibility calls');
  assert.equal(baseline.queries.traversalFeasibility.outside,2682,'post-PR129 step(10) outside-tick baseline must remain 2,682 calls');
  assert.equal(yielded.queries.traversalFeasibility.inside,baseline.queries.traversalFeasibility.inside,'yielding must not change baseline inside-tick feasibility work');
  assert.equal(yielded.queries.traversalFeasibility.outside,baseline.queries.traversalFeasibility.outside,'yielding must not change baseline outside-tick feasibility work');
  assert.equal(winnerYielded.queries.traversalFeasibility.inside,winner.queries.traversalFeasibility.inside,'yielding must not change winner-result inside-tick feasibility work');
  assert.equal(winnerYielded.queries.traversalFeasibility.outside,winner.queries.traversalFeasibility.outside,'yielding must not change winner-result outside-tick feasibility work');

  const report={
    generatedAt:new Date().toISOString(),
    note:'Test-only post-PR129 decision gate. Query counts + exact state parity are primary evidence; CI timing is secondary and runner-dependent.',
    single:{
      baseline:{timing:singleBaseline.timing,queries:singleBaseline.queries},
      winner:{timing:singleWinner.timing,queries:singleWinner.queries,delta:delta(singleWinner,singleBaseline)}
    },
    baseline:{timing:baseline.timing,queries:baseline.queries},
    winner:{timing:winner.timing,queries:winner.queries,delta:delta(winner,baseline)},
    yielded:{timing:yielded.timing,queries:yielded.queries,delta:delta(yielded,baseline)},
    winnerYielded:{timing:winnerYielded.timing,queries:winnerYielded.queries,deltaFromBaseline:delta(winnerYielded,baseline),deltaFromWinner:delta(winnerYielded,winner)}
  };
  fs.writeFileSync(outDir+'/result.json',JSON.stringify(report,null,2));
  console.log('POST_PR129_DECISION_GATE '+JSON.stringify(report));
  console.log('Post-PR129 decision gate: exact state parity ok');
} finally {
  await browser.close();
}
