(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.DELIBERATION_SCHEMA_VERSION||'11.42.0-usage-preference-sleep';
  const SOFT_SWITCH_MARGIN=14,MIN_INTENT_HOLD_TICKS=2;
  const ROUTE_CONTENTS_RISK_WEIGHT_MAX=8,ROUTE_DROP_RISK_WEIGHT_MAX=4;
  const SLEEP_CONFLICT_WAIT_TICKS=3,SLEEP_CONFLICT_JITTER=4;
  const SLEEP_CONFLICT_STIMULUS=Object.freeze({
    attention:Object.freeze({kind:'voice',intensity:24}),
    requestYield:Object.freeze({kind:'voice',intensity:24}),
    driveAwayNonphysical:Object.freeze({kind:'voice',intensity:34})
  });
  const SLEEP_CONFLICT_BASE_SCORE=Object.freeze({alternateSleepTarget:52,wait:44,attention:40,requestYield:39,driveAwayNonphysical:30});
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function fixedSelfAssociation(st,a,slotId,reason){
    if(reason?.direction!=='self'||!(Number(reason.signal)>0))return false;
    if(reason.kind!=='assignment')return reason.kind==='claim'||reason.kind==='habit';
    const refs=new Set(reason.sourceRefs||[]);
    return (st.usageAssignments||[]).some(x=>refs.has(x.id)&&x.principal?.kind==='agent'&&x.principal.id===a.id&&x.activity==='sleep'&&x.target?.kind==='slot'&&x.target.id===slotId);
  }
  function sleepConflictAssociationStrength(contributors){
    return clamp((contributors||[]).filter(c=>['assignment','claim','habit'].includes(c?.kind)&&c?.direction==='self').reduce((sum,c)=>sum+Math.max(0,Number(c.delta)||0),0),0,window.SimUsage?.PREFERENCE_CAP||10);
  }
  function preferredSleepConflicts(st,a){
    const U=window.SimUsage;if(!U?.associationReasons)throw new Error('Sleep preferred Slot conflict requires SimUsage associationReasons().');if(typeof SP.sleepSlotAvailability!=='function')throw new Error('Sleep preferred Slot conflict requires Spatial sleepSlotAvailability().');if(typeof E.observeAgentContext!=='function')throw new Error('Sleep preferred Slot conflict requires Engine observeAgentContext().');
    const out=[];
    for(const slot of SP.allSlots(st)){
      if(!slot?.canSleep||!SP.slotAllows(slot,a)||!SP.slotPoseFits?.(slot,a,'lying'))continue;
      const target={kind:'slot',id:slot.id},reasons=U.associationReasons(st,a,'sleep',target).filter(reason=>fixedSelfAssociation(st,a,slot.id,reason));
      if(!reasons.length)continue;
      const availability=SP.sleepSlotAvailability(st,a,slot);if(availability.reason!=='occupied')continue;
      const occupant=SP.slotOccupant(st,slot.id,a.id);if(!occupant)continue;
      const observation=E.observeAgentContext(st,a,occupant),contributors=U.preferenceContributors?.(st,a,'sleep',target)||[];
      out.push({preferredTarget:target,associationReasons:clone(reasons),associationContributors:clone(contributors),associationStrength:sleepConflictAssociationStrength(contributors),observation:clone(observation)});
    }
    return out.sort((x,y)=>y.associationStrength-x.associationStrength||String(x.preferredTarget.id).localeCompare(String(y.preferredTarget.id)));
  }
  function preferredSleepConflict(st,a){return preferredSleepConflicts(st,a)[0]||null;}
  function hasPreferredSleepConflict(st,a){return !!preferredSleepConflict(st,a);}
  function sleepConflictHistoryCount(action,kind){return (action?.sleepConflictHistory||[]).filter(x=>x?.selection===kind).length;}
  function conflictCandidateScore(st,a,action,conflict,kind,{noAlternate=false,objectiveScore=0,jitter=true}={}){
    const association=conflict.associationStrength||0,repeat=sleepConflictHistoryCount(action,kind);
    let score=SLEEP_CONFLICT_BASE_SCORE[kind]||0;
    if(kind==='alternateSleepTarget')score-=association*.7+Math.max(0,Math.min(12,Number(objectiveScore)||0))*.25;
    if(kind==='wait')score+=association*.45+(noAlternate?6:0);
    if(kind==='attention')score+=association*.55+(noAlternate?7:0);
    if(kind==='requestYield')score+=association*.65+(noAlternate?8:0);
    if(kind==='driveAwayNonphysical')score+=association*.50+(noAlternate?7:0);
    const repeatPenalty=repeat*8,randomDelta=jitter?(E.rand?.(-SLEEP_CONFLICT_JITTER,SLEEP_CONFLICT_JITTER)||0):0;
    return {score:score-repeatPenalty+randomDelta,contributors:[
      {kind:'usageAssociation',key:'preferredSleepSlot',role:'resolutionBias',value:association,target:clone(conflict.preferredTarget),sources:clone(conflict.associationReasons)},
      {kind:'availability',key:noAlternate?'noAlternateSleepTarget':'alternateSleepTargetAvailable',role:'resolutionContext',value:noAlternate?0:1},
      ...(repeat?[{kind:'history',key:'priorResolutionAttempt',role:'resolutionCost',selection:kind,count:repeat,delta:-repeatPenalty}]:[]),
      ...(jitter?[{kind:'stochastic',key:'resolutionJitter',role:'tieVariation',value:randomDelta}]:[])
    ]};
  }
  function sleepConflictResolutionCandidates(st,a,action,conflict,{jitter=true,rankedSleepTargets=null}={}){
    if(!conflict)return[];
    const U=window.SimUsage,ranked=rankedSleepTargets||U?.rankSleepTargets?.(st,a,SP.sleepTargets(st,a))||SP.sleepTargets(st,a),alternate=ranked[0]||null,noAlternate=!alternate,out=[];
    if(alternate){
      const score=conflictCandidateScore(st,a,action,conflict,'alternateSleepTarget',{noAlternate:false,objectiveScore:alternate.effectiveScore??alternate.score,jitter});
      out.push({kind:'alternateSleepTarget',score:score.score,contributors:score.contributors,selectedTarget:clone(alternate)});
    }
    const wait=conflictCandidateScore(st,a,action,conflict,'wait',{noAlternate,jitter});out.push({kind:'wait',score:wait.score,contributors:wait.contributors});
    if(conflict.observation?.observable){
      const attention=conflictCandidateScore(st,a,action,conflict,'attention',{noAlternate,jitter});out.push({kind:'attention',score:attention.score,contributors:attention.contributors});
      if(conflict.observation.observedAgentKind==='human'){
        const request=conflictCandidateScore(st,a,action,conflict,'requestYield',{noAlternate,jitter});out.push({kind:'requestYield',score:request.score,contributors:request.contributors});
        const drive=conflictCandidateScore(st,a,action,conflict,'driveAwayNonphysical',{noAlternate,jitter});out.push({kind:'driveAwayNonphysical',score:drive.score,contributors:drive.contributors});
      }
    }
    return out.sort((x,y)=>y.score-x.score||x.kind.localeCompare(y.kind));
  }
  function recordConflictHistory(st,action,selection){
    action.sleepConflictHistory??=[];action.sleepConflictHistory.push({tick:st.tick,selection});if(action.sleepConflictHistory.length>12)action.sleepConflictHistory.shift();
  }
  function captureConflictEvidence(st,a,action,conflict,candidates,selection){
    if(typeof E.captureConflictResolutionEvidence!=='function')throw new Error('Sleep preferred Slot conflict requires Conflict Resolution Evidence owner.');return E.captureConflictResolutionEvidence(st,a,action,{preferredTarget:conflict.preferredTarget,associationReasons:conflict.associationReasons,observation:conflict.observation,candidates:candidates.map(c=>({kind:c.kind,score:c.score,contributors:c.contributors,selectedTarget:c.selectedTarget?{kind:'slot',id:c.selectedTarget.id}:null})),selection:{kind:selection.kind,score:selection.score,selectedTarget:selection.selectedTarget?{kind:'slot',id:selection.selectedTarget.id}:null},priorConflictDecisionId:action.conflictResolutionDecisionId||null});
  }
  function beginConflictWait(st,a,action,conflict,selection,{phase='sleepConflictWait',requestEventId=null,source='occupancy'}={}){
    recordConflictHistory(st,action,selection.kind);action.phase=phase;action.sleepConflictPreferredSlotId=conflict.preferredTarget.id;action.sleepConflictWaitUntil=st.tick+SLEEP_CONFLICT_WAIT_TICKS;action.sleepConflictRequestEventId=requestEventId;action.sleepConflictWaitSource=source;
    if(phase==='sleepConflictWait')E.addEvent?.(`${a.name}暫時等待偏好的睡眠位置空出。`,'normal',[],{actor:a.id,action:'sleepConflictWait',slot:conflict.preferredTarget.id,visibility:'private',owner:a.id,waitUntilTick:action.sleepConflictWaitUntil});
  }
  function performConflictInteraction(st,a,action,conflict,selection){
    const occupant=conflict.observation?.observable&&st.agents?.[conflict.observation.targetId];if(!occupant)return false;
    if(typeof E.performAttentionInteraction!=='function')throw new Error('Sleep preferred Slot conflict requires generic attention interaction.');const stimulus=SLEEP_CONFLICT_STIMULUS[selection.kind]||SLEEP_CONFLICT_STIMULUS.attention,attention=E.performAttentionInteraction(a,occupant,{stimulus});
    if(!attention?.performed)return false;
    if(selection.kind==='attention'){beginConflictWait(st,a,action,conflict,selection,{source:'afterAttention'});return true;}
    const requestKind=selection.kind==='requestYield'?'yield':'driveAwayNonphysical',perceivedByTarget=!E.isSleeping?.(occupant),requestExpiresTick=st.tick+SLEEP_CONFLICT_WAIT_TICKS;
    const requestEventId=E.addEvent?.(selection.kind==='requestYield'?`${a.name}要求${occupant.name}讓出偏好的睡眠位置。`:`${a.name}用較強硬但非物理的方式要求${occupant.name}離開偏好的睡眠位置。`,'normal',[attention.eventId].filter(Boolean),{actor:a.id,target:occupant.id,action:'sleepSlotRequest',requestKind,interactionPurpose:'clearPreferredSleepSlot',slot:conflict.preferredTarget.id,expectsResponse:true,perceivedByTarget,requestExpiresTick});
    beginConflictWait(st,a,action,conflict,selection,{phase:'sleepConflictAwaitResponse',requestEventId,source:requestKind});return true;
  }
  function resolvePreferredSleepConflict(st,a,action,rankedSleepTargets){
    const conflict=preferredSleepConflict(st,a);if(!conflict)return null;
    const candidates=sleepConflictResolutionCandidates(st,a,action,conflict,{jitter:true,rankedSleepTargets}),selection=candidates[0];if(!selection)return null;
    captureConflictEvidence(st,a,action,conflict,candidates,selection);
    if(selection.kind==='alternateSleepTarget'){recordConflictHistory(st,action,selection.kind);return {handled:false,selection,target:selection.selectedTarget,conflict};}
    if(selection.kind==='wait'){beginConflictWait(st,a,action,conflict,selection);return {handled:true,selection,conflict};}
    if(performConflictInteraction(st,a,action,conflict,selection))return {handled:true,selection,conflict};
    beginConflictWait(st,a,action,conflict,{...selection,kind:'wait'},{source:'interactionUnavailable'});return {handled:true,selection:{kind:'wait'},conflict};
  }
  function clearConflictWait(action){
    for(const key of ['sleepConflictPreferredSlotId','sleepConflictWaitUntil','sleepConflictRequestEventId','sleepConflictWaitSource'])delete action[key];
  }
  function sleepConflictResponseEvent(st,requestEventId){return (st.events||[]).find(e=>e.data?.action==='sleepSlotResponse'&&e.data?.responseToRequest===requestEventId)||null;}
  function sleepConflictYieldEvent(st,requestEventId){return (st.events||[]).find(e=>e.data?.action==='sleepSlotYield'&&e.data?.responseToRequest===requestEventId)||null;}
  function stepPreferredSleepConflict(st,a,action){
    if(!['sleepConflictWait','sleepConflictAwaitResponse'].includes(action?.phase))return false;
    const slotId=action.sleepConflictPreferredSlotId,availability=SP.sleepSlotAvailability?.(st,a,slotId);
    if(availability?.available){clearConflictWait(action);action.phase='chooseSurface';return true;}
    if(availability?.reason!=='occupied'){clearConflictWait(action);action.phase='chooseSurface';return true;}
    if(action.phase==='sleepConflictAwaitResponse'){
      const response=sleepConflictResponseEvent(st,action.sleepConflictRequestEventId);
      if(response?.data?.response==='refused'){action.sleepConflictLastOutcome='refused';clearConflictWait(action);action.phase='chooseSurface';return true;}
      if(response?.data?.response==='accepted'){
        action.sleepConflictLastOutcome=sleepConflictYieldEvent(st,action.sleepConflictRequestEventId)?'completed':'accepted';
        if(action.sleepConflictLastOutcome==='completed'){clearConflictWait(action);action.phase='chooseSurface';return true;}
      }
      if(st.tick>=Number(action.sleepConflictWaitUntil||0)){
        if(!response){action.sleepConflictLastOutcome='noResponse';E.addEvent?.(`${a.name}等了一會兒，沒有把沒有回應解讀成拒絕，重新考慮睡眠位置衝突。`,'normal',[action.sleepConflictRequestEventId].filter(Boolean),{actor:a.id,action:'sleepConflictWaitEnded',slot:slotId,outcome:'noResponse',visibility:'private',owner:a.id});}
        clearConflictWait(action);action.phase='chooseSurface';return true;
      }
      return true;
    }
    if(st.tick>=Number(action.sleepConflictWaitUntil||0)){action.sleepConflictLastOutcome='waitExpired';clearConflictWait(action);action.phase='chooseSurface';return true;}
    return true;
  }
  function isSleepConflictWaiting(action){return ['sleepConflictWait','sleepConflictAwaitResponse'].includes(action?.phase);}
  function pendingSleepSlotRequest(st,a){
    if(a?.kind!=='human'||E.isSleeping?.(a))return null;
    return (st.events||[]).find(e=>{
      const d=e.data;if(d?.action!=='sleepSlotRequest'||d.target!==a.id||d.perceivedByTarget!==true||!d.requestExpiresTick||st.tick>d.requestExpiresTick)return false;
      if(a.posture?.slotId!==d.slot)return false;
      return !sleepConflictResponseEvent(st,e.id);
    })||null;
  }
  function sleepConflictResponderOptions(st,a){
    const request=pendingSleepSlotRequest(st,a);if(!request)return[];
    const confrontational=request.data.requestKind==='driveAwayNonphysical',acceptBase=confrontational?46:52,refuseBase=confrontational?56:50;
    const contributor={kind:'sleepSlotRequest',key:request.data.requestKind,role:'motivation',requestEventId:request.id,requesterId:request.data.actor,slotId:request.data.slot,observedTick:request.tick};
    return [
      {id:'respondSleepSlotRequest',requestEventId:request.id,response:'accept',score:acceptBase,decisionContributors:[contributor,{kind:'responseOption',key:'accept',role:'modifier',value:1}]},
      {id:'respondSleepSlotRequest',requestEventId:request.id,response:'refuse',score:refuseBase,decisionContributors:[contributor,{kind:'responseOption',key:'refuse',role:'modifier',value:1}]}
    ];
  }
  function buildSleepConflictResponseAction(st,a,choice,base){
    const request=(st.events||[]).find(e=>e.id===choice?.requestEventId&&e.data?.action==='sleepSlotRequest'&&e.data?.target===a?.id&&e.data?.perceivedByTarget===true);
    if(!request||!['accept','refuse'].includes(choice?.response)||sleepConflictResponseEvent(st,request.id)||a.posture?.slotId!==request.data.slot)return null;
    return {...base,phase:'respond',requestEventId:request.id,response:choice.response,requesterId:request.data.actor,slotId:request.data.slot};
  }
  function stepSleepConflictResponse(st,a,action){
    const request=(st.events||[]).find(e=>e.id===action?.requestEventId&&e.data?.action==='sleepSlotRequest'&&e.data?.target===a?.id);if(!request)return {finish:true};
    if(action.phase==='respond'){
      const responseEventId=E.addEvent?.(action.response==='accept'?`${a.name}表示會讓出這個睡眠位置。`:`${a.name}拒絕讓出這個睡眠位置。`,'normal',[request.id],{actor:a.id,target:request.data.actor,action:'sleepSlotResponse',response:action.response==='accept'?'accepted':'refused',responseToRequest:request.id,slot:action.slotId});
      action.responseEventId=responseEventId||null;if(action.response==='refuse')return {finish:true};action.phase='yield';return {finish:false};
    }
    if(action.phase==='yield'){
      if(a.posture?.slotId===action.slotId){
        if(!E.standUp?.(a)){action.wait=(action.wait||0)+1;if(action.wait<3)return {finish:false};E.addEvent?.(`${a.name}雖然答應讓位，但暫時無法離開這個位置。`,'normal',[action.responseEventId].filter(Boolean),{actor:a.id,target:action.requesterId,action:'sleepSlotYieldBlocked',responseToRequest:request.id,slot:action.slotId});return {finish:true};}
      }
      E.addEvent?.(`${a.name}實際離開了被要求讓出的睡眠位置。`,'normal',[action.responseEventId].filter(Boolean),{actor:a.id,target:action.requesterId,action:'sleepSlotYield',responseToRequest:request.id,slot:action.slotId});return {finish:true};
    }
    return {finish:true};
  }
  function routePreferenceForAction(st,a,action=a?.action){
    const careful=Math.max(0,Math.min(1,Number(a?.traits?.careful)||0));
    const contentsRiskWeight=careful*ROUTE_CONTENTS_RISK_WEIGHT_MAX,dropRiskWeight=careful*ROUTE_DROP_RISK_WEIGHT_MAX;
    return {weights:{timeWeight:0,contentsRiskWeight,dropRiskWeight},contributors:[{kind:'trait',key:'careful',role:'routeWeight',value:careful,actionKind:action?.kind||null,contentsRiskWeight,dropRiskWeight}]};
  }
  const SOFT_RECONSIDERABLE_ACTIONS=new Set(['wander','talk','petAnimal','seekHuman','cleanFloor','groom','rest']);

  function actionKind(a){return E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;}
  function foodAmount(st){return Object.values(st.containers||{}).filter(c=>c.canEatFrom).reduce((sum,c)=>sum+(c.contents?.food||0),0);}
  function wetTotal(st){return Object.values(st.map?.tiles||{}).reduce((sum,t)=>sum+(SP.tileLiquidAmount?.(t)||0),0);}
  function interactionTraversalCost(st,a,target,affordance='default'){
    if(typeof SP.bestInteractionPositionResult==='function')return SP.bestInteractionPositionResult(st,a,target,affordance)?.traversalCost??Infinity;
    const goal=SP.bestInteractionPosition(st,a,target,affordance);return goal?(SP.traversalCost?.(st,a,goal)??SP.pathDistance(st,a,goal)):Infinity;
  }
  function nearestAgent(st,a,kind,{awakeOnly=false}={}){
    return Object.values(st.agents||{}).filter(x=>x.id!==a.id&&!x.offMap&&x.kind===kind&&(!awakeOnly||!E.isSleeping?.(x))).map(x=>({x,d:interactionTraversalCost(st,a,{kind:'agent',id:x.id},'social')})).filter(x=>Number.isFinite(x.d)).sort((p,q)=>p.d-q.d||String(p.x.id).localeCompare(String(q.x.id)))[0]?.x||null;
  }
  function nearestPettableAnimal(a){return E.nearestPettableAnimal?.(a)||null;}
  function resourceExists(st,r){
    if(Object.values(st.sources||{}).some(s=>s.resource===r&&(s.infinite||(s.amount||0)>.05)))return true;
    return Object.values(st.containers||{}).some(c=>(c.contents?.[r]||0)>.05);
  }
  function drinkableContainer(st,a,r){
    return Object.values(st.containers||{}).filter(c=>c.canDrinkFrom&&(c.contents?.[r]||0)>.05&&(!E.holderOf?.(c.id)||E.holderOf(c.id)?.id===a.id)).map(c=>{
      const d=interactionTraversalCost(st,a,{kind:'object',id:c.id},'drinkFrom');return Number.isFinite(d)?{c,d}:null;
    }).filter(x=>x&&Number.isFinite(x.d)).sort((x,y)=>x.d-y.d)[0]?.c||null;
  }
  function hasHumanDrinkPlan(st,a,r){
    if(!resourceExists(st,r))return false;
    return Object.values(st.containers||{}).some(c=>c.portable&&c.canDrinkFrom&&(!E.holderOf?.(c.id)||E.holderOf(c.id)?.id===a.id));
  }
  function currentBidUtility(st,a,intent){
    if(intent?.kind==='respondSocialBid'){
      const bid=E.bidEvent?.(st,intent.source?.bidId);if(!bid||bid.data?.bidTo!==a.id)return 0;
      return 72+(a.traits?.animalAffinity||0)*20;
    }
    if(intent?.kind==='awaitResponse')return 52;
    return null;
  }
  function canonicalBaseUtility(a,actionKindValue){
    if(typeof E.baseUtilityForAction!=='function')throw new Error('Soft reconsideration requires core baseUtilityForAction');
    return E.baseUtilityForAction(a,actionKindValue);
  }
  function utilityForIntent(st,a,intentKind,{intent=null}={}){
    const bidValue=currentBidUtility(st,a,intent||{kind:intentKind});if(bidValue!=null)return bidValue;
    switch(intentKind){
      case'satisfyHunger':return E.canSatisfyHunger?.(a)?canonicalBaseUtility(a,'eat'):0;
      case'drinkWater':return E.canDrinkResource?.(a,'water')?canonicalBaseUtility(a,'drinkWater'):0;
      case'drinkAlcohol':return a.kind==='human'&&E.canDrinkResource?.(a,'alcohol')?canonicalBaseUtility(a,'drinkAlcohol'):0;
      case'recoverFatigue':return canonicalBaseUtility(a,'rest');
      case'sleep':return canonicalBaseUtility(a,'sleep');
      case'socialize':return a.kind==='human'&&nearestAgent(st,a,'human',{awakeOnly:true})?canonicalBaseUtility(a,'talk'):0;
      case'interactWithAnimal':return a.kind==='human'&&nearestPettableAnimal(a)?canonicalBaseUtility(a,'petAnimal'):0;
      case'seekSocialContact':return E.isAnimalAgent?.(a)&&(a.needs?.social||0)>14&&nearestAgent(st,a,'human')?canonicalBaseUtility(a,'seekHuman'):0;
      case'removeHazard':return wetTotal(st)>.2?canonicalBaseUtility(a,'cleanFloor'):0;
      case'groom':return a.kind==='cat'?canonicalBaseUtility(a,'groom'):0;
      case'explore':return canonicalBaseUtility(a,'wander');
      default:return 0;
    }
  }
  function candidateIntents(st,a){
    const out=[];
    const push=(intentKind,actionKindValue,extra={})=>{const utility=utilityForIntent(st,a,intentKind);if(utility>0)out.push({intentKind,actionKind:actionKindValue,utility,decisionContributors:E.decisionContributorsForAction?.(a,actionKindValue)||[],...extra});};
    if(a.kind==='human'){
      push('satisfyHunger','eat');push('drinkWater','drinkWater');push('drinkAlcohol','drinkAlcohol');push('recoverFatigue','rest');push('sleep','sleep');
      const h=nearestAgent(st,a,'human',{awakeOnly:true});if(h)push('socialize','talk',{targetAgent:h.id});
      const animal=nearestPettableAnimal(a);if(animal)push('interactWithAnimal','petAnimal',{targetAgent:animal.id});
      push('removeHazard','cleanFloor');
      const bidPick=E.newestObservedAnimalBid?.(st,a);if(bidPick){const target=st.agents?.[bidPick.bid?.data?.bidFrom];if(target&&!target.offMap&&E.canPetAnimal?.(a,target))out.push({intentKind:'respondSocialBid',actionKind:'petAnimal',utility:72+(a.traits?.animalAffinity||0)*20,targetAgent:target.id,bidId:bidPick.bid.id,observedTick:bidPick.ref.observedTick,decisionContributors:[{kind:'socialBid',key:'animalAffection',role:'motivation',bidId:bidPick.bid.id,observedTick:bidPick.ref.observedTick,fromAgent:target.id},{kind:'trait',key:'animalAffinity',role:'modifier',value:a.traits?.animalAffinity||0}]});}
    }else{
      push('satisfyHunger','eat');push('groom','groom');push('recoverFatigue','rest');push('sleep','sleep');
      const h=nearestAgent(st,a,'human');if(E.isAnimalAgent?.(a)&&(a.needs?.social||0)>14&&h)push('seekSocialContact','seekHuman',{targetAgent:h.id});
      push('drinkWater','drinkWater');
    }
    const hook=window.SimMemoryDeliberation?.adjustIntentCandidates;
    const adjusted=hook?hook(st,a,out):out;
    return adjusted.sort((x,y)=>y.utility-x.utility||((y.targetPreference||0)-(x.targetPreference||0))||x.intentKind.localeCompare(y.intentKind));
  }
  function reservationCount(st,a){return Object.values(st.reservations||{}).filter(owner=>owner===a.id).length;}
  function derivedCommitmentCost(st,a){
    const kind=actionKind(a),p=a.action;if(!kind)return a.activeIntent?.kind==='awaitResponse'?2:0;
    let cost=0;
    switch(kind){
      case'wander':cost=0;break;
      case'talk':case'seekHuman':cost=p.phase==='move'?4:9;break;
      case'petAnimal':cost=p.phase==='move'?5:10;break;
      case'cleanFloor':cost=p.phase==='move'?5:13;break;
      case'groom':cost=12;break;
      case'rest':cost=p.phase==='chooseSurface'?3:p.phase==='move'?6:p.phase==='settle'?9:12;break;
      case'sleep':if(isSleepConflictWaiting(p))cost=2;else return Infinity;break;
      default:return Infinity;
    }
    if(a.held)cost+=10;
    cost+=Math.min(9,reservationCount(st,a)*3);
    return cost;
  }
  function buildAction(st,a,c){
    if(!E.buildAction)return null;
    const choice={id:c.actionKind};
    if(c.targetAgent)choice.targetAgent=c.targetAgent;
    if((c.actionKind==='drinkWater'||c.actionKind==='drinkAlcohol')&&a.kind==='cat'){
      const resource=c.actionKind==='drinkWater'?'water':'alcohol',src=drinkableContainer(st,a,resource);if(!src)return null;choice.targetObject=src.id;
    }
    return E.buildAction(a,choice);
  }
  function clearAgentReservations(st,a){for(const [key,owner] of Object.entries({...st.reservations}))if(owner===a.id)delete st.reservations[key];}
  function dropHeld(st,a){if(!a.held)return;const c=st.containers?.[a.held];if(c)c.position={...a.position};a.held=null;}
  function softEligible(st,a){
    const intent=a.activeIntent;if(!intent)return {ok:false,reason:'no-intent'};
    if(intent.source?.type==='emergency')return {ok:false,reason:'emergency-intent'};
    if(E.emergencyChoice?.(st,a))return {ok:false,reason:'emergency-priority'};
    const kind=actionKind(a),openWait=!a.action&&intent.lifecycle==='open'&&intent.kind==='awaitResponse',conflictWait=kind==='sleep'&&isSleepConflictWaiting(a.action);
    if(!openWait&&!conflictWait&&!SOFT_RECONSIDERABLE_ACTIONS.has(kind))return {ok:false,reason:'protected-action'};
    const age=Math.max(0,st.tick-(intent.createdTick||0));
    if(age<MIN_INTENT_HOLD_TICKS)return {ok:false,reason:'minimum-hold',holdRemaining:MIN_INTENT_HOLD_TICKS-age};
    return {ok:true,reason:'eligible'};
  }
  function sameCurrentCandidate(st,a,intent,c){
    if(c.intentKind!==intent?.kind)return false;
    const hook=window.SimMemoryDeliberation?.isDistinctTargetCandidate;
    return !(hook&&hook(st,a,intent,c));
  }
  function buildReconsiderationSnapshot(st,a,eligibility){
    const intent=a.activeIntent,commitment=derivedCommitmentCost(st,a),baseCurrentUtility=intent?utilityForIntent(st,a,intent.kind,{intent}):0;
    const adjustCurrent=window.SimMemoryDeliberation?.adjustCurrentIntentUtility;
    const currentUtility=adjustCurrent&&intent?adjustCurrent(st,a,intent,baseCurrentUtility):baseCurrentUtility;
    const candidates=candidateIntents(st,a).filter(c=>!sameCurrentCandidate(st,a,intent,c)),best=candidates[0]||null,threshold=currentUtility+SOFT_SWITCH_MARGIN+(Number.isFinite(commitment)?commitment:0);
    return {...eligibility,currentUtility,commitmentCost:commitment,switchMargin:SOFT_SWITCH_MARGIN,switchThreshold:threshold,bestChallenger:best};
  }
  function reconsiderationSnapshot(st,a){return buildReconsiderationSnapshot(st,a,softEligible(st,a));}
  function freshIntent(st,a,c,priorIntent){
    const id=`intent:${a.id}:${st.tick}:${c.intentKind}:soft`;
    if(c.intentKind==='respondSocialBid')return {id,kind:c.intentKind,createdTick:st.tick,lifecycle:'actionBound',source:{type:'socialBid',bidId:c.bidId,observedTick:c.observedTick,reconsideration:{type:'soft',tick:st.tick,priorIntentId:priorIntent?.id||null}}};
    return {id,kind:c.intentKind,createdTick:st.tick,lifecycle:'actionBound',source:{type:'softReconsideration',tick:st.tick,priorIntentId:priorIntent?.id||null,priorIntentKind:priorIntent?.kind||null}};
  }
  function applySoftReconsideration(st,a){
    const eligibility=softEligible(st,a);if(!eligibility.ok)return false;
    const snap=buildReconsiderationSnapshot(st,a,eligibility),c=snap.bestChallenger;if(!c||!Number.isFinite(snap.commitmentCost)||c.utility<=snap.switchThreshold)return false;
    const nextAction=buildAction(st,a,c);if(!nextAction)return false;
    const priorIntent=a.activeIntent,priorActionKind=actionKind(a),priorIntentId=priorIntent?.id||null,priorIntentKind=priorIntent?.kind||null,priorDecisionId=E.currentDecisionEvidence?.(a)?.id||null;
    clearAgentReservations(st,a);dropHeld(st,a);a.action=null;a.activeIntent=null;
    const nextIntent=freshIntent(st,a,c,priorIntent);nextAction.intentId=nextIntent.id;a.action=nextAction;a.activeIntent=nextIntent;
    E.adoptDecisionEvidence?.(st,a,nextAction,{source:{type:'softReconsideration',tick:st.tick,priorIntentId,priorIntentKind,intentKind:c.intentKind,bidId:c.bidId||null},contributors:c.decisionContributors||[],utility:c.utility,priorDecisionId});
    E.addEvent(`${a.name}重新權衡目前狀況，放下「${E.intentLabel?.(priorIntent)||priorIntentKind}」，改先「${E.intentLabel?.(nextIntent)||c.intentKind}」。`,'normal',[],{actor:a.id,action:'intentReconsider',priorIntentId,priorIntentKind,priorActionKind:priorActionKind||null,intentId:nextIntent.id,intentKind:nextIntent.kind,nextActionKind:c.actionKind,challengerIntentKind:c.intentKind,currentUtility:snap.currentUtility,challengerUtility:c.utility,switchMargin:SOFT_SWITCH_MARGIN,commitmentCost:snap.commitmentCost,switchThreshold:snap.switchThreshold,position:E.positionRef(a.position)});
    return true;
  }
  function applySoftReconsiderations(st){for(const a of Object.values(st.agents||{}))applySoftReconsideration(st,a);}

  E.registerDecisionOptionProvider?.('sleepConflict.responder',sleepConflictResponderOptions,110);
  E.registerActionLabelResolver?.('sleepConflict.response',(st,a)=>a?.action?.kind==='respondSleepSlotRequest'?(a.action.phase==='yield'?'回應睡眠位置要求・準備讓位':a.action.response==='accept'?'回應睡眠位置要求・接受':'回應睡眠位置要求・拒絕'):null,110);

  if(!E.registerRuntimeHook)throw new Error('systems/intent/deliberation.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','intent.soft-reconsideration',()=>applySoftReconsiderations(E.getState()),700);

  Object.assign(E,{DELIBERATION_SCHEMA_VERSION:VERSION,SOFT_SWITCH_MARGIN,MIN_INTENT_HOLD_TICKS,SOFT_RECONSIDERABLE_ACTIONS,ROUTE_CONTENTS_RISK_WEIGHT_MAX,ROUTE_DROP_RISK_WEIGHT_MAX,SLEEP_CONFLICT_WAIT_TICKS,SLEEP_CONFLICT_STIMULUS,routePreferenceForAction,utilityForIntent,candidateIntents,derivedCommitmentCost,reconsiderationSnapshot,applySoftReconsideration,preferredSleepConflicts,preferredSleepConflict,hasPreferredSleepConflict,sleepConflictResolutionCandidates,resolvePreferredSleepConflict,stepPreferredSleepConflict,isSleepConflictWaiting,sleepConflictResponderOptions,buildSleepConflictResponseAction,stepSleepConflictResponse});
})();
