// Opt-in real production single-step/full-render diagnostic. No runtime changes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const seed=20260911,ticks=10,rounds=3;
const out='artifacts/browser-engine-cost-attribution';
const hash=s=>createHash('sha256').update(s).digest('hex');
function once(body,anchor,replacement){
  assert.equal(body.split(anchor).length,2,'Unique source anchor required: '+anchor);
  return body.replace(anchor,replacement);
}
function scope(body,name,kind,metadata){
  const anchor='function '+name+'(';
  return once(body,anchor,'function '+name+'(...args){return globalThis.__callerProbe.scope('+JSON.stringify(kind)+','+metadata+',()=>__c1_'+name+'.apply(this,args));}\n  function __c1_'+name+'(');
}
function patch(path,body,mode){
  if(path==='ui/core.js')return once(body,'function stepOne(){E.tick();render();}',
    'function stepOne(){const p=globalThis.__callerProbe,b=E.getState().tick,t=performance.now();p.begin(b+1);try{E.tick();const e=performance.now();p.endEngine();render();p.finish(b,E.getState().tick,e-t,performance.now()-e);}finally{p.stop();}}');
  if(mode==='minimal')return body;
  if(path==='engine.js'){
    for(const name of ['choose','startAction','stepAction'])
      body=scope(body,name,name,'globalThis.__callerProbe.actor(args[0],args[1])');
    return once(body,'const value=entry.provider(state,a);','const value=globalThis.__callerProbe.scope("provider",{id:entry.id},()=>entry.provider(state,a));');
  }
  if(path==='runtime-hook-pipeline.js'){
    body=once(body,'for(const entry of hooks.get(phase)||[])entry.handler(ctx);',
      'for(const entry of hooks.get(phase)||[])globalThis.__callerProbe.scope("hook",{id:entry.id,phase},()=>entry.handler(ctx));');
    body=once(body,'for(const entry of observers.get(phase)||[])entry.handler(ctx);',
      'for(const entry of observers.get(phase)||[])globalThis.__callerProbe.scope("observer",{id:entry.id,phase},()=>entry.handler(ctx));');
    return once(body,'ctx.result=coreTick(...args);','ctx.result=globalThis.__callerProbe.scope("core",{},()=>coreTick(...args));');
  }
  if(path==='spatial-traversal.js'){
    const specs=[
      ['bestInteractionPositionResult','interaction','{actor:globalThis.__callerProbe.actor(args[1]),target:args[2],affordance:args[3]??"default"}'],
      ['bestSlotApproachNode','slot','{actor:globalThis.__callerProbe.actor(args[2]),slot:typeof args[1]==="string"?args[1]:args[1]?.id,options:args[3]}'],
      ['planRoute','planRoute','{actor:globalThis.__callerProbe.actor(args[1]),goal:args[2],options:args[3]}'],
      ['interactionTraversalCosts','interactionCosts','{actor:globalThis.__callerProbe.actor(args[1]),goals:args[2],options:args[3]}'],
      ['slotApproachTraversalCosts','slotCosts','{actor:globalThis.__callerProbe.actor(args[1]),goals:args[2],options:args[3]}'],
      ['objectiveCostsFromOrigins','objectiveCosts','{actor:globalThis.__callerProbe.actor(args[1]),origins:args[2],goals:args[3],options:args[4]}'],
      ['routeStateSearchWithin','search','globalThis.__callerProbe.searchMeta(args)']
    ];
    for(const [name,kind,meta] of specs)body=scope(body,name,kind,meta);
    body=once(body,'if(!feasibilityByEdge.has(key))feasibilityByEdge.set(key,SP.traversalFeasibility?.(st,a,from,to)||null);',
      'if(!feasibilityByEdge.has(key)){globalThis.__callerProbe.edge(key);feasibilityByEdge.set(key,SP.traversalFeasibility?.(st,a,from,to)||null);}');
    return once(body,'if(onSettle?.(cur.node,cur.mode,best,ck,came)===true)',
      'globalThis.__callerProbe.settle();if(onSettle?.(cur.node,cur.mode,best,ck,came)===true)');
  }
  throw new Error('Unexpected source '+path);
}

