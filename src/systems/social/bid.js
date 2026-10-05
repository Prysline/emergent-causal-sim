(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W)return;
  if(typeof E.observeAgentContext!=='function')throw new Error('systems/social/bid.js requires Engine observeAgentContext().');
  const VERSION=W.SOCIAL_BID_SCHEMA_VERSION||'11.47.0-social-bid-carry-cooperation';
  const BID_MEMORY_TICKS=6,REQUESTER_PATIENCE_TICKS=3;
  const INTERACTION_BY_BID_KIND=Object.freeze({talkOffer:'talk',animalAffection:'socialAffection',petOffer:'pet',sleepSlotYield:'requestYield',sleepSlotDriveAway:'nonPhysicalDriveAway',carryCooperation:'carryCooperation'});
  const RESPONSE_KIND=Object.freeze({accept:'accepted',refuse:'refused',delay:'delayed'});
  const responseContracts=new Map();
  if(E.INTENT_ZH){E.INTENT_ZH.awaitResponse='等待社交回應';E.INTENT_ZH.respondSocialBid='回應社交邀請';}

  const uniqueStrings=(value,label)=>{
    if(value==null)return Object.freeze([]);
    if(!Array.isArray(value))throw new Error(`${label} must be an array.`);
    const out=[];for(const item of value){if(!item||typeof item!=='string')throw new Error(`${label} entries must be non-empty strings.`);if(out.includes(item))throw new Error(`${label} contains duplicate ${item}.`);out.push(item);}return Object.freeze(out);
  };
  function registerSocialBidResponseContract(bidKind,spec={}){
    if(!bidKind||typeof bidKind!=='string')throw new Error('Social Bid response contract requires a non-empty bidKind.');
    if(responseContracts.has(bidKind))throw new Error(`Duplicate Social Bid response contract: ${bidKind}`);
    const contract=Object.freeze({
      bidKind,
      interactionKind:spec.interactionKind||INTERACTION_BY_BID_KIND[bidKind]||null,
      responseActionKinds:uniqueStrings(spec.responseActionKinds,'responseActionKinds'),
      responseEventActions:uniqueStrings(spec.responseEventActions,'responseEventActions'),
      canonicalResponses:spec.canonicalResponses===true
    });
    responseContracts.set(bidKind,contract);return contract;
  }
  function socialBidResponseContract(bidKind){return responseContracts.get(bidKind)||null;}
  function listSocialBidResponseContracts(){return [...responseContracts.values()].map(c=>({bidKind:c.bidKind,interactionKind:c.interactionKind,responseActionKinds:[...c.responseActionKinds],responseEventActions:[...c.responseEventActions],canonicalResponses:c.canonicalResponses}));}

  function normalizeSocialState(st){for(const a of Object.values(st?.agents||{}))if(!Array.isArray(a.observedSocialBids))a.observedSocialBids=[];return st;}
  function bidEvent(st,bidId){const e=st?.causes?.[bidId];return e?.data?.socialBid===true?e:null;}
  function socialBidInteractionKind(bid){return bid?.data?.interactionKind||socialBidResponseContract(bid?.data?.bidKind)?.interactionKind||INTERACTION_BY_BID_KIND[bid?.data?.bidKind]||null;}
  function newEventsSince(st,marker){const out=[];for(const e of st.events||[]){if(marker&&e.id===marker)break;out.push(e);}return out;}
  function addObservedBid(st,a,bid,observedTick=st.tick){
    if(!a||!bid)return null;const existing=(a.observedSocialBids||[]).find(x=>x.bidId===bid.id);
    if(existing){existing.expiresTick=Math.max(existing.expiresTick||0,observedTick+BID_MEMORY_TICKS);return existing;}
    const ref={bidId:bid.id,observedTick,expiresTick:observedTick+BID_MEMORY_TICKS};a.observedSocialBids.push(ref);return ref;
  }
  function observedBidRefs(st,a){return (a?.observedSocialBids||[]).filter(ref=>ref.expiresTick>=st.tick&&bidEvent(st,ref.bidId));}
  function newestObservedBid(st,a,bidKinds=null){
    const allowed=bidKinds==null?null:new Set(Array.isArray(bidKinds)?bidKinds:[bidKinds]);
    return observedBidRefs(st,a).map(ref=>({ref,bid:bidEvent(st,ref.bidId)})).filter(x=>x.bid?.data?.bidTo===a.id&&(!allowed||allowed.has(x.bid?.data?.bidKind))).sort((x,y)=>y.ref.observedTick-x.ref.observedTick||String(y.bid?.id||'').localeCompare(String(x.bid?.id||'')))[0]||null;
  }
  function newestObservedAnimalBid(st,a){return newestObservedBid(st,a,'animalAffection');}
  function createAwaitResponseIntent(st,a,bid,sourceExtra={}){return {id:`intent:${a.id}:${st.tick}:awaitResponse:${bid.id}`,kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId:bid.id,...sourceExtra},patienceUntilTick:st.tick+REQUESTER_PATIENCE_TICKS};}
  function createRespondSocialBidIntent(st,a,bid,action,observedTick=st.tick,sourceExtra={}){const started=Number.isInteger(action?.started)?action.started:st.tick;return {id:`intent:${a.id}:${started}:respondSocialBid:${bid.id}`,kind:'respondSocialBid',createdTick:started,lifecycle:'actionBound',source:{type:'socialBid',bidId:bid.id,observedTick,...sourceExtra}};}
  function settleObservedBid(a,bidId){if(a)a.observedSocialBids=(a.observedSocialBids||[]).filter(ref=>ref.bidId!==bidId);}
  function settleRequesterWait(requester,bidId){if(requester?.activeIntent?.kind==='awaitResponse'&&requester.activeIntent.source?.bidId===bidId){requester.action=null;requester.activeIntent=null;return true;}return false;}
  function requesterResponseEvent(st,requester,bidId,{outcomes=['accepted','refused','delayed'],requireObserved=true}={}){
    const allowed=new Set(outcomes);return (st.events||[]).find(e=>e?.data?.responseToBid===bidId&&e.data?.target===requester?.id&&allowed.has(e.data?.responseKind)&&(requireObserved?e.data?.perceivedByTarget===true:true))||null;
  }
  function observeSocialBidEvent(ctx){
    const st=ctx?.state,event=ctx?.event,d=event?.data;if(!st||!event||d?.socialBid!==true||d?.perceivedByTarget!==true)return null;
    const responder=d.bidTo&&st.agents?.[d.bidTo];if(!responder)return null;return addObservedBid(st,responder,event,event.tick??st.tick);
  }
  function emitSocialBidResponse(st,responder,bid,outcome,{action='respondSocialBid',text=null,type='normal',causes=[],data={}}={}){
    const responseKind=RESPONSE_KIND[outcome];if(!responseKind)throw new Error(`Unknown Social Bid response outcome: ${outcome}`);
    const contract=socialBidResponseContract(bid?.data?.bidKind);if(!contract)throw new Error(`Missing Social Bid response contract: ${bid?.data?.bidKind||'unknown'}`);
    if(!contract.canonicalResponses)throw new Error(`Social Bid ${bid.data.bidKind} does not allow canonical accept/refuse/delay responses.`);
    if(contract.responseEventActions.length&&!contract.responseEventActions.includes(action))throw new Error(`Social Bid ${bid.data.bidKind} response action ${action} is not registered.`);
    if(!responder||bid.data?.bidTo!==responder.id)throw new Error('Social Bid response responder identity mismatch.');
    const requester=st.agents?.[bid.data?.bidFrom];if(!requester)throw new Error('Social Bid response requester is missing.');
    const observation=E.observeAgentContext(st,requester,responder),id=E.addEvent(text||`${responder.name}回應了${requester.name}的請求。`,type,[bid.id,...causes].filter(Boolean),{actor:responder.id,target:requester.id,action,responseToBid:bid.id,bidKind:bid.data.bidKind,requestKind:bid.data.bidKind,responseKind,perceivedByTarget:observation?.observable===true,position:E.positionRef?.(responder.position)||null,...data});
    settleObservedBid(responder,bid.id);return st.causes?.[id]||null;
  }

  function socialBidDecisionOptions(st,a){if(a?.kind!=='human'||a.action)return[];const pick=newestObservedAnimalBid(st,a);if(!pick)return[];const target=st.agents?.[pick.bid?.data?.bidFrom];if(!target||target.offMap||!E.canPetAnimal?.(a,target))return[];return[{id:'petAnimal',targetAgent:target.id,score:72+(a.traits?.animalAffinity||0)*20,why:['動物剛剛主動尋求互動','回應已形成短期社交動機'],socialBidId:pick.bid.id,socialBidObservedTick:pick.ref.observedTick,decisionContributors:[{kind:'socialBid',key:'animalAffection',role:'motivation',bidId:pick.bid.id,observedTick:pick.ref.observedTick,fromAgent:target.id},{kind:'trait',key:'animalAffinity',role:'modifier',value:a.traits?.animalAffinity||0}]}];}
  function promoteResponseIntent(st,a,bid,action,observedTick=st.tick){
    const contract=socialBidResponseContract(bid?.data?.bidKind);if(!contract||!contract.responseActionKinds.includes(action?.kind)||action?.targetAgent!==bid?.data?.bidFrom)return false;
    a.activeIntent=createRespondSocialBidIntent(st,a,bid,action,observedTick);a.action.intentId=a.activeIntent.id;return true;
  }
  function injectWaitingActions(st){for(const a of Object.values(st.agents||{})){if(a.action||a.activeIntent?.kind!=='awaitResponse'||a.activeIntent.lifecycle!=='open')continue;a.action={kind:'awaitResponse',phase:'waiting',started:a.activeIntent.createdTick,intentId:a.activeIntent.id,__v1122Transient:true};}}
  function annotateNewBids(st,newEvents){
    for(const e of newEvents){if(e.data?.action!=='seekHuman'||!e.data?.actor||!e.data?.target)continue;e.data.socialBid=true;e.data.bidId=e.id;e.data.bidKind='animalAffection';e.data.interactionKind='socialAffection';e.data.expectsResponse=true;e.data.bidFrom=e.data.actor;e.data.bidTo=e.data.target;const requester=st.agents[e.data.actor],target=st.agents[e.data.target];const perceived=e.data?.perceivedByTarget===true;e.data.perceivedByTarget=perceived;if(requester&&!requester.action)requester.activeIntent=createAwaitResponseIntent(st,requester,e);if(perceived)addObservedBid(st,target,e,st.tick);}
  }
  function promoteChosenResponses(st){for(const a of Object.values(st.agents||{})){const pick=st.thoughts?.[a.id]?.pick,bidId=pick?.socialBidId;if(!bidId||!a.action||a.action.started!==st.tick)continue;const bid=bidEvent(st,bidId),contract=socialBidResponseContract(bid?.data?.bidKind);if(!bid||bid.data?.bidTo!==a.id||a.action.targetAgent!==bid.data?.bidFrom||!contract?.responseActionKinds.includes(a.action.kind))continue;promoteResponseIntent(st,a,bid,a.action,pick.socialBidObservedTick??st.tick);}}
  function annotateResponses(st,newEvents,responseBefore){
    for(const e of newEvents){if(!e.data?.actor||!e.data?.target)continue;const actor=st.agents[e.data.actor],bidId=responseBefore.get(e.data.actor)||actor?.activeIntent?.source?.type==='socialBid'&&actor.activeIntent.source.bidId;if(!bidId)continue;const bid=bidEvent(st,bidId),contract=socialBidResponseContract(bid?.data?.bidKind);if(!bid||bid.data.bidFrom!==e.data.target||!contract?.responseEventActions.includes(e.data.action))continue;e.data.responseToBid=bidId;e.data.bidId=bidId;settleObservedBid(actor,bidId);settleRequesterWait(st.agents[e.data.target],bidId);}
  }
  function privateWaitData(st,a,intent,bid){const data={actor:a.id,action:'socialWaitEnded',bidId:bid?.id||intent.source?.bidId||null,intentId:intent.id,visibility:'private',owner:a.id};if(!bid)return data;data.bidKind=bid.data?.bidKind||null;data.interactionKind=socialBidInteractionKind(bid);const responder=bid.data?.bidTo&&st.agents?.[bid.data?.bidTo];const observation=E.observeAgentContext(st,a,responder);if(!observation?.observable){data.responderContextObserved=false;return data;}data.responderContextObserved=true;data.observedResponderActionKind=observation.observedActionKind;data.observedResponderPosture=observation.observedPosture;return data;}
  function expirePrivateWaiting(st){for(const a of Object.values(st.agents||{})){const intent=a.activeIntent;if(intent?.kind!=='awaitResponse'||intent.lifecycle!=='open'||st.tick<intent.patienceUntilTick)continue;const bidId=intent.source?.bidId,bid=bidId&&bidEvent(st,bidId);E.addEvent(`${a.name}等了一會兒，沒有得到立即回應，便不再等了。`,'normal',bidId?[bidId]:[],privateWaitData(st,a,intent,bid));a.activeIntent=null;}}
  function pruneObservedRefs(st){for(const a of Object.values(st.agents||{}))a.observedSocialBids=(a.observedSocialBids||[]).filter(ref=>ref.expiresTick>=st.tick&&bidEvent(st,ref.bidId));}
  function prepareTick(st){const snap={marker:st.events?.[0]?.id||null,responseBefore:new Map()};for(const a of Object.values(st.agents||{}))if(a.activeIntent?.kind==='respondSocialBid'&&a.activeIntent.source?.bidId)snap.responseBefore.set(a.id,a.activeIntent.source.bidId);injectWaitingActions(st);return snap;}
  function settleTick(after,snap){if(!snap)return;const newEvents=newEventsSince(after,snap.marker);annotateNewBids(after,newEvents);promoteChosenResponses(after);annotateResponses(after,newEvents,snap.responseBefore);pruneObservedRefs(after);expirePrivateWaiting(after);E.reconcileIntents?.(after);}

  registerSocialBidResponseContract('animalAffection',{interactionKind:'socialAffection',responseActionKinds:['petAnimal'],responseEventActions:['petAnimal']});
  E.registerDecisionOptionProvider?.('socialBid.respond-animal-affection',socialBidDecisionOptions,100);
  if(!E.registerEventCreatedListener)throw new Error('systems/social/bid.js requires event-created listener registry.');
  E.registerEventCreatedListener('socialBid.observe',observeSocialBidEvent,150);
  if(!E.registerRuntimeHook)throw new Error('systems/social/bid.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','socialBid.prepare',(ctx)=>{ctx.locals.socialBidV1147=prepareTick(E.getState());},900);
  E.registerRuntimeHook('afterTick','socialBid.settle',(ctx)=>settleTick(E.getState(),ctx.locals.socialBidV1147),300);
  E.registerRuntimeHook('afterReset','socialBid.normalize-reset',()=>normalizeSocialState(E.getState()),200);

  Object.assign(E,{SOCIAL_BID_SCHEMA_VERSION:VERSION,BID_MEMORY_TICKS,REQUESTER_PATIENCE_TICKS,INTERACTION_BY_BID_KIND,RESPONSE_KIND,bidEvent,socialBidInteractionKind,observedBidRefs,newestObservedBid,newestObservedAnimalBid,socialBidDecisionOptions,addObservedBid,registerSocialBidResponseContract,socialBidResponseContract,listSocialBidResponseContracts,createAwaitResponseIntent,createRespondSocialBidIntent,settleObservedBid,settleRequesterWait,requesterResponseEvent,emitSocialBidResponse});
})();
