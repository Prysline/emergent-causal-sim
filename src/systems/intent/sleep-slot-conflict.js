(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial,U=window.SimUsage;
  if(!E||!W?.DELIBERATION_SCHEMA_VERSION||!SP||!U)return;
  if(typeof E.observeAgentContext!=='function'||typeof E.performAttentionInteraction!=='function')throw new Error('sleep-slot-conflict requires shared Agent-context observation + attention.');
  const VERSION=W.DELIBERATION_SCHEMA_VERSION;
  const OCCUPANCY_WAIT_TICKS=3;
  const ATTENTION_STIMULUS=Object.freeze({kind:'sound',intensity:18});
  const FORCEFUL_STIMULUS=Object.freeze({kind:'sound',intensity:34});
  const HIGH_COMMITMENT_ACTIONS=new Set(['eat','drinkWater','drinkAlcohol','sleep','restockContainer','externalSupply']);
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const actionKind=a=>E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;
  const selfReason=r=>r?.direction==='self'&&Number(r.signal)>0;
  const associationWeight=reasons=>Math.min(10,(reasons||[]).reduce((sum,r)=>sum+(r.kind==='assignment'?8:r.kind==='claim'?5:r.kind==='habit'?4*Math.max(0,Math.min(1,Number(r.signal)||0)):0),0));
  function sleepAssociations(st,a){
    return SP.allSlots(st).filter(slot=>slot.canSleep&&SP.slotAllows(slot,a)&&SP.slotPoseFits?.(slot,a,'lying')).map(slot=>{
      const target={kind:'slot',id:slot.id},reasons=U.associationReasons(st,a,'sleep',target).filter(selfReason);
      return reasons.length?{slot,target,reasons,weight:associationWeight(reasons)}:null;
    }).filter(Boolean).sort((x,y)=>y.weight-x.weight||String(x.slot.id).localeCompare(String(y.slot.id)));
  }
  function preferredConflict(st,a){
    for(const association of sleepAssociations(st,a)){
      const availability=SP.slotAvailability?.(st,association.slot.id,a.id)||{available:SP.slotAvailable(st,association.slot.id,a.id),reason:null};
      if(availability.available||availability.reason!=='occupiedByAgent')continue;
      const occupant=availability.occupantId&&st.agents?.[availability.occupantId];if(!occupant)continue;
      const observation=E.observeAgentContext(st,a,occupant);
      return {...association,conflictReason:'occupiedByAgent',occupantId:occupant.id,observation};
    }
    return null;
  }
  function sleepOpportunityExists(st,a){return SP.sleepTargets(st,a).length>0||!!preferredConflict(st,a);}
  function rankedAlternate(st,a,preferredSlotId){return U.rankSleepTargets(st,a,SP.sleepTargets(st,a).filter(t=>t.id!==preferredSlotId))[0]||null;}
  function resolutionCandidates(st,a,conflict){
    if(!conflict)return [];
    const out=[],alternate=rankedAlternate(st,a,conflict.slot.id),w=conflict.weight,noAlternate=!alternate,obs=conflict.observation;
    if(alternate)out.push({kind:'alternateSleep',score:58-Math.min(18,Number(alternate.effectiveScore)||0)-w*.7,target:{kind:'slot',id:alternate.id},contributors:[{kind:'legalAlternate',targetId:alternate.id,effectiveScore:alternate.effectiveScore},{kind:'associationPersistence',value:w,delta:-w*.7}]});
    out.push({kind:'waitForSlot',score:38+w*1.1+(noAlternate?8:0),contributors:[{kind:'associationPersistence',value:w,delta:w*1.1},{kind:'noAlternate',value:noAlternate,delta:noAlternate?8:0}]});
    if(obs?.observable){
      if(obs.observedActionKind==='sleep')out.push({kind:'gainAttention',score:40+w+(noAlternate?8:0)+6,contributors:[{kind:'associationPersistence',value:w,delta:w},{kind:'occupantSleeping',value:true,delta:6},{kind:'noAlternate',value:noAlternate,delta:noAlternate?8:0}]});
      else{
        out.push({kind:'gainAttention',score:34+w*.8+(noAlternate?6:0),contributors:[{kind:'associationPersistence',value:w,delta:w*.8},{kind:'noAlternate',value:noAlternate,delta:noAlternate?6:0}]});
        if(obs.observedAgentKind==='human'){
          out.push({kind:'requestYield',score:44+w*1.1+(noAlternate?8:0),contributors:[{kind:'associationPersistence',value:w,delta:w*1.1},{kind:'humanResponder',value:true,delta:4},{kind:'noAlternate',value:noAlternate,delta:noAlternate?8:0}]});
          out.push({kind:'nonPhysicalShoo',score:30+w*1.2+(noAlternate?10:0),contributors:[{kind:'associationPersistence',value:w,delta:w*1.2},{kind:'humanResponder',value:true,delta:2},{kind:'noAlternate',value:noAlternate,delta:noAlternate?10:0}]});
        }
      }
    }
    out.push({kind:'deferSleep',score:20+(noAlternate?2:0),contributors:[{kind:'temporaryDeferral',value:true,delta:20}]});
    return out.sort((x,y)=>y.score-x.score||x.kind.localeCompare(y.kind));
  }
  function captureConflictResolutionEvidence(st,a,action,{conflict,candidates,selectedResolution}={}){
    if(!st||!a||!action?.decisionId||!conflict||!selectedResolution)return null;
    a.conflictResolutionEvidence??=[];
    const prior=action.conflictResolutionDecisionId||null,sequence=a.conflictResolutionEvidence.length+1,id=`conflict-decision:${a.id}:${st.tick}:${sequence}`;
    const evidence=Object.freeze({id,parentDecisionId:action.decisionId,preferredSlot:{kind:'slot',id:conflict.slot.id},associationReasons:clone(conflict.reasons),conflictReason:conflict.conflictReason,observation:clone(conflict.observation),evaluatedCandidates:clone(candidates),selectedResolution,selectedScore:candidates.find(c=>c.kind===selectedResolution)?.score??null,evaluatedTick:st.tick,priorConflictDecisionId:prior});
    a.conflictResolutionEvidence.push(evidence);action.conflictResolutionDecisionId=id;return evidence;
  }
  function requestEvent(st,a,conflict,kind){
    const occupant=st.agents?.[conflict.occupantId];if(!occupant)return null;
    const observation=E.observeAgentContext(st,a,occupant);if(!observation.observable||observation.observedAgentKind!=='human'||observation.observedActionKind==='sleep')return null;
    const forceful=kind==='nonPhysicalShoo',attention=E.performAttentionInteraction(a,occupant,{stimulus:forceful?FORCEFUL_STIMULUS:ATTENTION_STIMULUS});
    if(!attention.performed)return null;
    const responderObservation=E.observeAgentContext(st,occupant,a),perceivedByTarget=responderObservation?.observable===true;
    const id=E.addEvent(forceful?`${a.name}更強硬地要求${occupant.name}離開自己偏好的睡眠位置。`:`${a.name}請${occupant.name}讓出自己偏好的睡眠位置。`,forceful?'warn':'normal',[attention.eventId],{actor:a.id,target:occupant.id,action:'sleepSlotYieldRequest',requestKind:forceful?'nonPhysicalShoo':'requestYield',preferredSlot:conflict.slot.id,expectsResponse:true,perceivedByTarget,position:E.positionRef?.(a.position)||null});
    return id;
  }
  function bindYieldAction(st,responder,requester,requestId,slotId){
    const action=E.buildAction?.(responder,{id:'wander'});if(!action)return false;
    const priorIntent=responder.activeIntent?.id||null,priorAction=actionKind(responder);
    responder.action=action;
    const intent=E.createIntent?.(st,responder,action)||{id:`intent:${responder.id}:${st.tick}:explore`,kind:'explore',createdTick:st.tick,lifecycle:'actionBound',source:{type:'sleepSlotYieldResponse',requestId}};
    intent.kind='explore';intent.lifecycle='actionBound';intent.source={type:'sleepSlotYieldResponse',requestId,requesterId:requester.id,slotId,priorIntentId:priorIntent,priorActionKind:priorAction};action.intentId=intent.id;responder.activeIntent=intent;
    E.adoptDecisionEvidence?.(st,responder,action,{source:{type:'sleepSlotYieldResponse',tick:st.tick,requestId,intentKind:'explore'},contributors:[{kind:'observedRequest',key:'sleepSlotYieldRequest',role:'motivation',requestId,fromAgent:requester.id,slotId}]});
    return true;
  }
  function responseForRequest(st,event){
    const d=event?.data||{},responder=d.target&&st.agents?.[d.target],requester=d.actor&&st.agents?.[d.actor];if(!responder||!requester||d.perceivedByTarget!==true||responder.kind!=='human'||responder.offMap||E.isSleeping?.(responder))return null;
    if(st.events.some(e=>e.data?.responseToRequest===event.id))return null;
    const observed=E.observeAgentContext(st,responder,requester);if(!observed.observable)return null;
    const current=actionKind(responder);if(current&&HIGH_COMMITMENT_ACTIONS.has(current))return null;
    const own=U.associationReasons(st,responder,'sleep',{kind:'slot',id:d.preferredSlot}).filter(selfReason);
    if(own.length){return E.addEvent(`${responder.name}拒絕讓出這個睡眠位置。`,'normal',[event.id],{actor:responder.id,target:requester.id,action:'sleepSlotYieldResponse',responseToRequest:event.id,requestUnderstood:true,response:'refused',preferredSlot:d.preferredSlot,position:E.positionRef?.(responder.position)||null});}
    const responseId=E.addEvent(`${responder.name}答應讓出這個睡眠位置。`,'good',[event.id],{actor:responder.id,target:requester.id,action:'sleepSlotYieldResponse',responseToRequest:event.id,requestUnderstood:true,response:'accepted',preferredSlot:d.preferredSlot,position:E.positionRef?.(responder.position)||null});
    bindYieldAction(st,responder,requester,event.id,d.preferredSlot);return responseId;
  }
  function latestResponse(st,requestId){return st.events.find(e=>e.data?.responseToRequest===requestId)||null;}
  function settleYieldCompletions(st){
    const completed=new Set((st.events||[]).filter(e=>e.data?.action==='sleepSlotYieldCompleted').map(e=>e.data?.responseEventId).filter(Boolean));
    const accepted=(st.events||[]).filter(e=>e.data?.action==='sleepSlotYieldResponse'&&e.data?.response==='accepted'&&!completed.has(e.id));
    for(const response of accepted){
      const responder=response.data?.actor&&st.agents?.[response.data.actor],requester=response.data?.target&&st.agents?.[response.data.target],slotId=response.data?.preferredSlot;
      if(!responder||!slotId||responder.posture?.slotId===slotId)continue;
      E.addEvent(`${responder.name}實際離開了先前占用的睡眠位置。`,'normal',[response.data.responseToRequest,response.id].filter(Boolean),{actor:responder.id,target:requester?.id||response.data?.target||null,action:'sleepSlotYieldCompleted',responseToRequest:response.data.responseToRequest||null,responseEventId:response.id,preferredSlot:slotId,completed:true,position:E.positionRef?.(responder.position)||null});
    }
  }
  function interruptConflictWaitForHigherPriority(st,a){
    if(a.action?.kind!=='sleep'||a.action.phase!=='slotConflict')return false;
    const best=E.candidateIntents?.(st,a)?.find(c=>c.intentKind!=='sleep')||null,current=E.baseUtilityForAction?.(a,'sleep')||0;
    if(!best||best.utility<=current+(Number(E.SOFT_SWITCH_MARGIN)||14))return false;
    E.addEvent(`${a.name}暫時不再處理睡眠位置衝突，改先處理更迫切的需求。`,'normal',[],{actor:a.id,action:'sleepSlotConflictInterrupted',challengerIntentKind:best.intentKind,currentUtility:current,challengerUtility:best.utility,position:E.positionRef?.(a.position)||null});
    a.action=null;a.activeIntent=null;return true;
  }
  function prepareConflict(st,a){
    const p=a.action;if(p?.kind!=='sleep')return;
    if(p.phase==='chooseSurface'){
      if(Number(p.conflictBypassTick)>=st.tick){delete p.conflictBypassTick;return;}
      const conflict=preferredConflict(st,a);if(!conflict)return;
      p.phase='slotConflict';p.preferredConflictSlot=conflict.slot.id;p.conflictOccupantId=conflict.occupantId;return;
    }
    if(p.phase!=='slotConflict')return;
    const conflict=preferredConflict(st,a);
    if(!conflict){delete p.conflictMode;delete p.conflictWaitUntilTick;delete p.waitingRequestId;p.phase='chooseSurface';return;}
    p.preferredConflictSlot=conflict.slot.id;p.conflictOccupantId=conflict.occupantId;
    if(interruptConflictWaitForHigherPriority(st,a))return;
    if(p.waitingRequestId){const response=latestResponse(st,p.waitingRequestId);if(response?.data?.response==='refused'){delete p.waitingRequestId;delete p.conflictWaitUntilTick;p.conflictRetryTick=st.tick;}
      else if(response?.data?.response==='accepted'){p.conflictMode='waitForSlot';p.conflictWaitUntilTick=Math.max(p.conflictWaitUntilTick||0,st.tick+OCCUPANCY_WAIT_TICKS);}
      else if(st.tick>=(p.conflictWaitUntilTick||0)){E.addEvent(`${a.name}等了一會兒，沒有得到睡眠位置讓位要求的立即回應。`,'normal',[p.waitingRequestId],{actor:a.id,action:'sleepSlotRequestWaitEnded',requestId:p.waitingRequestId,preferredSlot:conflict.slot.id,visibility:'private',owner:a.id});delete p.waitingRequestId;delete p.conflictWaitUntilTick;p.conflictRetryTick=st.tick;}
      return;
    }
    if(p.conflictMode==='waitForSlot'&&st.tick<(p.conflictWaitUntilTick||0))return;
    if(p.conflictMode==='waitForSlot'){delete p.conflictMode;delete p.conflictWaitUntilTick;p.conflictRetryTick=st.tick;}
  }
  function resolveConflict(st,a){
    const p=a.action;if(p?.kind!=='sleep'||p.phase!=='slotConflict'||p.waitingRequestId||p.conflictMode==='waitForSlot'||Number(p.conflictRetryTick)>st.tick)return;
    const conflict=preferredConflict(st,a);if(!conflict){p.phase='chooseSurface';return;}
    const candidates=resolutionCandidates(st,a,conflict),selected=candidates[0];if(!selected)return;
    captureConflictResolutionEvidence(st,a,p,{conflict,candidates,selectedResolution:selected.kind});
    if(selected.kind==='alternateSleep'){p.conflictBypassTick=st.tick+1;p.phase='chooseSurface';return;}
    if(selected.kind==='waitForSlot'){p.conflictMode='waitForSlot';p.conflictWaitUntilTick=st.tick+OCCUPANCY_WAIT_TICKS;return;}
    if(selected.kind==='gainAttention'){
      const occupant=st.agents?.[conflict.occupantId];if(occupant)E.performAttentionInteraction(a,occupant,{stimulus:ATTENTION_STIMULUS});p.conflictRetryTick=st.tick+1;return;
    }
    if(selected.kind==='requestYield'||selected.kind==='nonPhysicalShoo'){
      const requestId=requestEvent(st,a,conflict,selected.kind);if(requestId){p.waitingRequestId=requestId;p.conflictWaitUntilTick=st.tick+OCCUPANCY_WAIT_TICKS;}else p.conflictRetryTick=st.tick+1;return;
    }
    if(selected.kind==='deferSleep'){
      E.addEvent(`${a.name}暫時放棄處理目前的睡眠位置衝突。`,'normal',[],{actor:a.id,action:'sleepSlotConflictDeferred',preferredSlot:conflict.slot.id,position:E.positionRef?.(a.position)||null});a.action=null;a.activeIntent=null;
    }
  }
  function prepareTick(st){for(const a of Object.values(st.agents||{}))prepareConflict(st,a);}
  function settleTick(st){
    for(const a of Object.values(st.agents||{}))resolveConflict(st,a);
    const requests=st.events.filter(e=>e.tick===st.tick&&e.data?.action==='sleepSlotYieldRequest');for(const request of requests)responseForRequest(st,request);
    settleYieldCompletions(st);
    E.reconcileIntents?.(st);
  }
  function conflictActionLabel(st,a){const p=a?.action;if(p?.kind!=='sleep'||p.phase!=='slotConflict')return null;const slot=p.preferredConflictSlot?SP.getSlot(st,p.preferredConflictSlot):null,name=slot&&st.furniture?.[slot.furnitureId]?.name||'偏好睡眠位置';if(p.waitingRequestId)return`睡眠・等待${name}讓位回應`;if(p.conflictMode==='waitForSlot')return`睡眠・等待${name}空出`;return`睡眠・處理${name}被占用`;}

  E.registerDecisionOptionProvider?.('sleep.preferred-slot-conflict',(st,a)=>{
    const profile=E.sleepProfile?.(a),propensity=E.sleepPropensity?.(a);if(!st||!profile||a?.needs?.sleepNeed<profile.minimumSleepNeed||propensity<profile.sleepOpportunityThreshold||SP.sleepTargets(st,a).length||!preferredConflict(st,a))return null;
    const score=42+a.needs.sleepNeed*.55+Math.max(-8,(E.circadianSleepBias?.(a)||0)*.55)+Math.max(0,a.needs.fatigue-65)*.15;
    return {id:'sleep',score,why:['睡眠需求','偏好睡眠位置被 Agent 占用，仍有可評估的衝突處理方案'],decisionContributors:E.decisionContributorsForAction?.(a,'sleep')||[]};
  },90);
  E.registerActionLabelResolver?.('sleep.preferred-slot-conflict',(st,a)=>conflictActionLabel(st,a),90);
  if(!E.registerRuntimeHook)throw new Error('sleep-slot-conflict requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','sleepSlotConflict.prepare',()=>prepareTick(E.getState()),650);
  E.registerRuntimeHook('afterTick','sleepSlotConflict.resolve',()=>settleTick(E.getState()),750);

  const api={VERSION,OCCUPANCY_WAIT_TICKS,ATTENTION_STIMULUS,FORCEFUL_STIMULUS,sleepAssociations,preferredConflict,sleepOpportunityExists,resolutionCandidates,captureConflictResolutionEvidence,responseForRequest,settleYieldCompletions};
  window.SimSleepSlotConflict=Object.freeze(api);
  Object.assign(E,{SLEEP_SLOT_CONFLICT_VERSION:VERSION,sleepPreferredSlotAssociations:sleepAssociations,preferredSleepSlotConflict:preferredConflict,sleepConflictResolutionCandidates:resolutionCandidates,captureConflictResolutionEvidence});
})();