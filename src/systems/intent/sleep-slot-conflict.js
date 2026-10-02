(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial,U=window.SimUsage;
  if(!E||!W||!SP||!U)return;
  if(typeof E.observeAgentContext!=='function'||typeof E.performAttentionInteraction!=='function')throw new Error('sleep-slot-conflict requires shared Agent-context observation + attention.');
  const VERSION=W.DELIBERATION_SCHEMA_VERSION;
  const OCCUPANCY_WAIT_TICKS=3;
  const RESPONSE_WAIT_TICKS=3;
  const ATTENTION_STIMULUS=Object.freeze({kind:'sound',intensity:24});
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const SELF_KEYS=new Set(['assignedToSelf','claimedBySelf','habitualForSelf']);
  const RESPONSE_ACTIONS=new Set(['sleepSlotYieldAccepted','sleepSlotYieldRefused','sleepSlotYieldDelayed']);

  function selfAssociationReasons(st,a,slotId){
    return U.associationReasons(st,a,'sleep',{kind:'slot',id:slotId}).filter(r=>SELF_KEYS.has(r.key));
  }
  function associationStrength(st,a,slotId){
    return clamp(U.preferenceContributors(st,a,'sleep',{kind:'slot',id:slotId})
      .filter(c=>SELF_KEYS.has(c.key)).reduce((sum,c)=>sum+Math.max(0,Number(c.delta)||0),0),0,10);
  }
  function preferredSleepSlotConflicts(st,a){
    const out=[];
    for(const slot of SP.allSlots(st)){
      if(!slot?.canSleep||!SP.slotAllows(slot,a)||!SP.slotPoseFits?.(slot,a,'lying'))continue;
      const reasons=selfAssociationReasons(st,a,slot.id);if(!reasons.length)continue;
      const occupant=SP.slotOccupant(st,slot.id,a.id);if(!occupant)continue;
      const observation=E.observeAgentContext(st,a,occupant);
      out.push({preferredSlot:{kind:'slot',id:slot.id},associationReasons:clone(reasons),associationStrength:associationStrength(st,a,slot.id),conflictReason:'agentOccupancy',observation:clone(observation)});
    }
    return out.sort((x,y)=>y.associationStrength-x.associationStrength||String(x.preferredSlot.id).localeCompare(String(y.preferredSlot.id)));
  }
  function hasPreferredSleepSlotConflict(st,a){return preferredSleepSlotConflicts(st,a).length>0;}

  function candidateSet(st,a,action,legalCandidates,conflict){
    const alt=legalCandidates?.[0]||null,obs=conflict.observation||{observable:false},strength=conflict.associationStrength||0,noAlt=!alt,attempts=Number(action.conflictAttempts)||0,last=action.lastConflictSelection||null;
    const repeated=id=>last===id?Math.min(18,attempts*6):0;
    const list=[];
    if(alt)list.push({id:'alternate',score:62-Math.min(28,Math.max(0,Number(alt.effectiveScore)||0))-strength*1.1-repeated('alternate'),target:{kind:'slot',id:alt.id},contributors:[{kind:'objectiveAlternative',key:'legalSleepTarget',role:'conflictResolution',effectiveScore:Number(alt.effectiveScore)||0},{kind:'association',key:'preferredSlotPersistence',role:'conflictResolution',value:strength,delta:-strength*1.1}]});
    list.push({id:'wait',score:40+strength*1.7+(noAlt?10:0)-repeated('wait'),contributors:[{kind:'association',key:'preferredSlotPersistence',role:'conflictResolution',value:strength,delta:strength*1.7},{kind:'availability',key:'noAlternate',role:'conflictResolution',value:noAlt?1:0,delta:noAlt?10:0}]});
    if(obs.observable){
      const sleeping=obs.observedActionKind==='sleep'||obs.observedPosture==='lying';
      list.push({id:'attention',score:36+strength*1.4+(noAlt?8:0)+(sleeping?4:0)-repeated('attention'),targetAgent:obs.targetId,contributors:[{kind:'association',key:'preferredSlotPersistence',role:'conflictResolution',value:strength,delta:strength*1.4},{kind:'observation',key:'occupantContext',role:'conflictResolution',observedTick:obs.observedTick,observedAgentKind:obs.observedAgentKind,observedActionKind:obs.observedActionKind,observedPosture:obs.observedPosture}]});
      if(obs.observedAgentKind==='human'&&!sleeping){
        list.push({id:'requestYield',score:42+strength*1.8+(noAlt?10:0)-repeated('requestYield'),targetAgent:obs.targetId,contributors:[{kind:'association',key:'preferredSlotPersistence',role:'conflictResolution',value:strength,delta:strength*1.8},{kind:'interaction',key:'cooperativeYieldRequest',role:'conflictResolution'}]});
        list.push({id:'driveAway',score:24+strength*2+(noAlt?12:0)-repeated('driveAway'),targetAgent:obs.targetId,contributors:[{kind:'association',key:'preferredSlotPersistence',role:'conflictResolution',value:strength,delta:strength*2},{kind:'interaction',key:'nonPhysicalDriveAway',role:'conflictResolution'}]});
      }
    }
    list.push({id:'abandon',score:18+(noAlt?6:0)+Math.min(18,attempts*3)-repeated('abandon'),contributors:[{kind:'fallback',key:'temporarilyAbandon',role:'conflictResolution',value:1}]});
    return list.map(c=>({...c,score:c.score+E.rand(-4,4)})).sort((x,y)=>y.score-x.score||String(x.id).localeCompare(String(y.id)));
  }
  function capture(st,a,action,conflict,candidates,selected){
    return E.captureConflictResolutionEvidence?.(st,a,action,{preferredSlot:conflict.preferredSlot,associationReasons:conflict.associationReasons,observation:conflict.observation?.observable?conflict.observation:{observable:false,reason:conflict.observation?.reason||'unobservable'},conflictReason:conflict.conflictReason,candidates:candidates.map(c=>({id:c.id,score:c.score,target:c.target||null,targetAgent:c.targetAgent||null,contributors:c.contributors||[]})),selected:{id:selected.id,score:selected.score,target:selected.target||null,targetAgent:selected.targetAgent||null},contributors:selected.contributors||[],priorConflictDecisionId:action.conflictResolutionDecisionId||null});
  }
  function addConflictBid(st,requester,responder,slotId,kind){
    const reciprocal=E.observeAgentContext(st,responder,requester),perceived=reciprocal?.observable===true;
    const drive=kind==='driveAway',action=drive?'sleepSlotDriveAway':'sleepSlotYieldRequest',bidKind=drive?'sleepSlotDriveAway':'sleepSlotYield';
    const id=E.addEvent(drive?`${requester.name}以較強硬的非物理方式要求${responder.name}離開睡眠位置。`:`${requester.name}要求${responder.name}讓出睡眠位置。`,'normal',[],{actor:requester.id,target:responder.id,action,slot:slotId,interactionPurpose:drive?'driveAway':'requestYield',socialBid:true,bidKind,interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:perceived,position:E.positionRef?.(requester.position)||null});
    const event=st.causes?.[id];if(event?.data)event.data.bidId=id;
    if(perceived)E.addObservedBid?.(st,responder,event,st.tick);
    return id;
  }
  function beginSleepSlotConflict(st,a,action,legalCandidates=[]){
    const conflicts=preferredSleepSlotConflicts(st,a);if(!conflicts.length)return false;
    const conflict=conflicts[0],candidates=candidateSet(st,a,action,legalCandidates,conflict),selected=candidates[0];if(!selected)return false;
    action.conflictAttempts=(Number(action.conflictAttempts)||0)+1;action.lastConflictSelection=selected.id;const evidence=capture(st,a,action,conflict,candidates,selected);if(evidence)action.conflictResolutionDecisionId=evidence.id;
    action.preferredSleepSlot=clone(conflict.preferredSlot);
    if(selected.id==='alternate')return false;
    if(selected.id==='wait'){action.phase='conflictWait';action.conflictWaitUntil=st.tick+OCCUPANCY_WAIT_TICKS;return true;}
    if(selected.id==='attention'){
      const target=st.agents?.[selected.targetAgent];if(target)E.performAttentionInteraction(a,target,{stimulus:ATTENTION_STIMULUS});
      action.phase='conflictPostAttention';action.conflictWaitUntil=st.tick+1;return true;
    }
    if(selected.id==='requestYield'||selected.id==='driveAway'){
      const target=st.agents?.[selected.targetAgent];if(!target){action.phase='chooseSurface';return true;}
      action.conflictBidId=addConflictBid(st,a,target,conflict.preferredSlot.id,selected.id);action.phase='conflictAwaitResponse';action.conflictWaitUntil=st.tick+RESPONSE_WAIT_TICKS;return true;
    }
    E.addEvent(`${a.name}暫時放棄處理目前的睡眠位置衝突。`,'normal',[],{actor:a.id,action:'sleepSlotConflictAbandon',slot:conflict.preferredSlot.id,visibility:'private',owner:a.id,position:E.positionRef?.(a.position)||null});
    a.action=null;if(a.activeIntent?.kind==='sleep')a.activeIntent=null;return true;
  }
  function responseEvent(st,bidId){return (st.events||[]).find(e=>e.data?.responseToBid===bidId&&RESPONSE_ACTIONS.has(e.data?.action))||null;}
  function preferredSlotAvailable(st,a,action){const id=action.preferredSleepSlot?.id;return !!id&&SP.slotAvailable(st,id,a.id);}
  function stepSleepSlotConflict(st,a,action){
    if(action.phase==='conflictWait'){
      if(preferredSlotAvailable(st,a,action)||st.tick>=action.conflictWaitUntil){action.phase='chooseSurface';return true;}return true;
    }
    if(action.phase==='conflictPostAttention'){
      if(preferredSlotAvailable(st,a,action)||st.tick>=action.conflictWaitUntil){action.phase='chooseSurface';return true;}return true;
    }
    if(action.phase==='conflictAwaitResponse'){
      const response=responseEvent(st,action.conflictBidId);
      if(response){
        if(response.data.action==='sleepSlotYieldAccepted'){action.phase='conflictWaitRelease';action.conflictWaitUntil=st.tick+OCCUPANCY_WAIT_TICKS;return true;}
        action.phase='chooseSurface';return true;
      }
      if(st.tick>=action.conflictWaitUntil){E.addEvent(`${a.name}等了一會兒，沒有得到睡眠位置要求的即時回應。`,'normal',[action.conflictBidId].filter(Boolean),{actor:a.id,action:'sleepSlotConflictWaitEnded',bidId:action.conflictBidId||null,outcome:'noResponse',visibility:'private',owner:a.id,position:E.positionRef?.(a.position)||null});action.phase='chooseSurface';return true;}return true;
    }
    if(action.phase==='conflictWaitRelease'){
      if(preferredSlotAvailable(st,a,action)||st.tick>=action.conflictWaitUntil){action.phase='chooseSurface';return true;}return true;
    }
    return false;
  }
  function newestConflictBid(st,a){
    return (E.observedBidRefs?.(st,a)||[]).map(ref=>({ref,bid:E.bidEvent?.(st,ref.bidId)})).filter(x=>x.bid?.data?.interactionKind==='sleepSlotConflict'&&x.bid.data.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;
  }
  function localResponse(st,responder,bid){
    const requester=st.agents?.[bid.data.bidFrom];if(!requester)return 'delay';
    const affect=Number(E.affectResponseSignal?.(responder))||0,relationship=Number(E.relationshipSignal?.(responder,requester.id))||0,drive=bid.data.bidKind==='sleepSlotDriveAway'?0.08:0;
    const roll=E.rand(0,1),accept=clamp(.48+affect*.12+relationship*.18+drive,.08,.88);
    if(roll<accept)return 'accept';if(roll>.86)return 'refuse';return 'delay';
  }
  function promoteResponses(st){
    for(const responder of Object.values(st.agents||{})){
      if(responder.kind!=='human'||responder.offMap||responder.action||E.isSleeping?.(responder))continue;
      const pick=newestConflictBid(st,responder);if(!pick)continue;const bid=pick.bid,requester=st.agents?.[bid.data.bidFrom];if(!requester||requester.offMap)continue;
      const responseKind=localResponse(st,responder,bid),intent={id:`intent:${responder.id}:${st.tick}:respondSleepSlotConflict:${bid.id}`,kind:'respondSleepSlotConflict',createdTick:st.tick,lifecycle:'actionBound',source:{type:'sleepSlotConflictBid',bidId:bid.id,observedTick:pick.ref.observedTick}};
      responder.activeIntent=intent;responder.action={kind:'respondSleepSlotConflict',phase:'respond',started:st.tick,wait:0,intentId:intent.id,responseToBid:bid.id,responseKind,requesterId:requester.id,slotId:bid.data.slot};E.addEvent(`${responder.name}理解了${requester.name}對睡眠位置的要求。`,'normal',[bid.id],{actor:responder.id,target:requester.id,action:'sleepSlotYieldUnderstood',responseToBid:bid.id,slot:bid.data.slot,position:E.positionRef?.(responder.position)||null});
    }
  }
  function clearObservedBid(a,bidId){a.observedSocialBids=(a.observedSocialBids||[]).filter(ref=>ref.bidId!==bidId);}
  function finishResponder(a){const id=a.action?.intentId;a.action=null;if(a.activeIntent?.id===id)a.activeIntent=null;}
  function stepSleepSlotResponderAction(st,a,p){
    const bid=E.bidEvent?.(st,p.responseToBid),requester=st.agents?.[p.requesterId];if(!bid||!requester){finishResponder(a);return true;}
    if(p.phase==='respond'){
      const action=p.responseKind==='accept'?'sleepSlotYieldAccepted':p.responseKind==='refuse'?'sleepSlotYieldRefused':'sleepSlotYieldDelayed';
      E.addEvent(p.responseKind==='accept'?`${a.name}接受了${requester.name}的讓位要求。`:p.responseKind==='refuse'?`${a.name}拒絕了${requester.name}的讓位要求。`:`${a.name}回應了${requester.name}，但暫時沒有讓出位置。`,'normal',[bid.id],{actor:a.id,target:requester.id,action,responseToBid:bid.id,slot:p.slotId,position:E.positionRef?.(a.position)||null});
      clearObservedBid(a,bid.id);
      if(p.responseKind!=='accept'){finishResponder(a);return true;}
      p.phase='leaveSlot';return true;
    }
    if(p.phase==='leaveSlot'){
      if(a.posture?.slotId!==p.slotId){E.addEvent(`${a.name}已不再占用被要求讓出的睡眠位置。`,'normal',[bid.id],{actor:a.id,target:requester.id,action:'sleepSlotYieldCompleted',responseToBid:bid.id,slot:p.slotId,position:E.positionRef?.(a.position)||null});finishResponder(a);return true;}
      const egress=SP.slotEgressNodes?.(st,p.slotId,a,'walk')?.[0]||null;if(!egress){finishResponder(a);return true;}
      a.position={...egress};a.posture={kind:'standing',slotId:null,furnitureId:null};
      E.addEvent(`${a.name}自行離開了被要求讓出的睡眠位置。`,'normal',[bid.id],{actor:a.id,target:requester.id,action:'sleepSlotYieldCompleted',responseToBid:bid.id,slot:p.slotId,position:E.positionRef?.(a.position)||null});finishResponder(a);return true;
    }
    finishResponder(a);return true;
  }
  function actionLabel(st,a){
    const p=a?.action;if(p?.kind==='sleep'&&p.phase?.startsWith('conflict'))return p.phase==='conflictWait'?'睡眠・等待偏好位置空出':p.phase==='conflictAwaitResponse'?'睡眠・等待讓位回應':p.phase==='conflictWaitRelease'?'睡眠・等待對方實際離開':'睡眠・處理偏好位置衝突';
    if(p?.kind==='respondSleepSlotConflict')return p.phase==='leaveSlot'?'回應睡眠位置要求・準備離開':'回應睡眠位置要求';
    return null;
  }

  E.registerActionLabelResolver?.('sleep-slot-conflict',actionLabel,100);
  if(!E.registerRuntimeHook)throw new Error('sleep-slot-conflict requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','sleepSlotConflict.promote-responses',()=>promoteResponses(E.getState()),350);

  Object.assign(E,{SLEEP_SLOT_CONFLICT_VERSION:VERSION,OCCUPANCY_WAIT_TICKS,RESPONSE_WAIT_TICKS,SLEEP_CONFLICT_ATTENTION_STIMULUS:ATTENTION_STIMULUS,preferredSleepSlotConflicts,hasPreferredSleepSlotConflict,beginSleepSlotConflict,stepSleepSlotConflict,stepSleepSlotResponderAction,newestSleepSlotConflictBid:newestConflictBid});
})();