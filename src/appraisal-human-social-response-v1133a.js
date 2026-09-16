(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W?.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION||!E.APPRAISAL_SCHEMA_VERSION)return;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=v=>Math.round(v*1000)/1000;
  const normNeed=v=>clamp((Number(v)||0)/100,0,1);
  const SHALLOW_ACTIONS=new Set(['briefTalkReply','declineTalk']);

  function agencyFor(a,memory){
    const actorId=memory?.observed?.actorId||null;
    if(actorId===a.id)return {kind:'self'};
    if(actorId)return {kind:'other',agentId:actorId};
    return {kind:memory?.observed?.positionRef?'environment':'unknown'};
  }
  function baselineFor(a,memory){
    const o=memory?.observed||{};
    if(o.targetId===a.id)return {relevance:.35,factors:[{kind:'directTarget',relevanceDelta:.35}]};
    if(o.actorId===a.id)return {relevance:.25,factors:[{kind:'selfActor',relevanceDelta:.25}]};
    return {relevance:.08,factors:[{kind:'bystander',relevanceDelta:.08}]};
  }
  function appraiseHumanSocialResponseMemory(st,a,memory){
    const action=memory?.observed?.action||'';
    if(!memory||memory.kind!=='episodic'||!['acceptTalk','talk','briefTalkReply','declineTalk'].includes(action))return memory?.appraisal||null;
    const o=memory.observed||{},base=baselineFor(a,memory),factors=[...base.factors];
    let relevance=base.relevance,goalCongruence=0;
    if(action==='acceptTalk'&&o.targetId===a.id){
      const social=normNeed(a.needs?.social),extra=round(.18+.17*social),positive=round(.28+.42*social);relevance=round(relevance+extra);goalCongruence=positive;
      factors.push({kind:'socialBidAccepted',key:'social',level:round(social),relevanceDelta:extra,congruenceDelta:positive});
    }else if(action==='talk'&&o.targetId===a.id){
      const social=normNeed(a.needs?.social),extra=round(.15+.18*social),positive=round(.24+.40*social);relevance=round(relevance+extra);goalCongruence=positive;
      factors.push({kind:'fullConversation',key:'social',level:round(social),relevanceDelta:extra,congruenceDelta:positive});
    }else if(SHALLOW_ACTIONS.has(action)&&o.targetId===a.id){
      relevance=round(relevance+.13);goalCongruence=-.14;factors.push({kind:'shallowSocialRejection',relevanceDelta:.13,congruenceDelta:-.14});
    }
    memory.appraisal={appraisedTick:memory.observedTick,ruleId:`${action}-v1`,relevance:round(clamp(relevance,0,1)),goalCongruence:round(clamp(goalCongruence,-1,1)),agency:agencyFor(a,memory),factors};
    return memory.appraisal;
  }

  if(!E.registerRuntimeHook)throw new Error('appraisal-human-social-response-v1133a.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('episodicMemoryCreated','appraisal.human-social',(ctx)=>{if(['acceptTalk','talk','briefTalkReply','declineTalk'].includes(ctx.memory?.observed?.action))ctx.result=appraiseHumanSocialResponseMemory(ctx.state,ctx.agent,ctx.memory);},300);

  Object.assign(E,{HUMAN_SOCIAL_APPRAISAL_ACTIONS:Object.freeze(['acceptTalk','talk','briefTalkReply','declineTalk']),appraiseHumanSocialResponseMemory});
})();
