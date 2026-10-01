(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.DELIBERATION_SCHEMA_VERSION||'11.42.0-usage-preference-sleep';
  const SOFT_SWITCH_MARGIN=14,MIN_INTENT_HOLD_TICKS=2;
  const ROUTE_CONTENTS_RISK_WEIGHT_MAX=8,ROUTE_DROP_RISK_WEIGHT_MAX=4;
  function routePreferenceForAction(st,a,action=a?.action){
    const careful=Math.max(0,Math.min(1,Number(a?.traits?.careful)||0));
    const contentsRiskWeight=careful*ROUTE_CONTENTS_RISK_WEIGHT_MAX,dropRiskWeight=careful*ROUTE_DROP_RISK_WEIGHT_MAX;
    return {weights:{timeWeight:0,contentsRiskWeight,dropRiskWeight},contributors:[{kind:'trait',key:'careful',role:'routeWeight',value:careful,actionKind:action?.kind||null,contentsRiskWeight,dropRiskWeight}]};
  }
  const SOFT_RECONSIDERABLE_ACTIONS=new Set(['wander','talk','petAnimal','seekHuman','cleanFloor','groom','rest']);
  const SLEEP_CONFLICT_WAIT_TICKS=()=>Math.max(2,Number(E.REQUESTER_PATIENCE_TICKS)||3);
  const SLEEP_CONFLICT_STIMULUS=Object.freeze({attention:{kind:'sound',intensity:24},requestYield:{kind:'sound',intensity:24},driveAway:{kind:'sound',intensity:34}});
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  function sleepAssociationStrength(reasons){
    return clamp((reasons||[]).reduce((sum,r)=>sum+(r?.key==='assignedToSelf'?8:r?.key==='claimedBySelf'?5:r?.key==='habitualForSelf'?4*clamp(Number(r.signal)||0,0,1):0),0),0,10);
  }
  function preferredSleepSlotConflicts(st,a){
    const U=window.SimUsage;if(!U?.associationReasons)return [];
    const out=[];
    for(const slot of SP.allSlots(st)){
      if(!slot?.canSleep||!SP.slotAllows(slot,a)||!SP.slotPoseFits?.(slot,a,'lying'))continue;
      const target={kind:'slot',id:slot.id},reasons=U.associationReasons(st,a,'sleep',target).filter(r=>['assignedToSelf','claimedBySelf','habitualForSelf'].includes(r?.key));
      if(!reasons.length)continue;
      const occupant=SP.slotOccupant(st,slot.id,a.id);if(!occupant)continue;
      const observation=E.observeAgentContext?.(st,a,occupant)||Object.freeze({observable:false,reason:'observation-unavailable'});
      out.push({slot,target,reasons,strength:sleepAssociationStrength(reasons),occupantId:occupant.id,observation});
    }
    return out.sort((x,y)=>y.strength-x.strength||String(x.slot.id).localeCompare(String(y.slot.id)));
  }
  function hasSleepPreferredSlotConflict(st,a){return preferredSleepSlotConflicts(st,a).length>0;}
  function sleepConflictResolutionCandidates(st,a,conflict,legalTargets=[],action=null){
    const strength=conflict.strength||0,obs=conflict.observation||{},prior=action?.sleepConflictOutcome||null,priorSelected=action?.sleepConflictLastResolution||null;
    const out=[],push=(id,score,extra={})=>{if(priorSelected===id&&['waitExpired','noResponse','refused','acceptedPending'].includes(prior))score-=8;out.push({id,score:Math.round(score*1000)/1000,...extra});};
    if(legalTargets.length)push('alternateSleepTarget',52-strength*1.2,{requiresObservation:false});
    push('waitForPreferredSlot',46+strength*.8,{requiresObservation:false});
    if(obs.observable){
      const sleeping=obs.observedActionKind==='sleep'||obs.observedPosture==='lying'&&obs.observedActionKind==='sleep';
      push('gainOccupantAttention',44+strength*.6+(sleeping?6:0),{requiresObservation:true,targetAgent:obs.targetId});
      if(obs.observedAgentKind==='human'){
        push('requestYield',43+strength*.8,{requiresObservation:true,targetAgent:obs.targetId});
        push('driveAwayNonPhysical',31+strength*.7+(prior==='refused'?5:0),{requiresObservation:true,targetAgent:obs.targetId});
      }
    }
    return out.sort((x,y)=>y.score-x.score||x.id.localeCompare(y.id));
  }
  function captureSleepConflictDecision(st,a,action,conflict,candidates,selected){
    const contributors=(conflict.reasons||[]).map(r=>({...clone(r),role:'conflictResolution',associationStrength:conflict.strength}));
    if(action?.sleepConflictOutcome)contributors.push({kind:'priorConflictOutcome',key:action.sleepConflictOutcome,role:'conflictResolution'});
    return E.captureConflictResolutionEvidence?.(st,a,action,{preferredSlot:conflict.target,associationReasons:conflict.reasons,observation:conflict.observation,candidates,selectedResolution:selected.id,contributors,priorConflictDecisionId:action.conflictResolutionDecisionId||null})||null;
  }
  function applySleepConflictResolution(st,a,action,conflict,selected){
    action.sleepConflictPreferredSlot=conflict.slot.id;action.sleepConflictLastResolution=selected.id;action.sleepConflictOutcome=null;
    delete action.sleepConflictBidId;delete action.sleepConflictUntilTick;delete action.sleepConflictTargetAgent;
    if(selected.id==='alternateSleepTarget')return false;
    if(selected.id==='waitForPreferredSlot'){action.phase='conflictWait';action.sleepConflictUntilTick=st.tick+SLEEP_CONFLICT_WAIT_TICKS();return true;}
    action.sleepConflictTargetAgent=selected.targetAgent||conflict.observation?.targetId||null;
    if(selected.id==='gainOccupantAttention'){action.phase='conflictAttention';return true;}
    if(selected.id==='requestYield'){action.phase='conflictRequestYield';return true;}
    if(selected.id==='driveAwayNonPhysical'){action.phase='conflictDriveAway';return true;}
    return false;
  }
  function resolveSleepPreferredSlotConflict(st,a,action,legalTargets=[]){
    const conflict=preferredSleepSlotConflicts(st,a)[0];if(!conflict)return false;
    const candidates=sleepConflictResolutionCandidates(st,a,conflict,legalTargets,action),selected=candidates[0];if(!selected)return false;
    captureSleepConflictDecision(st,a,action,conflict,candidates,selected);
    return applySleepConflictResolution(st,a,action,conflict,selected);
  }
  function conflictBidEvent(st,bidId){return bidId&&st.causes?.[bidId]||null;}
  function latestConflictResponse(st,bidId){return (st.events||[]).find(e=>e.data?.responseToBid===bidId&&['acceptSleepSlotYield','refuseSleepSlotYield'].includes(e.data?.action))||null;}
  function emitSleepConflictBid(st,a,action,kind){
    const target=st.agents?.[action.sleepConflictTargetAgent];if(!target)return null;
    const observation=E.observeAgentContext(st,a,target);if(!observation?.observable)return null;
    const wasSleeping=observation.observedActionKind==='sleep';let attention=null;
    if(wasSleeping)attention=E.performAttentionInteraction?.(a,target,{stimulus:SLEEP_CONFLICT_STIMULUS[kind]});
    const perceived=!wasSleeping||attention?.wake?.woke===true;
    const bidKind=kind==='driveAway'?'sleepSlotDriveAway':'sleepSlotYieldRequest',interactionKind=kind==='driveAway'?'driveAwayNonPhysical':'requestYield';
    const text=kind==='driveAway'?a.name+'以較強硬的非物理方式要求'+target.name+'離開偏好的睡眠位置。':a.name+'請'+target.name+'讓出偏好的睡眠位置。';
    const id=E.addEvent(text,'normal',attention?.eventId?[attention.eventId]:[],{actor:a.id,target:target.id,action:kind==='driveAway'?'sleepSlotDriveAway':'sleepSlotYieldRequest',slot:action.sleepConflictPreferredSlot,socialBid:true,bidKind,interactionKind,expectsResponse:true,bidFrom:a.id,bidTo:target.id,perceivedByTarget:perceived,interactionPurpose:interactionKind,stimulusKind:SLEEP_CONFLICT_STIMULUS[kind].kind,stimulusIntensity:SLEEP_CONFLICT_STIMULUS[kind].intensity,position:E.positionRef?.(a.position)||null});
    const bid=st.causes?.[id];if(bid?.data)bid.data.bidId=id;if(perceived)E.addObservedBid?.(st,target,bid,st.tick);return id;
  }
  function stepSleepPreferredSlotConflict(st,a,action){
    const slotId=action?.sleepConflictPreferredSlot;if(!slotId)return false;
    if(SP.slotAvailable(st,slotId,a.id)){action.phase='chooseSurface';action.sleepConflictOutcome='slotAvailable';return true;}
    if(action.phase==='conflictWait'){
      if(st.tick>=Number(action.sleepConflictUntilTick||0)){action.sleepConflictOutcome='waitExpired';action.phase='chooseSurface';}return true;
    }
    if(action.phase==='conflictAttention'){
      const target=st.agents?.[action.sleepConflictTargetAgent],result=target&&E.performAttentionInteraction?.(a,target,{stimulus:SLEEP_CONFLICT_STIMULUS.attention});action.sleepConflictOutcome=result?.performed?'attentionPerformed':'attentionUnavailable';action.phase='conflictWait';action.sleepConflictUntilTick=st.tick+SLEEP_CONFLICT_WAIT_TICKS();return true;
    }
    if(action.phase==='conflictRequestYield'||action.phase==='conflictDriveAway'){
      const kind=action.phase==='conflictDriveAway'?'driveAway':'requestYield',bidId=emitSleepConflictBid(st,a,action,kind);action.sleepConflictBidId=bidId;action.sleepConflictOutcome=bidId?'requestSent':'notPerceived';action.phase='conflictAwaitResponse';action.sleepConflictUntilTick=st.tick+SLEEP_CONFLICT_WAIT_TICKS();return true;
    }
    if(action.phase==='conflictAwaitResponse'){
      const response=latestConflictResponse(st,action.sleepConflictBidId);if(response?.data?.action==='refuseSleepSlotYield'){action.sleepConflictOutcome='refused';action.phase='chooseSurface';return true;}if(response?.data?.action==='acceptSleepSlotYield')action.sleepConflictOutcome='acceptedPending';
      if(st.tick>=Number(action.sleepConflictUntilTick||0)){if(action.sleepConflictOutcome!=='acceptedPending')action.sleepConflictOutcome=conflictBidEvent(st,action.sleepConflictBidId)?.data?.perceivedByTarget===true?'noResponse':'notPerceived';action.phase='chooseSurface';}return true;
    }
    return false;
  }

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
    const kind=actionKind(a),p=a.action;if(!kind)return a.activeIntent?.kind==='awaitResponse'?2:0;if(kind==='sleep'&&String(p?.phase||'').startsWith('conflict'))return 2;
    let cost=0;
    switch(kind){
      case'wander':cost=0;break;
      case'talk':case'seekHuman':cost=p.phase==='move'?4:9;break;
      case'petAnimal':cost=p.phase==='move'?5:10;break;
      case'cleanFloor':cost=p.phase==='move'?5:13;break;
      case'groom':cost=12;break;
      case'rest':cost=p.phase==='chooseSurface'?3:p.phase==='move'?6:p.phase==='settle'?9:12;break;
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
    const kind=actionKind(a),openWait=!a.action&&intent.lifecycle==='open'&&intent.kind==='awaitResponse',sleepConflictWait=kind==='sleep'&&String(a.action?.phase||'').startsWith('conflict');
    if(!openWait&&!sleepConflictWait&&!SOFT_RECONSIDERABLE_ACTIONS.has(kind))return {ok:false,reason:'protected-action'};
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

  if(!E.registerRuntimeHook)throw new Error('systems/intent/deliberation.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','intent.soft-reconsideration',()=>applySoftReconsiderations(E.getState()),700);

  Object.assign(E,{DELIBERATION_SCHEMA_VERSION:VERSION,SOFT_SWITCH_MARGIN,MIN_INTENT_HOLD_TICKS,SOFT_RECONSIDERABLE_ACTIONS,ROUTE_CONTENTS_RISK_WEIGHT_MAX,ROUTE_DROP_RISK_WEIGHT_MAX,routePreferenceForAction,utilityForIntent,candidateIntents,derivedCommitmentCost,reconsiderationSnapshot,applySoftReconsideration,preferredSleepSlotConflicts,hasSleepPreferredSlotConflict,sleepConflictResolutionCandidates,resolveSleepPreferredSlotConflict,stepSleepPreferredSlotConflict});
})();
