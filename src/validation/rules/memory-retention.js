(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.MEMORY_RETENTION_SCHEMA_VERSION)return;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    if(st?.memoryRetention!==undefined||st?.memoryArchive!==undefined)add('global_memory_retention_registry_forbidden','v11.13.3 不應建立 global memory retention / archive registry。');
    for(const a of Object.values(st?.agents||{})){
      const memories=a.episodicMemories||[];
      for(const m of memories){
        for(const key of ['salience','retentionScore','importance','retentionProtected'])if(m&&Object.prototype.hasOwnProperty.call(m,key))add('episodic_memory_retention_mirror_forbidden',`${a.name} 的 salience / retention 必須保持 derived，不應 persistent 保存 ${key}。`,{agentId:a.id,memoryId:m?.id,key});
        const c=E.memoryRetentionComponents?.(st,a,m);
        if(!c||!Number.isFinite(c.score)||c.score<0||c.score>1)add('episodic_memory_salience_invalid',`${a.name} 的 derived memory salience 無效。`,{agentId:a.id,memoryId:m?.id,components:c});
      }
      const f=a.affect,active=Math.abs(Number(f?.valence)||0)+(Number(f?.activation)||0)+(Number(f?.frustration)||0)>0;
      if(active&&f?.source?.memoryId){
        const source=memories.find(m=>m.id===f.source.memoryId);
        if(!source)add('active_affect_source_memory_pruned',`${a.name} 的 active Affect source memory 在 Affect 歸零前不得被 retention pruning 移除。`,{agentId:a.id,memoryId:f.source.memoryId});
        else if(!E.isMemoryRetentionProtected?.(a,source))add('active_affect_source_not_protected',`${a.name} 的 active Affect source memory 應被標記為 derived retention protection。`,{agentId:a.id,memoryId:source.id});
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('memory-retention',validateLayer,1200);
})();
