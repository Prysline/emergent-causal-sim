(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial,U=window.SimUsage;
  if(!E||!W||!SP||!U)return;
  if(typeof E.observeAgentContext!=='function'||typeof E.performAttentionInteraction!=='function')throw new Error('sleep-conflict requires shared Agent-context observation + attention.');
  const VERSION=W.DELIBERATION_SCHEMA_VERSION||'11.44.0-sleep-slot-conflict';
  const REQUEST_STIMULUS=Object.freeze({kind:'sound',intensity:18});
  const DRIVE_STIMULUS=Object.freeze({kind:'sound',intensity:28});
  if(E.INTENT_ZH)E.INTENT_ZH.respondSleepSlotConflict='回應睡位衝突';

  const clone=value=>value==null?value:structuredClone(value);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const selfReasons=reasons=>(reasons||[]).filter(r=>r?.direction==='self'&&Number(r.signal)>0);

  function preferredSleepConflict(st,a){
    const conflicts=[];
    for(const target of U.sleepAssociationTargets?.(st,a)||[]){
      const reasons=selfReasons(U.associationReasons(st,a,'sleep',target));if(!reasons.length)continue;
      const availability=SP.sleepTargetAvailability?.(st,a,target);if(availability?.reason!=='occupied'||!availability.occupantId)continue;
      const contributors=U.preferenceContributors(st,a,'sleep',target).filter(c=>c?.direction==='self'&&Number(c.delta)>0);
      const persistence=clamp(contributors.reduce((sum,c)=>sum+(Number(c.delta)||0),0),0,U.PREFERENCE_CAP||10);
      conflicts.push({preferredSlot:clone(target),associationReasons:clone(reasons),associationContributors:clone(contributors),persistence,occupantWorldId:availability.occupantId});
    }
    return conflicts.sort((x,y)=>y.persistence-x.persistence||String(x.preferredSlot.id).localeCompare(String(y.preferredSlot.id)))[0]||null;
  }

  function resolutionCandidates(st,a,conflict,legalTargets=SP.sleepTargets(st,a),{priorOutcome=null}={}){
    if(!conflict)return {observation:null,candidates:[]};
    const occupant=st.agents?.[conflict.occupantWorldId]||null;
    const observation=occupant?E.observeAgentContext(st,a,occupant):Object.freeze({observable:false,reason:'missing-agent'});
    const p=conflict.persistence||0,out=[];
    if((legalTargets||[]).length)out.push({kind:'alternateSleep',score:48-p*1.2,contributors:[{kind:'associationPersistence',value:p,direction:'againstAlternate'}]});
    out.push({kind:'waitForSlot',score:38+p*.5,contributors:[{kind:'associationPersistence',value:p,direction:'forPersistence'}]});
    if(observation?.observable){
      const sleeping=observation.observedActionKind==='sleep';
      out.push({kind:'gainAttention',score:40+p*.5+(sleeping?3:0),stimulus:REQUEST_STIMULUS,contributors:[{kind:'associationPersistence',value:p},{kind:'observedContext',key:'sleeping',value:sleeping}]});
      if(observation.observedAgentKind==='human'){
        out.push({kind:'requestYield',score:42+p*.8+(priorOutcome==='noResponse'||priorOutcome==='deferred'?-4:0),stimulus:REQUEST_STIMULUS,contributors:[{kind:'associationPersistence',value:p}]});
        out.push({kind:'nonphysicalDriveAway',score:34+p*.9+(priorOutcome==='refused'||priorOutcome==='noResponse'?12:0),stimulus:DRIVE_STIMULUS,contributors:[{kind:'associationPersistence',value:p},{kind:'priorOutcome',value:priorOutcome}]});
      }
    }
    out.push({kind:'deferSleepConflict',score:30,contributors:[{kind:'fallback',key:'defer'}]});
    return {observation,candidates:out.sort((x,y)=>y.score-x.score||x.kind.localeCompare(y.kind))};
  }

  function captureResolution(st,a,action,conflict,evaluation,selected){
    return E.captureConflictResolutionEvidence?.(st,a,action,{
      preferredSlot:conflict.preferredSlot,
      associationReasons:conflict.associationReasons,
      observation:evaluation.observation?.observable?evaluation.observation:{observable:false,reason:evaluation.observation?.reason||'unobserved'},
      candidates:evaluation.candidates,
      selectedResolution:selected.kind,
      contributors:selected.contributors||[],
      priorConflictDecisionId:action.conflictResolutionDecisionId||null
    })||null;
  }

  function addConflictBid(st,a,target,action,kind,attention){
    const bidKind=kind==='requestYield'?'yieldSleepSlotRequest':'leaveSleepSlotDemand';
    const interactionKind=kind==='requestYield'?'requestYield':'nonphysicalDriveAway';
    const perceivedByTarget=!E.isSleeping(target)&&E.observeAgentContext(st,target,a)?.observable===true;
    const text=kind==='requestYield'?a.name+'要求'+target.name+'讓出自己偏好的睡眠位置。':a.name+'以較強硬但非物理的方式要求'+target.name+'離開睡眠位置。';
    const id=E.addEvent(text,kind==='requestYield'?'normal':'warn',attention?.eventId?[attention.eventId]:[],{actor:a.id,target:target.id,action:interactionKind,socialBid:true,bidKind,interactionKind,expectsResponse:true,bidFrom:a.id,bidTo:target.id,preferredSlotId:action.conflictPreferredSlot||null,perceivedByTarget,position:E.positionRef(a.position)});
    const event=st.causes?.[id];if(event?.data)event.data.bidId=id;
    if(perceivedByTarget)E.addObservedBid?.(st,target,event,st.tick);
    return id;
  }

  function higherPriorityConflictInterrupt(st,a){
    const emergency=E.emergencyChoice?.(st,a);return emergency&&emergency.intentKind!=='sleep'?emergency:null;
  }

  function stepSleepPreferredSlotConflict(st,a,action,legalTargets){
    if(action.phase==='conflictWait'){
      const interrupt=higherPriorityConflictInterrupt(st,a);if(interrupt)return {handled:true,abortReason:'等待偏好睡位期間出現更迫切的需求'};
      const availability=SP.sleepTargetAvailability?.(st,a,{kind:'slot',id:action.conflictPreferredSlot});
      if(availability?.available||st.tick>action.conflictWaitStarted){action.phase='chooseSurface';return {handled:true};}
      return {handled:true};
    }
    if(action.phase==='conflictAwaitResponse'){
      const interrupt=higherPriorityConflictInterrupt(st,a);if(interrupt)return {handled:true,abortReason:'等待睡位互動回應期間出現更迫切的需求'};
      const response=(st.events||[]).find(e=>e.data?.responseToBid===action.conflictBidId);
      if(response){
        action.conflictPriorOutcome=response.data?.sleepConflictResponse||null;action.phase='chooseSurface';return {handled:true};
      }
      if(st.tick>=action.conflictResponseUntil){
        E.addEvent(a.name+'沒有把這次未即時收到回應解讀成拒絕，重新考慮睡位衝突。','normal',[action.conflictBidId].filter(Boolean),{actor:a.id,action:'sleepConflictNoResponse',bidId:action.conflictBidId,visibility:'private',owner:a.id,position:E.positionRef(a.position)});
        action.conflictPriorOutcome='noResponse';action.phase='chooseSurface';return {handled:true};
      }
      return {handled:true};
    }
    if(action.phase!=='chooseSurface')return {handled:false};
    const conflict=preferredSleepConflict(st,a);if(!conflict)return {handled:false};
    if(action.conflictBypassTarget===conflict.preferredSlot.id&&(legalTargets||[]).length){action.conflictBypassTarget=null;return {handled:false};}
    action.conflictPreferredSlot=conflict.preferredSlot.id;
    const evaluation=resolutionCandidates(st,a,conflict,legalTargets,{priorOutcome:action.conflictPriorOutcome||null});
    const selected=evaluation.candidates[0];if(!selected)return {handled:false};
    captureResolution(st,a,action,conflict,evaluation,selected);
    if(selected.kind==='alternateSleep'){action.conflictBypassTarget=conflict.preferredSlot.id;return {handled:false};}
    if(selected.kind==='waitForSlot'){action.conflictWaitStarted=st.tick;action.phase='conflictWait';return {handled:true};}
    if(selected.kind==='deferSleepConflict')return {handled:true,abortReason:'暫時放棄處理偏好睡位衝突'};
    const target=evaluation.observation?.observable&&st.agents?.[evaluation.observation.targetId];if(!target){action.phase='chooseSurface';return {handled:true};}
    const attention=E.performAttentionInteraction(a,target,{stimulus:selected.stimulus});
    if(selected.kind==='gainAttention'){action.conflictPriorOutcome='attention';action.phase='chooseSurface';return {handled:true};}
    const bidId=addConflictBid(st,a,target,action,selected.kind,attention);
    action.conflictBidId=bidId;action.conflictResponseUntil=st.tick+(Number(E.REQUESTER_PATIENCE_TICKS)||3);action.phase='conflictAwaitResponse';return {handled:true};
  }

  function newestConflictBid(st,a){
    return (E.observedBidRefs?.(st,a)||[]).map(ref=>({ref,bid:E.bidEvent?.(st,ref.bidId)})).filter(x=>['yieldSleepSlotRequest','leaveSleepSlotDemand'].includes(x.bid?.data?.bidKind)&&x.bid.data.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;
  }
  function promoteResponderAgency(st){
    for(const responder of Object.values(st.agents||{})){
      if(responder.kind!=='human'||responder.offMap||E.isSleeping(responder)||responder.action||responder.activeIntent)continue;
      const pick=newestConflictBid(st,responder);if(!pick)continue;
      const requester=st.agents?.[pick.bid.data.bidFrom];if(!requester||requester.offMap)continue;
      const social=E.talkResponseFor?.(responder,requester)||'brief';
      const response=social==='engage'?'accepted':social==='decline'?'refused':'deferred';
      const actionName=response==='accepted'?'acceptSleepSlotRequest':response==='refused'?'refuseSleepSlotRequest':'deferSleepSlotRequest';
      const responseId=E.addEvent(response==='accepted'?responder.name+'接受了'+requester.name+'的睡位讓位要求。':response==='refused'?responder.name+'拒絕了'+requester.name+'的睡位讓位要求。':responder.name+'沒有立刻答應或拒絕'+requester.name+'的睡位讓位要求。','normal',[pick.bid.id],{actor:responder.id,target:requester.id,action:actionName,responseToBid:pick.bid.id,sleepConflictResponse:response,preferredSlotId:pick.bid.data.preferredSlotId||null,position:E.positionRef(responder.position)});
      responder.observedSocialBids=(responder.observedSocialBids||[]).filter(ref=>ref.bidId!==pick.bid.id);
      if(response!=='accepted'||responder.posture?.slotId!==pick.bid.data.preferredSlotId)continue;
      const leave=E.buildAction(responder,{id:'wander'});if(!leave)continue;
      const intent={id:'intent:'+responder.id+':'+st.tick+':respondSleepSlotConflict:'+pick.bid.id,kind:'respondSleepSlotConflict',createdTick:st.tick,lifecycle:'actionBound',source:{type:'sleepSlotConflictBid',bidId:pick.bid.id,responseEventId:responseId,tick:st.tick}};
      leave.intentId=intent.id;responder.activeIntent=intent;responder.action=leave;
    }
  }

  if(!E.registerRuntimeHook)throw new Error('sleep-conflict requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','sleepConflict.responder-agency',()=>promoteResponderAgency(E.getState()),350);

  Object.assign(E,{SLEEP_CONFLICT_SCHEMA_VERSION:VERSION,preferredSleepConflict,resolutionCandidates,stepSleepPreferredSlotConflict,newestConflictBid});
})();