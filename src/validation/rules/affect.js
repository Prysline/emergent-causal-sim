(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.AFFECT_SCHEMA_VERSION)return;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    if(st?.affects!==undefined)add('global_affect_registry_forbidden','v11.13.2 不應建立 global affects registry。');
    for(const a of Object.values(st?.agents||{})){
      const f=a.affect;
      if(!f||typeof f!=='object'){add('agent_affect_missing',`${a.name} 缺少 Agent-private current affect。`,{agentId:a.id});continue;}
      if(!Number.isFinite(f.valence)||f.valence< -1||f.valence>1)add('agent_affect_valence_invalid',`${a.name} 的 affect.valence 必須介於 -1～1。`,{agentId:a.id,valence:f.valence});
      if(!Number.isFinite(f.activation)||f.activation<0||f.activation>1)add('agent_affect_activation_invalid',`${a.name} 的 affect.activation 必須介於 0～1。`,{agentId:a.id,activation:f.activation});
      if(!Number.isFinite(f.frustration)||f.frustration<0||f.frustration>1)add('agent_affect_frustration_invalid',`${a.name} 的 affect.frustration 必須介於 0～1。`,{agentId:a.id,frustration:f.frustration});
      for(const key of ['lastUpdatedTick','lastDecayTick'])if(!Number.isInteger(f[key])||f[key]<0||f[key]>(st.tick||0))add('agent_affect_tick_invalid',`${a.name} 的 ${key} 無效。`,{agentId:a.id,key,value:f[key],tick:st.tick});
      const active=Math.abs(Number(f.valence)||0)+(Number(f.activation)||0)+(Number(f.frustration)||0)>0;
      if(active){
        const s=f.source;
        if(!s||typeof s!=='object')add('agent_affect_source_missing',`${a.name} 的非中性 affect 必須保留來源 appraisal reference。`,{agentId:a.id});
        else{
          if(typeof s.memoryId!=='string'||!s.memoryId.startsWith(`memory:${a.id}:`))add('agent_affect_source_memory_invalid',`${a.name} 的 affect source memory 不屬於自己。`,{agentId:a.id,source:s});
          if(typeof s.sourceEventId!=='string'||!s.sourceEventId)add('agent_affect_source_event_missing',`${a.name} 的 affect source 缺少 sourceEventId。`,{agentId:a.id,source:s});
          if(!Number.isInteger(s.appraisedTick)||s.appraisedTick<0||!Number.isInteger(s.appliedTick)||s.appliedTick<0||s.appliedTick>(st.tick||0))add('agent_affect_source_tick_invalid',`${a.name} 的 affect source tick 無效。`,{agentId:a.id,source:s,tick:st.tick});
          const m=(a.episodicMemories||[]).find(x=>x.id===s.memoryId);
          if(m&&(!m.appraisal||m.sourceEventId!==s.sourceEventId||m.appraisal.appraisedTick!==s.appraisedTick))add('agent_affect_source_mismatch',`${a.name} 的 affect source 與 episodic appraisal 不一致。`,{agentId:a.id,memoryId:s.memoryId});
        }
      }else if(f.source!=null)add('neutral_affect_source_stale',`${a.name} 的 neutral affect 不應保留 stale source。`,{agentId:a.id,source:f.source});
      for(const key of ['relationship','relationshipDelta','targetAgentId','intentionality','utilityInfluence'])if(Object.prototype.hasOwnProperty.call(f,key))add('agent_affect_out_of_scope_field',`${a.name} 的 v11.13.2 affect 不應提前保存 ${key}。`,{agentId:a.id,key});
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('affect',validateLayer,1000);
})();
