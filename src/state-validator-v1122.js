(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.bidEvent)return;
  const baseValidate=V.validateState;
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

  function validateState(st){
    const base=baseValidate(st),issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});

    for(const a of Object.values(st?.agents||{})){
      if(own(a,'pendingInteraction'))add('legacy_pending_interaction_persistent',`${a.name} 仍保存 legacy pendingInteraction；v11.12.2 只允許 runtime transient compatibility。`,{agentId:a.id});

      if(!Array.isArray(a.observedSocialBids))add('observed_social_bids_invalid',`${a.name} 的 observedSocialBids 必須是 array。`,{agentId:a.id});
      else{
        const seen=new Set();
        for(const ref of a.observedSocialBids){
          if(!ref||typeof ref!=='object'){add('observed_social_bid_ref_invalid',`${a.name} 有無效的 Social Bid reference。`,{agentId:a.id});continue;}
          if(!ref.bidId||typeof ref.bidId!=='string'){add('observed_social_bid_id_missing',`${a.name} 的 Social Bid reference 缺少 bidId。`,{agentId:a.id});continue;}
          if(seen.has(ref.bidId))add('observed_social_bid_duplicate',`${a.name} 重複保存 Social Bid ${ref.bidId}。`,{agentId:a.id,bidId:ref.bidId});
          seen.add(ref.bidId);
          if(!Number.isInteger(ref.observedTick)||ref.observedTick<0||ref.observedTick>st.tick)add('observed_social_bid_tick_invalid',`${a.name} 的 Social Bid observedTick 無效。`,{agentId:a.id,bidId:ref.bidId,observedTick:ref.observedTick});
          if(!Number.isInteger(ref.expiresTick)||ref.expiresTick<ref.observedTick)add('observed_social_bid_expiry_invalid',`${a.name} 的 Social Bid expiresTick 無效。`,{agentId:a.id,bidId:ref.bidId,expiresTick:ref.expiresTick});
          if(Number.isInteger(ref.expiresTick)&&ref.expiresTick<st.tick)add('observed_social_bid_stale',`${a.name} 保留了已過期的 Social Bid ${ref.bidId}。`,{agentId:a.id,bidId:ref.bidId,expiresTick:ref.expiresTick});
          const bid=E.bidEvent(st,ref.bidId);
          if(!bid)add('observed_social_bid_missing_event',`${a.name} 引用的 Social Bid ${ref.bidId} 已不存在。`,{agentId:a.id,bidId:ref.bidId});
          else if(bid.data?.bidTo!==a.id)add('observed_social_bid_wrong_audience',`${a.name} 保存了不是指向自己的 Social Bid ${ref.bidId}。`,{agentId:a.id,bidId:ref.bidId,bidTo:bid.data?.bidTo});
        }
      }

      const intent=a.activeIntent;
      if(intent?.source?.type==='socialBid'){
        const bidId=intent.source.bidId,bid=E.bidEvent(st,bidId);
        if(!bidId||typeof bidId!=='string')add('social_intent_bid_missing',`${a.name} 的社交 Intent 缺少 bidId。`,{agentId:a.id,intentId:intent.id});
        else if(!bid)add('social_intent_bid_event_missing',`${a.name} 的社交 Intent 引用不存在的 Bid ${bidId}。`,{agentId:a.id,intentId:intent.id,bidId});
        if(intent.kind==='awaitResponse'){
          if(intent.lifecycle!=='open')add('await_response_lifecycle_invalid',`${a.name} 的 awaitResponse Intent 必須是 open lifecycle。`,{agentId:a.id,intentId:intent.id});
          if(!Number.isInteger(intent.patienceUntilTick)||intent.patienceUntilTick<intent.createdTick)add('await_response_patience_invalid',`${a.name} 的 awaitResponse patienceUntilTick 無效。`,{agentId:a.id,intentId:intent.id,patienceUntilTick:intent.patienceUntilTick});
          if(bid&&bid.data?.bidFrom!==a.id)add('await_response_wrong_requester',`${a.name} 正在等待不是自己發出的 Social Bid。`,{agentId:a.id,intentId:intent.id,bidId});
          if(a.action)add('await_response_should_not_persist_action',`${a.name} 的 awaitResponse 不應保存 persistent Action；等待由 open Intent 表示。`,{agentId:a.id,intentId:intent.id,actionKind:a.action.kind});
        }
        if(intent.kind==='respondSocialBid'){
          if(intent.lifecycle!=='actionBound')add('respond_social_bid_lifecycle_invalid',`${a.name} 的 respondSocialBid Intent 必須綁定 Action。`,{agentId:a.id,intentId:intent.id});
          if(bid&&bid.data?.bidTo!==a.id)add('respond_social_bid_wrong_responder',`${a.name} 正在回應不是指向自己的 Social Bid。`,{agentId:a.id,intentId:intent.id,bidId});
          if(!a.action||a.action.kind!=='petCat')add('respond_social_bid_action_invalid',`${a.name} 的 respondSocialBid 必須由 petCat Action 執行。`,{agentId:a.id,intentId:intent.id,actionKind:a.action?.kind});
          if(bid&&a.action?.targetAgent!==bid.data?.bidFrom)add('respond_social_bid_target_mismatch',`${a.name} 的 response Action target 與 Bid requester 不一致。`,{agentId:a.id,intentId:intent.id,bidId,targetAgent:a.action?.targetAgent,bidFrom:bid.data?.bidFrom});
          if(intent.source?.observedTick!=null&&(!Number.isInteger(intent.source.observedTick)||intent.source.observedTick<0||intent.source.observedTick>st.tick))add('respond_social_bid_observed_tick_invalid',`${a.name} 的 respondSocialBid observedTick 無效。`,{agentId:a.id,intentId:intent.id,observedTick:intent.source?.observedTick});
        }
      }
    }

    for(const e of Object.values(st?.causes||{})){
      if(e?.data?.socialBid===true){
        const d=e.data;
        if(d.bidId!==e.id)add('social_bid_id_mismatch',`Social Bid ${e.id} 的 data.bidId 必須等於 event id。`,{eventId:e.id,bidId:d.bidId});
        if(!d.bidKind||typeof d.bidKind!=='string')add('social_bid_kind_missing',`Social Bid ${e.id} 缺少 bidKind。`,{eventId:e.id});
        if(!st.agents?.[d.bidFrom]||!st.agents?.[d.bidTo])add('social_bid_agent_missing',`Social Bid ${e.id} 的 requester / responder 無效。`,{eventId:e.id,bidFrom:d.bidFrom,bidTo:d.bidTo});
        if(d.bidFrom===d.bidTo)add('social_bid_self_target',`Social Bid ${e.id} 不可指向自己。`,{eventId:e.id,bidFrom:d.bidFrom});
        for(const k of ['accepted','pending','expired','fulfilled'])if(own(d,k))add('social_bid_shared_lifecycle_flag',`Social Bid ${e.id} 不應保存共享心理狀態 ${k}。`,{eventId:e.id,field:k});
      }
      if(e?.data?.responseToBid){
        const bid=E.bidEvent(st,e.data.responseToBid);
        if(!bid)add('social_bid_response_missing_source',`事件 ${e.id} 回應的 Social Bid ${e.data.responseToBid} 不存在。`,{eventId:e.id,bidId:e.data.responseToBid});
        else{
          if(e.data.actor!==bid.data.bidTo)add('social_bid_response_actor_mismatch',`事件 ${e.id} 的 responder 與 Social Bid target 不一致。`,{eventId:e.id,bidId:bid.id});
          if(e.data.target!==bid.data.bidFrom)add('social_bid_response_target_mismatch',`事件 ${e.id} 的 response target 與 Social Bid requester 不一致。`,{eventId:e.id,bidId:bid.id});
        }
      }
      if(e?.data?.action==='socialWaitEnded'){
        if(e.data.visibility!=='private'||e.data.owner!==e.data.actor)add('social_wait_visibility_invalid',`socialWaitEnded ${e.id} 必須標示為 requester-private observability。`,{eventId:e.id,actor:e.data.actor,owner:e.data.owner,visibility:e.data.visibility});
        if(e.data.bidId&&!E.bidEvent(st,e.data.bidId))add('social_wait_bid_missing',`socialWaitEnded ${e.id} 引用的 Social Bid ${e.data.bidId} 不存在。`,{eventId:e.id,bidId:e.data.bidId});
      }
    }

    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.validateState=validateState;
})();
