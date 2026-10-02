(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.DELIBERATION_SCHEMA_VERSION||'11.44.0-sleep-slot-conflict';
  const SOFT_SWITCH_MARGIN=14,MIN_INTENT_HOLD_TICKS=2;
  const ROUTE_CONTENTS_RISK_WEIGHT_MAX=8,ROUTE_DROP_RISK_WEIGHT_MAX=4;
  function routePreferenceForAction(st,a,action=a?.action){
    const careful=Math.max(0,Math.min(1,Number(a?.traits?.careful)||0));
    const contentsRiskWeight=careful*ROUTE_CONTENTS_RISK_WEIGHT_MAX,dropRiskWeight=careful*ROUTE_DROP_RISK_WEIGHT_MAX;
    return {weights:{timeWeight:0,contentsRiskWeight,dropRiskWeight},contributors:[{kind:'trait',key:'careful',role:'routeWeight',value:careful,actionKind:action?.kind||null,contentsRiskWeight,dropRiskWeight}]};
  }
  const SOFT_RECONSIDERABLE_ACTIONS=new Set(['wander','talk','petAnimal','seekHuman','cleanFloor','groom','rest']);
  const SLEEP_CONFLICT_REASSESS_TICKS=2;
  const SLEEP_CONFLICT_STIMULUS=Object.freeze({attention:{kind:'sound',intensity:22},requestYield:{kind:'sound',intensity:18},nonphysicalShoo:{kind:'sound',intensity:34}});
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function preferredSleepAssociations(st,a){
    const U=window.SimUsage,hasUsageFacts=(st?.usageAssignments?.length||0)>0||(st?.usageClaims?.length||0)>0||Object.keys(a?.usageHabits||{}).length>0;
    if(typeof U?.associationReasons!=='function'||typeof U?.preferenceContributors!=='function'){
      if(hasUsageFacts)throw new Error('Preferred sleep conflict requires canonical Usage association owners when usage facts exist.');
      return [];
    }
    const cap=Number(U.PREFERENCE_CAP)||10,out=[];
    for(const slot of SP.allSlots?.(st)||[]){
      if(!slot?.canSleep)continue;
      const target={kind:'slot',id:slot.id};
      const reasons=U.associationReasons(st,a,'sleep',target).filter(reason=>reason?.direction==='self'&&Number(reason.signal)>0);
      if(!reasons.length)continue;
      const contributors=U.preferenceContributors(st,a,'sleep',target).filter(c=>c?.direction==='self'&&Number(c.delta)>0);
      const strength=clamp(contributors.reduce((sum,c)=>sum+(Number(c.delta)||0),0),0,cap);
      out.push({target,reasons,contributors,strength});
    }
    return out.sort((x,y)=>y.strength-x.strength||String(x.target.id).localeCompare(String(y.target.id)));
  }
  function preferredSleepConflictFor(st,a){
    if(!st||!a||a.offMap)return null;
    if(typeof SP.sleepTargetAvailability!=='function')throw new Error('Preferred sleep conflict requires Spatial sleepTargetAvailability().');
    const conflicts=[];
    for(const association of preferredSleepAssociations(st,a)){
      const availability=SP.sleepTargetAvailability(st,a,association.target);
      if(availability?.reason!=='occupied'||!availability.occupantId)continue;
      const slot=SP.getSlot?.(st,association.target.id),occupant=st.agents?.[availability.occupantId];
      if(!slot||!occupant)continue;
      const observation=E.observeAgentContext?.(st,a,occupant)||Object.freeze({observable:false,reason:'observation-unavailable'});
      conflicts.push({slot,occupantId:occupant.id,association,observation});
    }
    return conflicts.sort((x,y)=>y.association.strength-x.association.strength||String(x.slot.id).localeCompare(String(y.slot.id)))[0]||null;
  }
  function sleepConflictResolutionCandidates(st,a,conflict,legalCandidates=[]){
    if(!conflict)return [];
    const strength=conflict.association.strength,noAlternate=!legalCandidates.length,out=[];
    if(legalCandidates.length){const best=legalCandidates[0],burden=clamp(Number(best.effectiveScore??best.score)||0,-10,20);out.push({kind:'alternateSleepTarget',score:70-strength*2-burden*.35,target:{kind:'slot',id:best.id},contributors:[{kind:'associationStrength',value:strength},{kind:'objectiveTargetBurden',value:burden}]});}
    out.push({kind:'waitForPreferredSlot',score:42+strength*2+(noAlternate?8:0),contributors:[{kind:'associationStrength',value:strength},{kind:'noAlternate',value:noAlternate}]});
    out.push({kind:'deferSleepConflict',score:34-strength*.5+(noAlternate?2:6),contributors:[{kind:'associationStrength',value:strength},{kind:'noAlternate',value:noAlternate}]});
    const obs=conflict.observation;
    if(obs?.observable){
      const sleeping=obs.observedActionKind==='sleep'||obs.observedPosture==='lying';
      out.push({kind:'gainOccupantAttention',score:38+strength*1.7+(noAlternate?8:0)+(sleeping?8:0),contributors:[{kind:'associationStrength',value:strength},{kind:'noAlternate',value:noAlternate},{kind:'observedSleeping',value:sleeping}]});
      if(obs.observedAgentKind==='human'){
        out.push({kind:'requestYield',score:48+strength*1.8+(noAlternate?8:0),contributors:[{kind:'associationStrength',value:strength},{kind:'noAlternate',value:noAlternate}]});
        out.push({kind:'nonphysicalShoo',score:28+strength*1.5+(noAlternate?10:0),contributors:[{kind:'associationStrength',value:strength},{kind:'noAlternate',value:noAlternate}]});
      }
    }
    return out.sort((x,y)=>y.score-x.score||x.kind.localeCompare(y.kind));
  }
  function emitSleepConflictBid(st,a,conflict,resolutionKind){
    const target=st.agents?.[conflict.occupantId];if(!target)return null;
    const stimulus=SLEEP_CONFLICT_STIMULUS[resolutionKind]||SLEEP_CONFLICT_STIMULUS.attention;
    const attention=E.performAttentionInteraction?.(a,target,{stimulus});
    if(resolutionKind==='attention')return {attention,eventId:attention?.eventId||null,bidId:null};
    const perceived=!!attention?.performed&&!E.isSleeping?.(target);
    const bidKind=resolutionKind==='requestYield'?'sleepSlotYieldRequest':'sleepSlotShoo';
    const text=resolutionKind==='requestYield'?a.name+'要求'+target.name+'讓出目前的睡眠位置。':a.name+'以較強硬的非物理方式要求'+target.name+'離開目前的睡眠位置。';
    const bidId=E.addEvent(text,'normal',attention?.eventId?[attention.eventId]:[],{actor:a.id,target:target.id,action:resolutionKind==='requestYield'?'requestSleepSlotYield':'nonphysicalSleepSlotShoo',slot:conflict.slot.id,interactionPurpose:resolutionKind==='requestYield'?'requestYield':'nonphysicalShoo',socialBid:true,bidKind,interactionKind:'sleepSlotConflict',expectsResponse:true,bidFrom:a.id,bidTo:target.id,perceivedByTarget:perceived,stimulusKind:stimulus.kind,stimulusIntensity:stimulus.intensity,position:E.positionRef?.(a.position)||null});
    const bid=st.causes?.[bidId];if(bid?.data)bid.data.bidId=bidId;if(perceived&&bid)E.addObservedBid?.(st,target,bid,st.tick);
    return {attention,eventId:attention?.eventId||null,bidId};
  }
  function sleepConflictObservationSignature(observation){
    const o=observation||{},observable=o.observable===true;
    return JSON.stringify({observable,reason:observable?null:o.reason||null,targetId:observable?o.targetId||null:null,observedAgentKind:observable?o.observedAgentKind||null:null,observedActionKind:observable?o.observedActionKind||null:null,observedPosture:observable?o.observedPosture||null:null});
  }
  function enterSleepConflictWait(st,a,p,conflict,{sourceBidId=null,resolutionKind='waitForPreferredSlot'}={}){
    p.phase='conflictWait';p.conflictPreferredSlot=conflict.slot.id;p.conflictOccupantId=conflict.occupantId;p.conflictObservationSignature=sleepConflictObservationSignature(conflict.observation);p.conflictReassessTick=st.tick+SLEEP_CONFLICT_REASSESS_TICKS;p.conflictSourceBidId=sourceBidId;p.conflictResolutionKind=resolutionKind;
    E.addEvent(a.name+'暫時等待睡眠位置狀況改變。','normal',sourceBidId?[sourceBidId]:[],{actor:a.id,action:'sleepConflictWait',visibility:'private',owner:a.id,preferredSlot:conflict.slot.id,resolutionKind,position:E.positionRef?.(a.position)||null});
  }
  function resolvePreferredSleepConflictStep(st,a,p,legalCandidates=[]){
    const conflict=preferredSleepConflictFor(st,a);if(!conflict)return {handled:false,conflict:null};
    const candidates=sleepConflictResolutionCandidates(st,a,conflict,legalCandidates),selected=candidates[0]||null;if(!selected)return {handled:false,conflict};
    const evidence=E.captureConflictResolutionEvidence?.(st,a,p,{preferredSlot:{kind:'slot',id:conflict.slot.id},associationReasons:conflict.association.reasons,conflictReason:'occupied',observation:conflict.observation?.observable?conflict.observation:{observable:false,reason:conflict.observation?.reason||'unavailable'},candidates,selectedResolution:selected,priorConflictDecisionId:p.conflictResolutionDecisionId||null});
    if(evidence)p.conflictResolutionDecisionId=evidence.id;
    if(selected.kind==='alternateSleepTarget')return {handled:false,conflict,selected,evidence};
    if(selected.kind==='deferSleepConflict'){
      E.addEvent(a.name+'暫時放棄處理目前的偏好睡眠位置衝突。','normal',[],{actor:a.id,action:'deferSleepConflict',visibility:'private',owner:a.id,preferredSlot:conflict.slot.id,position:E.positionRef?.(a.position)||null});
      return {handled:true,defer:true,conflict,selected,evidence};
    }
    if(selected.kind==='waitForPreferredSlot'){enterSleepConflictWait(st,a,p,conflict);return {handled:true,conflict,selected,evidence};}
    const kind=selected.kind==='gainOccupantAttention'?'attention':selected.kind;
    const interaction=emitSleepConflictBid(st,a,conflict,kind);enterSleepConflictWait(st,a,p,conflict,{sourceBidId:interaction?.bidId||null,resolutionKind:selected.kind});
    return {handled:true,conflict,selected,evidence,interaction};
  }
  function stepPreferredSleepConflictWait(st,a,p){
    const slotId=p?.conflictPreferredSlot;if(!slotId)return false;
    const occupant=SP.slotOccupant?.(st,slotId,a.id)||null;
    let observationChanged=false;
    if(occupant){
      const observation=E.observeAgentContext?.(st,a,occupant)||Object.freeze({observable:false,reason:'observation-unavailable'});
      const signature=sleepConflictObservationSignature(observation);
      observationChanged=occupant.id===p.conflictOccupantId?signature!==p.conflictObservationSignature:observation.observable===true;
    }
    if(!occupant||SP.slotAvailable?.(st,slotId,a.id)||observationChanged||st.tick>=(Number(p.conflictReassessTick)||st.tick)){delete p.conflictPreferredSlot;delete p.conflictOccupantId;delete p.conflictObservationSignature;delete p.conflictReassessTick;delete p.conflictSourceBidId;delete p.conflictResolutionKind;p.phase='chooseSurface';return false;}
    return true;
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
    const kind=actionKind(a),p=a.action;if(!kind)return a.activeIntent?.kind==='awaitResponse'?2:0;
    let cost=0;
    switch(kind){
      case'wander':cost=0;break;
      case'talk':case'seekHuman':cost=p.phase==='move'?4:9;break;
      case'petAnimal':cost=p.phase==='move'?5:10;break;
      case'cleanFloor':cost=p.phase==='move'?5:13;break;
      case'groom':cost=12;break;
      case'rest':cost=p.phase==='chooseSurface'?3:p.phase==='move'?6:p.phase==='settle'?9:12;break;
      case'sleep':if(p.phase==='conflictWait'){cost=2;break;}return Infinity;
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
    const kind=actionKind(a),openWait=!a.action&&intent.lifecycle==='open'&&intent.kind==='awaitResponse',conflictWait=kind==='sleep'&&a.action?.phase==='conflictWait';
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

  if(!E.registerRuntimeHook)throw new Error('systems/intent/deliberation.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','intent.soft-reconsideration',()=>applySoftReconsiderations(E.getState()),700);

  Object.assign(E,{DELIBERATION_SCHEMA_VERSION:VERSION,SOFT_SWITCH_MARGIN,MIN_INTENT_HOLD_TICKS,SOFT_RECONSIDERABLE_ACTIONS,ROUTE_CONTENTS_RISK_WEIGHT_MAX,ROUTE_DROP_RISK_WEIGHT_MAX,SLEEP_CONFLICT_REASSESS_TICKS,SLEEP_CONFLICT_STIMULUS,routePreferenceForAction,utilityForIntent,candidateIntents,derivedCommitmentCost,reconsiderationSnapshot,applySoftReconsideration,preferredSleepConflictFor,sleepConflictResolutionCandidates,resolvePreferredSleepConflictStep,stepPreferredSleepConflictWait});
})();
