(() => {
  const E=window.SimEngine,F=window.SimFurniturePassageYielding,SP=window.SimSpatial;
  if(!E?.registerRuntimeHook||!E?.addEvent)throw new Error('furniture-passage-yielding-runtime.js requires runtime hook pipeline + canonical World Event authority.');
  if(!F?.candidateForNavigation||!F?.applyRuntimeFurniturePlacement)throw new Error('furniture-passage-yielding-runtime.js requires Furniture Passage Yielding core.');

  const VERSION='furniture-passage-yielding-runtime-v1',clone=value=>value==null?value:JSON.parse(JSON.stringify(value)),zOf=p=>p?.z??0;
  const sameNode=(left,right)=>!!left&&!!right&&left.x===right.x&&left.y===right.y&&zOf(left)===zOf(right)&&(left.surfaceId??'floor')===(right.surfaceId??'floor');
  const walkReachable=(st,a,goal)=>{const route=F.basePlanRoute(st,a,goal,{mode:'walk',objective:'traversalCost'});return Array.isArray(route?.path)&&route.path.length>0&&Number.isFinite(route.traversalCost);};

  function abortRecovery(st,a,reason,data={}){
    const action=a?.action,recovery=action?.passageYieldingRecovery;if(!action||!recovery)return null;
    delete action.passageYieldingRecovery;
    return E.addEvent(`${a.name}停止這次局部家具讓路，重新評估原本的行動路徑。`,'normal',[],{actor:a.id,action:'furniturePassageYieldingAbort',reason,furnitureId:recovery.furnitureId,decisionId:recovery.decisionId,intentId:action.intentId||a.activeIntent?.id||null,position:E.positionRef?.(a.position)||clone(a.position),...clone(data)});
  }
  function armRecovery(st,a,candidate){
    const action=a?.action;if(!action||action.passageYieldingRecovery)return false;
    action.passageYieldingRecovery={
      version:VERSION,
      decisionId:`execution-decision:passage-yielding:${a.id}:${st.tick}:${candidate.furnitureId}`,
      createdTick:st.tick,
      furnitureId:candidate.furnitureId,
      originalGoal:clone(candidate.goal),
      interactionPosition:clone(candidate.interactionPosition),
      parkedPlacement:clone(candidate.parkedPlacement),
      observation:clone(candidate.observation),
      counterfactual:{parkedWalkReachable:true,parkedPathDistance:candidate.parkedWalk?.pathDistance??null}
    };
    return true;
  }
  function settleRecovery(st,a){
    const action=a?.action,recovery=action?.passageYieldingRecovery;if(!action||!recovery)return false;
    if(!sameNode(action.spatialGoal,recovery.originalGoal))return !!abortRecovery(st,a,'navigation-goal-changed');
    if(walkReachable(st,a,recovery.originalGoal))return !!abortRecovery(st,a,'normal-walk-route-restored');
    const furniture=st.furniture?.[recovery.furnitureId];if(!furniture)return !!abortRecovery(st,a,'furniture-missing');
    const legality=F.placementLegality(st,furniture);if(!legality.ok)return !!abortRecovery(st,a,'placement-legality-changed',{legalityReason:legality.reason});
    const contacts=F.interactionPositions(st,a,furniture,legality.displacement);if(!contacts.some(entry=>sameNode(entry.position,recovery.interactionPosition)))return !!abortRecovery(st,a,'interaction-position-unavailable');
    if(!sameNode(a.position,recovery.interactionPosition))return false;
    const counterfactual=F.evaluateFurnitureCandidate(st,a,recovery.originalGoal,furniture,{requireObservation:false});if(!counterfactual)return !!abortRecovery(st,a,'counterfactual-no-longer-restores-walk');
    const result=F.applyRuntimeFurniturePlacement(st,furniture.id,recovery.parkedPlacement);if(!result.ok)return !!abortRecovery(st,a,'runtime-placement-rejected',{legalityReason:result.reason});
    const event=E.addEvent(`${a.name}把${furniture.name||furniture.id}收回局部停放位置，讓原本的步行路徑重新可用。`,'normal',[],{actor:a.id,action:'furniturePassageYielding',furnitureId:furniture.id,decisionId:recovery.decisionId,intentId:action.intentId||a.activeIntent?.id||null,fromPlacement:clone(result.fromPlacement),toPlacement:clone(result.toPlacement),position:E.positionRef?.(a.position)||clone(a.position)});
    action.lastPassageYielding={decisionId:recovery.decisionId,eventId:event,completedTick:st.tick,furnitureId:furniture.id};delete action.passageYieldingRecovery;
    return true;
  }
  function settle(ctx){
    const st=ctx?.state||E.getState?.();if(!st)return;
    for(const a of Object.values(st.agents||{})){
      if(!a?.action||a.offMap)continue;
      if(a.action.passageYieldingRecovery){settleRecovery(st,a);continue;}
      const goal=a.action.spatialGoal;if(!goal)continue;
      const candidate=F.candidateForNavigation(st,a,goal);if(candidate)armRecovery(st,a,candidate);
    }
  }

  E.registerRuntimeHook('afterTick','furniturePassageYielding.settle',settle,125);
  Object.assign(E,{FURNITURE_PASSAGE_YIELDING_RUNTIME_VERSION:VERSION});
  window.SimFurniturePassageYieldingRuntime={VERSION,armRecovery,settleRecovery};
})();