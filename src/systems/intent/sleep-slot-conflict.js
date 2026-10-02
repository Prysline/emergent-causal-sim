(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial,U=window.SimUsage;
  if(!E||!W||!SP||!U)return;
  if(typeof E.observeAgentContext!=='function')throw new Error('sleep-slot-conflict requires Engine observeAgentContext().');
  if(typeof E.performAttentionInteraction!=='function')throw new Error('sleep-slot-conflict requires Engine performAttentionInteraction().');
  if(typeof E.captureConflictResolutionEvidence!=='function')throw new Error('sleep-slot-conflict requires Decision Evidence conflict capture.');
  const VERSION=W.DELIBERATION_SCHEMA_VERSION;
  const OCCUPANCY_WAIT_TICKS=3;
  const RESPONSE_WAIT_TICKS=3;
  const ATTENTION_STIMULUS=Object.freeze({kind:'voice',intensity:24});
  const REQUEST_STIMULUS=Object.freeze({kind:'voice',intensity:28});
  const DRIVE_STIMULUS=Object.freeze({kind:'raised-voice',intensity:38});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const HIGH_COMMITMENT_ACTIONS=new Set(['eat','drinkWater','drinkAlcohol','sleep','restockContainer','externalSupply']);

  function conflictObservation(st,a,slotId){
    const occupant=SP.slotOccupant(st,slotId,a?.id)||null;
    if(!occupant)return {occupant:null,observation:Object.freeze({observable:false,reason:'no-agent-occupant'})};
    return {occupant,observation:E.observeAgentContext(st,a,occupant)};
  }
  function preferredSleepSlotConflicts(st,a){
    const associations=U.sleepTargetAssociations?.(st,a)||[],out=[];
    for(const association of associations){
      const availability=SP.sleepTargetAvailability?.(st,a,association.target);
      if(availability?.reason!=='occupied')continue;
      const observed=conflictObservation(st,a,association.target.id);
      out.push({
        preferredTarget:clone(association.target),
        associationReasons:clone(association.reasons||[]),
        associationContributors:clone(association.contributors||[]),
        preferenceDelta:Number(association.preferenceDelta)||0,
        objectiveExclusionReason:'occupied',
        occupantId:observed.occupant?.id||null,
        observation:clone(observed.observation)
      });
    }
    return out.sort((x,y)=>y.preferenceDelta-x.preferenceDelta||String(x.preferredTarget.id).localeCompare(String(y.preferredTarget.id)));
  }
  function preferredSleepSlotConflict(st,a){return preferredSleepSlotConflicts(st,a)[0]||null;}
  function candidate(kind,base,conflict,extraContributors=[]){
    return {kind,baseUtility:base,utility:base,contributors:[
      {kind:'usagePreference',key:'preferredSleepSlot',role:'conflictResolution',value:conflict.preferenceDelta,target:clone(conflict.preferredTarget)},
      ...clone(extraContributors)
    ]};
  }
  function resolutionCandidates(st,a,conflict=preferredSleepSlotConflict(st,a)){
    if(!conflict)return [];
    const legal=SP.sleepTargets(st,a),hasAlternate=legal.length>0,insistence=clamp(Number(conflict.preferenceDelta)||0,0,10),noAlternate=hasAlternate?0:6,obs=conflict.observation||{observable:false},out=[];
    if(hasAlternate)out.push(candidate('useAlternate',56-insistence*1.45,conflict,[{kind:'availability',key:'legalAlternate',role:'modifier',value:legal.length}]));
    out.push(candidate('waitForSlot',42+insistence*1.35+noAlternate,conflict,[{kind:'availability',key:'noAlternate',role:'modifier',value:hasAlternate?0:1}]));
    out.push(candidate('deferSleep',34+(hasAlternate?0:2),conflict));
    if(obs.observable){
      out.push(candidate('gainAttention',39+insistence*1.15+noAlternate*.6,conflict,[{kind:'observation',key:'occupantObserved',role:'eligibility',observedTick:obs.observedTick,observedAgentKind:obs.observedAgentKind}]));
      if(obs.observedAgentKind==='human'){
        out.push(candidate('requestYield',41+insistence*1.45+noAlternate*.8,conflict,[{kind:'observation',key:'humanOccupantObserved',role:'eligibility',observedTick:obs.observedTick}]));
        out.push(candidate('driveAwayNonPhysical',28+insistence*1.2+noAlternate*.7,conflict,[{kind:'interaction',key:'nonPhysicalOnly',role:'constraint',value:1}]));
      }
    }
    return out.map(c=>({...c,utility:c.utility+E.rand(-4,4)})).sort((x,y)=>y.utility-x.utility||x.kind.localeCompare(y.kind));
  }
  function sleepDecisionOption(st,a,base){
    const conflict=preferredSleepSlotConflict(st,a);if(!conflict)return null;
    const contributors=[...(base.decisionContributors||E.decisionContributorsForAction?.(a,'sleep')||[]),{kind:'sleepSlotConflict',key:'preferredSlotOccupied',role:'trigger',target:clone(conflict.preferredTarget),associationReasons:clone(conflict.associationReasons),objectiveExclusionReason:'occupied'}];
    return {...base,why:[...(base.why||[]),'偏好睡眠位置目前因 Agent occupancy 不可用'],decisionContributors:contributors,sleepConflict:true};
  }
  function captureResolution(st,a,action,conflict,candidates,selected){
    return E.captureConflictResolutionEvidence(st,a,action,{
      preferredTarget:conflict.preferredTarget,
      associationReasons:conflict.associationReasons,
      observation:conflict.observation,
      candidates:candidates.map(c=>({kind:c.kind,utility:c.utility,contributors:c.contributors})),
      selectedResolution:selected.kind,
      contributors:selected.contributors,
      priorConflictDecisionId:action.conflictResolutionDecisionId||null
    });
  }
  function latestResponseEvent(st,bidId){
    return (st.events||[]).find(e=>e.data?.responseToBid===bidId&&['sleepSlotYieldAccepted','sleepSlotYieldRefused'].includes(e.data?.action))||null;
  }
  function addConflictBid(st,a,conflict,{drive=false}={}){
    const occupantId=conflict.observation?.observable?conflict.observation.targetId:null,occupant=occupantId&&st.agents?.[occupantId];if(!occupant)return null;
    const stimulus=drive?DRIVE_STIMULUS:REQUEST_STIMULUS;
    const attention=E.performAttentionInteraction(a,occupant,{stimulus});
    const after=E.observeAgentContext(st,a,occupant),awake=after.observable&&after.observedActionKind!=='sleep';
    const action=drive?'sleepSlotDriveRequest':'sleepSlotYieldRequest',bidKind=drive?'sleepSlotDrive':'sleepSlotYield';
    const text=drive?a.name+'以較強硬的非物理方式要求'+occupant.name+'離開偏好的睡眠位置。':a.name+'要求'+occupant.name+'讓出偏好的睡眠位置。';
    const id=E.addEvent(text,drive?'warn':'normal',[attention.eventId].filter(Boolean),{
      actor:a.id,target:occupant.id,action,socialBid:true,bidKind,interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:a.id,bidTo:occupant.id,perceivedByTarget:!!awake,
      preferredSlot:conflict.preferredTarget.id,interactionPurpose:drive?'driveAwayNonPhysical':'requestYield',stimulusKind:stimulus.kind,stimulusIntensity:stimulus.intensity,position:E.positionRef?.(a.position)||null
    });
    const event=st.causes?.[id];if(event?.data)event.data.bidId=id;
    if(awake&&typeof E.addObservedBid==='function')E.addObservedBid(st,occupant,event,st.tick);
    return {id,perceived:!!awake,attention,afterObservation:clone(after)};
  }
  function chooseSurface(st,a,action){
    const conflict=preferredSleepSlotConflict(st,a);if(!conflict)return {handled:false};
    const candidates=resolutionCandidates(st,a,conflict),selected=candidates[0];if(!selected)return {handled:false};
    captureResolution(st,a,action,conflict,candidates,selected);
    action.preferredSleepSlotId=conflict.preferredTarget.id;
    action.conflictObservedOccupantId=conflict.observation?.observable?conflict.observation.targetId:null;
    if(selected.kind==='useAlternate')return {handled:false};
    if(selected.kind==='deferSleep')return {handled:true,abortReason:'暫時不處理偏好睡眠位置的占用衝突'};
    if(selected.kind==='waitForSlot'){
      action.phase='conflictWait';action.conflictWaitUntilTick=st.tick+OCCUPANCY_WAIT_TICKS;action.conflictObservation=clone(conflict.observation);return {handled:true};
    }
    if(selected.kind==='gainAttention'){
      const occupant=conflict.observation?.observable&&st.agents?.[conflict.observation.targetId];
      if(occupant)E.performAttentionInteraction(a,occupant,{stimulus:ATTENTION_STIMULUS});
      action.phase='conflictReevaluate';return {handled:true};
    }
    if(selected.kind==='requestYield'||selected.kind==='driveAwayNonPhysical'){
      const bid=addConflictBid(st,a,conflict,{drive:selected.kind==='driveAwayNonPhysical'});
      action.conflictRequestBidId=bid?.id||null;action.conflictResponseUntilTick=st.tick+RESPONSE_WAIT_TICKS;action.phase=bid?.id?'conflictAwaitResponse':'conflictReevaluate';return {handled:true};
    }
    return {handled:false};
  }
  function conflictChanged(st,a,action){
    const slotId=action.preferredSleepSlotId;if(!slotId)return true;
    const availability=SP.sleepTargetAvailability?.(st,a,{kind:'slot',id:slotId});
    if(availability?.available)return true;
    const occupant=SP.slotOccupant(st,slotId,a.id);if(!occupant)return true;
    const next=E.observeAgentContext(st,a,occupant),prev=action.conflictObservation;
    return JSON.stringify(next)!==JSON.stringify(prev);
  }
  function stepConflict(st,a,action){
    if(action.phase==='conflictReevaluate'){action.phase='chooseSurface';return {handled:true};}
    if(action.phase==='conflictWait'){
      const availability=SP.sleepTargetAvailability?.(st,a,{kind:'slot',id:action.preferredSleepSlotId});
      if(availability?.available||conflictChanged(st,a,action)||st.tick>=action.conflictWaitUntilTick){action.phase='chooseSurface';return {handled:true};}
      return {handled:true};
    }
    if(action.phase==='conflictAwaitResponse'){
      const availability=SP.sleepTargetAvailability?.(st,a,{kind:'slot',id:action.preferredSleepSlotId});
      if(availability?.available){action.phase='chooseSurface';return {handled:true};}
      const response=action.conflictRequestBidId&&latestResponseEvent(st,action.conflictRequestBidId);
      if(response){action.phase='chooseSurface';return {handled:true};}
      if(st.tick>=action.conflictResponseUntilTick){
        const bid=st.causes?.[action.conflictRequestBidId],target=bid?.data?.bidTo&&st.agents?.[bid.data.bidTo],obs=target?E.observeAgentContext(st,a,target):{observable:false,reason:'missing-agent'};
        E.addEvent(a.name+'等了一會兒，沒有得到立即回應，重新考慮睡眠位置衝突。','normal',action.conflictRequestBidId?[action.conflictRequestBidId]:[],{
          actor:a.id,action:'sleepSlotRequestWaitEnded',bidId:action.conflictRequestBidId||null,visibility:'private',owner:a.id,preferredSlot:action.preferredSleepSlotId,
          responderContextObserved:obs.observable===true,observedResponderActionKind:obs.observable?obs.observedActionKind:null,observedResponderPosture:obs.observable?obs.observedPosture:null
        });
        action.phase='chooseSurface';return {handled:true};
      }
      return {handled:true};
    }
    return {handled:false};
  }
  function newestObservedConflictBid(st,a){
    return (E.observedBidRefs?.(st,a)||[]).map(ref=>({ref,bid:E.bidEvent?.(st,ref.bidId)})).filter(x=>['sleepSlotYield','sleepSlotDrive'].includes(x.bid?.data?.bidKind)&&x.bid?.data?.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;
  }
  function responseEvaluation(st,responder,bid){
    const requester=bid?.data?.bidFrom&&st.agents?.[bid.data.bidFrom];if(!requester)return null;
    const rawSocial=Number(responder.traits?.social),sociability=clamp(Number.isFinite(rawSocial)?rawSocial:.5,0,1),relationship=clamp(Number(E.relationshipSignal?.(responder,requester.id))||0,-1,1),affect=clamp(Number(E.affectResponseSignal?.(responder))||0,-1,1);
    const commitment=responder.action&&responder.action.kind!=='sleepSlotResponse'?(HIGH_COMMITMENT_ACTIONS.has(responder.action.kind)?.28:.14):0;
    const score=clamp(.38+sociability*.24+relationship*.18+affect*.12-commitment,0,1);
    const response=score>=.58?'accept':score<.31?'refuse':'delay';
    return {score,response,requesterId:requester.id,bidId:bid.id,slotId:bid.data?.preferredSlot||null,bidKind:bid.data?.bidKind||null};
  }
  function bindResponse(st,a,evaluation){
    const action={kind:'sleepSlotResponse',phase:'respond',started:st.tick,responseKind:evaluation.response,responseToBid:evaluation.bidId,targetAgent:evaluation.requesterId,slotId:evaluation.slotId};
    const intent={id:'intent:'+a.id+':'+st.tick+':respondSleepSlotConflict:'+evaluation.bidId,kind:'respondSleepSlotConflict',createdTick:st.tick,lifecycle:'actionBound',source:{type:'socialBid',bidId:evaluation.bidId,observedTick:st.tick}};
    action.intentId=intent.id;a.action=action;a.activeIntent=intent;
    E.adoptDecisionEvidence?.(st,a,action,{source:{type:'socialBid',tick:st.tick,intentKind:intent.kind,bidId:evaluation.bidId},contributors:[{kind:'socialBid',key:evaluation.bidKind,role:'motivation',bidId:evaluation.bidId,fromAgent:evaluation.requesterId},{kind:'responseAgency',key:'yieldScore',role:'modifier',value:evaluation.score}],utility:40+evaluation.score*40});
  }
  function promoteResponses(st){
    for(const a of Object.values(st.agents||{})){
      if(a.kind!=='human'||a.offMap||E.isSleeping?.(a)||a.action||a.activeIntent)continue;
      const pick=newestObservedConflictBid(st,a);if(!pick)continue;
      const evaluation=responseEvaluation(st,a,pick.bid);if(!evaluation||evaluation.response==='delay')continue;
      const best=E.candidateIntents?.(st,a)?.[0]||null,responseUtility=40+evaluation.score*40;
      if(best&&best.utility>responseUtility)continue;
      bindResponse(st,a,evaluation);
    }
  }
  function settleObservedBid(a,bidId){if(a)a.observedSocialBids=(a.observedSocialBids||[]).filter(ref=>ref.bidId!==bidId);}
  function resolveResponses(st){
    for(const a of Object.values(st.agents||{})){
      const action=a.action;if(action?.kind!=='sleepSlotResponse'||action.phase!=='respond')continue;
      const bid=E.bidEvent?.(st,action.responseToBid),requester=bid?.data?.bidFrom&&st.agents?.[bid.data.bidFrom];
      if(!bid||!requester){a.action=null;a.activeIntent=null;continue;}
      if(action.responseKind==='accept'){
        const responseId=E.addEvent(a.name+'接受了'+requester.name+'的讓位要求。','good',[bid.id],{actor:a.id,target:requester.id,action:'sleepSlotYieldAccepted',responseToBid:bid.id,preferredSlot:action.slotId,position:E.positionRef?.(a.position)||null});
        const left=E.standUp?.(a)===true;
        if(left){
          const leaveId=E.addEvent(a.name+'自行離開了原本占用的睡眠位置。','normal',[responseId],{actor:a.id,target:requester.id,action:'leaveSleepSlot',slot:action.slotId,position:E.positionRef?.(a.position)||null});
          if(SP.sleepTargetAvailability?.(st,requester,{kind:'slot',id:action.slotId})?.available)E.addEvent('原本被占用的睡眠位置現在可再次使用。','system',[leaveId],{actor:a.id,target:requester.id,action:'sleepSlotAvailable',slot:action.slotId});
        }
      }else{
        E.addEvent(a.name+'拒絕了'+requester.name+'這次的讓位要求。','normal',[bid.id],{actor:a.id,target:requester.id,action:'sleepSlotYieldRefused',responseToBid:bid.id,preferredSlot:action.slotId,position:E.positionRef?.(a.position)||null});
      }
      settleObservedBid(a,bid.id);a.action=null;a.activeIntent=null;
    }
  }

  E.registerActionLabelResolver?.('sleepSlotConflict.labels',(st,a)=>{
    const p=a?.action;if(!p)return null;
    if(p.kind==='sleepSlotResponse')return p.responseKind==='accept'?'回應睡眠位置讓位要求・準備讓位':'回應睡眠位置讓位要求・拒絕';
    if(p.kind!=='sleep')return null;
    if(p.phase==='conflictWait')return '睡眠・等待偏好位置空出';
    if(p.phase==='conflictAwaitResponse')return '睡眠・等待讓位要求回應';
    if(p.phase==='conflictReevaluate')return '睡眠・重新評估偏好位置衝突';
    return null;
  },120);

  if(!E.registerRuntimeHook)throw new Error('sleep-slot-conflict requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','sleepSlotConflict.resolve-responses',()=>resolveResponses(E.getState()),275);
  E.registerRuntimeHook('afterTick','sleepSlotConflict.promote-responses',()=>promoteResponses(E.getState()),750);

  window.SimSleepSlotConflict=Object.freeze({
    VERSION,OCCUPANCY_WAIT_TICKS,RESPONSE_WAIT_TICKS,ATTENTION_STIMULUS,REQUEST_STIMULUS,DRIVE_STIMULUS,
    preferredSleepSlotConflicts,preferredSleepSlotConflict,resolutionCandidates,sleepDecisionOption,chooseSurface,stepConflict,responseEvaluation,newestObservedConflictBid,promoteResponses,resolveResponses
  });
})();