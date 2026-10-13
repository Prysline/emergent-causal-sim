(() => {
  const V=window.SimValidator,W=window.SimWorld,H=window.SimDailyLifeLearnedHabit;if(!V||!W?.DAILY_LIFE_LEARNED_HABIT_SCHEMA_VERSION||!H)return;
  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    if(Object.prototype.hasOwnProperty.call(st||{},'learnedHabits'))add('learned_habit_world_truth_forbidden','Learned Habit must remain Agent-private; state.learnedHabits is not canonical World truth.');
    for(const agent of Object.values(st?.agents||{})){
      const habits=agent?.learnedHabits;
      if(!habits||Array.isArray(habits)||typeof habits!=='object'){add('learned_habit_state_missing',`${agent?.name||agent?.id||'Agent'} requires Agent-private learnedHabits.`,{agentId:agent?.id});continue;}
      for(const [key,summary] of Object.entries(habits))if(!H.validSummary(summary,key))add('learned_habit_summary_invalid',`${agent.name} has invalid Learned Habit summary ${key}.`,{agentId:agent.id,habitKey:key});
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('daily-life-learned-habit',validateLayer,1950);
})();
