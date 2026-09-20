(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.RELATIONSHIP_SCHEMA_VERSION)return;
  const FORBIDDEN_GLOBAL=['relationships','pairRelationships','relationshipRegistry'];
  const FORBIDDEN_ENTRY=['trust','love','hate','friendshipScore','relationshipScore','confidence','history','evidenceIds','memoryIds','lastEvidenceMemoryId'];
  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const key of FORBIDDEN_GLOBAL)if(st?.[key]!==undefined)add('global_relationship_registry_forbidden',`${key} 不應成為第二份 Relationship truth。`,{key});
    for(const a of Object.values(st?.agents||{})){
      if(!a.relationships||typeof a.relationships!=='object'||Array.isArray(a.relationships)){add('relationship_map_invalid',`${a.name} 的 relationships 必須是 Agent-local map。`,{agentId:a.id});continue;}
      for(const [counterpartId,r] of Object.entries(a.relationships)){
        if(counterpartId===a.id)add('relationship_self_reference',`${a.name} 不應保存對自己的 Relationship。`,{agentId:a.id,counterpartId});
        if(!st.agents?.[counterpartId])add('relationship_counterpart_missing',`${a.name} 的 Relationship 指向不存在的 Agent ${counterpartId}。`,{agentId:a.id,counterpartId});
        if(!r||typeof r!=='object'||Array.isArray(r)){add('relationship_entry_invalid',`${a.name} → ${counterpartId} 的 Relationship entry 無效。`,{agentId:a.id,counterpartId});continue;}
        if(!Number.isFinite(r.familiarity)||r.familiarity<0||r.familiarity>1)add('relationship_familiarity_invalid',`${a.name} → ${counterpartId} 的 familiarity 必須介於 0～1。`,{agentId:a.id,counterpartId,value:r.familiarity});
        if(!Number.isFinite(r.affinity)||r.affinity<-1||r.affinity>1)add('relationship_affinity_invalid',`${a.name} → ${counterpartId} 的 affinity 必須介於 -1～1。`,{agentId:a.id,counterpartId,value:r.affinity});
        if(!Number.isInteger(r.lastUpdatedTick)||r.lastUpdatedTick<0||r.lastUpdatedTick>(Number(st.tick)||0))add('relationship_tick_invalid',`${a.name} → ${counterpartId} 的 lastUpdatedTick 無效。`,{agentId:a.id,counterpartId,value:r.lastUpdatedTick});
        for(const key of FORBIDDEN_ENTRY)if(Object.prototype.hasOwnProperty.call(r,key))add('relationship_extra_truth_forbidden',`${a.name} → ${counterpartId} 不應 persistent 保存 ${key}。`,{agentId:a.id,counterpartId,key});
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('relationship',validateLayer,1600);
})();
