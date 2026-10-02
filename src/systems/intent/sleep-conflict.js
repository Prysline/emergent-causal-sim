(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial,U=window.SimUsage;
  if(!E||!W||!SP||!U)return;
  if(typeof E.observeAgentContext!=='function'||typeof E.performAttentionInteraction!=='function')throw new Error('systems/intent/sleep-conflict.js requires shared Agent-context observation + attention.');
  if(typeof E.captureConflictResolutionEvidence!=='function')throw new Error('systems/intent/sleep-conflict.js requires Conflict Resolution Evidence owner.');
  const VERSION=W.DELIBERATION_SCHEMA_VERSION;
  const ATTENTION_STIMULUS=Object.freeze({kind:'sound',intensity:26});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

  function sleepDrive(a){
    const p=E.sleepProfile(a),bias=E.circadianSleepBias(a),propensity=E.sleepPropensity(a);
    if((a.needs?.sleepNeed||0)<p.minimumSleepNeed||propensity<p.sleepOpportunityThreshold)return null;
    return 42+(a.needs?.sleepNeed||0)*.55+Math.max(-8,bias*.55)+Math.max(0,(a.needs?.fatigue||0)-65)*.15;
  }
  function associationStrength(reasons){
    let value=0;
    for(const r of reasons||[]){
      if(r.direction!=='self')continue;
      if(r.kind==='assignment')value+=8;
      else if(r.kind==='claim')value+=5;
      else if(r.kind==='habit')value+=4*clamp(Number(r.signal)||0,0,1);
    }
    return clamp(value,0,10);
  }
  function latestConflictEvidence(a,slotId){return [...(a?.conflictResolutionEvidence||[])].reverse().find(x=>x?.preferredSlot?.id===slotId)||null;}
  function preferredSleepConflicts(st,a){
    const legalIds=new Set(SP.sleepTargets(st,a).map(x=>x.id)),out=[];
    for(const slot of SP.allSlots(st)){
      if(!slot.canSleep||legalIds.has(slot.id)||!SP.slotAllows(slot,a)||!SP.slotPoseFits?.(slot,a,'lying'))continue;
      const target={kind:'slot',id:slot.id},reasons=U.associationReasons(st,a,'sleep',target).filter(r=>r.direction==='self');
      if(!reasons.length)continue;
      const availability=SP.sleepSlotAvailability?.(st,slot.id,a.id)||null;
      if(availability?.reason!=='occupied'||!availability.occupantId)continue;
      const occupant=st.agents?.[availability.occupantId];if(!occupant)continue;
      const observation=E.observeAgentContext(st,a,occupant),associationValue=associationStrength(reasons);
      out.push({preferredSlot:target,associationReasons:clone(reasons),associationValue,occupantId:occupant.id,observation:clone(observation),priorConflictDecisionId:latestConflictEvidence(a,slot.id)?.id||null});
    }
    return out.sort((x,y)=>y.associationValue-x.associationValue||x.preferredSlot.id.localeCompare(y.preferredSlot.id));
  }
  function conflictCandidates(st,a,conflict){
    const base=sleepDrive(a);if(!Number.isFinite(base))return[];
    const noAlternate=SP.sleepTargets(st,a).length===0,insist=conflict.associationValue||0,obs=conflict.observation||{observable:false};
    const out=[{resolution:'wait',utility:base-7+insist*.65+(noAlternate?7:0),contributors:[{kind:'sleepConflict',key:'waitForPreferredSlot',role:'resolution',preferredSlot:clone(conflict.preferredSlot)},{kind:'association',key:'preferredSlotStrength',role:'modifier',value:insist}]}];
    if(obs.observable){
      const sleeping=obs.observedActionKind==='sleep'||obs.observedPosture==='lying';
      out.push({resolution:'attention',utility:base-10+insist*.55+(sleeping?5:1)+(noAlternate?4:0),contributors:[{kind:'sleepConflict',key:'gainOccupantAttention',role:'resolution',targetAgent:obs.targetId},{kind:'observation',key:'occupantContext',role:'evidence',observedTick:obs.observedTick,observedActionKind:obs.observedActionKind,observedPosture:obs.observedPosture}]});
      if(obs.observedAgentKind==='human'){
        out.push({resolution:'requestYield',utility:base-9+insist*.85+(noAlternate?6:0),contributors:[{kind:'sleepConflict',key:'requestYield',role:'resolution',targetAgent:obs.targetId},{kind:'association',key:'preferredSlotStrength',role:'modifier',value:insist}]});
        out.push({resolution:'driveAway',utility:base-17+insist*.75+(noAlternate?7:0),contributors:[{kind:'sleepConflict',key:'nonPhysicalDriveAway',role:'resolution',targetAgent:obs.targetId},{kind:'association',key:'preferredSlotStrength',role:'modifier',value:insist}]});
      }
    }
    return out.sort((x,y)=>y.utility-x.utility||x.resolution.localeCompare(y.resolution));
  }
  function sleepConflictDecisionOptions(st,a){
    const drive=sleepDrive(a);if(!Number.isFinite(drive)||a.action||a.activeIntent?.lifecycle==='open')return[];
    const options=[];
    for(const conflict of preferredSleepConflicts(st,a)){
      const candidates=conflictCandidates(st,a,conflict);
      for(const c of candidates)options.push({id:'sleepConflict',score:c.utility,why:['偏好的睡眠位置目前被占用',c.resolution==='wait'?'暫時等待':c.resolution==='attention'?'試著引起占用者注意':c.resolution==='requestYield'?'要求占用者讓位':'以非物理方式要求占用者離開'],resolution:c.resolution,preferredSlot:clone(conflict.preferredSlot),targetAgent:conflict.observation?.observable?conflict.observation.targetId:null,associationReasons:clone(conflict.associationReasons),observation:clone(conflict.observation),evaluatedCandidates:clone(candidates),priorConflictDecisionId:conflict.priorConflictDecisionId,decisionContributors:clone(c.contributors)});
    }
    return options;
  }
  function buildAction(st,a,choice){
    if(choice?.id!=='sleepConflict'||!choice.resolution||!choice.preferredSlot?.id)return null;
    const phase=choice.resolution==='wait'?'wait':'move';
    return {kind:'sleepConflict',phase,started:st.tick,wait:0,resolution:choice.resolution,preferredSlot:clone(choice.preferredSlot),targetAgent:choice.targetAgent||null,associationReasons:clone(choice.associationReasons||[]),observation:clone(choice.observation||null),evaluatedCandidates:clone(choice.evaluatedCandidates||[]),priorConflictDecisionId:choice.priorConflictDecisionId||null};
  }
  function ensureConflictEvidence(st,a,p){
    if(p.conflictResolutionDecisionId||!p.decisionId)return null;
    const selected=(p.evaluatedCandidates||[]).find(x=>x.resolution===p.resolution)||null;
    return E.captureConflictResolutionEvidence(st,a,p,{preferredSlot:p.preferredSlot,associationReasons:p.associationReasons,observation:p.observation,evaluatedCandidates:p.evaluatedCandidates,selectedResolution:p.resolution,contributors:selected?.contributors||[],priorConflictDecisionId:p.priorConflictDecisionId||null});
  }
  function interactionReady(st,a,targetId){return !!targetId&&!!st.agents?.[targetId]&&SP.isAtInteraction(st,a,{kind:'agent',id:targetId},'social');}
  function addYieldBid(st,a,target,p,{driveAway=false}={}){
    const attention=E.performAttentionInteraction(a,target,{stimulus:ATTENTION_STIMULUS});
    if(!attention.performed)return null;
    const perceived=!E.isSleeping(target);
    const action=driveAway?'sleepSlotDriveAway':'sleepSlotYieldRequest';
    const id=E.addEvent(driveAway?`${a.name}以強硬但非物理的方式要求${target.name}離開睡眠位置。`:`${a.name}要求${target.name}讓出偏好的睡眠位置。`,'normal',[attention.eventId].filter(Boolean),{actor:a.id,target:target.id,action,preferredSlot:p.preferredSlot?.id||null,socialBid:true,bidKind:action,interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:a.id,bidTo:target.id,perceivedByTarget:perceived,position:E.positionRef?.(a.position)||null});
    const event=st.causes?.[id];if(event?.data)event.data.bidId=id;if(perceived)E.addObservedBid?.(st,target,event,st.tick);
    if(perceived){
      a.activeIntent={id:`intent:${a.id}:${st.tick}:awaitSleepConflictResponse:${id}`,kind:'awaitSleepConflictResponse',createdTick:st.tick,lifecycle:'open',source:{type:'sleepSlotConflict',bidId:id,preferredSlot:p.preferredSlot?.id||null},patienceUntilTick:st.tick+(Number(E.REQUESTER_PATIENCE_TICKS)||3)};
    }
    return id;
  }
  function stepAction(st,a,p,helpers){
    ensureConflictEvidence(st,a,p);
    const availability=SP.sleepSlotAvailability?.(st,p.preferredSlot?.id,a.id);
    if(availability?.available){helpers.finishAction(a,{dropHeld:false});return;}
    if(p.resolution==='wait'){
      E.addEvent(`${a.name}暫時等待偏好的睡眠位置空出來。`,'normal',[],{actor:a.id,action:'sleepConflictWait',preferredSlot:p.preferredSlot.id,visibility:'private',owner:a.id,position:E.positionRef?.(a.position)||null});helpers.finishAction(a,{dropHeld:false});return;
    }
    const target=p.targetAgent&&st.agents?.[p.targetAgent];if(!target||target.offMap){helpers.finishAction(a,{dropHeld:false});return;}
    if(p.phase==='move'){
      if(!helpers.moveToInteraction(a,{kind:'agent',id:target.id},'處理睡眠位置占用','social'))return;p.phase='interact';return;
    }
    if(p.phase!=='interact'||!interactionReady(st,a,target.id)){p.phase='move';return;}
    if(p.resolution==='attention')E.performAttentionInteraction(a,target,{stimulus:ATTENTION_STIMULUS});
    else addYieldBid(st,a,target,p,{driveAway:p.resolution==='driveAway'});
    helpers.finishAction(a,{dropHeld:false});
  }
  function newestYieldBid(st,a){return (E.observedBidRefs?.(st,a)||[]).map(ref=>({ref,bid:E.bidEvent?.(st,ref.bidId)})).filter(x=>['sleepSlotYieldRequest','sleepSlotDriveAway'].includes(x.bid?.data?.bidKind)&&x.bid.data.bidTo===a.id).sort((x,y)=>y.ref.observedTick-x.ref.observedTick)[0]||null;}
  function responseEvaluation(st,a,pick){
    const bid=pick.bid,slotId=bid.data?.preferredSlot,reasons=slotId?U.associationReasons(st,a,'sleep',{kind:'slot',id:slotId}):[],own=associationStrength(reasons),drive=bid.data?.bidKind==='sleepSlotDriveAway';
    const acceptUtility=62-own*1.7-(drive?7:0),refuseUtility=44+own*1.6+(drive?7:0);
    return acceptUtility>=refuseUtility?{response:'accept',utility:acceptUtility,ownAssociationValue:own}:{response:'refuse',utility:refuseUtility,ownAssociationValue:own};
  }
  function responseCandidate(st,a){if(!a||a.kind!=='human'||a.offMap||E.isSleeping(a))return null;const pick=newestYieldBid(st,a);if(!pick)return null;const requester=st.agents?.[pick.bid.data.bidFrom];if(!requester||requester.offMap)return null;const ev=responseEvaluation(st,a,pick);return {...ev,bidId:pick.bid.id,requesterId:requester.id,preferredSlot:pick.bid.data.preferredSlot,observedTick:pick.ref.observedTick};}
  function bindResponse(st,a,c,{softSnapshot=null,priorIntent=null,priorActionKind=null}={}){
    const action={kind:'sleepConflictResponse',phase:'respond',started:st.tick,wait:0,response:c.response,responseToBid:c.bidId,targetAgent:c.requesterId,preferredSlot:{kind:'slot',id:c.preferredSlot},ownAssociationValue:c.ownAssociationValue};
    const intent={id:`intent:${a.id}:${st.tick}:respondSleepConflict:${c.bidId}`,kind:'respondSleepConflict',createdTick:st.tick,lifecycle:'actionBound',source:{type:'sleepSlotConflict',bidId:c.bidId,observedTick:c.observedTick}};action.intentId=intent.id;a.action=action;a.activeIntent=intent;
    E.adoptDecisionEvidence?.(st,a,action,{source:{type:'sleepSlotConflictResponse',tick:st.tick,intentKind:intent.kind,bidId:c.bidId,observedTick:c.observedTick},contributors:[{kind:'socialBid',key:'sleepSlotConflict',role:'motivation',bidId:c.bidId,observedTick:c.observedTick,fromAgent:c.requesterId},{kind:'association',key:'responderPreferredSlotStrength',role:'modifier',value:c.ownAssociationValue}],utility:c.utility});
    if(softSnapshot)E.addEvent(`${a.name}重新權衡後，改先回應睡眠位置讓位要求。`,'normal',[],{actor:a.id,action:'intentReconsider',priorIntentId:priorIntent?.id||null,priorIntentKind:priorIntent?.kind||null,priorActionKind:priorActionKind||null,intentId:intent.id,intentKind:intent.kind,nextActionKind:'sleepConflictResponse',challengerIntentKind:'respondSleepConflict',currentUtility:softSnapshot.currentUtility,challengerUtility:c.utility,switchMargin:softSnapshot.switchMargin,commitmentCost:softSnapshot.commitmentCost,switchThreshold:softSnapshot.switchThreshold,position:E.positionRef?.(a.position)||null});
    return true;
  }
  function promoteResponses(st){
    for(const a of Object.values(st.agents||{})){
      if(a.kind!=='human'||a.offMap||E.isSleeping(a)||a.activeIntent?.kind==='respondSleepConflict')continue;const c=responseCandidate(st,a);if(!c)continue;
      if(!a.action&&!a.activeIntent){const best=E.candidateIntents?.(st,a)?.[0]||null;if(best&&best.utility>c.utility)continue;bindResponse(st,a,c);continue;}
      const snap=E.reconsiderationSnapshot?.(st,a);if(!snap?.ok||!Number.isFinite(snap.commitmentCost)||c.utility<=snap.switchThreshold)continue;
      const priorIntent=clone(a.activeIntent),priorActionKind=a.action?.kind||null;
      for(const [key,owner] of Object.entries({...st.reservations}))if(owner===a.id)delete st.reservations[key];if(a.held){const held=st.containers?.[a.held];if(held)held.position={...a.position};a.held=null;}a.action=null;a.activeIntent=null;bindResponse(st,a,c,{softSnapshot:snap,priorIntent,priorActionKind});
    }
  }
  function clearBidRef(a,bidId){if(a)a.observedSocialBids=(a.observedSocialBids||[]).filter(x=>x.bidId!==bidId);}
  function settleRequesterWait(st,bidId){const bid=E.bidEvent?.(st,bidId),requester=bid?.data?.bidFrom&&st.agents?.[bid.data.bidFrom];if(requester?.activeIntent?.kind==='awaitSleepConflictResponse'&&requester.activeIntent.source?.bidId===bidId)requester.activeIntent=null;}
  function stepResponse(st,a,p,helpers){
    const bid=E.bidEvent?.(st,p.responseToBid),requester=bid?.data?.bidFrom&&st.agents?.[bid.data.bidFrom];if(!bid||!requester){helpers.finishAction(a,{dropHeld:false});return;}
    if(p.phase==='respond'){
      const action=p.response==='accept'?'acceptSleepSlotYield':'refuseSleepSlotYield';
      E.addEvent(p.response==='accept'?`${a.name}接受了${requester.name}的讓位要求。`:`${a.name}拒絕了${requester.name}的讓位要求。`,'normal',[bid.id],{actor:a.id,target:requester.id,action,responseToBid:bid.id,preferredSlot:p.preferredSlot?.id||null,position:E.positionRef?.(a.position)||null});clearBidRef(a,bid.id);settleRequesterWait(st,bid.id);
      if(p.response==='accept'){p.phase='leaveSlot';return;}helpers.finishAction(a,{dropHeld:false});return;
    }
    if(p.phase==='leaveSlot'){
      const priorSlot=a.posture?.slotId;if(priorSlot===p.preferredSlot?.id){if(!helpers.standUp(a))return;E.addEvent(`${a.name}實際離開了先前占用的睡眠位置。`,'normal',[bid.id],{actor:a.id,target:requester.id,action:'leaveSleepSlot',responseToBid:bid.id,slot:priorSlot,position:E.positionRef?.(a.position)||null});}
      helpers.finishAction(a,{dropHeld:false});
    }
  }
  function expireResponseWaits(st){
    for(const a of Object.values(st.agents||{})){
      const intent=a.activeIntent;if(intent?.kind!=='awaitSleepConflictResponse'||intent.lifecycle!=='open'||st.tick<intent.patienceUntilTick)continue;
      const bidId=intent.source?.bidId,bid=bidId&&E.bidEvent?.(st,bidId),responder=bid?.data?.bidTo&&st.agents?.[bid.data?.bidTo],observation=E.observeAgentContext(st,a,responder);
      E.addEvent(`${a.name}等了一會兒，沒有得到明確的讓位回應。`,'normal',bidId?[bidId]:[],{actor:a.id,action:'sleepConflictResponseWaitEnded',bidId:bidId||null,intentId:intent.id,visibility:'private',owner:a.id,responderContextObserved:!!observation?.observable,observedResponderActionKind:observation?.observable?observation.observedActionKind:null,observedResponderPosture:observation?.observable?observation.observedPosture:null});a.activeIntent=null;
    }
  }
  function injectRequesterWaitingActions(st){
    for(const a of Object.values(st.agents||{})){
      const intent=a.activeIntent;if(a.action||intent?.kind!=='awaitSleepConflictResponse'||intent.lifecycle!=='open')continue;
      a.action={kind:'sleepConflictResponseWait',phase:'waiting',started:intent.createdTick,intentId:intent.id,wait:0,__sleepConflictTransient:true};
    }
  }
  function actionLabel(st,a){const p=a?.action;if(p?.kind==='sleepConflict')return p.resolution==='wait'?'睡眠衝突・等待偏好位置':p.resolution==='attention'?'睡眠衝突・引起占用者注意':p.resolution==='requestYield'?'睡眠衝突・要求讓位':'睡眠衝突・非物理驅離';if(p?.kind==='sleepConflictResponse')return p.phase==='leaveSlot'?'回應讓位要求・準備離開':'回應睡眠位置要求';return null;}

  E.registerDecisionOptionProvider?.('sleepConflict.resolve',sleepConflictDecisionOptions,80);
  E.registerActionLabelResolver?.('sleepConflict.label',actionLabel,80);
  if(!E.registerRuntimeHook)throw new Error('systems/intent/sleep-conflict.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','sleepConflict.responses',()=>{const st=E.getState();expireResponseWaits(st);promoteResponses(st);},350);
  E.registerRuntimeHook('beforeTick','sleepConflict.requester-wait',()=>injectRequesterWaitingActions(E.getState()),850);

  window.SimSleepConflict=Object.freeze({VERSION,ATTENTION_STIMULUS,preferredSleepConflicts,conflictCandidates,sleepConflictDecisionOptions,buildAction,stepAction,stepResponse,responseCandidate});
  E.SLEEP_CONFLICT_VERSION=VERSION;
})();