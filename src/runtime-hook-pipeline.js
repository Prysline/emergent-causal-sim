(() => {
  const E=window.SimEngine;if(!E)return;
  const coreTick=E.tick,coreReset=E.reset;
  const PHASES=Object.freeze(['beforeTick','afterTick','afterReset','episodicMemoryCreated']);
  const OBSERVER_PHASES=Object.freeze(['afterTick','afterReset']);
  const hooks=new Map(PHASES.map(phase=>[phase,[]]));
  const observers=new Map(OBSERVER_PHASES.map(phase=>[phase,[]]));
  let registrationSeq=0,observerRegistrationSeq=0,finalizedRuntimeHookManifest=null;

  function registerRuntimeHook(phase,id,handler,order=0){
    if(!hooks.has(phase))throw new Error(`Unknown runtime hook phase: ${phase}`);
    if(finalizedRuntimeHookManifest)throw new Error(`Runtime hook registry is finalized; cannot register ${phase}:${id}.`);
    if(!id||typeof id!=='string')throw new Error('Runtime hook id must be a non-empty string');
    if(typeof handler!=='function')throw new Error(`Runtime hook ${id} must be a function`);
    const list=hooks.get(phase);
    if(list.some(entry=>entry.id===id))throw new Error(`Duplicate runtime hook: ${phase}:${id}`);
    list.push({id,handler,order:Number.isFinite(order)?order:0,seq:registrationSeq++});
    list.sort((a,b)=>a.order-b.order||a.seq-b.seq||a.id.localeCompare(b.id));
    return handler;
  }
  function runRuntimeHooks(phase,ctx){
    for(const entry of hooks.get(phase)||[])entry.handler(ctx);
    return ctx;
  }
  function listRuntimeHooks(phase){
    const list=hooks.get(phase)||[];
    return list.map(({id,order})=>({id,order}));
  }
  function currentRuntimeHookManifest(){
    return Object.fromEntries(PHASES.map(phase=>[phase,listRuntimeHooks(phase)]));
  }
  function assertRuntimeHookManifest(expected){
    if(!expected||typeof expected!=='object')throw new Error('Expected runtime hook manifest must be an object.');
    for(const phase of PHASES){
      const wanted=expected[phase];
      if(!Array.isArray(wanted))throw new Error(`Expected runtime hook manifest must define phase ${phase}.`);
      const actual=listRuntimeHooks(phase);
      if(JSON.stringify(actual)!==JSON.stringify(wanted))throw new Error(`Runtime hook manifest mismatch for ${phase}; expected=${JSON.stringify(wanted)}, actual=${JSON.stringify(actual)}.`);
    }
    return currentRuntimeHookManifest();
  }
  function finalizeRuntimeHooks(expected){
    if(finalizedRuntimeHookManifest)throw new Error('Runtime hook registry is already finalized.');
    assertRuntimeHookManifest(expected);
    finalizedRuntimeHookManifest=Object.freeze(Object.fromEntries(PHASES.map(phase=>[phase,Object.freeze(expected[phase].map(entry=>Object.freeze({...entry}))) ])));
    return currentRuntimeHookManifest();
  }
  function registerRuntimeObserver(phase,id,handler,order=0){
    if(!observers.has(phase))throw new Error(`Unknown runtime observer phase: ${phase}`);
    if(!id||typeof id!=='string')throw new Error('Runtime observer id must be a non-empty string');
    if(typeof handler!=='function')throw new Error(`Runtime observer ${id} must be a function`);
    const list=observers.get(phase);
    if(list.some(entry=>entry.id===id))throw new Error(`Duplicate runtime observer: ${phase}:${id}`);
    list.push({id,handler,order:Number.isFinite(order)?order:0,seq:observerRegistrationSeq++});
    list.sort((a,b)=>a.order-b.order||a.seq-b.seq||a.id.localeCompare(b.id));
    return handler;
  }
  function runRuntimeObservers(phase,ctx){
    for(const entry of observers.get(phase)||[])entry.handler(ctx);
    return ctx;
  }
  function listRuntimeObservers(phase){
    const list=observers.get(phase)||[];
    return list.map(({id,order})=>({id,order}));
  }
  function currentRuntimeObserverManifest(){
    return Object.fromEntries(OBSERVER_PHASES.map(phase=>[phase,listRuntimeObservers(phase)]));
  }

  const pipelineTick=(...args)=>{
    const ctx={args,locals:Object.create(null),state:E.getState(),beforeCore:null,afterCore:null,result:null};
    runRuntimeHooks('beforeTick',ctx);
    ctx.beforeCore=E.getState();
    ctx.result=coreTick(...args);
    ctx.afterCore=E.getState();
    ctx.state=ctx.afterCore;
    runRuntimeHooks('afterTick',ctx);
    runRuntimeObservers('afterTick',ctx);
    return ctx.result;
  };
  const pipelineReset=(...args)=>{
    const result=coreReset(...args),ctx={args,result,state:E.getState(),locals:Object.create(null)};
    runRuntimeHooks('afterReset',ctx);
    runRuntimeObservers('afterReset',ctx);
    return result;
  };
  const episodicMemoryCreated=(st,a,memory)=>{
    const ctx={state:st,agent:a,memory,result:null,locals:Object.create(null)};
    runRuntimeHooks('episodicMemoryCreated',ctx);
    return ctx.result??memory?.appraisal??null;
  };

  E.tick=pipelineTick;
  E.reset=pipelineReset;
  E.onEpisodicMemoryCreated=episodicMemoryCreated;
  Object.assign(E,{
    RUNTIME_HOOK_PIPELINE_VERSION:'runtime-hook-pipeline-2',
    RUNTIME_HOOK_PHASES:PHASES,
    RUNTIME_OBSERVER_PHASES:OBSERVER_PHASES,
    RUNTIME_PIPELINE_TICK:pipelineTick,
    RUNTIME_PIPELINE_RESET:pipelineReset,
    registerRuntimeHook,runRuntimeHooks,listRuntimeHooks,currentRuntimeHookManifest,assertRuntimeHookManifest,finalizeRuntimeHooks,
    registerRuntimeObserver,runRuntimeObservers,listRuntimeObservers,currentRuntimeObserverManifest,
    isRuntimeHookRegistryFinalized:()=>!!finalizedRuntimeHookManifest
  });
})();
