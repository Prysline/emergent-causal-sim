(() => {
  const E=window.SimEngine;if(!E)return;
  const coreTick=E.tick,coreReset=E.reset;
  const PHASES=Object.freeze(['beforeTick','afterTick','afterReset','episodicMemoryCreated']);
  const hooks=new Map(PHASES.map(phase=>[phase,[]]));
  let registrationSeq=0;

  function registerRuntimeHook(phase,id,handler,order=0){
    if(!hooks.has(phase))throw new Error(`Unknown runtime hook phase: ${phase}`);
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

  const pipelineTick=(...args)=>{
    const ctx={args,locals:Object.create(null),state:E.getState(),beforeCore:null,afterCore:null,result:null};
    runRuntimeHooks('beforeTick',ctx);
    ctx.beforeCore=E.getState();
    ctx.result=coreTick(...args);
    ctx.afterCore=E.getState();
    ctx.state=ctx.afterCore;
    runRuntimeHooks('afterTick',ctx);
    return ctx.result;
  };
  const pipelineReset=(...args)=>{
    const result=coreReset(...args),ctx={args,result,state:E.getState(),locals:Object.create(null)};
    runRuntimeHooks('afterReset',ctx);
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
    RUNTIME_HOOK_PIPELINE_VERSION:'runtime-hook-pipeline-1',
    RUNTIME_HOOK_PHASES:PHASES,
    RUNTIME_PIPELINE_TICK:pipelineTick,
    RUNTIME_PIPELINE_RESET:pipelineReset,
    registerRuntimeHook,
    runRuntimeHooks,
    listRuntimeHooks
  });
})();
