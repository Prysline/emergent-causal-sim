(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.INTERRUPTION_SCHEMA_VERSION)return;
  const baseValidate=V.validateState;

  function validateState(st){
    const base=baseValidate(st),issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const a of Object.values(st?.agents||{})){
      const intent=a.activeIntent;
      if(!intent)continue;
      if(a.action&&intent.lifecycle!=='actionBound')add('action_intent_lifecycle_invalid',`${a.name} 有 live Action 時 Active Intent 必須是 actionBound。`,{agentId:a.id,intentId:intent.id,lifecycle:intent.lifecycle});
      if(!a.action&&intent.lifecycle==='actionBound')add('action_bound_intent_without_action',`${a.name} 的 actionBound Active Intent 沒有 live Action。`,{agentId:a.id,intentId:intent.id});
      if(intent.lifecycle==='open'&&a.action)add('open_intent_with_action',`${a.name} 的 open Active Intent 不應同時保存 Action。`,{agentId:a.id,intentId:intent.id,actionKind:a.action.kind});
      if(intent.replanCount!=null&&(!Number.isInteger(intent.replanCount)||intent.replanCount<0))add('intent_replan_count_invalid',`${a.name} 的 replanCount 無效。`,{agentId:a.id,intentId:intent.id,replanCount:intent.replanCount});
      if(intent.replanAttempts!=null&&(!Number.isInteger(intent.replanAttempts)||intent.replanAttempts<0||intent.replanAttempts>E.MAX_REPLAN_ATTEMPTS))add('intent_replan_attempts_invalid',`${a.name} 的 replanAttempts 無效。`,{agentId:a.id,intentId:intent.id,replanAttempts:intent.replanAttempts});
      if(intent.lastReplanTick!=null&&(!Number.isInteger(intent.lastReplanTick)||intent.lastReplanTick<0||intent.lastReplanTick>st.tick))add('intent_last_replan_tick_invalid',`${a.name} 的 lastReplanTick 無效。`,{agentId:a.id,intentId:intent.id,lastReplanTick:intent.lastReplanTick});
      if(intent.source?.type==='emergency'){
        if(!['thirst','hunger','sleepNeed'].includes(intent.source.need))add('emergency_intent_need_invalid',`${a.name} 的 emergency Intent need 無效。`,{agentId:a.id,intentId:intent.id,need:intent.source.need});
        if(!Number.isFinite(intent.source.value)||intent.source.value<0||intent.source.value>100)add('emergency_intent_value_invalid',`${a.name} 的 emergency Intent value 無效。`,{agentId:a.id,intentId:intent.id,value:intent.source.value});
        if(!Number.isInteger(intent.source.tick)||intent.source.tick<0||intent.source.tick>st.tick)add('emergency_intent_tick_invalid',`${a.name} 的 emergency Intent tick 無效。`,{agentId:a.id,intentId:intent.id,tick:intent.source.tick});
      }
    }
    for(const e of Object.values(st?.causes||{})){
      if(e?.data?.action==='replanAction'){
        if(!st.agents?.[e.data.actor])add('replan_event_actor_missing',`replanAction ${e.id} 的 actor 無效。`,{eventId:e.id,actor:e.data.actor});
        if(!e.data.intentId||!e.data.intentKind||!e.data.priorActionKind)add('replan_event_fields_missing',`replanAction ${e.id} 缺少 Intent / Action 欄位。`,{eventId:e.id});
        if(!Number.isInteger(e.data.replanCount)||e.data.replanCount<1)add('replan_event_count_invalid',`replanAction ${e.id} 的 replanCount 無效。`,{eventId:e.id,replanCount:e.data.replanCount});
        if(!(e.causeIds||[]).length)add('replan_event_abort_cause_missing',`replanAction ${e.id} 應連到造成 replanning 的 abort event。`,{eventId:e.id});
      }
      if(e?.data?.action==='actionReplanned'){
        if(!e.data.intentId||!e.data.intentKind||!e.data.nextActionKind)add('replanned_event_fields_missing',`actionReplanned ${e.id} 缺少 Intent / Action 欄位。`,{eventId:e.id});
      }
      if(e?.data?.action==='intentPreempt'){
        if(!st.agents?.[e.data.actor])add('preempt_event_actor_missing',`intentPreempt ${e.id} 的 actor 無效。`,{eventId:e.id,actor:e.data.actor});
        if(!['thirst','hunger','sleepNeed'].includes(e.data.emergencyNeed))add('preempt_event_need_invalid',`intentPreempt ${e.id} 的 emergencyNeed 無效。`,{eventId:e.id,need:e.data.emergencyNeed});
        if(!Number.isFinite(e.data.emergencyValue)||e.data.emergencyValue<94)add('preempt_event_value_invalid',`intentPreempt ${e.id} 的 emergencyValue 不符合緊急門檻。`,{eventId:e.id,value:e.data.emergencyValue});
        if(!e.data.nextActionKind||!e.data.intentId||!e.data.intentKind)add('preempt_event_fields_missing',`intentPreempt ${e.id} 缺少新 Action / Intent 欄位。`,{eventId:e.id});
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.validateState=validateState;
})();
