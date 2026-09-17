(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.SOCIAL_BID_SCHEMA_VERSION||'11.12.2-social-bid-lifecycle';
  const BID_MEMORY_TICKS=6,REQUESTER_PATIENCE_TICKS=3;
  const INTERACTION_BY_BID_KIND=Object.freeze({talkOffer:'talk',animalAffection:'socialAffection',petOffer:'pet'});
  const actionKind=a=>E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;
  if(E.INTENT_ZH){E.INTENT_ZH.awaitResponse='等待社交回應';E.INTENT_ZH.respondSocialBid='回應社交邀請';}

  function normalizeSocialState(st){
    for(const a of Object.values(st?.agents||{})){
      if(!Array.isArray(a.observedSocialBids))a.observedSocialBids=[];
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
  function observedBidRefs(st,a){return (a?.observedSocialBids||[]).filter(ref=>ref.expiresTick>=st.tick&&bidEvent(st,ref.bidId));}
  function newestObservedAnimalBid(st,a){return observedBidRefs(st,a).map(ref=>({ref,bid:bidEvent(st,ref.bidId)})).filter(x=>x.bid?.data?.bidKind==='animalAffection'&&x.bid.data.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;}
  function socialBidDecisionOptions(st,a){if(a?.kind!=='human'||a.action)return[];const pick=newestObservedAnimalBid(st,a);if(!pick)return[];const target=st.agents?.[pick.bid?.data?.bidFrom];if(!target||target.offMap||!E.canPetAnimal?.(a,target))return[];return[{id:'petAnimal',targetAgent:target.id,score:72+(a.traits?.animalAffinity||0)*20,why:['動物剛剛主動尋求互動','回應已形成短期社交動機'],socialBidId:pick.bid.id,socialBidObservedTick:pick.ref.observedTick}];}
  function awaitIntent(st,a,bid){return {id:`intent:${a.id}:${st.tick}:awaitResponse:${bid.id}`,kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId:bid.id},patienceUntilTick:st.tick+REQUESTER_PATIENCE_TICKS};}
  function responseIntent(st,a,bid,action,observedTick=st.tick){const started=Number.isInteger(action?.started)?action.started:st.tick;return {id:`intent:${a.id}:${started}:respondSocialBid:${bid.id}`,kind:'respondSocialBid',createdTick:started,lifecycle:'actionBound',source:{type:'socialBid',bidId:bid.id,observedTick}};}
  function promoteResponseIntent(st,a,bid,observedTick=st.tick){
    if(!a?.action||a.action.kind!=='petAnimal'||a.action.targetAgent!==bid?.data?.bidFrom)return false;
    a.activeIntent=responseIntent(st,a,bid,a.action,observedTick);a.action.intentId=a.activeIntent.id;return true;
  }
  function injectWaitingActions(st){
    for(const a of Object.values(st.agents||{})){
      if(a.action||a.activeIntent?.kind!=='awaitResponse'||a.activeIntent.lifecycle!=='open')continue;
      a.action={kind:'awaitResponse',phase:'waiting',started:a.activeIntent.createdTick,intentId:a.activeIntent.id,__v1122Transient:true};
    }
  }
  function annotateNewBids(st,newEvents){
    for(const e of newEvents){
      if(e.data?.action!=='seekHuman'||!e.data?.actor||!e.data?.target)continue;
      e.data.socialBid=true;e.data.bidId=e.id;e.data.bidKind='animalAffection';e.data.interactionKind='socialAffection';e.data.expectsResponse=true;e.data.bidFrom=e.data.actor;e.data.bidTo=e.data.target;
      const requester=st.agents[e.data.actor],target=st.agents[e.data.target];
      const perceived=e.data?.perceivedByTarget===true;e.data.perceivedByTarget=perceived;
      if(requester&&!requester.action)requester.activeIntent=awaitIntent(st,requester,e);
      if(!perceived)continue;
      addObservedBid(st,target,e,st.tick);
    }
  }
  function promoteChosenResponses(st){for(const a of Object.values(st.agents||{})){const pick=st.thoughts?.[a.id]?.pick,bidId=pick?.socialBidId;if(!bidId||a.action?.kind!=='petAnimal'||a.action.started!==st.tick)continue;const bid=bidEvent(st,bidId);if(!bid||bid.data?.bidTo!==a.id||a.action.targetAgent!==bid.data?.bidFrom)continue;promoteResponseIntent(st,a,bid,pick.socialBidObservedTick??st.tick);}}
  function annotateResponses(st,newEvents,responseBefore){
    for(const e of newEvents){
      if(e.data?.action!=='petAnimal'||!e.data?.actor||!e.data?.target)continue;
      const actor=st.agents[e.data.actor];const bidId=responseBefore.get(e.data.actor)||actor?.activeIntent?.source?.type==='socialBid'&&actor.activeIntent.source.bidId;if(!bidId)continue;
      const bid=bidEvent(st,bidId);if(!bid||bid.data.bidFrom!==e.data.target)continue;
      e.data.responseToBid=bidId;e.data.bidId=bidId;if(actor)actor.observedSocialBids=actor.observedSocialBids.filter(x=>x.bidId!==bidId);
      const requester=st.agents[e.data.target];if(requester?.activeIntent?.kind==='awaitResponse'&&requester.activeIntent.source?.bidId===bidId)requester.activeIntent=null;
    }
  }
  function canObserveResponderContext(st,requester,responder){
    if(!requester||!responder||requester.offMap||responder.offMap||E.isSleeping?.(requester)||!requester.position||!responder.position)return false;
    const rr=SP.roomAt?.(st,requester.position),tr=SP.roomAt?.(st,responder.position);if(rr&&tr&&rr!==tr)return false;
    return (SP.manhattan?.(requester.position,responder.position)??Infinity)<=4;
  }
  function privateWaitData(st,a,intent,bid){
    const data={actor:a.id,action:'socialWaitEnded',bidId:bid?.id||intent.source?.bidId||null,intentId:intent.id,visibility:'private',owner:a.id};if(!bid)return data;
    data.bidKind=bid.data?.bidKind||null;data.interactionKind=socialBidInteractionKind(bid);const responder=bid.data?.bidTo&&st.agents?.[bid.data?.bidTo];
    if(!canObserveResponderContext(st,a,responder)){data.responderContextObserved=false;return data;}
    data.responderContextObserved=true;data.observedResponderActionKind=actionKind(responder);data.observedResponderPosture=responder?.posture?.kind||null;return data;
  }
  function expirePrivateWaiting(st){
    for(const a of Object.values(st.agents||{})){
      const intent=a.activeIntent;if(intent?.kind!=='awaitResponse'||intent.lifecycle!=='open'||st.tick<intent.patienceUntilTick)continue;
      const bidId=intent.source?.bidId,bid=bidId&&bidEvent(st,bidId);E.addEvent(`${a.name}等了一會兒，沒有得到立即回應，便不再等了。`,'normal',bidId?[bidId]:[],privateWaitData(st,a,intent,bid));a.activeIntent=null;
    }
  }
  function pruneObservedRefs(st){for(const a of Object.values(st.agents||{}))a.observedSocialBids=(a.observedSocialBids||[]).filter(ref=>ref.expiresTick>=st.tick&&bidEvent(st,ref.bidId));}
  function prepareTick(st){
    const snap={marker:st.events?.[0]?.id||null,responseBefore:new Map()};
    for(const a of Object.values(st.agents||{}))if(a.activeIntent?.kind==='respondSocialBid'&&a.activeIntent.source?.bidId)snap.responseBefore.set(a.id,a.activeIntent.source.bidId);
    injectWaitingActions(st);return snap;
  }
  function settleTick(after,snap){
    if(!snap)return;const newEvents=newEventsSince(after,snap.marker);annotateNewBids(after,newEvents);promoteChosenResponses(after);annotateResponses(after,newEvents,snap.responseBefore);pruneObservedRefs(after);expirePrivateWaiting(after);E.reconcileIntents?.(after);
  }

  E.registerDecisionOptionProvider?.('socialBid.respond-animal-affection',socialBidDecisionOptions,100);

  if(!E.registerRuntimeHook)throw new Error('social-bid-runtime-v1122.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','socialBid.prepare',(ctx)=>{ctx.locals.socialBidV1122=prepareTick(E.getState());},900);
  E.registerRuntimeHook('afterTick','socialBid.settle',(ctx)=>settleTick(E.getState(),ctx.locals.socialBidV1122),300);
  E.registerRuntimeHook('afterReset','socialBid.normalize-reset',()=>normalizeSocialState(E.getState()),200);

  normalizeSocialState(E.getState());
  Object.assign(E,{SOCIAL_BID_SCHEMA_VERSION:VERSION,BID_MEMORY_TICKS,REQUESTER_PATIENCE_TICKS,INTERACTION_BY_BID_KIND,bidEvent,socialBidInteractionKind,observedBidRefs,newestObservedAnimalBid,socialBidDecisionOptions,addObservedBid,canObserveSocialResponderContext:canObserveResponderContext});
})();
