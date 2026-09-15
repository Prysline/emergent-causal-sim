(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.SOCIAL_BID_SCHEMA_VERSION||'11.12.2-social-bid-lifecycle';
  const baseTick=E.tick,baseReset=E.reset;
  const BID_MEMORY_TICKS=6,REQUESTER_PATIENCE_TICKS=3;
  const INTERACTION_BY_BID_KIND=Object.freeze({talkOffer:'talk',catAffection:'socialAffection',petOffer:'pet'});
  const actionKind=a=>E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;
  if(E.INTENT_ZH){E.INTENT_ZH.awaitResponse='等待社交回應';E.INTENT_ZH.respondSocialBid='回應社交邀請';}

  function normalizeSocialState(st){
    for(const a of Object.values(st?.agents||{})){
      if(!Array.isArray(a.observedSocialBids))a.observedSocialBids=[];
      delete a.pendingInteraction;
    }
    return st;
  }
  function bidEvent(st,bidId){const e=st?.causes?.[bidId];return e?.data?.socialBid===true?e:null;}
  function socialBidInteractionKind(bid){return bid?.data?.interactionKind||INTERACTION_BY_BID_KIND[bid?.data?.bidKind]||null;}
  function newEventsSince(st,marker){const out=[];for(const e of st.events||[]){if(marker&&e.id===marker)break;out.push(e);}return out;}
  function addObservedBid(st,a,bid,observedTick=st.tick){
    if(!a||!bid)return null;
    const existing=a.observedSocialBids.find(x=>x.bidId===bid.id);
    if(existing){existing.expiresTick=Math.max(existing.expiresTick||0,observedTick+BID_MEMORY_TICKS);return existing;}
    const ref={bidId:bid.id,observedTick,expiresTick:observedTick+BID_MEMORY_TICKS};
    a.observedSocialBids.push(ref);return ref;
  }
  function observedBidRefs(st,a){
    return (a?.observedSocialBids||[]).filter(ref=>ref.expiresTick>=st.tick&&bidEvent(st,ref.bidId));
  }
  function newestObservedCatBid(st,a){
    return observedBidRefs(st,a).map(ref=>({ref,bid:bidEvent(st,ref.bidId)})).filter(x=>x.bid?.data?.bidKind==='catAffection'&&x.bid.data.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;
  }
  function awaitIntent(st,a,bid){
    return {id:`intent:${a.id}:${st.tick}:awaitResponse:${bid.id}`,kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId:bid.id},patienceUntilTick:st.tick+REQUESTER_PATIENCE_TICKS};
  }
  function responseIntent(st,a,bid,action,observedTick=st.tick){
    const started=Number.isInteger(action?.started)?action.started:st.tick;
    return {id:`intent:${a.id}:${started}:respondSocialBid:${bid.id}`,kind:'respondSocialBid',createdTick:started,lifecycle:'actionBound',source:{type:'socialBid',bidId:bid.id,observedTick}};
  }
  function promoteResponseIntent(st,a,bid,observedTick=st.tick){
    if(!a?.action||a.action.kind!=='petCat'||a.action.targetAgent!==bid?.data?.bidFrom)return false;
    a.activeIntent=responseIntent(st,a,bid,a.action,observedTick);
    a.action.intentId=a.activeIntent.id;
    return true;
  }
  function injectWaitingActions(st){
    for(const a of Object.values(st.agents||{})){
      if(a.action||a.activeIntent?.kind!=='awaitResponse'||a.activeIntent.lifecycle!=='open')continue;
      a.action={kind:'awaitResponse',phase:'waiting',started:a.activeIntent.createdTick,intentId:a.activeIntent.id,__v1122Transient:true};
      E.installActionKind?.(a.action);
    }
  }
  function injectResponderCompatibility(st,injected){
    for(const a of Object.values(st.agents||{})){
      if(a.kind!=='human'||a.action)continue;
      const pick=newestObservedCatBid(st,a);if(!pick)continue;
      const from=pick.bid.data.bidFrom;
      a.pendingInteraction={type:'cat_request',from,createdTick:pick.ref.observedTick,expiresTick:st.tick+100000,accepted:false,__v1122Transient:true};
      injected.set(a.id,{bidId:pick.bid.id,from,observedTick:pick.ref.observedTick});
    }
  }
  function annotateNewBids(st,newEvents){
    for(const e of newEvents){
      if(e.data?.action!=='seekHuman'||!e.data?.actor||!e.data?.target)continue;
      e.data.socialBid=true;e.data.bidId=e.id;e.data.bidKind='catAffection';e.data.interactionKind='socialAffection';e.data.expectsResponse=true;e.data.bidFrom=e.data.actor;e.data.bidTo=e.data.target;
      const requester=st.agents[e.data.actor],target=st.agents[e.data.target],compat=target?.pendingInteraction;
      const perceived=!!(target&&compat?.type==='cat_request'&&compat.from===requester?.id);
      e.data.perceivedByTarget=perceived;
      // Requester-private waiting follows from making the Bid, not from knowing whether the target perceived it.
      if(requester&&!requester.action)requester.activeIntent=awaitIntent(st,requester,e);
      if(!perceived)continue;
      const ref=addObservedBid(st,target,e,st.tick);
      if(target.action?.kind==='petCat'&&compat?.accepted)promoteResponseIntent(st,target,e,ref.observedTick);
    }
  }
  function promoteInjectedResponses(st,injected){
    for(const [agentId,info] of injected){
      const a=st.agents[agentId],bid=bidEvent(st,info.bidId);if(!a||!bid)continue;
      if(a.action?.kind==='petCat'&&a.action.targetAgent===info.from&&a.pendingInteraction?.accepted)promoteResponseIntent(st,a,bid,info.observedTick);
    }
  }
  function annotateResponses(st,newEvents,responseBefore){
    for(const e of newEvents){
      if(e.data?.action!=='petCat'||!e.data?.actor||!e.data?.target)continue;
      const actor=st.agents[e.data.actor];
      const bidId=responseBefore.get(e.data.actor)||actor?.activeIntent?.source?.type==='socialBid'&&actor.activeIntent.source.bidId;
      if(!bidId)continue;
      const bid=bidEvent(st,bidId);if(!bid||bid.data.bidFrom!==e.data.target)continue;
      e.data.responseToBid=bidId;e.data.bidId=bidId;
      if(actor)actor.observedSocialBids=actor.observedSocialBids.filter(x=>x.bidId!==bidId);
      const requester=st.agents[e.data.target];
      if(requester?.activeIntent?.kind==='awaitResponse'&&requester.activeIntent.source?.bidId===bidId)requester.activeIntent=null;
    }
  }
  function canObserveResponderContext(st,requester,responder){
    if(!requester||!responder||requester.offMap||responder.offMap||E.isSleeping?.(requester)||!requester.position||!responder.position)return false;
    const rr=SP.roomAt?.(st,requester.position),tr=SP.roomAt?.(st,responder.position);if(rr&&tr&&rr!==tr)return false;
    return (SP.manhattan?.(requester.position,responder.position)??Infinity)<=4;
  }
  function privateWaitData(st,a,intent,bid){
    const data={actor:a.id,action:'socialWaitEnded',bidId:bid?.id||intent.source?.bidId||null,intentId:intent.id,visibility:'private',owner:a.id};
    if(!bid)return data;
    data.bidKind=bid.data?.bidKind||null;
    data.interactionKind=socialBidInteractionKind(bid);
    const responder=bid.data?.bidTo&&st.agents?.[bid.data.bidTo];
    if(!canObserveResponderContext(st,a,responder)){data.responderContextObserved=false;return data;}
    data.responderContextObserved=true;
    data.observedResponderActionKind=actionKind(responder);
    data.observedResponderPosture=responder?.posture?.kind||null;
    return data;
  }
  function expirePrivateWaiting(st){
    for(const a of Object.values(st.agents||{})){
      const intent=a.activeIntent;if(intent?.kind!=='awaitResponse'||intent.lifecycle!=='open'||st.tick<intent.patienceUntilTick)continue;
      const bidId=intent.source?.bidId,bid=bidId&&bidEvent(st,bidId);
      E.addEvent(`${a.name}等了一會兒，沒有得到立即回應，便不再等了。`,'normal',bidId?[bidId]:[],privateWaitData(st,a,intent,bid));
      a.activeIntent=null;
    }
  }
  function pruneObservedRefs(st){
    for(const a of Object.values(st.agents||{}))a.observedSocialBids=(a.observedSocialBids||[]).filter(ref=>ref.expiresTick>=st.tick&&bidEvent(st,ref.bidId));
  }
  function removeCompatibilityState(st){for(const a of Object.values(st.agents||{}))delete a.pendingInteraction;}

  E.tick=(...args)=>{
    const st=E.getState(),marker=st.events?.[0]?.id||null,injected=new Map(),responseBefore=new Map();
    for(const a of Object.values(st.agents||{}))if(a.activeIntent?.kind==='respondSocialBid'&&a.activeIntent.source?.bidId)responseBefore.set(a.id,a.activeIntent.source.bidId);
    removeCompatibilityState(st);
    injectWaitingActions(st);
    injectResponderCompatibility(st,injected);
    const result=baseTick(...args),after=E.getState(),newEvents=newEventsSince(after,marker);
    annotateNewBids(after,newEvents);
    promoteInjectedResponses(after,injected);
    annotateResponses(after,newEvents,responseBefore);
    removeCompatibilityState(after);
    pruneObservedRefs(after);
    expirePrivateWaiting(after);
    E.reconcileIntents?.(after);
    return result;
  };
  E.reset=(...args)=>normalizeSocialState(baseReset(...args));

  normalizeSocialState(E.getState());
  Object.assign(E,{SOCIAL_BID_SCHEMA_VERSION:VERSION,BID_MEMORY_TICKS,REQUESTER_PATIENCE_TICKS,INTERACTION_BY_BID_KIND,bidEvent,socialBidInteractionKind,observedBidRefs,newestObservedCatBid,addObservedBid,canObserveSocialResponderContext:canObserveResponderContext});
})();
