(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP||!E.MEMORY_SCHEMA_VERSION)return;
  const VERSION=W.APPRAISAL_SCHEMA_VERSION||'11.13.1-event-appraisal';
  const priorMemoryCreatedHook=E.onEpisodicMemoryCreated;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=v=>Math.round(v*1000)/1000;
  const normNeed=v=>clamp((Number(v)||0)/100,0,1);

  function agencyFor(a,memory){
    const actorId=memory?.observed?.actorId||null;
    if(actorId===a.id)return {kind:'self'};
    if(actorId)return {kind:'other',agentId:actorId};
    return {kind:memory?.observed?.positionRef?'environment':'unknown'};
  }
  function addFactor(ctx,factor){
    const f={...factor};
    if(Number.isFinite(f.relevanceDelta))ctx.relevance+=f.relevanceDelta;
    if(Number.isFinite(f.congruenceDelta))ctx.goalCongruence+=f.congruenceDelta;
    ctx.factors.push(f);
  }
  function applyRoleBaseline(ctx){
    const {a,memory}=ctx,o=memory.observed||{};
    let roleMatched=false;
    if(o.targetId===a.id){addFactor(ctx,{kind:'directTarget',relevanceDelta:.35});roleMatched=true;}
    if(o.actorId===a.id){addFactor(ctx,{kind:'selfActor',relevanceDelta:.25});roleMatched=true;}
    if(!roleMatched)addFactor(ctx,{kind:'bystander',relevanceDelta:.08});
  }
  function petCatRule(ctx){
    const {a,memory}=ctx,o=memory.observed||{};
    if(o.targetId===a.id){
      const social=normNeed(a.needs?.social);
      addFactor(ctx,{kind:'need',key:'social',level:round(social),relevanceDelta:round(.15+.30*social),congruenceDelta:round(.15+.65*social)});
    }
    if(o.actorId===a.id){
      const affinity=clamp(Number(a.traits?.animalAffinity)||0,0,1);
      addFactor(ctx,{kind:'trait',key:'animalAffinity',level:round(affinity),relevanceDelta:round(.05+.10*affinity),congruenceDelta:round(.05+.15*affinity)});
    }
  }
  function spillRule(ctx){
    const {st,a,memory}=ctx,o=memory.observed||{};
    if(o.actorId===a.id)addFactor(ctx,{kind:'selfCausedSpill',relevanceDelta:.15,congruenceDelta:-.20});
    const p=E.parseMemoryPositionRef?.(o.positionRef);if(!p||!a.position)return;
    const d=SP.manhattan?.(a.position,p);if(!Number.isFinite(d))return;
    let relevanceDelta=0,congruenceDelta=0;
    if(d===0){relevanceDelta=.35;congruenceDelta=-.55;}
    else if(d===1){relevanceDelta=.28;congruenceDelta=-.45;}
    else if(d===2){relevanceDelta=.18;congruenceDelta=-.30;}
    else if(d<=4){relevanceDelta=.08;congruenceDelta=-.12;}
    if(relevanceDelta||congruenceDelta)addFactor(ctx,{kind:'spillProximity',distance:d,relevanceDelta,congruenceDelta});
  }

  const APPRAISAL_RULES=Object.freeze({petCat:petCatRule,spill:spillRule});

  function appraiseEpisodicMemory(st,a,memory){
    if(!memory||memory.kind!=='episodic'||memory.appraisal)return memory?.appraisal||null;
    const ctx={st,a,memory,relevance:0,goalCongruence:0,factors:[]};
    applyRoleBaseline(ctx);
    const action=memory.observed?.action||'',rule=APPRAISAL_RULES[action]||null;
    if(rule)rule(ctx);
    const appraisal={
      appraisedTick:memory.observedTick,
      ruleId:rule?`${action}-v1`:'baseline-v1',
      relevance:round(clamp(ctx.relevance,0,1)),
      goalCongruence:round(clamp(ctx.goalCongruence,-1,1)),
      agency:agencyFor(a,memory),
      factors:ctx.factors
    };
    memory.appraisal=appraisal;
    return appraisal;
  }

  E.onEpisodicMemoryCreated=(st,a,memory)=>{
    if(typeof priorMemoryCreatedHook==='function')priorMemoryCreatedHook(st,a,memory);
    return appraiseEpisodicMemory(st,a,memory);
  };

  Object.assign(E,{APPRAISAL_SCHEMA_VERSION:VERSION,APPRAISAL_RULES,appraiseEpisodicMemory});
})();
