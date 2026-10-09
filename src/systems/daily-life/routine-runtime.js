(() => {
  const E=window.SimEngine,R=window.SimDailyLifeRoutine;
  if(!E||!R)throw new Error('systems/daily-life/routine-runtime.js requires Engine and Routine state policy.');
  if(!E.registerDecisionOptionProvider)throw new Error('Routine requires decision-option provider contract.');
  if(typeof E.bestReadableObjectOpportunity!=='function')throw new Error('Routine requires canonical readable-object opportunity query.');

  function decisionOptionFor(st,agent){
    if(agent?.kind!=='human')return null;
    R.ensureRoutineState(st,agent);
    const active=R.activeAnchorFor(agent,'read',st?.minute);if(!active)return null;
    const opportunity=E.bestReadableObjectOpportunity(st,agent);if(!opportunity)return null;
    const baseScore=R.scoreForEvidence(active.evidence),score=Math.max(0,baseScore-opportunity.accessPenalty);
    return {
      id:'read',targetObject:opportunity.targetObject,score,
      why:['目前時間符合自己的日常閱讀傾向','Routine 只提供有限偏好；仍由 Deliberation 與其他候選競爭'],
      decisionContributors:[
        {kind:'routine',key:active.anchor.id,role:'motivation',activityKind:'read',source:active.anchor.source,boundedEvidence:active.evidence},
        {kind:'context',key:'dailyTimeWindow',role:'context',startMinute:active.anchor.context.startMinute,endMinute:active.anchor.context.endMinute,currentMinute:st.minute},
        {kind:'spatial',key:'readAccessTraversalCost',role:'cost',value:opportunity.traversalCost}
      ]
    };
  }

  E.registerDecisionOptionProvider('dailyLifeRoutine.read',decisionOptionFor,460);
  E.DAILY_LIFE_ROUTINE_VERSION=R.VERSION;
  E.routineDecisionOption=decisionOptionFor;
})();
