(() => {
  const E=window.SimEngine,A=window.SimAgentCarry;
  if(!E||!A)throw new Error('systems/agent-carry-lifecycle.js requires Engine + Agent Carry.');
  if(typeof E.registerRuntimeHook!=='function')throw new Error('systems/agent-carry-lifecycle.js requires runtime-hook-pipeline.js.');
  const RECOVERY_RETRY_TICKS=2;
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

  function recoveryCause(st,carrierId){
    return (st.events||[]).find(event=>event?.tick===st.tick&&event.data?.actor===carrierId&&event.data?.action==='abort')?.id||null;
  }
  function recoveryContextFromAction(action){
    const sleep=action?.sleepConflict||null,recovery=action?.recovery||null;
    return {
      originalConflictSlotId:sleep?.originalConflictSlotId||recovery?.originalConflictSlotId||null,
      conflictDecisionId:sleep?.conflictDecisionId||recovery?.conflictDecisionId||null,
      requestedPlacement:clone(sleep?.requestedPlacement||recovery?.requestedPlacement||action?.targetPlacement||null)
    };
  }
  function setBlocked(st,carrier,relation,context,causeId=null){
    const prior=relation.recovery,first=prior?.phase!=='recovery-blocked';
    relation.recovery={phase:'recovery-blocked',owner:'carryAgent',blockedSinceTick:prior?.blockedSinceTick??st.tick,retryAfterTick:st.tick+RECOVERY_RETRY_TICKS,...context};
    if(first)E.addEvent(`${carrier.name}暫時找不到能安全放下懷中角色的位置，先原地保持抱持。`,'normal',[causeId].filter(Boolean),{actor:carrier.id,target:relation.carriedAgentId,action:'agentCarryRecoveryBlocked',relationId:relation.id,recoveryPhase:'recovery-blocked',retryAfterTick:relation.recovery.retryAfterTick,originalRelocationSuccess:false,originalConflictSlotId:context.originalConflictSlotId||null,conflictDecisionId:context.conflictDecisionId||null,position:E.positionRef?.(carrier.position)||null});
    return relation.recovery;
  }
  function bindRecoveryAction(st,carrier,relation,context,causeId=null){
    const recovery=A.nearbyRecoveryFloor?.(st,carrier);if(!recovery)return false;
    const action=E.buildAction?.(carrier,{id:'carryAgent',targetAgent:relation.carriedAgentId,targetPlacement:recovery.target,method:relation.method,cooperative:relation.responderMode==='cooperative'});if(!action)return false;
    action.recovery={kind:'neutralFloor',relationId:relation.id,originalConflictSlotId:context.originalConflictSlotId||null,conflictDecisionId:context.conflictDecisionId||null,requestedPlacement:clone(context.requestedPlacement),targetPlacement:clone(recovery.target)};
    relation.recovery={phase:'placing',owner:'carryAgent',startedTick:st.tick,targetPlacement:clone(recovery.target),...context};
    carrier.action=action;
    E.addEvent(`${carrier.name}改為先尋找附近可安全放下懷中角色的中立位置。`,'normal',[causeId].filter(Boolean),{actor:carrier.id,target:relation.carriedAgentId,action:'agentCarryRecoveryStart',relationId:relation.id,recoveryPhase:'placing',recoveryTarget:clone(recovery.target),originalRelocationSuccess:false,originalConflictSlotId:context.originalConflictSlotId||null,conflictDecisionId:context.conflictDecisionId||null,position:E.positionRef?.(carrier.position)||null});
    return true;
  }
  function beginRecovery(st,carrier,relation,sourceAction){
    const context=recoveryContextFromAction(sourceAction),causeId=recoveryCause(st,carrier.id);
    if(bindRecoveryAction(st,carrier,relation,context,causeId))return true;
    setBlocked(st,carrier,relation,context,causeId);return false;
  }
  function retryBlocked(st,carrier,relation){
    const recovery=relation.recovery;if(recovery?.phase!=='recovery-blocked'||carrier.action)return false;
    const upcomingTick=st.tick+1;if(upcomingTick<Number(recovery.retryAfterTick||0))return false;
    const context={originalConflictSlotId:recovery.originalConflictSlotId||null,conflictDecisionId:recovery.conflictDecisionId||null,requestedPlacement:clone(recovery.requestedPlacement)};
    if(bindRecoveryAction(st,carrier,relation,context))return true;
    recovery.retryAfterTick=upcomingTick+RECOVERY_RETRY_TICKS;return false;
  }
  function captureLifecycle(ctx){
    const st=ctx?.state,map=new Map();if(!st)return;
    for(const relation of Object.values(st.agentCarries||{})){
      const carrier=st.agents?.[relation.carrierId];if(!carrier)continue;
      retryBlocked(st,carrier,relation);
      if(carrier.action?.kind==='carryAgent')map.set(relation.id,{carrierId:carrier.id,carriedAgentId:relation.carriedAgentId,action:clone(carrier.action),relationRecovery:clone(relation.recovery)});
    }
    ctx.locals.agentCarryLifecycle=map;
  }
  function annotateRecoveryPlacement(st,snapshot){
    const placement=(st.events||[]).find(event=>event?.tick===st.tick&&event.data?.actor===snapshot.carrierId&&event.data?.target===snapshot.carriedAgentId&&event.data?.action==='agentPlacementComplete');
    if(!placement)return null;
    placement.data.recovery=true;placement.data.originalRelocationSuccess=false;placement.data.recoveryKind='neutralFloor';placement.data.originalConflictSlotId=snapshot.action?.recovery?.originalConflictSlotId||null;placement.data.conflictDecisionId=snapshot.action?.recovery?.conflictDecisionId||null;
    return placement;
  }
  function reconcileLifecycle(ctx){
    const st=ctx?.state,snapshots=ctx?.locals?.agentCarryLifecycle;if(!st||!snapshots)return;
    for(const snapshot of snapshots.values()){
      const relation=st.agentCarries?.[snapshot.carriedAgentId],carrier=st.agents?.[snapshot.carrierId];if(!carrier)continue;
      if(snapshot.action?.recovery&&!relation){
        const placement=annotateRecoveryPlacement(st,snapshot);
        E.addEvent(`${carrier.name}已把懷中角色安全放到附近中立位置；原本的搬移目標仍視為失敗。`,'normal',[placement?.id].filter(Boolean),{actor:carrier.id,target:snapshot.carriedAgentId,action:'agentCarryRecoveryComplete',recoveryKind:'neutralFloor',originalRelocationSuccess:false,originalConflictSlotId:snapshot.action.recovery.originalConflictSlotId||null,conflictDecisionId:snapshot.action.recovery.conflictDecisionId||null,position:E.positionRef?.(carrier.position)||null});
        continue;
      }
      if(!relation||carrier.action)continue;
      beginRecovery(st,carrier,relation,snapshot.action);
    }
  }

  E.registerRuntimeHook('beforeTick','agentCarry.capture-lifecycle',captureLifecycle,50);
  E.registerRuntimeHook('afterTick','agentCarry.recover-placement',reconcileLifecycle,175);
  window.SimAgentCarryRecovery=Object.freeze({RECOVERY_RETRY_TICKS,recoveryContextFromAction,setBlocked,bindRecoveryAction,beginRecovery,retryBlocked,captureLifecycle,reconcileLifecycle});
})();