function install(mode){
  const rows=[],stack=[],scopes=[],calls={};
  let tick=null,measuring=false,seq=0;
  const timed=mode==='detailed';
  const actor=(a,choice)=>typeof a==='string'?{id:a}:a?{
    id:a.id,position:a.position,posture:a.posture,held:a.held,
    locomotion:a.locomotion?.mode??null,action:a.action?.kind??null,
    phase:a.action?.phase??null,intent:a.intent?.id??a.intent?.kind??null,choice:choice?.id??null
  }:null;
  const clean=x=>JSON.parse(JSON.stringify(x??null));
  const lastSearch=()=>stack.findLast(x=>x.kind==='search');
  const probe={
    actor,
    searchMeta(args){
      const o=args[3]??{};
      return {actor:actor(args[2]),origins:args[1],objective:o.objective??'traversalCost',
        mode:o.mode??null,movementCredit:o.movementCredit??0,weights:o.weights??null};
    },
    begin(n){tick=n;measuring=true;},
    endEngine(){measuring=false;},
    stop(){measuring=false;tick=null;},
    finish(before,after,engineMs,renderMs){rows.push({before,after,engineMs,renderMs});},
    scope(kind,meta,fn){
      if(!measuring)return fn();
      const entry={id:++seq,tick,kind,meta:clean(meta),parent:stack.at(-1)?.id??null,
        depth:stack.length,feasibility:0,passage:0,edges:0,settled:0};
      if(kind==='search'&&timed)entry.edgeKeys=[];
      const start=timed?performance.now():0;
      stack.push(entry);
      try{
        const value=fn();
        if(kind==='choose')entry.selected=value?.id??null;
        if(kind==='provider')entry.options=(Array.isArray(value)?value:[value]).filter(Boolean).map(x=>x.id);
        return value;
      }finally{
        if(timed)entry.inclusiveMs=performance.now()-start;
        stack.pop();scopes.push(entry);
      }
    },
    edge(key){if(!measuring)return;const s=lastSearch();if(s){s.edges++;if(timed)s.edgeKeys.push(key);}},
    settle(){if(!measuring)return;const s=lastSearch();if(s)s.settled++;},
    query(name){
      if(!measuring)return;
      const r=calls[tick]??(calls[tick]={feasibility:0,passage:0,unscopedFeasibility:0,unscopedPassage:0});
      r[name]++;
      const entry=stack.at(-1);
      if(entry)entry[name]++;
      else r[name==='feasibility'?'unscopedFeasibility':'unscopedPassage']++;
    },
    snapshot(){return {rows,scopes,calls};}
  };
  globalThis.__callerProbe=probe;
}

