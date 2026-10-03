(() => {
  const E=window.SimEngine,SP=window.SimSpatial,U=window.SimUsage;
  if(!E||!SP||!U)return;
  if(typeof E.observeAgentContext!=='function'||typeof E.performAttentionInteraction!=='function')throw new Error('sleep-conflict.js requires shared Agent-context observation + attention.');
  const VERSION='11.44.0-sleep-slot-conflict';
  const OCCUPANCY_REASSESS_TICKS=1;
  const ATTENTION_REASSESS_TICKS=1;
  const REQUEST_STIMULUS=Object.freeze({kind:'sound',intensity:24});
  const DRIVE_STIMULUS=Object.freeze({kind:'sound',intensity:32});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

  function associationStrength(reasons){
    let score=0;
    for(const r of reasons||[]){
      if(r.direction!=='self')continue;
      if(r.kind==='assignment')score+=8;
      else if(r.kind==='claim')score+=5;
      else if(r.kind==='habit')score+=4*clamp(Number(r.signal)||0,0,1);
    }
    return clamp(score,0,10);
  }
  function selfSleepAssociations(st,a){
    const out=[];
    for(const slot of SP.allSlots(st)){
      if(!slot.canSleep||!SP.slotAllows(slot,a)||!SP.slotPoseFits?.(slot,a,'lying'))continue;
      const target={kind:'slot',id:slot.id},reasons=U.associationReasons(st,a,'sleep',target).filter(r=>r.direction==='self');
      if(reasons.length)out.push({slot,target,reasons,strength:associationStrength(reasons)});
    }
    return out.sort((x,y)=>y.strength-x.strength||String(x.slot.id).localeCompare(String(y.slot.id)));
  }
  function detectPreferredSleepConflict(st,a){
    for(const item of selfSleepAssociations(st,a)){
      const exclusion=SP.sleepTargetExclusion?.(st,a,item.slot.id);
      if(exclusion?.reason==='occupied')return {...item,exclusion};
    }
    return null;
  }
  function hasPreferredSleepConflict(st,a){return !!detectPreferredSleepConflict(st,a);}
  function lastConflictEvidence(a,slotId){
    return (a?.conflictResolutionEvidence||[]).filter(x=>x?.preferredSlot?.id===slotId).sort((x,y)=>y.sequence-x.sequence)[0]||null;
  }
  function observationForConflict(st,a,conflict){
    const occupant=SP.slotOccupant(st,conflict.slot.id,a.id);
    if(!occupant)return Object.freeze({observable:false,reason:'occupant-missing'});
    return E.observeAgentContext(st,a,occupant);
  }
  function conflictCandidates(st,a,conflict){
    const legal=U.rankSleepTargets(st,a,SP.sleepTargets(st,a)),bestAlternate=legal[0]||null,observation=observationForConflict(st,a,conflict);
    const insist=conflict.strength,noAlternate=!bestAlternate,prior=lastConflictEvidence(a,conflict.slot.id),out=[];
    const push=(kind,score,contributors=[],extra={})=>out.push({kind,score:Math.round(score*1000)/1000,contributors:clone(contributors),...extra});
    const common=[{kind:'association',key:'preferredSlotInsistence',role:'modifier',value:insist}];
    if(bestAlternate)push('alternate',52-insist*1.8-clamp(Number(bestAlternate.effectiveScore)||0,-10,25)*.35,common,{target:{kind:'slot',id:bestAlternate.id}});
    push('wait',35+insist*1.4+(noAlternate?8:0),common);
    if(observation.observable){
      const sleeping=observation.observedActionKind==='sleep';
      push('attention',30+insist*1.1+(sleeping?12:0)+(noAlternate?5:0),common.concat([{kind:'observation',key:'occupantSleeping',role:'modifier',value:sleeping?1:0}]));
      if(observation.observedAgentKind==='human'){
        push('requestYield',36+insist*1.6+(noAlternate?6:0),common);
        push('driveAway',24+insist*1.9+(noAlternate?8:0),common);
      }
    }
    out.sort((x,y)=>y.score-x.score||String(x.kind).localeCompare(String(y.kind)));
    return {observation,bestAlternate,candidates:out,selected:out[0]||null,prior};
  }
  function captureConflict(st,a,action,conflict,evaluation){
    const observation=evaluation.observation?.observable?evaluation.observation:{observable:false,reason:evaluation.observation?.reason||'unobservable'};
    return E.captureConflictResolutionEvidence?.(st,a,action,{
      preferredSlot:{kind:'slot',id:conflict.slot.id},
      associationReasons:conflict.reasons,
      observation,
      candidates:evaluation.candidates.map(c=>({kind:c.kind,score:c.score,target:c.target||null,contributors:c.contributors||[]})),
      selectedResolution:evaluation.selected?.kind||'none',
      contributors:evaluation.selected?.contributors||[],
      priorConflictDecisionId:evaluation.prior?.id||null
    })||null;
  }
  function beginConflictWait(st,action,conflict,{source='sleepSlotOccupancy',ticks=OCCUPANCY_REASSESS_TICKS}={}){
    action.phase='conflictWait';action.preferredConflictSlotId=conflict.slot.id;action.conflictWaitSource=source;action.conflictWaitStartedTick=st.tick;action.conflictWaitUntilTick=st.tick+Math.max(1,Number(ticks)||1);return {handled:true,resolution:source==='attentionReassessment'?'attention':'wait'};
  }
  function beginOccupancyWait(st,a,action,conflict){return beginConflictWait(st,action,conflict,{source:'sleepSlotOccupancy',ticks:OCCUPANCY_REASSESS_TICKS});}
  function awaitResponseIntent(st,a,bidId,slotId,conflictDecisionId=null){
    const patience=Math.max(1,Number(E.REQUESTER_PATIENCE_TICKS)||3);
    return {id:'intent:'+a.id+':'+st.tick+':awaitResponse:'+bidId,kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId,context:'sleepSlotConflict',preferredSlotId:slotId,conflictDecisionId},patienceUntilTick:st.tick+patience};
  }
  function observeSleepConflictBid(ctx){
    const st=ctx?.state,event=ctx?.event,d=event?.data;
    if(!st||!event||d?.socialBid!==true||d?.perceivedByTarget!==true||!['sleepSlotYield','sleepSlotDriveAway'].includes(d?.bidKind))return null;
    const responder=d.bidTo&&st.agents?.[d.bidTo];if(!responder)return null;
    return E.addObservedBid?.(st,responder,event,event.tick??st.tick)||null;
  }
  function emitYieldBid(st,a,action,conflict,evaluation,mode){
    const observation=evaluation.observation,target=observation?.targetId&&st.agents?.[observation.targetId];if(!observation?.observable||!target)return beginOccupancyWait(st,a,action,conflict);
    const stimulus=mode==='driveAway'?DRIVE_STIMULUS:REQUEST_STIMULUS,attention=E.performAttentionInteraction(a,target,{stimulus});
    const wasSleeping=observation.observedActionKind==='sleep',perceivedByTarget=!wasSleeping||attention.wake?.woke===true;
    const bidKind=mode==='driveAway'?'sleepSlotDriveAway':'sleepSlotYield',interactionKind=mode==='driveAway'?'nonPhysicalDriveAway':'requestYield';
    const text=mode==='driveAway'?a.name+'以較強硬的非物理方式要求'+target.name+'離開偏好的睡眠位置。':a.name+'要求'+target.name+'讓出偏好的睡眠位置。';
    const bidId=E.addEvent(text,'normal',attention.eventId?[attention.eventId]:[],{actor:a.id,target:target.id,action:mode==='driveAway'?'sleepSlotDriveAway':'sleepSlotYieldRequest',slot:conflict.slot.id,socialBid:true,bidKind,interactionKind,expectsResponse:true,bidFrom:a.id,bidTo:target.id,perceivedByTarget,interactionPurpose:mode==='driveAway'?'driveAwayFromSleepSlot':'requestSleepSlotYield',conflictDecisionId:action.conflictResolutionDecisionId||null,position:E.positionRef?.(a.position)||null});
    const bid=st.causes?.[bidId];if(bid?.data)bid.data.bidId=bidId;
    const conflictDecisionId=action.conflictResolutionDecisionId||null;a.action=null;a.activeIntent=awaitResponseIntent(st,a,bidId,conflict.slot.id,conflictDecisionId);
    return {handled:true,resolution:mode,bidId,perceivedByTarget};
  }
  function resolveSleepChoice(st,a,action){
    if(action?.phase!=='chooseSurface')return {handled:false};
    const conflict=detectPreferredSleepConflict(st,a);if(!conflict)return {handled:false};
    const evaluation=conflictCandidates(st,a,conflict);if(!evaluation.selected)return {handled:false};
    captureConflict(st,a,action,conflict,evaluation);
    switch(evaluation.selected.kind){
      case'alternate':return {handled:false,resolution:'alternate'};
      case'wait':return beginOccupancyWait(st,a,action,conflict);
      case'attention':{
        const target=evaluation.observation?.targetId&&st.agents?.[evaluation.observation.targetId];
        if(!target)return beginOccupancyWait(st,a,action,conflict);
        E.performAttentionInteraction(a,target,{stimulus:REQUEST_STIMULUS});
        return beginConflictWait(st,action,conflict,{source:'attentionReassessment',ticks:ATTENTION_REASSESS_TICKS});
      }
      case'requestYield':return emitYieldBid(st,a,action,conflict,evaluation,'requestYield');
      case'driveAway':return emitYieldBid(st,a,action,conflict,evaluation,'driveAway');
      default:return beginOccupancyWait(st,a,action,conflict);
    }
  }
  function clearWaitFields(action){for(const k of ['preferredConflictSlotId','conflictWaitSource','conflictWaitStartedTick','conflictWaitUntilTick'])delete action[k];}
  function stepSleepConflict(st,a,action){
    if(action?.phase!=='conflictWait')return false;
    const slotId=action.preferredConflictSlotId,exclusion=slotId&&SP.sleepTargetExclusion?.(st,a,slotId);
    const reasons=slotId?U.associationReasons(st,a,'sleep',{kind:'slot',id:slotId}).filter(r=>r.direction==='self'):[];
    if(!slotId||!reasons.length||exclusion?.reason!=='occupied'||st.tick>=Number(action.conflictWaitUntilTick||0)){clearWaitFields(action);action.phase='chooseSurface';return true;}
    return true;
  }
  function newestObservedConflictBid(st,a){
    return (E.observedBidRefs?.(st,a)||[]).map(ref=>({ref,bid:E.bidEvent?.(st,ref.bidId)})).filter(x=>['sleepSlotYield','sleepSlotDriveAway'].includes(x.bid?.data?.bidKind)&&x.bid?.data?.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;
  }
  function responseEvaluation(st,a,bid,observedTick){
    const slotId=bid?.data?.slot,reasons=slotId?U.associationReasons(st,a,'sleep',{kind:'slot',id:slotId}).filter(r=>r.direction==='self'):[],own=associationStrength(reasons),sleepNeed=clamp(Number(a?.needs?.sleepNeed)||0,0,100),relationship=clamp(Number(E.relationshipSignal?.(a,bid?.data?.bidFrom))||0,-1,1),age=Math.max(0,st.tick-(observedTick||st.tick)),pressure=bid?.data?.bidKind==='sleepSlotDriveAway'?.08:0;
    const score=clamp(.62-sleepNeed*.004-own*.025+relationship*.08+pressure+Math.min(.12,age*.04),0,1);
    const response=score>=.52?'accept':score<=.28?'refuse':'delay';
    return {score,response,sleepNeed,ownAssociationStrength:own,relationshipSignal:relationship,requestAge:age};
  }
  function settleObservedBid(a,bidId){if(a)a.observedSocialBids=(a.observedSocialBids||[]).filter(ref=>ref.bidId!==bidId);}
  function requesterResponseEvent(st,a,bidId){
    return (st.events||[]).find(e=>e?.data?.responseToBid===bidId&&e.data?.target===a.id&&e.data?.perceivedByTarget===true&&['accepted','refused'].includes(e.data?.responseKind))||null;
  }
  function consumeRequesterResponses(st){
    for(const requester of Object.values(st.agents||{})){
      const intent=requester.activeIntent,bidId=intent?.source?.context==='sleepSlotConflict'&&intent.kind==='awaitResponse'?intent.source.bidId:null;
      if(!bidId)continue;
      const response=requesterResponseEvent(st,requester,bidId);if(!response)continue;
      requester.action=null;requester.activeIntent=null;
    }
  }
  function yieldIntent(st,responder,bid){
    const existing=responder.activeIntent;
    if(existing?.kind==='yieldSleepSlot'&&existing.source?.type==='sleepSlotConflictResponse'&&existing.source.bidId===bid.id)return existing;
    if(existing||responder.action)return null;
    const intent={id:'intent:'+responder.id+':'+st.tick+':yieldSleepSlot:'+bid.id,kind:'yieldSleepSlot',createdTick:st.tick,lifecycle:'open',source:{type:'sleepSlotConflictResponse',bidId:bid.id,slotId:bid.data?.slot,tick:st.tick}};
    responder.activeIntent=intent;return intent;
  }
  function bindYieldDeparture(st,responder,bid,evaluation){
    const slot=SP.getSlot?.(st,bid.data?.slot);if(!slot||responder.posture?.slotId!==slot.id)return false;
    const intent=yieldIntent(st,responder,bid);if(!intent)return false;
    if(responder.action)return true;
    const egress=SP.slotEgressNodes?.(st,slot,responder,'walk')?.[0]||null;
    if(!egress)return true;
    const departure=E.buildAction?.(responder,{id:'wander',targetTile:egress});if(!departure)return true;
    intent.lifecycle='actionBound';departure.intentId=intent.id;responder.action=departure;
    E.adoptDecisionEvidence?.(st,responder,departure,{source:{type:'sleepSlotConflictResponse',tick:st.tick,bidId:bid.id,intentKind:'yieldSleepSlot'},contributors:[{kind:'need',key:'sleepNeed',role:'modifier',value:evaluation.sleepNeed},{kind:'association',key:'ownSlotInsistence',role:'modifier',value:evaluation.ownAssociationStrength},{kind:'relationship',key:'requesterSignal',role:'modifier',value:evaluation.relationshipSignal}],utility:evaluation.score*100});
    return true;
  }
  function retryPendingYieldDepartures(st){
    for(const responder of Object.values(st.agents||{})){
      const intent=responder.activeIntent;if(responder.action||intent?.kind!=='yieldSleepSlot'||intent.source?.type!=='sleepSlotConflictResponse')continue;
      const bid=E.bidEvent?.(st,intent.source.bidId);if(!bid)continue;
      bindYieldDeparture(st,responder,bid,responseEvaluation(st,responder,bid,intent.createdTick));
    }
  }
  function processSleepConflictResponses(st){
    consumeRequesterResponses(st);retryPendingYieldDepartures(st);
    for(const responder of Object.values(st.agents||{})){
      if(responder.kind!=='human'||responder.offMap||E.isSleeping?.(responder)||responder.action||responder.activeIntent)continue;
      const pick=newestObservedConflictBid(st,responder);if(!pick)continue;
      let understoodId=pick.ref.understoodEventId||null;
      if(!understoodId){
        const requester=st.agents?.[pick.bid.data?.bidFrom];
        understoodId=E.addEvent(responder.name+'理解了'+(requester?.name||'對方')+'希望處理這個睡眠位置占用衝突。','normal',[pick.bid.id],{actor:responder.id,target:requester?.id||null,action:'understandSleepSlotRequest',responseToBid:pick.bid.id,slot:pick.bid.data?.slot,responseKind:'understood',requestKind:pick.bid.data?.bidKind,position:E.positionRef?.(responder.position)||null});
        pick.ref.understoodEventId=understoodId;pick.ref.understoodTick=st.tick;
      }
      const evaluation=responseEvaluation(st,responder,pick.bid,pick.ref.observedTick);
      if(evaluation.response==='delay')continue;
      const requester=st.agents?.[pick.bid.data?.bidFrom],accepted=evaluation.response==='accept',action=accepted?'acceptSleepSlotYield':'refuseSleepSlotYield',responseKind=accepted?'accepted':'refused';
      const requesterObservation=requester?E.observeAgentContext(st,requester,responder):{observable:false};
      E.addEvent(accepted?responder.name+'接受了'+(requester?.name||'對方')+'的讓位要求。':responder.name+'拒絕了'+(requester?.name||'對方')+'的讓位要求。','normal',[pick.bid.id,understoodId].filter(Boolean),{actor:responder.id,target:requester?.id||null,action,responseToBid:pick.bid.id,slot:pick.bid.data?.slot,responseKind,requestKind:pick.bid.data?.bidKind,perceivedByTarget:requesterObservation.observable===true,position:E.positionRef?.(responder.position)||null});
      settleObservedBid(responder,pick.bid.id);
      if(accepted)bindYieldDeparture(st,responder,pick.bid,evaluation);
    }
  }
  function settleYieldCompletions(st){
    for(const responder of Object.values(st.agents||{})){
      const intent=responder.activeIntent;
      if(intent?.kind!=='yieldSleepSlot'||intent.source?.type!=='sleepSlotConflictResponse'||intent.source?.completedEventId)continue;
      const bid=E.bidEvent?.(st,intent.source.bidId);if(!bid)continue;
      if(responder.posture?.slotId===intent.source.slotId)continue;
      const requester=st.agents?.[bid.data?.bidFrom];
      intent.source.completedEventId=E.addEvent(responder.name+'已實際離開原本占用的睡眠位置。','normal',[bid.id],{actor:responder.id,target:requester?.id||null,action:'completeSleepSlotYield',responseToBid:bid.id,slot:intent.source.slotId,responseKind:'completed',position:E.positionRef?.(responder.position)||null});
    }
  }

  E.registerEventCreatedListener?.('sleepConflict.observe-bid',observeSleepConflictBid,150);
  E.registerActionLabelResolver?.('sleepConflict.label',(st,a)=>a?.action?.kind==='sleep'&&a.action.phase==='conflictWait'?(a.action.conflictWaitSource==='attentionReassessment'?'睡眠・引起注意後重新觀察偏好位置':'睡眠・等待偏好的睡眠位置空出'):null,120);
  if(!E.registerRuntimeHook)throw new Error('sleep-conflict.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','sleepConflict.respond',()=>processSleepConflictResponses(E.getState()),275);
  E.registerRuntimeHook('afterTick','sleepConflict.complete-yield',()=>settleYieldCompletions(E.getState()),150);

  const api={VERSION,OCCUPANCY_REASSESS_TICKS,ATTENTION_REASSESS_TICKS,associationStrength,selfSleepAssociations,hasPreferredSleepConflict,conflictCandidates,resolveSleepChoice,stepSleepConflict,responseEvaluation,consumeRequesterResponses,processSleepConflictResponses,settleYieldCompletions,observeSleepConflictBid};
  window.SimSleepConflict=Object.freeze(api);
  E.SLEEP_SLOT_CONFLICT_VERSION=VERSION;
})();
