(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.MEMORY_DELIBERATION_SCHEMA_VERSION)return;
  const FORBIDDEN_KEYS=['memoryPreference','socialMemoryBias','targetAssociation','memoryUtilityDelta','targetPreference','memoryInfluenceScore'];

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const key of ['memoryDeliberation','targetAssociations','socialMemoryBiases'])if(st?.[key]!==undefined)add('global_memory_deliberation_registry_forbidden',`v11.13.4 的 ${key} 必須保持 derived，不應建立 global registry。`,{key});
    for(const a of Object.values(st?.agents||{})){
      for(const key of FORBIDDEN_KEYS)if(Object.prototype.hasOwnProperty.call(a,key))add('agent_memory_deliberation_mirror_forbidden',`${a.name} 不應 persistent 保存 ${key}。`,{agentId:a.id,key});
      for(const m of a.episodicMemories||[])for(const key of FORBIDDEN_KEYS)if(Object.prototype.hasOwnProperty.call(m,key))add('memory_deliberation_mirror_forbidden',`${a.name} 的 episodic memory 不應 persistent 保存 ${key}。`,{agentId:a.id,memoryId:m?.id,key});
      for(const e of E.currentSocialTargetEvaluations?.(st,a)||[]){
        if(!Number.isFinite(e.memoryUtilityDelta)||Math.abs(e.memoryUtilityDelta)>(E.MEMORY_DELIBERATION_MAX_DELTA||18)+.001)add('memory_utility_delta_invalid',`${a.name} 對 ${e.targetAgent} 的 memory utility delta 超出界線。`,{agentId:a.id,targetAgent:e.targetAgent,evaluation:e});
        if(!Number.isFinite(e.finalUtility)||!Number.isFinite(e.targetPreference)||!Number.isFinite(e.pathDistance))add('memory_target_evaluation_invalid',`${a.name} 的 target-aware memory evaluation 含非有限值。`,{agentId:a.id,targetAgent:e.targetAgent,evaluation:e});
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('memory-deliberation',validateLayer,1400);
})();
