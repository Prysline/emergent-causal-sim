(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION)return;
  const baseValidate=V.validateState;
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
  const RESPONSE_ACTION={acceptTalk:'engage',briefTalkReply:'brief',declineTalk:'decline'};

  function validateState(st){
    const base=baseValidate(st),issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    const responsesByOffer=new Map(),talksByOffer=new Map();

    for(const a of Object.values(st?.agents||{})){
      for(const key of ['talkResponseDecision','talkResponseScore','talkResponseUtility','socialResponsePriority','ignoredBy']){
        if(own(a,key))add('talk_response_private_cache_forbidden',`${a.name} 不應保存 ${key}；Human talk response 必須保持 derived。`,{agentId:a.id,field:key});
      }
      for(const m of a.episodicMemories||[]){
        const source=st.causes?.[m.sourceEventId];
        if(source?.data?.action==='socialWaitEnded')add('no_response_memory_boundary_violation',`${a.name} 不應把 private socialWaitEnded 直接當成 episodic world memory。`,{agentId:a.id,memoryId:m.id,eventId:m.sourceEventId});
      }
    }

    for(const e of Object.values(st?.causes||{})){
      const d=e?.data||{};
      if(d.action==='talkOffer'){
        if(d.socialBid!==true||d.bidKind!=='talkOffer')add('talk_offer_bid_invalid',`talkOffer ${e.id} 必須是 bidKind=talkOffer 的 Social Bid。`,{eventId:e.id});
        if(d.actor!==d.bidFrom||d.target!==d.bidTo)add('talk_offer_direction_mismatch',`talkOffer ${e.id} 的 actor/target 必須與 bidFrom/bidTo 一致。`,{eventId:e.id});
        if(d.actor===d.target||st.agents?.[d.actor]?.kind!=='human'||st.agents?.[d.target]?.kind!=='human')add('talk_offer_species_invalid',`talkOffer ${e.id} 必須由一名 human 指向另一名 human。`,{eventId:e.id,actor:d.actor,target:d.target});
        if(d.perceivedByTarget!==true)add('talk_offer_perception_invalid',`talkOffer ${e.id} 只應在 responder 實際可感知時建立。`,{eventId:e.id});
      }
      if(RESPONSE_ACTION[d.action]){
        const expected=RESPONSE_ACTION[d.action],offer=E.bidEvent?.(st,d.responseToBid);
        if(d.talkResponse!==expected)add('talk_response_label_mismatch',`事件 ${e.id} 的 ${d.action} 與 talkResponse=${d.talkResponse} 不一致。`,{eventId:e.id});
        if(!offer||offer.data?.bidKind!=='talkOffer')add('talk_response_offer_missing',`事件 ${e.id} 必須回應有效的 talkOffer。`,{eventId:e.id,bidId:d.responseToBid});
        else if(offer.data.bidFrom!==d.target||offer.data.bidTo!==d.actor)add('talk_response_direction_mismatch',`事件 ${e.id} 的 responder/requester 方向與 talkOffer 不一致。`,{eventId:e.id,bidId:offer.id});
        if(d.responseToBid){const list=responsesByOffer.get(d.responseToBid)||[];list.push(e);responsesByOffer.set(d.responseToBid,list);}
        for(const key of ['responseScore','socialNeed','socialTrait','affect','relationship','intentionalIgnore'])if(own(d,key))add('talk_response_private_payload_leak',`事件 ${e.id} 不應洩漏 responder-private ${key}。`,{eventId:e.id,field:key});
      }
      if(d.action==='talk'&&d.responseToBid){
        const offer=E.bidEvent?.(st,d.responseToBid);
        if(!offer||offer.data?.bidKind!=='talkOffer')add('talk_success_offer_missing',`talk ${e.id} 引用的 talkOffer ${d.responseToBid} 不存在。`,{eventId:e.id,bidId:d.responseToBid});
        if(d.talkResponse!=='engage')add('talk_success_response_invalid',`由 talkOffer 形成的 full talk ${e.id} 必須是 engage outcome。`,{eventId:e.id,talkResponse:d.talkResponse});
        const list=talksByOffer.get(d.responseToBid)||[];list.push(e);talksByOffer.set(d.responseToBid,list);
      }
      if(d.action==='socialWaitEnded'&&d.bidKind==='talkOffer'){
        for(const key of ['ignored','intentionalIgnore','disliked','rejectedBy'])if(own(d,key))add('talk_no_response_intent_inference_forbidden',`no-response private outcome ${e.id} 不得直接保存 ${key} 等意圖推定。`,{eventId:e.id,field:key});
        if(d.responderContextObserved===true&&own(d,'observedResponderActionKind')&&d.observedResponderActionKind!==null&&typeof d.observedResponderActionKind!=='string')add('talk_no_response_context_invalid',`no-response ${e.id} 的 observedResponderActionKind 必須是字串或 null。`,{eventId:e.id});
      }
    }

    for(const [offerId,responses] of responsesByOffer){
      if(responses.length!==1)add('talk_offer_response_count_invalid',`talkOffer ${offerId} 應只有一個 observable responder outcome。`,{bidId:offerId,count:responses.length});
      const response=responses[0],talks=talksByOffer.get(offerId)||[];
      if(response?.data?.talkResponse==='engage'&&talks.length!==1)add('talk_engage_success_missing',`talkOffer ${offerId} 的 engage response 應對應一個 full talk。`,{bidId:offerId,talkCount:talks.length});
      if(['brief','decline'].includes(response?.data?.talkResponse)&&talks.length)add('talk_shallow_rejection_success_conflict',`talkOffer ${offerId} 的 ${response.data.talkResponse} 不可同時產生 full talk。`,{bidId:offerId,talkCount:talks.length});
    }

    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.validateState=validateState;
})();
