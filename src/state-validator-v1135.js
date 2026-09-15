(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION)return;
  const baseValidate=V.validateState;
  const CONTEXTS=new Set(['unobserved','sleeping','highCommitment','observedAction','observedIdle']);
  const FORBIDDEN_PRIVATE=['intentionalIgnore','ignored','rejected','rejectedBy','disliked','motive','responderIntent','responderUtility','responderAffect','responderMemory','relationship','responseScore','agency'];
  const FORBIDDEN_MIRRORS=['socialOutcomeMemories','noResponseMemories','rejectionScore','ignoredBy','socialOutcomeScore'];

  function validateState(st){
    const base=baseValidate(st),issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const key of ['socialOutcomeMemories','privateSocialOutcomeRegistry','noResponseRegistry'])if(st?.[key]!==undefined)add('global_social_outcome_registry_forbidden',`${key} 不應成為第二份 historical truth。`,{key});
    for(const a of Object.values(st?.agents||{})){
      for(const key of FORBIDDEN_MIRRORS)if(Object.prototype.hasOwnProperty.call(a,key))add('agent_social_outcome_mirror_forbidden',`${a.name} 不應 persistent 保存 ${key}。`,{agentId:a.id,key});
      for(const m of a.episodicMemories||[]){
        if(m?.episodeKind!=='privateSocialOutcome')continue;
        const x=m.experienced;
        if(!x||typeof x!=='object'||x.kind!=='socialNoResponse')add('private_social_outcome_projection_invalid',`${a.name} 的 private social outcome 缺少 experienced projection。`,{agentId:a.id,memoryId:m?.id});
        if(!x?.bidId||x.bidKind!=='talkOffer'||!x.counterpartId||x.counterpartId===a.id)add('private_social_outcome_identity_invalid',`${a.name} 的 private social outcome bid/counterpart 無效。`,{agentId:a.id,memoryId:m?.id,experienced:x});
        if(!Number.isInteger(x?.waitedTicks)||x.waitedTicks<0)add('private_social_outcome_wait_invalid',`${a.name} 的 private social outcome waitedTicks 無效。`,{agentId:a.id,memoryId:m?.id,waitedTicks:x?.waitedTicks});
        if(typeof x?.responderContextObserved!=='boolean'||!CONTEXTS.has(x?.contextKind))add('private_social_outcome_context_invalid',`${a.name} 的 private social outcome context 無效。`,{agentId:a.id,memoryId:m?.id,experienced:x});
        if(x?.responderContextObserved!==true&&(x?.observedResponderActionKind!=null||x?.observedResponderPosture!=null))add('private_social_outcome_unobserved_leak',`${a.name} 看不到 responder context 時不應保存 responder action/posture。`,{agentId:a.id,memoryId:m?.id});
        for(const key of FORBIDDEN_PRIVATE)if(x&&Object.prototype.hasOwnProperty.call(x,key))add('private_social_outcome_inference_leak',`${a.name} 的 private social outcome 不得保存 ${key}。`,{agentId:a.id,memoryId:m?.id,key});
        for(const key of FORBIDDEN_MIRRORS)if(Object.prototype.hasOwnProperty.call(m,key))add('memory_social_outcome_mirror_forbidden',`${a.name} 的 private social outcome 不應 persistent 保存 ${key}。`,{agentId:a.id,memoryId:m?.id,key});
        const p=m?.appraisal;
        if(p?.agency?.kind!=='unknown')add('private_social_outcome_agency_overreach',`${a.name} 的 no-response appraisal 不得把 counterpart 自動當成 causal agent。`,{agentId:a.id,memoryId:m?.id,agency:p?.agency});
        const expected=E.SOCIAL_OUTCOME_CONTEXT_CONGRUENCE?.[x?.contextKind];
        if(Number.isFinite(expected)&&Math.abs((Number(p?.goalCongruence)||0)-expected)>.001)add('private_social_outcome_congruence_mismatch',`${a.name} 的 no-response appraisal 應只依 audited observable-context band。`,{agentId:a.id,memoryId:m?.id,expected,actual:p?.goalCongruence});
        const source=st.causes?.[m.sourceEventId];
        if(source&&(source.data?.action!=='socialWaitEnded'||source.data?.visibility!=='private'||source.data?.owner!==a.id||source.data?.actor!==a.id||source.data?.bidId!==x?.bidId))add('private_social_outcome_source_invalid',`${a.name} 的 private outcome source 若仍在 hot cause state，必須是自己的 socialWaitEnded。`,{agentId:a.id,memoryId:m?.id,sourceEventId:m.sourceEventId});
        const bid=E.bidEvent?.(st,x?.bidId);
        if(bid&&(bid.data?.bidKind!=='talkOffer'||bid.data?.bidFrom!==a.id||bid.data?.bidTo!==x?.counterpartId))add('private_social_outcome_bid_invalid',`${a.name} 的 private outcome 必須指向自己發出的 talkOffer。`,{agentId:a.id,memoryId:m?.id,bidId:x?.bidId});
        if(x?.bidId&&Object.values(st.causes||{}).some(e=>e?.data?.responseToBid===x.bidId))add('private_social_outcome_response_conflict',`${a.name} 的同一 talkOffer 已有 observable response，不得同時保存 no-response private outcome。`,{agentId:a.id,memoryId:m?.id,bidId:x.bidId});
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }
  V.validateState=validateState;
})();
