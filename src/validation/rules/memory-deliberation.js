(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.MEMORY_DELIBERATION_SCHEMA_VERSION)return;
  const FORBIDDEN_KEYS=['memoryPreference','socialMemoryBias','targetAssociation','memoryUtilityDelta','targetPreference','memoryInfluenceScore'];

  // Derived target evaluation validity is enforced at E.targetEvaluation().
  // Routine state validation must not recompute social candidates and Spatial routes.
  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const key of ['memoryDeliberation','targetAssociations','socialMemoryBiases'])if(st?.[key]!==undefined)add('global_memory_deliberation_registry_forbidden',`v11.13.4 的 ${key} 必須保持 derived，不應建立 global registry。`,{key});
    for(const a of Object.values(st?.agents||{})){
      for(const key of FORBIDDEN_KEYS)if(Object.prototype.hasOwnProperty.call(a,key))add('agent_memory_deliberation_mirror_forbidden',`${a.name} 不應 persistent 保存 ${key}。`,{agentId:a.id,key});
      for(const m of a.episodicMemories||[])for(const key of FORBIDDEN_KEYS)if(Object.prototype.hasOwnProperty.call(m,key))add('memory_deliberation_mirror_forbidden',`${a.name} 的 episodic memory 不應 persistent 保存 ${key}。`,{agentId:a.id,memoryId:m?.id,key});
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('memory-deliberation',validateLayer,1400);
})();