async function run(browser,mode){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[],intercepted=new Set();
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const paths=mode==='minimal'?['ui/core.js']:['ui/core.js','engine.js','runtime-hook-pipeline.js','spatial-traversal.js'];
  await page.addInitScript(install,mode);
  for(const path of paths)await page.route('**/src/'+path,async route=>{
    try{
      const response=await route.fetch();
      assert.ok(response.ok(),'Source fetch failed '+path);
      const body=patch(path,await response.text(),mode);
      intercepted.add(path);
      await route.fulfill({response,body});
    }catch(e){errors.push(String(e));await route.abort();}
  });
  try{
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.SimEngine?.getState?.()&&window.SimUI?.isStarted?.());
    assert.deepEqual([...intercepted].sort(),paths.slice().sort(),'All lexical probes installed');
    await page.evaluate(seed=>{
      document.getElementById('seedInput').value=String(seed);
      document.getElementById('reset').click();
    },seed);
    if(mode!=='minimal')await page.evaluate(()=>{
      for(const [key,name] of [['traversalFeasibility','feasibility'],['getPassageProfile','passage']]){
        const sp=window.SimSpatial,original=sp[key];
        if(typeof original!=='function')throw new Error('Missing query '+key);
        sp[key]=function(...args){globalThis.__callerProbe.query(name);return original.apply(this,args);};
      }
    });
    const states=[],agents=[];
    for(let i=1;i<=ticks;i++){
      const observed=await page.evaluate(async()=>{
        document.getElementById('step').click();
        await new Promise(r=>requestAnimationFrame(r));
        await new Promise(r=>requestAnimationFrame(r));
        const s=window.SimEngine.getState();
        return {tick:s.tick,state:JSON.stringify(s),agents:Object.values(s.agents).map(a=>({
          id:a.id,action:a.action?.kind??null,phase:a.action?.phase??null,
          intent:a.intent??null,thought:s.thoughts?.[a.id]?.pick?.id??null
        }))};
      });
      assert.equal(observed.tick,i,'Single step must advance exactly once');
      states.push(observed.state);agents.push(observed.agents);
    }
    const data=await page.evaluate(()=>globalThis.__callerProbe.snapshot());
    assert.equal(data.rows.length,ticks,'Every tick must execute full stepOne/render');
    for(const [i,r] of data.rows.entries()){
      assert.equal(r.before,i);assert.equal(r.after,i+1);
      assert.ok([r.engineMs,r.renderMs].every(x=>Number.isFinite(x)&&x>=0));
    }
    assert.deepEqual(errors,[],'No page/console errors');
    if(mode!=='minimal'){
      assert.ok(data.scopes.some(r=>r.kind==='search'),'Lexical route search must be observed');
      assert.ok(data.scopes.some(r=>r.kind==='choose'),'Engine decision must be observed');
      for(const [t,c] of Object.entries(data.calls))for(const k of ['feasibility','passage']){
        const unscoped=c[k==='feasibility'?'unscopedFeasibility':'unscopedPassage'];
        assert.equal(data.scopes.filter(x=>x.tick===Number(t)).reduce((s,x)=>s+x[k],0)+unscoped,c[k],'Exclusive query count conservation');
      }
    }
    return {states,report:{mode,agents,...data,stateHashes:states.map(hash)}};
  }finally{await page.close();}
}

fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
let reference=null,countReference=null;
try{
  const modes=['minimal','count','detailed'];
  for(let round=0;round<rounds;round++)for(let i=0;i<modes.length;i++){
    const mode=modes[(round+i)%modes.length];
    const {states,report}=await run(browser,mode);
    reference??=states;
    assert.deepEqual(states,reference,'Full canonical state including RNG, events, actions and intents must match at every tick');
    if(mode!=='minimal'){
      countReference??=report.calls;
      assert.deepEqual(report.calls,countReference,'Instrumented query counts must match across rounds/modes');
    }
    report.round=round+1;results.push(report);
    fs.writeFileSync(out+'/result.json',JSON.stringify({seed,ticks,rounds,browserVersion:browser.version(),nodeVersion:process.version,platform:process.platform,sha:process.env.GITHUB_SHA??null,results},null,2));
    console.log('C1_CASE '+JSON.stringify({mode,round:round+1,rows:report.rows,calls:report.calls,stateHashes:report.stateHashes}));
    if(mode==='detailed')for(const t of [7,9]){
      const rows=report.scopes.filter(x=>x.tick===t);
      const byId=new Map(rows.map(x=>[x.id,x]));
      const top=rows.filter(x=>['choose','stepAction','startAction','provider','interaction','slot','search'].includes(x.kind)).sort((a,b)=>b.inclusiveMs-a.inclusiveMs).slice(0,12).map(({edgeKeys,...x})=>({...x,parents:(()=>{const out=[];let p=byId.get(x.parent);while(p){out.push({kind:p.kind,meta:p.meta});p=byId.get(p.parent);}return out;})()}));
      console.log('C1_TICK_ATTRIBUTION '+JSON.stringify({round:round+1,tick:t,agents:report.agents[t-1],top}));
    }
  }
  console.log('C1 PASS: all nine cases, per-tick full-state parity and count conservation');
}finally{await browser.close();}
