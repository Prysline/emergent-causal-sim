(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W?.MEMORY_RETENTION_SCHEMA_VERSION||!E.APPRAISAL_SCHEMA_VERSION)return;
  const VERSION=W.MEMORY_RETENTION_SCHEMA_VERSION||'11.13.3-memory-salience-pruning';
  const WEIGHTS=W.MEMORY_SALIENCE_WEIGHTS||{relevance:.50,affectImpact:.25,recurrence:.15,recency:.10};
  const RECENCY_HALF_LIFE=W.MEMORY_RECENCY_HALF_LIFE||32;
  const RECURRENCE_RELEVANCE_MIN=W.MEMORY_RECURRENCE_RELEVANCE_MIN??.45;
  const RECURRENCE_FULL_COUNT=W.MEMORY_RECURRENCE_FULL_COUNT||3;
  const baseReset=E.reset;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=v=>Math.round(v*1000)/1000;

  function memorySignature(m){
    if(m?.episodeKind==='privateSocialOutcome'){
      const x=m.experienced||{};
      return `privateSocialOutcome|${x.kind||''}|${x.counterpartId||''}`;
    }
    const o=m?.observed||{};
    return `${o.action||''}|${o.actorId||''}|${o.targetId||''}`;
  }
  function activeAffectSource(a,m){
    const f=a?.affect,s=f?.source;
    const active=Math.abs(Number(f?.valence)||0)+(Number(f?.activation)||0)+(Number(f?.frustration)||0)>0;
    return !!(active&&s?.memoryId===m?.id);
  }
  function recurrenceComponent(a,m){
    const p=m?.appraisal,relevance=clamp(Number(p?.relevance)||0,0,1);
    if(relevance<=0)return 0;
    const sig=memorySignature(m);let related=0;
    for(const other of a?.episodicMemories||[]){
      if(other===m||memorySignature(other)!==sig)continue;
      if((Number(other?.appraisal?.relevance)||0)>=RECURRENCE_RELEVANCE_MIN)related++;
    }
    return round(relevance*clamp(related/RECURRENCE_FULL_COUNT,0,1));
  }
  function memoryRetentionComponents(st,a,m){
    const p=m?.appraisal||{};
    const relevance=clamp(Number(p.relevance)||0,0,1);
    const affectImpact=round(relevance*Math.abs(clamp(Number(p.goalCongruence)||0,-1,1)));
    const recurrence=recurrenceComponent(a,m);
    const age=Math.max(0,(Number(st?.tick)||0)-(Number(m?.lastObservedTick)||Number(m?.observedTick)||0));
    const recency=round(1/(1+age/RECENCY_HALF_LIFE));
    const score=round(clamp(relevance*WEIGHTS.relevance+affectImpact*WEIGHTS.affectImpact+recurrence*WEIGHTS.recurrence+recency*WEIGHTS.recency,0,1));
    return {score,relevance:round(relevance),affectImpact,recurrence,recency,protectedByAffect:activeAffectSource(a,m)};
  }
  function memoryRetentionScore(st,a,m){return memoryRetentionComponents(st,a,m).score;}
  function evictionCompare(st,a,left,right){
    const l=memoryRetentionComponents(st,a,left),r=memoryRetentionComponents(st,a,right);
    if(l.score!==r.score)return l.score-r.score;
    const ll=Number(left?.lastObservedTick)||0,rl=Number(right?.lastObservedTick)||0;if(ll!==rl)return ll-rl;
    const lo=Number(left?.observedTick)||0,ro=Number(right?.observedTick)||0;if(lo!==ro)return lo-ro;
    return String(left?.id||left?.sourceEventId||'').localeCompare(String(right?.id||right?.sourceEventId||''));
  }
  function pruneAgentMemoriesBySalience(st,a){
    if(!Array.isArray(a?.episodicMemories))return [];
    const removed=[];
    while(a.episodicMemories.length>(E.MAX_EPISODIC_MEMORIES||64)){
      let candidates=a.episodicMemories.filter(m=>!activeAffectSource(a,m));
      if(!candidates.length)candidates=a.episodicMemories.slice();
      candidates.sort((x,y)=>evictionCompare(st,a,x,y));
      const victim=candidates[0],index=a.episodicMemories.indexOf(victim);
      if(index<0)break;
      removed.push(a.episodicMemories.splice(index,1)[0]);
    }
    return removed;
  }
  function normalizeRetentionState(st){
    for(const a of Object.values(st?.agents||{}))pruneAgentMemoriesBySalience(st,a);
    return st;
  }

  E.reset=(...args)=>normalizeRetentionState(baseReset(...args));
  normalizeRetentionState(E.getState());
  Object.assign(E,{MEMORY_RETENTION_SCHEMA_VERSION:VERSION,MEMORY_SALIENCE_WEIGHTS:WEIGHTS,MEMORY_RECENCY_HALF_LIFE:RECENCY_HALF_LIFE,MEMORY_RECURRENCE_RELEVANCE_MIN:RECURRENCE_RELEVANCE_MIN,MEMORY_RECURRENCE_FULL_COUNT:RECURRENCE_FULL_COUNT,memorySignature,memoryRetentionComponents,memoryRetentionScore,isMemoryRetentionProtected:activeAffectSource,compareMemoryEviction:(st,a,x,y)=>evictionCompare(st,a,x,y),pruneAgentMemoriesBySalience,normalizeMemoryRetentionState:normalizeRetentionState});
})();
