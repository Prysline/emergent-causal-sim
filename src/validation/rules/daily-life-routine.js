(() => {
  const V=window.SimValidator,E=window.SimEngine,R=window.SimDailyLifeRoutine;if(!V||!E?.DAILY_LIFE_ROUTINE_VERSION||!R)return;
  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    if(Object.prototype.hasOwnProperty.call(st||{},'routines'))add('routine_world_truth_forbidden','Routine must remain Agent-private; state.routines is not a canonical World truth.');
    for(const agent of Object.values(st?.agents||{})){
      const routine=agent?.routine;
      if(!routine||!Array.isArray(routine.anchors)){add('routine_state_missing',`${agent?.name||agent?.id||'Agent'} requires Agent-private routine.anchors.`,{agentId:agent?.id});continue;}
      const ids=new Set();
      for(const anchor of routine.anchors){
        if(!R.validAnchor(anchor))add('routine_anchor_invalid',`${agent.name} has invalid Routine anchor.`,{agentId:agent.id,anchorId:anchor?.id});
        if(anchor?.id&&ids.has(anchor.id))add('routine_anchor_duplicate',`${agent.name} has duplicate Routine anchor ${anchor.id}.`,{agentId:agent.id,anchorId:anchor.id});
        if(anchor?.id)ids.add(anchor.id);
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('daily-life-routine',validateLayer,1900);
})();
