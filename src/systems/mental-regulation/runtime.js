(() => {
  const E=window.SimEngine,SP=window.SimSpatial,M=window.SimMentalRegulation;
  if(!E||!SP||!M)throw new Error('systems/mental-regulation/runtime.js requires Engine, Spatial, and Mental Regulation state policy.');
  if(!E.registerDecisionOptionProvider)throw new Error('Mental Regulation requires decision-option provider contract.');
  if(!E.registerRuntimeHook)throw new Error('Mental Regulation requires runtime-hook pipeline.');

  const clonePosition=p=>p?{x:p.x,y:p.y,...(p.z===undefined?{}:{z:p.z})}:null;
  const samePosition=(a,b)=>!!a&&!!b&&(typeof SP.same==='function'?SP.same(a,b):(a.x===b.x&&a.y===b.y&&(a.z??0)===(b.z??0)));

  E.registerDecisionOptionProvider('mentalRegulation.wander',(st,a)=>M.decisionOptionFor(a,'wander'),450);

  E.registerRuntimeHook('beforeTick','mentalRegulation.capture-execution',(ctx)=>{
    const st=ctx.state||E.getState();
    ctx.locals.mentalRegulationExecution=Object.fromEntries(Object.values(st?.agents||{}).map(a=>[a.id,Object.freeze({
      actionKind:a.action?.kind||null,
      intentId:a.activeIntent?.id||a.action?.intentId||null,
      position:clonePosition(a.position)
    })]));
  },1200);

  E.registerRuntimeHook('afterTick','mentalRegulation.apply-realized-feedback',(ctx)=>{
    const st=ctx.state||E.getState(),before=ctx.locals.mentalRegulationExecution||{};
    for(const a of Object.values(st?.agents||{})){
      M.applyBaselineDrift(a,{awake:!a.offMap&&!E.isSleeping?.(a)});
      const snapshot=before[a.id];
      if(snapshot?.actionKind!=='wander'||!snapshot.position||!a.position||samePosition(snapshot.position,a.position))continue;
      M.applyRealizedActivityFeedback(a,'wander',{feedbackUnits:1});
    }
  },50);

  E.MENTAL_REGULATION_VERSION=M.VERSION;
})();
