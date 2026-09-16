(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.APPRAISAL_SCHEMA_VERSION)return;
  const AGENCY_KINDS=new Set(['self','other','environment','unknown']);

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const a of Object.values(st?.agents||{}))for(const m of a.episodicMemories||[]){
      const p=m?.appraisal;
      if(!p||typeof p!=='object'){add('episodic_appraisal_missing',`${a.name} 的 episodic memory 缺少 v11.13.1 appraisal。`,{agentId:a.id,memoryId:m?.id});continue;}
      if(!Number.isInteger(p.appraisedTick)||p.appraisedTick!==m.observedTick)add('episodic_appraisal_tick_invalid',`${a.name} 的 appraisal 必須固定在 memory 首次形成的 observedTick。`,{agentId:a.id,memoryId:m.id,appraisedTick:p.appraisedTick,observedTick:m.observedTick});
      if(typeof p.ruleId!=='string'||!p.ruleId)add('episodic_appraisal_rule_missing',`${a.name} 的 appraisal 缺少 audited ruleId。`,{agentId:a.id,memoryId:m.id});
      if(!Number.isFinite(p.relevance)||p.relevance<0||p.relevance>1)add('episodic_appraisal_relevance_invalid',`${a.name} 的 appraisal relevance 必須介於 0～1。`,{agentId:a.id,memoryId:m.id,relevance:p.relevance});
      if(!Number.isFinite(p.goalCongruence)||p.goalCongruence< -1||p.goalCongruence>1)add('episodic_appraisal_congruence_invalid',`${a.name} 的 appraisal goalCongruence 必須介於 -1～1。`,{agentId:a.id,memoryId:m.id,goalCongruence:p.goalCongruence});
      const agency=p.agency;if(!agency||typeof agency!=='object'||!AGENCY_KINDS.has(agency.kind))add('episodic_appraisal_agency_invalid',`${a.name} 的 appraisal agency 無效。`,{agentId:a.id,memoryId:m.id,agency});
      else{
        if(agency.kind==='self'&&agency.agentId!=null)add('episodic_appraisal_self_agency_leak',`${a.name} 的 self agency 不應另存 agentId。`,{agentId:a.id,memoryId:m.id,agency});
        if(agency.kind==='other'&&(!agency.agentId||agency.agentId===a.id))add('episodic_appraisal_other_agency_invalid',`${a.name} 的 other agency 必須指向另一個可觀察 actor。`,{agentId:a.id,memoryId:m.id,agency});
      }
      if(!Array.isArray(p.factors)||!p.factors.length)add('episodic_appraisal_factors_missing',`${a.name} 的 appraisal 必須保留至少一個可觀測／private-context factor。`,{agentId:a.id,memoryId:m.id});
      else for(const f of p.factors){
        if(!f||typeof f!=='object'||typeof f.kind!=='string'||!f.kind)add('episodic_appraisal_factor_invalid',`${a.name} 的 appraisal factor 無效。`,{agentId:a.id,memoryId:m.id,factor:f});
        for(const key of ['eventData','rawEvent','text','causeIds','wakeRoll','utility'])if(f&&Object.prototype.hasOwnProperty.call(f,key))add('episodic_appraisal_private_leak',`${a.name} 的 appraisal factor 不得保存 ${key}。`,{agentId:a.id,memoryId:m.id,key});
      }
      for(const key of ['valence','affect','emotion','anger','fear','intentionality','relationshipDelta','utilityInfluence'])if(Object.prototype.hasOwnProperty.call(p,key))add('episodic_appraisal_out_of_scope_field',`${a.name} 的 v11.13.1 appraisal 不應提前保存 ${key}。`,{agentId:a.id,memoryId:m.id,key});
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.registerValidationLayer('appraisal',validateLayer,900);
})();
