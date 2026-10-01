(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;
  if(!E||!W?.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION||!SP)return;
  if(typeof E.affectResponseSignal!=='function')throw new Error('systems/social/human-response.js requires systems/affect/runtime.js.');
  const VERSION=W.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION||'11.13.3a-human-social-response';
  const TALK_RESPONSE_THRESHOLDS=Object.freeze({declineMax:.30,engageMin:.62});
  const TALK_AFFECT_RESPONSE_CAP=.12;
  const TALK_RELATIONSHIP_RESPONSE_CAP=.18;
  const SLEEP_SLOT_RESPONSE_THRESHOLDS=Object.freeze({declineMax:.30,acceptMin:.62});
  const HIGH_COMMITMENT_ACTIONS=new Set(['eat','drinkWater','drinkAlcohol','sleep','restockContainer','externalSupply']);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=v=>Math.round(v*1000)/1000;
  const actionKind=a=>E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;
  const resetForScenario=E.reset;
  const counterpartId=counterpart=>typeof counterpart==='string'?counterpart:counterpart?.id||null;

  function talkBaseEngagementScore(human){const social=clamp((Number(human?.needs?.social)||0)/100,0,1),rawTrait=Number(human?.traits?.social),sociability=clamp(Number.isFinite(rawTrait)?rawTrait:.5,0,1);return round(social*.70+sociability*.30);}
  function talkAffectResponseDelta(human){const signal=Number(E.affectResponseSignal(human))||0;return round(clamp(signal*TALK_AFFECT_RESPONSE_CAP,-TALK_AFFECT_RESPONSE_CAP,TALK_AFFECT_RESPONSE_CAP));}
  function talkRelationshipResponseDelta(human,requester){const id=counterpartId(requester);if(!id)return 0;const signal=Number(E.relationshipSignal?.(human,id))||0;return round(clamp(signal*TALK_RELATIONSHIP_RESPONSE_CAP,-TALK_RELATIONSHIP_RESPONSE_CAP,TALK_RELATIONSHIP_RESPONSE_CAP));}
  function talkResponseEvaluation(human,requester=null){const baseScore=talkBaseEngagementScore(human),affectResponseDelta=talkAffectResponseDelta(human),relationshipResponseDelta=talkRelationshipResponseDelta(human,requester),finalScore=round(clamp(baseScore+affectResponseDelta+relationshipResponseDelta,0,1));const response=finalScore<TALK_RESPONSE_THRESHOLDS.declineMax?'decline':finalScore>=TALK_RESPONSE_THRESHOLDS.engageMin?'engage':'brief';return {baseScore,affectResponseDelta,relationshipResponseDelta,finalScore,response};}
  function talkEngagementScore(human,requester=null){return talkResponseEvaluation(human,requester).finalScore;}
  function talkResponseFor(human,requester=null){return talkResponseEvaluation(human,requester).response;}
  function talkResponseUtility(human,requester=null){return round(48+talkEngagementScore(human,requester)*36);}
  function newestObservedTalkOffer(st,a){return (E.observedBidRefs?.(st,a)||[]).map(ref=>({ref,bid:E.bidEvent?.(st,ref.bidId)})).filter(x=>x.bid?.data?.bidKind==='talkOffer'&&x.bid.data.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;}
  function talkResponseCandidate(st,a){
    if(!a||a.kind!=='human'||a.offMap||E.isSleeping?.(a))return null;const pick=newestObservedTalkOffer(st,a);if(!pick)return null;
    const requester=st.agents?.[pick.bid.data.bidFrom];if(!requester||requester.offMap||requester.kind!=='human')return null;if(!SP.isAtInteraction(st,a,{kind:'agent',id:requester.id},'social'))return null;
    return {intentKind:'respondSocialBid',actionKind:'talk',utility:talkResponseUtility(a,requester),targetAgent:requester.id,bidId:pick.bid.id,observedTick:pick.ref.observedTick,responseKind:talkResponseFor(a,requester)};
  }
  function awaitIntent(st,a,bid){const patience=Number(E.REQUESTER_PATIENCE_TICKS)||3;return {id:`intent:${a.id}:${st.tick}:awaitResponse:${bid.id}`,kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId:bid.id},patienceUntilTick:st.tick+patience};}
  function responseIntent(st,a,c,sourceExtra={}){return {id:`intent:${a.id}:${st.tick}:respondSocialBid:${c.bidId}`,kind:'respondSocialBid',createdTick:st.tick,lifecycle:'actionBound',source:{type:'socialBid',bidId:c.bidId,observedTick:c.observedTick,...sourceExtra}};}
  function responseAction(st,c){const action={kind:'talk',phase:'respondBid',targetAgent:c.targetAgent,responseToBid:c.bidId,started:st.tick,wait:0};return action;}
  function clearAgentReservations(st,a){for(const [key,owner] of Object.entries({...st.reservations}))if(owner===a.id)delete st.reservations[key];}
  function dropHeld(st,a){if(!a.held)return;const c=st.containers?.[a.held];if(c)c.position={...a.position};a.held=null;}
  function bindResponse(st,a,c,{softSnapshot=null}={}){
    const priorIntent=a.activeIntent,priorActionKind=actionKind(a),action=responseAction(st,c);let sourceExtra={};
    if(softSnapshot){clearAgentReservations(st,a);dropHeld(st,a);a.action=null;a.activeIntent=null;sourceExtra={reconsideration:{type:'soft',tick:st.tick,priorIntentId:priorIntent?.id||null}};}
    const intent=responseIntent(st,a,c,sourceExtra);action.intentId=intent.id;a.action=action;a.activeIntent=intent;
    if(softSnapshot)E.addEvent(`${a.name}重新權衡後，改先回應聊天邀請。`,'normal',[],{actor:a.id,action:'intentReconsider',priorIntentId:priorIntent?.id||null,priorIntentKind:priorIntent?.kind||null,priorActionKind:priorActionKind||null,intentId:intent.id,intentKind:intent.kind,nextActionKind:'talk',challengerIntentKind:'respondSocialBid',currentUtility:softSnapshot.currentUtility,challengerUtility:c.utility,switchMargin:softSnapshot.switchMargin,commitmentCost:softSnapshot.commitmentCost,switchThreshold:softSnapshot.switchThreshold,position:E.positionRef?.(a.position)||null});
    return true;
  }
  function promoteTalkResponses(st){
    for(const a of Object.values(st.agents||{})){
      if(a.kind!=='human'||a.offMap||E.isSleeping?.(a)||a.activeIntent?.kind==='respondSocialBid')continue;const c=talkResponseCandidate(st,a);if(!c)continue;
      if(!a.action&&!a.activeIntent){const best=E.candidateIntents?.(st,a)?.[0]||null;if(best&&best.utility>c.utility)continue;bindResponse(st,a,c);continue;}
      const snap=E.reconsiderationSnapshot?.(st,a);if(!snap?.ok||!Number.isFinite(snap.commitmentCost)||c.utility<=snap.switchThreshold)continue;bindResponse(st,a,c,{softSnapshot:snap});
    }
  }
  function capturePendingTalkOffers(st){
    const out=[];
    for(const a of Object.values(st.agents||{})){
      const action=a.action,target=action?.targetAgent&&st.agents?.[action.targetAgent];
      if(a.kind!=='human'||!action||actionKind(a)!=='talk'||action.phase!=='interact'||action.responseToBid)continue;if(a.activeIntent?.kind==='respondSocialBid')continue;
      if(!target||target.kind!=='human'||target.offMap||E.isSleeping?.(target))continue;if(!SP.isAtInteraction(st,a,{kind:'agent',id:target.id},'social'))continue;
      out.push({requesterId:a.id,responderId:target.id,action,position:E.positionRef?.(a.position)||`${a.position.x},${a.position.y}`});action.phase='talkOfferPending';
    }
    return out;
  }
  function addTalkOffer(st,requester,responder,position){
    const id=E.addEvent(`${requester.name}向${responder.name}發出聊天邀請。`,'normal',[],{actor:requester.id,target:responder.id,action:'talkOffer',position,socialBid:true,bidKind:'talkOffer',interactionKind:'talk',expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:true});
    const event=st.causes?.[id];if(event?.data)event.data.bidId=id;return id;
  }
  function emitTalkOffers(st,records){
    for(const record of records){
      const requester=st.agents?.[record.requesterId],responder=st.agents?.[record.responderId];if(!requester||!responder||requester.action!==record.action||actionKind(requester)!=='talk'||requester.action.phase!=='talkOfferPending')continue;
      if(responder.offMap||E.isSleeping?.(responder)||!SP.isAtInteraction(st,requester,{kind:'agent',id:responder.id},'social')){requester.action.phase='move';continue;}
      const offerId=addTalkOffer(st,requester,responder,record.position),offer=st.causes?.[offerId];E.addObservedBid?.(st,responder,offer,st.tick);requester.action=null;requester.activeIntent=awaitIntent(st,requester,offer);
    }
  }
  function settleObservedBid(a,bidId){if(a)a.observedSocialBids=(a.observedSocialBids||[]).filter(ref=>ref.bidId!==bidId);}
  function settleRequesterWait(requester,bidId){if(requester?.activeIntent?.kind==='awaitResponse'&&requester.activeIntent.source?.bidId===bidId)requester.activeIntent=null;}
  function addTalkResponse(st,responder,requester,bidId,response){
    const action=response==='engage'?'acceptTalk':response==='brief'?'briefTalkReply':'declineTalk';
    const text=response==='engage'?`${responder.name}回應了${requester.name}的聊天邀請，明確接下話題。`:response==='brief'?`${responder.name}簡短回應了${requester.name}的聊天邀請，但沒有繼續聊天。`:`${responder.name}回應了${requester.name}的聊天邀請，明確表示這次不繼續聊天。`;
    return E.addEvent(text,response==='engage'?'good':'normal',[bidId],{actor:responder.id,target:requester.id,action,responseToBid:bidId,talkResponse:response,position:E.positionRef?.(responder.position)||`${responder.position.x},${responder.position.y}`});
  }
  function applyFullTalk(st,requester,responder,bidId,responseId){const id=E.addEvent(`${requester.name}和${responder.name}聊了一會兒。`,'good',[bidId,responseId],{actor:requester.id,target:responder.id,action:'talk',talkOfferId:bidId,talkResponseEventId:responseId,talkResponse:'engage',position:E.positionRef?.(requester.position)||`${requester.position.x},${requester.position.y}`});requester.needs.social=clamp((Number(requester.needs?.social)||0)-E.rand(12,20),0,100);responder.needs.social=clamp((Number(responder.needs?.social)||0)-E.rand(8,15),0,100);E.addNoise?.(requester.position,8,2,'talk');return id;}
  function applyBriefReply(requester,responder){requester.needs.social=clamp((Number(requester.needs?.social)||0)-3,0,100);responder.needs.social=clamp((Number(responder.needs?.social)||0)-1,0,100);E.addNoise?.(requester.position,2,1,'talk');}
  function resolveTalkResponses(st){
    for(const responder of Object.values(st.agents||{})){
      const action=responder.action;if(responder.kind!=='human'||!action||actionKind(responder)!=='talk'||action.phase!=='respondBid'||!action.responseToBid)continue;
      const bid=E.bidEvent?.(st,action.responseToBid),requester=bid?.data?.bidFrom&&st.agents?.[bid.data.bidFrom];
      if(!bid||bid.data?.bidKind!=='talkOffer'||bid.data.bidTo!==responder.id||!requester||requester.offMap||responder.offMap||E.isSleeping?.(responder)||!SP.isAtInteraction(st,responder,{kind:'agent',id:requester.id},'social')){responder.action=null;if(responder.activeIntent?.source?.bidId===action.responseToBid)responder.activeIntent=null;continue;}
      const response=talkResponseFor(responder,requester),responseId=addTalkResponse(st,responder,requester,bid.id,response);settleObservedBid(responder,bid.id);settleRequesterWait(requester,bid.id);if(response==='engage')applyFullTalk(st,requester,responder,bid.id,responseId);else if(response==='brief')applyBriefReply(requester,responder);responder.action=null;if(responder.activeIntent?.source?.bidId===bid.id)responder.activeIntent=null;
    }
  }
  function newestObservedSleepSlotBid(st,a){
    return (E.observedBidRefs?.(st,a)||[]).map(ref=>({ref,bid:E.bidEvent?.(st,ref.bidId)})).filter(x=>['sleepSlotYieldRequest','sleepSlotDriveAway'].includes(x.bid?.data?.bidKind)&&x.bid?.data?.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;
  }
  function sleepSlotResponseEvaluation(human,requester,bidKind='sleepSlotYieldRequest'){
    const base=bidKind==='sleepSlotDriveAway'?.34:.54,affect=talkAffectResponseDelta(human),relationship=talkRelationshipResponseDelta(human,requester),finalScore=round(clamp(base+affect+relationship,0,1));
    const response=finalScore<SLEEP_SLOT_RESPONSE_THRESHOLDS.declineMax?'decline':finalScore>=SLEEP_SLOT_RESPONSE_THRESHOLDS.acceptMin?'accept':'delay';
    return {baseScore:base,affectResponseDelta:affect,relationshipResponseDelta:relationship,finalScore,response};
  }
  function sleepSlotResponseCandidate(st,a){
    if(!a||a.kind!=='human'||a.offMap||E.isSleeping?.(a))return null;
    const pick=newestObservedSleepSlotBid(st,a);if(!pick)return null;
    const requester=st.agents?.[pick.bid?.data?.bidFrom];if(!requester||requester.offMap)return null;
    const evaluation=sleepSlotResponseEvaluation(a,requester,pick.bid.data.bidKind);
    return {pick,requester,evaluation};
  }
  function emitSleepSlotResponse(st,responder,requester,bid,response){
    const action=response==='accept'?'acceptSleepSlotYield':'refuseSleepSlotYield';
    const text=response==='accept'?responder.name+'同意讓出睡眠位置。':responder.name+'拒絕讓出睡眠位置。';
    return E.addEvent(text,'normal',[bid.id],{actor:responder.id,target:requester.id,action,responseToBid:bid.id,slot:bid.data?.slot||null,sleepSlotResponse:response,position:E.positionRef?.(responder.position)||null});
  }
  function bindSleepSlotYield(st,responder,requester,bid){
    const action=E.buildAction?.(responder,{id:'wander'});if(!action)return false;
    const intent={id:'intent:'+responder.id+':'+st.tick+':yieldSleepSlot:'+bid.id,kind:'explore',createdTick:st.tick,lifecycle:'actionBound',source:{type:'sleepSlotConflictResponse',bidId:bid.id,requesterId:requester.id,slotId:bid.data?.slot||null}};
    action.intentId=intent.id;action.sleepConflictYieldBidId=bid.id;action.sleepConflictYieldSlotId=bid.data?.slot||null;responder.action=action;responder.activeIntent=intent;
    emitSleepSlotResponse(st,responder,requester,bid,'accept');settleObservedBid(responder,bid.id);return true;
  }
  function promoteSleepSlotResponses(st){
    for(const responder of Object.values(st.agents||{})){
      const c=sleepSlotResponseCandidate(st,responder);if(!c)continue;
      const {pick,requester,evaluation}=c,bid=pick.bid;
      if(evaluation.response==='delay')continue;
      if(responder.action||responder.activeIntent){
        const snap=E.reconsiderationSnapshot?.(st,responder);if(!snap?.ok||!Number.isFinite(snap.commitmentCost)||68<=snap.switchThreshold)continue;
        clearAgentReservations(st,responder);dropHeld(st,responder);responder.action=null;responder.activeIntent=null;
      }
      if(evaluation.response==='decline'){emitSleepSlotResponse(st,responder,requester,bid,'decline');settleObservedBid(responder,bid.id);continue;}
      bindSleepSlotYield(st,responder,requester,bid);
    }
  }
  function settleSleepSlotYieldCompletion(st){
    for(const responder of Object.values(st.agents||{})){
      const action=responder.action,bidId=action?.sleepConflictYieldBidId,slotId=action?.sleepConflictYieldSlotId;if(!bidId||!slotId)continue;
      if(responder.posture?.slotId===slotId)continue;
      const bid=E.bidEvent?.(st,bidId),requester=bid?.data?.bidFrom&&st.agents?.[bid.data.bidFrom];
      E.addEvent(responder.name+'實際離開了先前占用的睡眠位置。','normal',[bidId],{actor:responder.id,target:requester?.id||null,action:'sleepSlotYieldCompleted',responseToBid:bidId,slot:slotId,position:E.positionRef?.(responder.position)||null});
      delete action.sleepConflictYieldBidId;delete action.sleepConflictYieldSlotId;
    }
  }

  function noResponseInterpretationWeight(waitEvent){const d=waitEvent?.data||{};if(d.action!=='socialWaitEnded'||d.bidKind!=='talkOffer')return null;if(d.responderContextObserved!==true)return .22;const kind=d.observedResponderActionKind||null;if(kind==='sleep'||d.observedResponderPosture==='lying'&&kind==='sleep')return .05;if(kind&&HIGH_COMMITMENT_ACTIONS.has(kind))return .12;if(kind)return .28;return .45;}
  function prepareHumanTalkScenario(mode='talk-engage',seed=11331){
    const st=resetForScenario(seed),requester=st.agents?.zhou,responder=st.agents?.zhen,cat=st.agents?.orange;if(!requester||!responder)return st;
    requester.position={x:5,y:5};responder.position={x:5,y:6};if(cat)cat.offMap=true;requester.offMap=false;responder.offMap=false;requester.action=null;requester.activeIntent=null;responder.action=null;responder.activeIntent=null;
    Object.assign(requester.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:70});const social=mode==='talk-engage'?90:mode==='talk-brief'?35:mode==='talk-decline'?0:80;Object.assign(responder.needs,{hunger:18,thirst:mode==='talk-no-response'?95:18,fatigue:18,sleepNeed:18,social});
    requester.action={kind:'talk',phase:'interact',targetAgent:responder.id,started:st.tick,wait:0};E.ensureIntentForAction?.(st,requester);return st;
  }
  function prepareTick(st){const pendingOffers=capturePendingTalkOffers(st);emitTalkOffers(st,pendingOffers);promoteTalkResponses(st);promoteSleepSlotResponses(st);}
  function settleTick(st){resolveTalkResponses(st);settleSleepSlotYieldCompletion(st);E.reconcileIntents?.(st);}

  if(!E.registerRuntimeHook)throw new Error('systems/social/human-response.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','humanSocial.prepare',()=>prepareTick(E.getState()),300);
  E.registerRuntimeHook('afterTick','humanSocial.resolve',()=>settleTick(E.getState()),700);

  Object.assign(E,{HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION:VERSION,TALK_RESPONSE_THRESHOLDS,TALK_AFFECT_RESPONSE_CAP,TALK_RELATIONSHIP_RESPONSE_CAP,SLEEP_SLOT_RESPONSE_THRESHOLDS,HIGH_COMMITMENT_ACTIONS,talkBaseEngagementScore,talkAffectResponseDelta,talkRelationshipResponseDelta,talkResponseEvaluation,talkEngagementScore,talkResponseFor,talkResponseUtility,newestObservedTalkOffer,talkResponseCandidate,newestObservedSleepSlotBid,sleepSlotResponseEvaluation,sleepSlotResponseCandidate,noResponseInterpretationWeight,prepareHumanTalkScenario});
})();
