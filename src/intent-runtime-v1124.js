(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.DELIBERATION_SCHEMA_VERSION||'11.12.4-soft-reconsideration';
  const SOFT_SWITCH_MARGIN=14,MIN_INTENT_HOLD_TICKS=2;
  const SOFT_RECONSIDERABLE_ACTIONS=new Set(['wander','talk','petAnimal','seekHuman','cleanFloor','groom','rest']);

  function actionKind(a){return E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;}
  function foodAmount(st){return Object.values(st.containers||{}).filter(c=>c.canEatFrom).reduce((sum,c)=>sum+(c.contents?.food||0),0);}
  function wetTotal(st){return Object.values(st.map?.tiles||{}).reduce((sum,t)=>sum+(SP.tileLiquidAmount?.(t)||0),0);}
  function nearestAgent(st,a,kind,{awakeOnly=false}={}){
    return Object.values(st.agents||{}).filter(x=>x.id!==a.id&&!x.offMap&&x.kind===kind&&(!awakeOnly||!E.isSleeping?.(x))).map(x=>({x,d:SP.pathDistance(st,a,x.position)})).filter(x=>Number.isFinite(x.d)).sort((p,q)=>p.d-q.d)[0]?.x||null;
  }
  function nearestPettableAnimal(a){return E.nearestPettableAnimal?.(a)||null;}
  function resourceExists(st,r){
    if(Object.values(st.sources||{}).some(s=>s.resource===r&&(s.infinite||(s.amount||0)>.05)))return true;
    return Object.values(st.containers||{}).some(c=>(c.contents?.[r]||0)>.05);
  }
  function drinkableContainer(st,a,r){
    return Object.values(st.containers||{}).filter(c=>c.canDrinkFrom&&(c.contents?.[r]||0)>.05&&(!E.holderOf?.(c.id)||E.holderOf(c.id)?.id===a.id)).map(c=>{
      const goal=SP.bestInteractionPosition(st,a,{kind:'object',id:c.id},'drinkFrom');return goal?{c,d:SP.pathDistance(st,a,goal)}:null;
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
      case'satisfyHunger':return foodAmount(st)>.05?canonicalBaseUtility(a,'eat'):0;
      case'drinkWater':return (a.kind==='cat'?!!drinkableContainer(st,a,'water'):hasHumanDrinkPlan(st,a,'water'))?canonicalBaseUtility(a,'drinkWater'):0;
      case'drinkAlcohol':return a.kind==='human'&&hasHumanDrinkPlan(st,a,'alcohol')?canonicalBaseUtility(a,'drinkAlcohol'):0;
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
    const push=(intentKind,actionKindValue,extra={})=>{const utility=utilityForIntent(st,a,intentKind);if(utility>0)out.push({intentKind,actionKind:actionKindValue,utility,...extra});};
    if(a.kind==='human'){
      push('satisfyHunger','eat');push('drinkWater','drinkWater');push('drinkAlcohol','drinkAlcohol');push('recoverFatigue','rest');push('sleep','sleep');
      const h=nearestAgent(st,a,'human',{awakeOnly:true});if(h)push('socialize','talk',{targetAgent:h.id});
      const animal=nearestPettableAnimal(a);if(animal)push('interactWithAnimal','petAnimal',{targetAgent:animal.id});
      push('removeHazard','cleanFloor');
      const bidPick=E.newestObservedAnimalBid?.(st,a);if(bidPick){const target=st.agents?.[bidPick.bid?.data?.bidFrom];if(target&&!target.offMap&&E.canPetAnimal?.(a,target))out.push({intentKind:'respondSocialBid',actionKind:'petAnimal',utility:72+(a.traits?.animalAffinity||0)*20,targetAgent:target.id,bidId:bidPick.bid.id,observedTick:bidPick.ref.observedTick});}
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
    const kind=actionKind(a),openWait=!a.action&&intent.lifecycle==='open'&&intent.kind==='awaitResponse';
    if(!openWait&&!SOFT_RECONSIDERABLE_ACTIONS.has(kind))return {ok:false,reason:'protected-action'};
    const age=Math.max(0,st.tick-(intent.createdTick||0));
    if(age<MIN_INTENT_HOLD_TICKS)return {ok:false,reason:'minimum-hold',holdRemaining:MIN_INTENT_HOLD_TICKS-age};
    return {ok:true,reason:'eligible'};
  }
  function sameCurrentCandidate(st,a,intent,c){
    if(c.intentKind!==intent?.kind)return false;
    const hook=window.SimMemoryDeliberation?.isDistinctTargetCandidate;
    return !(hook&&hook(st,a,intent,c));
  }
  function reconsiderationSnapshot(st,a){
    const intent=a.activeIntent,eligibility=softEligible(st,a),commitment=derivedCommitmentCost(st,a),baseCurrentUtility=intent?utilityForIntent(st,a,intent.kind,{intent}):0;
    const adjustCurrent=window.SimMemoryDeliberation?.adjustCurrentIntentUtility;
    const currentUtility=adjustCurrent&&intent?adjustCurrent(st,a,intent,baseCurrentUtility):baseCurrentUtility;
    const candidates=candidateIntents(st,a).filter(c=>!sameCurrentCandidate(st,a,intent,c)),best=candidates[0]||null,threshold=currentUtility+SOFT_SWITCH_MARGIN+(Number.isFinite(commitment)?commitment:0);
    return {...eligibility,currentUtility,commitmentCost:commitment,switchMargin:SOFT_SWITCH_MARGIN,switchThreshold:threshold,bestChallenger:best};
  }
  function freshIntent(st,a,c,priorIntent){
    const id=`intent:${a.id}:${st.tick}:${c.intentKind}:soft`;
    if(c.intentKind==='respondSocialBid')return {id,kind:c.intentKind,createdTick:st.tick,lifecycle:'actionBound',source:{type:'socialBid',bidId:c.bidId,observedTick:c.observedTick,reconsideration:{type:'soft',tick:st.tick,priorIntentId:priorIntent?.id||null}}};
    return {id,kind:c.intentKind,createdTick:st.tick,lifecycle:'actionBound',source:{type:'softReconsideration',tick:st.tick,priorIntentId:priorIntent?.id||null,priorIntentKind:priorIntent?.kind||null}};
  }
  function applySoftReconsideration(st,a){
    const snap=reconsiderationSnapshot(st,a),c=snap.bestChallenger;if(!snap.ok||!c||!Number.isFinite(snap.commitmentCost)||c.utility<=snap.switchThreshold)return false;
    const nextAction=buildAction(st,a,c);if(!nextAction)return false;
    const priorIntent=a.activeIntent,priorActionKind=actionKind(a),priorIntentId=priorIntent?.id||null,priorIntentKind=priorIntent?.kind||null;
    clearAgentReservations(st,a);dropHeld(st,a);a.action=null;a.activeIntent=null;
    const nextIntent=freshIntent(st,a,c,priorIntent);nextAction.intentId=nextIntent.id;a.action=nextAction;a.activeIntent=nextIntent;
    E.addEvent(`${a.name}重新權衡目前狀況，放下「${E.intentLabel?.(priorIntent)||priorIntentKind}」，改先「${E.intentLabel?.(nextIntent)||c.intentKind}」。`,'normal',[],{actor:a.id,action:'intentReconsider',priorIntentId,priorIntentKind,priorActionKind:priorActionKind||null,intentId:nextIntent.id,intentKind:nextIntent.kind,nextActionKind:c.actionKind,challengerIntentKind:c.intentKind,currentUtility:snap.currentUtility,challengerUtility:c.utility,switchMargin:SOFT_SWITCH_MARGIN,commitmentCost:snap.commitmentCost,switchThreshold:snap.switchThreshold,position:E.positionRef(a.position)});
    return true;
  }
  function applySoftReconsiderations(st){for(const a of Object.values(st.agents||{}))applySoftReconsideration(st,a);}

  if(!E.registerRuntimeHook)throw new Error('intent-runtime-v1124.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','intent.soft-reconsideration',()=>applySoftReconsiderations(E.getState()),700);

  Object.assign(E,{DELIBERATION_SCHEMA_VERSION:VERSION,SOFT_SWITCH_MARGIN,MIN_INTENT_HOLD_TICKS,SOFT_RECONSIDERABLE_ACTIONS,utilityForIntent,candidateIntents,derivedCommitmentCost,reconsiderationSnapshot,applySoftReconsideration});
})();
