(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.MEMORY_SCHEMA_VERSION)return;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data}),owners=new WeakMap();
    for(const a of Object.values(st?.agents||{})){
      const memories=a.episodicMemories;
      if(!Array.isArray(memories)){add('episodic_memories_missing',`${a.name} 缺少 episodicMemories array。`,{agentId:a.id});continue;}
      if(memories.length>E.MAX_EPISODIC_MEMORIES)add('episodic_memory_cap_exceeded',`${a.name} 的 episodic memory 超過固定上限。`,{agentId:a.id,count:memories.length,max:E.MAX_EPISODIC_MEMORIES});
      const ids=new Set(),sources=new Set();
      for(const m of memories){
        if(!m||typeof m!=='object'){add('episodic_memory_invalid',`${a.name} 存在無效 memory。`,{agentId:a.id});continue;}
        const priorOwner=owners.get(m);if(priorOwner&&priorOwner!==a.id)add('episodic_memory_cross_agent_shared',`同一個 memory object 不得被不同 Agent 共用。`,{agentId:a.id,otherAgentId:priorOwner,memoryId:m.id});else owners.set(m,a.id);
        if(m.kind!=='episodic')add('episodic_memory_kind_invalid',`${a.name} 的 memory kind 必須為 episodic。`,{agentId:a.id,memoryId:m.id,kind:m.kind});
        if(typeof m.sourceEventId!=='string'||!m.sourceEventId)add('episodic_memory_source_missing',`${a.name} 的 episodic memory 缺少 sourceEventId。`,{agentId:a.id,memoryId:m.id});
        const expectedId=m.sourceEventId?`memory:${a.id}:${m.sourceEventId}`:null;if(!m.id||m.id!==expectedId)add('episodic_memory_id_invalid',`${a.name} 的 memory ID 與 Agent/source event 不一致。`,{agentId:a.id,memoryId:m.id,expectedId});
        if(ids.has(m.id))add('episodic_memory_duplicate_id',`${a.name} 有重複 memory ID。`,{agentId:a.id,memoryId:m.id});ids.add(m.id);
        if(sources.has(m.sourceEventId))add('episodic_memory_duplicate_source',`${a.name} 對同一 source event 不應保存多筆 episodic memory。`,{agentId:a.id,sourceEventId:m.sourceEventId});sources.add(m.sourceEventId);
        if(!Number.isInteger(m.observedTick)||m.observedTick<0||m.observedTick>st.tick)add('episodic_memory_observed_tick_invalid',`${a.name} 的 observedTick 無效。`,{agentId:a.id,memoryId:m.id,observedTick:m.observedTick});
        if(!Number.isInteger(m.lastObservedTick)||m.lastObservedTick<m.observedTick||m.lastObservedTick>st.tick)add('episodic_memory_last_observed_tick_invalid',`${a.name} 的 lastObservedTick 無效。`,{agentId:a.id,memoryId:m.id,lastObservedTick:m.lastObservedTick});
        const isPrivateSocialOutcome=E.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION&&m.episodeKind==='privateSocialOutcome';
        const o=m.observed;
        if(isPrivateSocialOutcome){
          if(o!=null)add('episodic_private_outcome_fake_observation',`${a.name} 的 private social outcome 不應偽裝成 observable world-event projection。`,{agentId:a.id,memoryId:m.id});
        }else{
          if(!o||typeof o!=='object'||typeof o.action!=='string'||!o.action)add('episodic_memory_projection_invalid',`${a.name} 的 episodic memory 缺少 minimal observable projection。`,{agentId:a.id,memoryId:m.id});
          if(o&&Object.prototype.hasOwnProperty.call(o,'data'))add('episodic_memory_event_data_copied',`${a.name} 的 memory 不應複製整份 event.data。`,{agentId:a.id,memoryId:m.id});
        }
        for(const key of ['text','causeIds','affect','salience','utilityInfluence'])if(Object.prototype.hasOwnProperty.call(m,key))add('episodic_memory_out_of_scope_field',`${a.name} 的 v11.13.0 memory 不應提前保存 ${key}。`,{agentId:a.id,memoryId:m.id,key});
        if(Object.prototype.hasOwnProperty.call(m,'appraisal')&&!E.APPRAISAL_SCHEMA_VERSION)add('episodic_memory_out_of_scope_field',`${a.name} 的 v11.13.0 memory 不應提前保存 appraisal。`,{agentId:a.id,memoryId:m.id,key:'appraisal'});
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('memory.episodic',validateLayer,800);
})();
