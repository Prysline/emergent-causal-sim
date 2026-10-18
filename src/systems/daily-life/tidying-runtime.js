(() => {
  const E=window.SimEngine,S=window.SimTidyingState,P=window.SimPerception,SP=window.SimSpatial,O=window.SimObjectHandling;
  if(!E?.registerDecisionOptionProvider||!S?.knownAssignments||!P?.classifyObjectPointVisualAvailability||!SP?.bestInteractionPositionResult||!O?.canHoldObject)throw new Error('Tidying requires canonical Engine, Spatial, Handling and Perception consumers.');
  function candidate(st,agent,assignment){
    const object=st.objects?.[assignment.objectId],destination=st.furniture?.[assignment.target.id];
    if(!object||!destination||destination.objectContainment!==true||object.containedBy===destination.id||agent.held)return null;
    const locationState=SP.objectLocationState(st,object.id);
    if(!['free','supported'].includes(locationState)||SP.holderOf(st,object.id)||!O.canHoldObject(st,agent,object))return null;
    if(st.reservations?.['object:'+object.id]&&st.reservations['object:'+object.id]!==agent.id)return null;
    const observed=P.classifyObjectPointVisualAvailability(st,agent,object);
    if(!observed.visualAvailable)return null;
    const pickup=SP.bestInteractionPositionResult(st,agent,{kind:'object',id:object.id},'pickup');
    const store=SP.bestInteractionPositionResult(st,agent,{kind:'furniture',id:destination.id},'default');
    if(!Number.isFinite(pickup?.traversalCost)||!Number.isFinite(store?.traversalCost))return null;
    const cost=Math.min(15,(pickup.traversalCost+store.traversalCost)*.6);
    return {id:'putAwayObject',targetObject:object.id,destinationId:destination.id,storageAssignmentId:assignment.id,observed,score:Math.max(0,48-cost),why:['觀察到已知物件偏離指定收納處','可拿取並可到達收納位置'],decisionContributors:[{kind:'knownStorageAssignment',key:assignment.id,role:'motivation',assignmentId:assignment.id,scoreDelta:Math.max(0,48-cost)},{kind:'observation',key:'objectVisualAvailability',role:'evidence',objectId:object.id,observedTick:observed.observedTick},{kind:'spatial',key:'storageTraversalCost',role:'cost',value:pickup.traversalCost+store.traversalCost}]};
  }
  function decisionOptionFor(st,agent){
    if(agent?.kind!=='human'||agent.offMap||agent.held)return null;
    const out=S.knownAssignments(st,agent).map(assignment=>candidate(st,agent,assignment)).filter(Boolean);
    out.sort((a,b)=>b.score-a.score||a.storageAssignmentId.localeCompare(b.storageAssignmentId));
    return out[0]||null;
  }
  E.registerDecisionOptionProvider('tidying.putAway',decisionOptionFor,470);
  E.registerActionLabelResolver('tidying.putAway',(st,a)=>a.action?.kind==='putAwayObject'?'收拾物件・'+a.action.phase:null,470);
  E.TIDYING_VERSION=S.VERSION;
  E.tidyingDecisionOption=decisionOptionFor;
  E.EMERGENCY_PREEMPTIBLE?.add('putAwayObject');
})();
