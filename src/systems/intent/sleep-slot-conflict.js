(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial,U=window.SimUsage;
  if(!E||!W?.DELIBERATION_SCHEMA_VERSION||!SP||!U)return;
  if(typeof E.observeAgentContext!=='function'||typeof E.performAttentionInteraction!=='function')throw new Error('sleep-slot-conflict requires shared Agent-context observation + attention.');
  const VERSION=W.DELIBERATION_SCHEMA_VERSION;
  const OCCUPANCY_WAIT_TICKS=Math.max(1,Number(E.REQUESTER_PATIENCE_TICKS)||3);
  const RESPONSE_THRESHOLDS=Object.freeze({declineMax:.34,acceptMin:.62});
  const ATTENTION_STIMULUS=Object.freeze({kind:'sound',intensity:18});
  const REQUEST_STIMULUS=Object.freeze({kind:'sound',intensity:24});
  const SHOO_STIMULUS=Object.freeze({kind:'sound',intensity:34});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const round=v=>Math.round(v*1000)/1000;
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

  function contributorsFromReasons(reasons){
    return (reasons||[]).filter(r=>r?.direction==='self'&&['assignment','claim','habit'].includes(r.kind)).map(reason=>{
      let delta=0;
      if(reason.kind==='assignment')delta=(U.DELTA?.assignment||8)*(Number(reason.signal)||0);
      else if(reason.kind==='claim')delta=(U.DELTA?.claim||5)*(Number(reason.signal)||0);
      else if(reason.kind==='habit')delta=(U.DELTA?.habit||4)*clamp(Number(reason.signal)||0,0,1);
      return {...clone(reason),delta};
    }).filter(c=>c.delta>0);
  }
  function associationStrengthFromContributors(contributors){
    return clamp((contributors||[]).reduce((sum,c)=>sum+(Number(c.delta)||0),0),0,U.PREFERENCE_CAP||10);
  }
  function associationStrength(st,a,slotId){
    return associationStrengthFromContributors(contributorsFromReasons(U.associationReasons(st,a,'sleep',{kind:'slot',id:slotId})));
  }
  function preferredSleepConflicts(st,a){
    const out=[];
    for(const slot of SP.allSlots(st)){
      if(!slot.canSleep||!SP.slotAllows(slot,a)||!SP.slotPoseFits(slot,a,'lying'))continue;
      const reasons=U.associationReasons(st,a,'sleep',{kind:'slot',id:slot.id}).filter(r=>r?.direction==='self');
      if(!reasons.length)continue;
      const occupant=SP.slotOccupant(st,slot.id,a.id);if(!occupant)continue;
      const observation=E.observeAgentContext(st,a,occupant);
      const contributors=contributorsFromReasons(reasons),strength=associationStrengthFromContributors(contributors);
      out.push({slot,preferredSlot:{kind:'slot',id:slot.id},associationReasons:clone(reasons),associationContributors:clone(contributors),associationStrength:strength,occupant,observation});
    }
    return out.sort((x,y)=>y.associationStrength-x.associationStrength||String(x.slot.id).localeCompare(String(y.slot.id)));
  }
  function preferredSleepConflict(st,a){return preferredSleepConflicts(st,a)[0]||null;}
  function sleepChoiceConflictAvailable(st,a){return !!preferredSleepConflict(st,a);}

  function priorConflictDecisionId(a,parentDecisionId,slotId){
    const all=Array.isArray(a?.conflictResolutionEvidence)?a.conflictResolutionEvidence:[];
    return [...all].reverse().find(e=>e?.id&&e?.preferredSlot?.id===slotId&&e?.parentDecisionId!==parentDecisionId)?.id
      ||[...all].reverse().find(e=>e?.id&&e?.preferredSlot?.id===slotId)?.id||null;
  }
  function resolutionCandidates(st,a,action,legalCandidates=[]){
    const conflict=preferredSleepConflict(st,a);if(!conflict)return {conflict:null,candidates:[]};
    const parent=E.currentDecisionEvidence?.(a),parentUtility=Number.isFinite(parent?.utility)?parent.utility:50,strength=conflict.associationStrength,noAlternate=!legalCandidates.length;
    const candidates=[];
    const add=(kind,base,extra={})=>{const stochastic=E.rand(-3,3),utility=round(base+stochastic);candidates.push({kind,utility,stochastic,...extra});};
    const alternate=legalCandidates[0];
    if(alternate){
      const objective=clamp(Number(alternate.effectiveScore??alternate.score)||0,-6,12);
      add('alternate',parentUtility-objective-strength*.65,{target:{kind:'slot',id:alternate.id},objectiveScore:Number(alternate.objectiveScore??alternate.score),preferenceDelta:Number(alternate.preferenceDelta)||0,effectiveScore:Number(alternate.effectiveScore??alternate.score),contributors:clone(alternate.preferenceContributors||[])});
    }
    add('wait',parentUtility-2+strength*.55+(noAlternate?2:0),{contributors:clone(conflict.associationContributors)});
    if(conflict.observation?.observable){
      add('attention',parentUtility-1+strength*.65+(noAlternate?3:0),{targetAgent:conflict.observation.targetId,contributors:clone(conflict.associationContributors)});
      if(conflict.observation.observedAgentKind==='human'){
        add('requestYield',parentUtility+strength*.75+(noAlternate?3:0),{targetAgent:conflict.observation.targetId,contributors:clone(conflict.associationContributors)});
        add('shoo',parentUtility-4+strength*.85+(noAlternate?4:0),{targetAgent:conflict.observation.targetId,contributors:clone(conflict.associationContributors)});
      }
    }
    return {conflict,candidates:candidates.sort((x,y)=>y.utility-x.utility||x.kind.localeCompare(y.kind))};
  }
  function chooseResolution(st,a,action,legalCandidates=[]){
    const result=resolutionCandidates(st,a,action,legalCandidates),conflict=result.conflict,candidates=result.candidates;if(!conflict||!candidates.length)return null;
    const selected=candidates[0],parentDecisionId=action?.decisionId||E.currentDecisionEvidence?.(a)?.id||null;
    const evidence=E.captureConflictResolutionEvidence?.(st,a,action,{preferredSlot:conflict.preferredSlot,associationReasons:conflict.associationReasons,observation:conflict.observation?.observable?conflict.observation:null,conflictReason:'occupiedByAgent',candidates,selected:{kind:selected.kind,target:selected.target||null,targetAgent:selected.targetAgent||null,utility:selected.utility},contributors:selected.contributors||[],priorConflictDecisionId:priorConflictDecisionId(a,parentDecisionId,conflict.slot.id)})||null;
    return {...selected,conflict,evidenceId:evidence?.id||null};
  }

  function occupancyWaitIntent(st,a,resolution){
    const current=a.activeIntent;
    return {id:current?.id||('intent:'+a.id+':'+st.tick+':sleep:occupancyWait'),kind:'sleep',createdTick:current?.createdTick??st.tick,lifecycle:'open',source:{type:'sleepSlotOccupancyWait',slotId:resolution.conflict.slot.id,startedTick:st.tick,priorSource:clone(current?.source||null),conflictResolutionDecisionId:resolution.evidenceId||null},patienceUntilTick:st.tick+OCCUPANCY_WAIT_TICKS};
  }
  function sleepSlotOccupancyWaitPending(st,a,intent){
    if(intent?.kind!=='sleep'||intent?.source?.type!=='sleepSlotOccupancyWait')return false;
    if(SP.slotAvailable(st,intent.source.slotId,a.id))return false;
    return st.tick<(Number(intent.patienceUntilTick)||0);
  }

  function attentionForResolution(st,a,resolution,stimulus){
    const responder=st.agents?.[resolution.targetAgent];if(!responder)return null;
    return E.performAttentionInteraction(a,responder,{stimulus,causeIds:[]});
  }
  function awaitResponseIntent(st,a,bidId){
    return {id:'intent:'+a.id+':'+st.tick+':awaitResponse:'+bidId,kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId},patienceUntilTick:st.tick+Math.max(1,Number(E.REQUESTER_PATIENCE_TICKS)||3)};
  }
  function addYieldBid(st,requester,responder,resolution,mode,attention){
    const perceived=!E.isSleeping?.(responder)&&E.observeAgentContext(st,requester,responder)?.observable===true;
    const action=mode==='shoo'?'sleepSlotShoo':'sleepSlotYieldRequest',interactionKind=action;
    const text=mode==='shoo'?requester.name+'以較強硬的方式要求'+responder.name+'離開偏好的睡眠位置。':requester.name+'要求'+responder.name+'讓出偏好的睡眠位置。';
    const bidId=E.addEvent(text,mode==='shoo'?'warn':'normal',attention?.eventId?[attention.eventId]:[],{actor:requester.id,target:responder.id,action,slot:resolution.conflict.slot.id,interactionPurpose:mode==='shoo'?'displaceWithoutForce':'requestYield',interactionKind,socialBid:true,bidKind:action,expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:perceived,conflictResolutionDecisionId:resolution.evidenceId||null,position:E.positionRef?.(requester.position)||null});
    const bid=st.causes?.[bidId];if(bid?.data)bid.data.bidId=bidId;
    if(perceived)E.addObservedBid?.(st,responder,bid,st.tick);
    requester.action=null;requester.activeIntent=awaitResponseIntent(st,requester,bidId);
    return bidId;
  }
  function beginResolution(st,a,action,resolution){
    if(!resolution)return false;
    if(resolution.kind==='wait'){a.action=null;a.activeIntent=occupancyWaitIntent(st,a,resolution);return true;}
    if(resolution.kind==='attention'){attentionForResolution(st,a,resolution,ATTENTION_STIMULUS);if(a.action===action){action.phase='chooseSurface';action.sleepTarget=null;}return true;}
    if(resolution.kind==='requestYield'||resolution.kind==='shoo'){
      const responder=st.agents?.[resolution.targetAgent];if(!responder)return false;
      const stimulus=resolution.kind==='shoo'?SHOO_STIMULUS:REQUEST_STIMULUS,attention=attentionForResolution(st,a,resolution,stimulus);
      addYieldBid(st,a,responder,resolution,resolution.kind==='shoo'?'shoo':'request',attention);return true;
    }
    return false;
  }

  function newestObservedYieldBid(st,a){
    return (E.observedBidRefs?.(st,a)||[]).map(ref=>({ref,bid:E.bidEvent?.(st,ref.bidId)})).filter(x=>['sleepSlotYieldRequest','sleepSlotShoo'].includes(x.bid?.data?.bidKind)&&x.bid?.data?.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;
  }
  function responseEvaluation(st,responder,requester,bid){
    const slotId=bid?.data?.slot,own=slotId?associationStrength(st,responder,slotId):0;
    const rawSocial=Number(responder?.traits?.social),social=clamp(Number.isFinite(rawSocial)?rawSocial:.5,0,1),relationship=clamp(Number(E.relationshipSignal?.(responder,requester?.id))||0,-1,1),affect=clamp(Number(E.affectResponseSignal?.(responder))||0,-1,1),confrontational=bid?.data?.bidKind==='sleepSlotShoo'?.08:0;
    const finalScore=round(clamp(.52+(social-.5)*.22+relationship*.16+affect*.10-(own/(U.PREFERENCE_CAP||10))*.22-confrontational,0,1));
    const response=finalScore<RESPONSE_THRESHOLDS.declineMax?'decline':finalScore>=RESPONSE_THRESHOLDS.acceptMin?'accept':'delay';
    return {finalScore,response,contributors:[{kind:'trait',key:'social',role:'responderBias',value:social},{kind:'relationship',key:'requester',role:'responderBias',value:relationship},{kind:'affect',key:'current',role:'responderBias',value:affect},{kind:'usageAssociation',key:'ownPreferredSlot',role:'responderBias',value:own},{kind:'interaction',key:'confrontational',role:'responderBias',value:confrontational}]};
  }
  function settleObservedBid(a,bidId){if(a)a.observedSocialBids=(a.observedSocialBids||[]).filter(ref=>ref.bidId!==bidId);}
  function settleRequester(st,bid){const requester=st.agents?.[bid?.data?.bidFrom];if(requester?.activeIntent?.kind==='awaitResponse'&&requester.activeIntent.source?.bidId===bid.id)requester.activeIntent=null;}
  function responseCanCompete(st,a,utility){
    if(a.action||a.activeIntent)return false;
    const best=E.candidateIntents?.(st,a)?.[0]||null;return !best||best.utility<=utility;
  }
  function markUnderstood(st,responder,requester,pick){
    if(pick.ref.understoodTick!=null)return;
    pick.ref.understoodTick=st.tick;
    E.addEvent(responder.name+'注意到'+requester.name+'對睡眠位置的要求。','normal',[pick.bid.id],{actor:responder.id,target:requester.id,action:'sleepSlotRequestUnderstood',responseToBid:pick.bid.id,slot:pick.bid.data?.slot||null,position:E.positionRef?.(responder.position)||null});
  }
  function declineYield(st,responder,requester,pick,evaluation){
    E.addEvent(responder.name+'沒有答應讓出目前的睡眠位置。','normal',[pick.bid.id],{actor:responder.id,target:requester.id,action:'declineSleepSlotYield',responseToBid:pick.bid.id,slot:pick.bid.data?.slot||null,responseScore:evaluation.finalScore,position:E.positionRef?.(responder.position)||null});
    settleObservedBid(responder,pick.bid.id);settleRequester(st,pick.bid);
  }
  function pendingYieldIntent(st,responder,pending){
    return {id:'intent:'+responder.id+':'+st.tick+':respondSleepSlotRequest:'+pending.bidId,kind:'respondSleepSlotRequest',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId:pending.bidId,responseEventId:pending.responseEventId,slotId:pending.slotId}};
  }
  function planPendingYield(st,responder){
    const pending=responder?.pendingSleepSlotYield;if(!pending||responder.offMap||E.isSleeping?.(responder)||responder.action)return false;
    if(responder.activeIntent&&responder.activeIntent.kind!=='respondSleepSlotRequest')return false;
    const egress=SP.slotEgressNodes?.(st,pending.slotId,responder,'walk')?.[0]||null;
    if(!egress)return false;
    const action=E.buildAction?.(responder,{id:'wander',targetTile:egress});if(!action?.targetTile)return false;
    action.sleepSlotYield={slotId:pending.slotId,bidId:pending.bidId};
    const intent=responder.activeIntent||pendingYieldIntent(st,responder,pending);
    intent.lifecycle='actionBound';action.intentId=intent.id;responder.activeIntent=intent;responder.action=action;return true;
  }
  function acceptYield(st,responder,requester,pick,evaluation){
    const slotId=pick.bid.data?.slot||null;
    const responseId=E.addEvent(responder.name+'答應讓出目前的睡眠位置。','good',[pick.bid.id],{actor:responder.id,target:requester.id,action:'acceptSleepSlotYield',responseToBid:pick.bid.id,slot:slotId,responseScore:evaluation.finalScore,position:E.positionRef?.(responder.position)||null});
    settleObservedBid(responder,pick.bid.id);settleRequester(st,pick.bid);
    const pending={bidId:pick.bid.id,responseEventId:responseId,slotId:slotId,requesterId:requester.id};
    responder.pendingSleepSlotYield=pending;responder.activeIntent=pendingYieldIntent(st,responder,pending);
    planPendingYield(st,responder);
    return true;
  }
  function promoteYieldResponses(st){
    for(const responder of Object.values(st.agents||{})){
      if(responder.pendingSleepSlotYield){planPendingYield(st,responder);continue;}
      if(responder.kind!=='human'||responder.offMap||E.isSleeping?.(responder))continue;
      const pick=newestObservedYieldBid(st,responder);if(!pick)continue;
      const requester=st.agents?.[pick.bid.data?.bidFrom];if(!requester||requester.offMap)continue;
      const evaluation=responseEvaluation(st,responder,requester,pick.bid),utility=round(48+evaluation.finalScore*34);
      if(!responseCanCompete(st,responder,utility))continue;
      markUnderstood(st,responder,requester,pick);
      if(evaluation.response==='delay')continue;
      if(evaluation.response==='decline')declineYield(st,responder,requester,pick,evaluation);else acceptYield(st,responder,requester,pick,evaluation);
    }
  }
  function settleYieldCompletion(st){
    for(const responder of Object.values(st.agents||{})){
      const pending=responder.pendingSleepSlotYield;if(!pending)continue;
      if(responder.posture?.slotId===pending.slotId)continue;
      E.addEvent(responder.name+'實際離開了原本占用的睡眠位置。','normal',[pending.responseEventId].filter(Boolean),{actor:responder.id,target:pending.requesterId,action:'sleepSlotYieldCompleted',responseToBid:pending.bidId,slot:pending.slotId,position:E.positionRef?.(responder.position)||null});
      responder.pendingSleepSlotYield=null;
    }
  }
  function normalizeState(st){for(const a of Object.values(st?.agents||{}))if(a.pendingSleepSlotYield===undefined)a.pendingSleepSlotYield=null;return st;}
  function actionLabel(st,a){const action=a?.action;if(action?.kind!=='sleep')return null;if(action.phase==='chooseSurface'&&preferredSleepConflict(st,a))return '睡眠・處理偏好睡眠位置衝突';return null;}

  E.registerActionLabelResolver?.('sleepSlotConflict.label',actionLabel,80);
  if(!E.registerRuntimeHook)throw new Error('sleep-slot-conflict requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','sleepSlotConflict.responses',()=>promoteYieldResponses(E.getState()),250);
  E.registerRuntimeHook('afterTick','sleepSlotConflict.yield-completion',()=>settleYieldCompletion(E.getState()),150);
  E.registerRuntimeHook('afterReset','sleepSlotConflict.normalize',()=>normalizeState(E.getState()),650);

  const api={VERSION,OCCUPANCY_WAIT_TICKS,RESPONSE_THRESHOLDS,preferredSleepConflicts,preferredSleepConflict,sleepChoiceConflictAvailable,resolutionCandidates,chooseResolution,beginResolution,sleepSlotOccupancyWaitPending,responseEvaluation};
  window.SimSleepSlotConflict=Object.freeze(api);
  Object.assign(E,{SLEEP_SLOT_CONFLICT_VERSION:VERSION,preferredSleepConflicts,preferredSleepConflict,sleepChoiceConflictAvailable,sleepSlotOccupancyWaitPending});
})();