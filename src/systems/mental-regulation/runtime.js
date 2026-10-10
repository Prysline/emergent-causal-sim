(() => {
  const E=window.SimEngine,SP=window.SimSpatial,M=window.SimMentalRegulation;
  if(!E||!SP||!M)throw new Error('systems/mental-regulation/runtime.js requires Engine, Spatial, and Mental Regulation state policy.');
  if(!E.registerDecisionOptionProvider)throw new Error('Mental Regulation requires decision-option provider contract.');
  if(!E.registerRuntimeHook)throw new Error('Mental Regulation requires runtime-hook pipeline.');
  if(typeof E.bestReadableObjectOpportunity!=='function')throw new Error('Mental Regulation requires canonical readable-object opportunity query.');

  const samePosition=(a,b)=>!!a&&!!b&&(typeof SP.same==='function'?SP.same(a,b):(a.x===b.x&&a.y===b.y&&(a.z??0)===(b.z??0)));

  E.registerDecisionOptionProvider('mentalRegulation.wander',(st,a)=>M.decisionOptionFor(a,'wander'),450);
  E.registerDecisionOptionProvider('mentalRegulation.read',(st,a)=>{
    const option=M.decisionOptionFor(a,'read');if(!option)return null;
    const opportunity=E.bestReadableObjectOpportunity(st,a);if(!opportunity)return null;
    return {...option,targetObject:opportunity.targetObject,score:Math.max(0,option.score-opportunity.accessPenalty),decisionContributors:[...(option.decisionContributors||[]),{kind:'spatial',key:'readAccessTraversalCost',role:'cost',value:opportunity.traversalCost}]};
  },455);

  E.registerRuntimeHook('beforeTick','mentalRegulation.capture-execution',(ctx)=>{
    const st=ctx.state||E.getState(),capture=Object.create(null);
    for(const a of Object.values(st?.agents||{})){
      if(!M.isEligibleAgent(a))continue;
      const item=capture[a.id]={awake:!E.isSleeping?.(a),wanderPosition:null,read:null};
      if(a.action?.kind==='wander'&&a.position)item.wanderPosition={x:a.position.x,y:a.position.y,z:a.position.z};
      if(a.action?.kind==='read'&&a.action.phase==='reading')item.read={action:a.action,feedbackUnits:Number(a.action.feedbackUnits)||0};
    }
    ctx.locals.mentalRegulationExecution=capture;
  },1200);

  E.registerRuntimeHook('afterTick','mentalRegulation.settle',(ctx)=>{
    const st=ctx.state||E.getState(),before=ctx.locals.mentalRegulationExecution;
    if(!before)return;
    for(const [agentId,capture] of Object.entries(before)){
      const a=st?.agents?.[agentId];if(!a)continue;
      const realizedActivities=[];
      if(capture.wanderPosition&&a.position&&!samePosition(capture.wanderPosition,a.position))realizedActivities.push({activityKind:'wander',feedbackUnits:1});
      if(capture.read){
        const realized=Math.max(0,(Number(capture.read.action?.feedbackUnits)||0)-capture.read.feedbackUnits);
        if(realized>0)realizedActivities.push({activityKind:'read',feedbackUnits:realized});
      }
      M.settleMentalRegulation(a,{awake:capture.awake,realizedActivities});
    }
  },50);

  E.MENTAL_REGULATION_VERSION=M.VERSION;
})();
