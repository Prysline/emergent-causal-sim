(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W?.AFFECT_SCHEMA_VERSION||!E.APPRAISAL_SCHEMA_VERSION)return;
  const VERSION=W.AFFECT_SCHEMA_VERSION||'11.13.2-short-lived-affect';
  const DECAY=W.AFFECT_DECAY||{valence:.90,activation:.82,frustration:.86};
  const EPSILON=W.AFFECT_EPSILON??.005;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=v=>Math.round(v*1000)/1000;
  const neutral=tick=>W.createNeutralAffect?W.createNeutralAffect(tick):{valence:0,activation:0,frustration:0,lastUpdatedTick:tick,lastDecayTick:tick,source:null};

  function normalizeAgentAffect(a,tick=0){
    if(!a.affect||typeof a.affect!=='object')a.affect=neutral(tick);
    const f=a.affect;
    f.valence=round(clamp(Number(f.valence)||0,-1,1));f.activation=round(clamp(Number(f.activation)||0,0,1));f.frustration=round(clamp(Number(f.frustration)||0,0,1));
    if(!Number.isInteger(f.lastUpdatedTick)||f.lastUpdatedTick<0)f.lastUpdatedTick=tick;if(!Number.isInteger(f.lastDecayTick)||f.lastDecayTick<0)f.lastDecayTick=tick;
    if(f.source!=null&&typeof f.source!=='object')f.source=null;
    if(Math.abs(f.valence)<=EPSILON&&f.activation<=EPSILON&&f.frustration<=EPSILON){f.valence=0;f.activation=0;f.frustration=0;f.source=null;}
    return f;
  }
  function normalizeAffectState(st){for(const a of Object.values(st?.agents||{}))normalizeAgentAffect(a,st?.tick||0);return st;}
  function shrink(v,factor,signed=false){const raw=(Number(v)||0)*factor;if(Math.abs(raw)<=EPSILON)return 0;const next=round(raw);return signed?clamp(next,-1,1):clamp(next,0,1);}
  function decayAgentAffect(a,nextTick){
    const f=normalizeAgentAffect(a,Math.max(0,nextTick-1));f.valence=shrink(f.valence,DECAY.valence,true);f.activation=shrink(f.activation,DECAY.activation,false);f.frustration=shrink(f.frustration,DECAY.frustration,false);f.lastDecayTick=nextTick;if(f.valence===0&&f.activation===0&&f.frustration===0)f.source=null;return f;
  }
  function decayAffectState(st,nextTick=(st?.tick||0)+1){for(const a of Object.values(st?.agents||{}))decayAgentAffect(a,nextTick);return st;}
  function updateAffectFromAppraisal(st,a,memory){
    const p=memory?.appraisal;if(!a||!p)return null;
    const relevance=clamp(Number(p.relevance)||0,0,1),congruence=clamp(Number(p.goalCongruence)||0,-1,1),positiveImpact=relevance*Math.max(0,congruence),negativeImpact=relevance*Math.max(0,-congruence),magnitude=positiveImpact+negativeImpact;
    if(magnitude<=0)return normalizeAgentAffect(a,st?.tick||0);
    const f=normalizeAgentAffect(a,st?.tick||0);f.valence=round(clamp(f.valence+(positiveImpact-negativeImpact)*.55,-1,1));f.activation=round(clamp(f.activation+magnitude*.45,0,1));f.frustration=round(clamp(f.frustration+negativeImpact*.65-positiveImpact*.15,0,1));f.lastUpdatedTick=st?.tick||0;f.source={memoryId:memory.id,sourceEventId:memory.sourceEventId,appraisedTick:p.appraisedTick,appliedTick:st?.tick||0};return f;
  }

  if(E.registerRuntimeHook){
    E.registerRuntimeHook('episodicMemoryCreated','affect.from-appraisal',(ctx)=>{updateAffectFromAppraisal(ctx.state,ctx.agent,ctx.memory);ctx.result=ctx.memory?.appraisal||ctx.result;},400);
    E.registerRuntimeHook('beforeTick','affect.decay',()=>{const st=E.getState();decayAffectState(st,(st?.tick||0)+1);},500);
    E.registerRuntimeHook('afterReset','affect.normalize-reset',()=>normalizeAffectState(E.getState()),400);
  }else{
    const baseTick=E.tick,baseReset=E.reset,priorMemoryCreatedHook=E.onEpisodicMemoryCreated;
    E.onEpisodicMemoryCreated=(st,a,memory)=>{if(typeof priorMemoryCreatedHook==='function')priorMemoryCreatedHook(st,a,memory);updateAffectFromAppraisal(st,a,memory);return memory?.appraisal||null;};
    E.tick=(...args)=>{const st=E.getState();decayAffectState(st,(st?.tick||0)+1);return baseTick(...args);};
    E.reset=(...args)=>normalizeAffectState(baseReset(...args));
  }

  normalizeAffectState(E.getState());
  Object.assign(E,{AFFECT_SCHEMA_VERSION:VERSION,AFFECT_DECAY:DECAY,AFFECT_EPSILON:EPSILON,normalizeAffectState,decayAgentAffect,decayAffectState,updateAffectFromAppraisal});
})();
