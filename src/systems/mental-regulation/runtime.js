(() => {
  const E=window.SimEngine,SP=window.SimSpatial,M=window.SimMentalRegulation;
  if(!E||!SP||!M)throw new Error('systems/mental-regulation/runtime.js requires Engine, Spatial, and Mental Regulation state policy.');
  if(!E.registerDecisionOptionProvider)throw new Error('Mental Regulation requires decision-option provider contract.');
  if(!E.registerRuntimeHook)throw new Error('Mental Regulation requires runtime-hook pipeline.');

  const samePosition=(a,b)=>!!a&&!!b&&(typeof SP.same==='function'?SP.same(a,b):(a.x===b.x&&a.y===b.y&&(a.z??0)===(b.z??0)));

  E.registerDecisionOptionProvider('mentalRegulation.wander',(st,a)=>M.decisionOptionFor(a,'wander'),450);
  E.registerDecisionOptionProvider('mentalRegulation.read',(st,a)=>{
    const option=M.decisionOptionFor(a,'read');if(!option)return null;
    const candidates=Object.values(st.objects||{}).filter(object=>object?.affordances?.includes('read')).map(object=>{const result=SP.bestInteractionPositionResult?.(st,a,{kind:'object',id:object.id},'read');return result&&Number.isFinite(result.traversalCost)?{object,result}:null;}).filter(Boolean).sort((x,y)=>x.result.traversalCost-y.result.traversalCost||String(x.object.id).localeCompare(String(y.object.id)));
    const best=candidates[0];if(!best)return null;
    const traversalCost=best.result.traversalCost,accessPenalty=Math.min(18,traversalCost*1.5);
    return {...option,targetObject:best.object.id,score:Math.max(0,option.score-accessPenalty),decisionContributors:[...(option.decisionContributors||[]),{kind:'spatial',key:'readAccessTraversalCost',role:'cost',value:traversalCost}]};
  },455);

  E.registerRuntimeHook('beforeTick','mentalRegulation.capture-execution',(ctx)=>{
    const st=ctx.state||E.getState(),executingWander=Object.create(null);
    for(const a of Object.values(st?.agents||{})){
      if(a.action?.kind!=='wander'||!a.position)continue;
      executingWander[a.id]={x:a.position.x,y:a.position.y,z:a.position.z};
    }
    ctx.locals.mentalRegulationExecution=executingWander;
    const executingRead=Object.create(null);
    for(const a of Object.values(st?.agents||{}))if(a.action?.kind==='read'&&a.action.phase==='reading')executingRead[a.id]={action:a.action,feedbackUnits:Number(a.action.feedbackUnits)||0};
    ctx.locals.mentalRegulationReadExecution=executingRead;
  },1200);

  E.registerRuntimeHook('afterTick','mentalRegulation.apply-realized-feedback',(ctx)=>{
    const st=ctx.state||E.getState(),before=ctx.locals.mentalRegulationExecution;
    if(!before)return;
    for(const [agentId,positionBefore] of Object.entries(before)){
      const a=st?.agents?.[agentId];
      if(!a?.position||samePosition(positionBefore,a.position))continue;
      M.applyRealizedActivityFeedback(a,'wander',{feedbackUnits:1});
    }
    for(const [agentId,capture] of Object.entries(ctx.locals.mentalRegulationReadExecution||{})){
      const a=st?.agents?.[agentId],realized=Math.max(0,(Number(capture.action?.feedbackUnits)||0)-capture.feedbackUnits);
      if(!a||realized<=0)continue;
      M.applyRealizedActivityFeedback(a,'read',{feedbackUnits:realized});
    }
  },50);

  E.MENTAL_REGULATION_VERSION=M.VERSION;
})();
