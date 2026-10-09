(() => {
  const E=window.SimEngine,SP=window.SimSpatial,M=window.SimMentalRegulation;
  if(!E||!SP||!M)throw new Error('systems/mental-regulation/runtime.js requires Engine, Spatial, and Mental Regulation state policy.');
  if(!E.registerDecisionOptionProvider)throw new Error('Mental Regulation requires decision-option provider contract.');
  if(!E.registerRuntimeHook)throw new Error('Mental Regulation requires runtime-hook pipeline.');

  const samePosition=(a,b)=>!!a&&!!b&&(typeof SP.same==='function'?SP.same(a,b):(a.x===b.x&&a.y===b.y&&(a.z??0)===(b.z??0)));

  E.registerDecisionOptionProvider('mentalRegulation.wander',(st,a)=>M.decisionOptionFor(a,'wander'),450);

  E.registerRuntimeHook('beforeTick','mentalRegulation.capture-execution',(ctx)=>{
    const st=ctx.state||E.getState(),executingWander=Object.create(null);
    for(const a of Object.values(st?.agents||{})){
      if(a.action?.kind!=='wander'||!a.position)continue;
      executingWander[a.id]={x:a.position.x,y:a.position.y,z:a.position.z};
    }
    ctx.locals.mentalRegulationExecution=executingWander;
  },1200);

  E.registerRuntimeHook('afterTick','mentalRegulation.apply-realized-feedback',(ctx)=>{
    const st=ctx.state||E.getState(),before=ctx.locals.mentalRegulationExecution;
    if(!before)return;
    for(const [agentId,positionBefore] of Object.entries(before)){
      const a=st?.agents?.[agentId];
      if(!a?.position||samePosition(positionBefore,a.position))continue;
      M.applyRealizedActivityFeedback(a,'wander',{feedbackUnits:1});
    }
  },50);

  E.MENTAL_REGULATION_VERSION=M.VERSION;
})();
