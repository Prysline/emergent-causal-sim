(() => {
  const E=window.SimEngine,W=window.SimWorld;
  if(!E||!W?.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION||!E.MEMORY_DELIBERATION_SCHEMA_VERSION||!E.APPRAISAL_SCHEMA_VERSION)return;
  const VERSION=W.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION||'11.13.5-requester-social-outcome-memory';
  const baseTick=E.tick,baseReset=E.reset;
  const RELEVANCE_BASE=W.SOCIAL_OUTCOME_RELEVANCE_BASE??.30;
  const RELEVANCE_SOCIAL_SCALE=W.SOCIAL_OUTCOME_RELEVANCE_SOCIAL_SCALE??.40;
  const CONTEXT_CONGRUENCE=W.SOCIAL_OUTCOME_CONTEXT_CONGRUENCE||{unobserved:-.22,sleeping:-.05,highCommitment:-.12,observedAction:-.28,observedIdle:-.45};
  const HIGH_COMMITMENT_ACTIONS=E.HIGH_COMMITMENT_ACTIONS||new Set(['eat','drinkWater','drinkAlcohol','sleep','restockContainer','externalSupply']);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=(v,d=3)=>{const p=10**d;return Math.round(v*p)/p;};

  function newEventsSince(st,marker){const out=[];for(const e of st.events||[]){if(marker&&e.id===marker)break;out.push(e);}return out.reverse();}
  function contextKind(waitEvent){
    const d=waitEvent?.data||{};
    if(d.responderContextObserved!==true)return 'unobserved';
    const kind=d.observedResponderActionKind||null;
    if(kind==='sleep'||(d.observedResponderPosture==='lying'&&kind==='sleep'))return 'sleeping';
    if(kind&&HIGH_COMMITMENT_ACTIONS.has(kind))return 'highCommitment';
    if(kind)return 'observedAction';
    return 'observedIdle';
  }
  function hasObservableResponse(st,bidId){
    if(!bidId)return false;
    for(const e of Object.values(st?.causes||{}))if(e?.data?.responseToBid===bidId)return true;
    return false;
  }
  function privateOutcomeProjection(st,waitEvent,bid){
    const d=waitEvent?.data||{},kind=contextKind(waitEvent);
    const bidTick=Number.isInteger(bid?.tick)?bid.tick:Math.max(0,(Number(st?.tick)||0)-(Number(E.REQUESTER_PATIENCE_TICKS)||3));
    return {
      kind:'socialNoResponse',
      bidId:bid.id,
      bidKind:bid.data?.bidKind||null,
      counterpartId:bid.data?.bidTo||null,
      waitedTicks:Math.max(0,(Number(st?.tick)||0)-bidTick),
      responderContextObserved:d.responderContextObserved===true,
      observedResponderActionKind:d.responderContextObserved===true?(d.observedResponderActionKind||null):null,
      observedResponderPosture:d.responderContextObserved===true?(d.observedResponderPosture||null):null,
      contextKind:kind
    };
  }
  function appraiseRequesterSocialOutcome(st,a,memory){
    const x=memory?.experienced;if(!a||memory?.episodeKind!=='privateSocialOutcome'||x?.kind!=='socialNoResponse')return null;
    const social=clamp((Number(a.needs?.social)||0)/100,0,1);
    const relevance=round(clamp(RELEVANCE_BASE+RELEVANCE_SOCIAL_SCALE*social,0,1));
    const congruence=round(clamp(Number(CONTEXT_CONGRUENCE[x.contextKind])||0,-1,0));
    const appraisal={
      appraisedTick:memory.observedTick,
      ruleId:`privateSocialNoResponse-${x.contextKind}-v1`,
      relevance,
      goalCongruence:congruence,
      agency:{kind:'unknown'},
      factors:[
        {kind:'unansweredSocialGoal',key:'social',level:round(social),relevanceDelta:relevance},
        {kind:'noResponseObservableContext',contextKind:x.contextKind,responderContextObserved:x.responderContextObserved,congruenceDelta:congruence}
      ]
    };
    memory.appraisal=appraisal;
    return appraisal;
  }
  function rememberRequesterSocialOutcome(st,waitEvent){
    const d=waitEvent?.data||{};
    if(d.action!=='socialWaitEnded'||d.visibility!=='private'||!d.owner||d.owner!==d.actor||!d.bidId)return null;
    const bid=E.bidEvent?.(st,d.bidId);if(!bid||bid.data?.bidKind!=='talkOffer'||bid.data?.bidFrom!==d.actor)return null;
    if(hasObservableResponse(st,bid.id))return null;
    const a=st.agents?.[d.actor];if(!a)return null;
    if(!Array.isArray(a.episodicMemories))a.episodicMemories=[];
    const existing=a.episodicMemories.find(m=>m?.sourceEventId===waitEvent.id);if(existing)return existing;
    const memory={
      id:`memory:${a.id}:${waitEvent.id}`,
      kind:'episodic',
      episodeKind:'privateSocialOutcome',
      sourceEventId:waitEvent.id,
      observedTick:st.tick,
      lastObservedTick:st.tick,
      experienced:privateOutcomeProjection(st,waitEvent,bid)
    };
    a.episodicMemories.push(memory);
    appraiseRequesterSocialOutcome(st,a,memory);
    E.updateAffectFromAppraisal?.(st,a,memory);
    E.pruneAgentMemories?.(st,a);
    return memory;
  }
  function processRequesterSocialOutcomes(st,marker){
    const made=[];
    for(const e of newEventsSince(st,marker)){
      const memory=rememberRequesterSocialOutcome(st,e);
      if(memory)made.push({agentId:e.data.actor,memory});
    }
    return made;
  }

  E.tick=(...args)=>{
    const before=E.getState(),marker=before?.events?.[0]?.id||null;
    const result=baseTick(...args),after=E.getState();
    processRequesterSocialOutcomes(after,marker);
    return result;
  };
  E.reset=(...args)=>baseReset(...args);

  Object.assign(E,{
    SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION:VERSION,
    SOCIAL_OUTCOME_CONTEXT_CONGRUENCE:CONTEXT_CONGRUENCE,
    requesterSocialOutcomeContextKind:contextKind,
    appraiseRequesterSocialOutcome,
    rememberRequesterSocialOutcome,
    processRequesterSocialOutcomes
  });
})();
