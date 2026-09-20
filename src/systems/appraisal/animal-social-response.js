(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W?.SOCIAL_RESPONSE_SCHEMA_VERSION||!E.APPRAISAL_SCHEMA_VERSION)return;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=v=>Math.round(v*1000)/1000;
  const normNeed=v=>clamp((Number(v)||0)/100,0,1);

  function agencyFor(a,memory){
    const actorId=memory?.observed?.actorId||null;
    if(actorId===a.id)return {kind:'self'};
    if(actorId)return {kind:'other',agentId:actorId};
    return {kind:memory?.observed?.positionRef?'environment':'unknown'};
  }
  function appraiseAvoidPetMemory(st,a,memory){
    if(!memory||memory.kind!=='episodic'||memory.observed?.action!=='avoidPet')return memory?.appraisal||null;
    const o=memory.observed||{};let relevance=.08,goalCongruence=0,factors=[{kind:'bystander',relevanceDelta:.08}];
    if(o.actorId===a.id){
      const social=normNeed(a.needs?.social);relevance=.55;goalCongruence=round(.20+.45*(1-social));
      factors=[{kind:'selfActor',relevanceDelta:.25},{kind:'declinedUnwantedContact',key:'social',level:round(social),relevanceDelta:.30,congruenceDelta:goalCongruence}];
    }else if(o.targetId===a.id){
      const affinity=clamp(Number(a.traits?.animalAffinity)||0,0,1),extraRelevance=round(.10+.15*affinity),negative=round(.18+.32*affinity);
      relevance=round(.35+extraRelevance);goalCongruence=-negative;
      factors=[{kind:'directTarget',relevanceDelta:.35},{kind:'petOfferDeclined',key:'animalAffinity',level:round(affinity),relevanceDelta:extraRelevance,congruenceDelta:-negative}];
    }
    memory.appraisal={appraisedTick:memory.observedTick,ruleId:'avoidPet-v1',relevance:round(clamp(relevance,0,1)),goalCongruence:round(clamp(goalCongruence,-1,1)),agency:agencyFor(a,memory),factors};
    return memory.appraisal;
  }

  if(!E.registerRuntimeHook)throw new Error('systems/appraisal/animal-social-response.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('episodicMemoryCreated','appraisal.social-response',(ctx)=>{if(ctx.memory?.observed?.action==='avoidPet')ctx.result=appraiseAvoidPetMemory(ctx.state,ctx.agent,ctx.memory);},200);

  Object.assign(E,{SOCIAL_RESPONSE_APPRAISAL_RULE_ID:'avoidPet-v1',appraiseAvoidPetMemory});
})();
