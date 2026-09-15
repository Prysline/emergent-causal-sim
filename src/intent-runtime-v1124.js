(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.DELIBERATION_SCHEMA_VERSION||'11.12.4-soft-reconsideration';
  const SOFT_SWITCH_MARGIN=14,MIN_INTENT_HOLD_TICKS=2;
  const SOFT_RECONSIDERABLE_ACTIONS=new Set(['wander','talk','petCat','seekHuman','cleanFloor','groom','rest']);

  function actionKind(a){return E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;}
  function foodAmount(st){return Object.values(st.containers||{}).filter(c=>c.canEatFrom).reduce((sum,c)=>sum+(c.contents?.food||0),0);}
  function wetTotal(st){return Object.values(st.map?.tiles||{}).reduce((sum,t)=>sum+(SP.tileLiquidAmount?.(t)||0),0);}
  function nearestAgent(st,a,kind,{awakeOnly=false}={}){
    return Object.values(st.agents||{}).filter(x=>x.id!==a.id&&!x.offMap&&x.kind===kind&&(!awakeOnly||!E.isSleeping?.(x))).map(x=>({x,d:SP.pathDistance(st,a,x.position)})).filter(x=>Number.isFinite(x.d)).sort((p,q)=>p.d-q.d)[0]?.x||null;
  }
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
  function sleepCandidateUtility(st,a){
    const p=E.sleepProfile?.(a),need=a.needs?.sleepNeed||0,bias=E.circadianSleepBias?.(a,st.minute)||0,propensity=E.sleepPropensity?.(a,st.minute)??need;
    if(!p||!SP.sleepTargets?.(st,a)?.length||need<p.minimumSleepNeed||propensity<p.sleepOpportunityThreshold)return null;
    return 42+need*.55+Math.max(-8,bias*.55)+Math.max(0,(a.needs?.fatigue||0)-65)*.15;
  }
  function currentBidUtility(st,a,intent){
    if(intent?.kind==='respondSocialBid'){
      const bid=E.bidEvent?.(st,intent.source?.bidId);if(!bid||bid.data?.bidTo!==a.id)return 0;
      return 72+(a.traits?.animalAffinity||0)*20;
    }
    if(intent?.kind==='awaitResponse')return 52;
    return null;
  }
  function utilityForIntent(st,a,intentKind,{intent=null}={}){
    const bidValue=currentBidUtility(st,a,intent||{kind:intentKind});if(bidValue!=null)return bidValue;
    const n=a.needs||{},traits=a.traits||{};
    switch(intentKind){
      case'satisfyHunger':return foodAmount(st)>.05?n.hunger*1.08+12:0;
      case'drinkWater':return (a.kind==='cat'?!!drinkableContainer(st,a,'water'):hasHumanDrinkPlan(st,a,'water'))?n.thirst*1.18+10:0;
      case'drinkAlcohol':return a.kind==='human'&&hasHumanDrinkPlan(st,a,'alcohol')?n.thirst*.42+(traits.alcoholLike||0)*34+(a.status?.intoxication<35?6:-18):0;
      case'recoverFatigue':return Math.max(0,Math.min(n.fatigue||0,68)-18)*1.25+9;
      case'sleep':return sleepCandidateUtility(st,a)||0;
      case'socialize':return a.kind==='human'&&nearestAgent(st,a,'human',{awakeOnly:true})?Math.max(0,(n.social||0)-18)*.9+(traits.social||0)*16:0;
      case'interactWithCat':return a.kind==='human'&&nearestAgent(st,a,'cat')?8+(traits.animalAffinity||0)*18+(n.social||0)*.18:0;
      case'seekSocialContact':return a.kind==='cat'&&(n.social||0)>14&&nearestAgent(st,a,'human')?Math.max(0,(n.social||0)-10)*.95+(traits.social||0)*18:0;
      case'removeHazard':{const wet=wetTotal(st);return wet>.2?15+wet*.9+(a.wellbeing?.safety||0)*.08:0;}
      case'groom':return a.kind==='cat'?(n.groomingNeed||0)*.83+Object.values(a.contacts?.paws||{}).reduce((x,y)=>x+y,0)*.9+18:0;
      case'explore':return a.kind==='cat'?20+(traits.curious||0)*25:10;
      default:return 0;
    }
  }
  function candidateIntents(st,a){
    const out=[];
    const push=(intentKind,actionKindValue,extra={})=>{const utility=utilityForIntent(st,a,intentKind);if(utility>0)out.push({intentKind,actionKind:actionKindValue,utility,...extra});};
    if(a.kind==='human'){
      push('satisfyHunger','eat');push('drinkWater','drinkWater');push('drinkAlcohol','drinkAlcohol');push('recoverFatigue','rest');push('sleep','sleep');
      const h=nearestAgent(st,a,'human',{awakeOnly:true});if(h)push('socialize','talk',{targetAgent:h.id});
      const cat=nearestAgent(st,a,'cat');if(cat)push('interactWithCat','petCat',{targetAgent:cat.id});
      push('removeHazard','cleanFloor');
      const bidPick=E.newestObservedCatBid?.(st,a);if(bidPick){const target=st.agents?.[bidPick.bid?.data?.bidFrom];if(target&&!target.offMap)out.push({intentKind:'respondSocialBid',actionKind:'petCat',utility:72+(a.traits?.animalAffinity||0)*20,targetAgent:target.id,bidId:bidPick.bid.id,observedTick:bidPick.ref.observedTick});}
    }else{
      push('satisfyHunger','eat');push('groom','groom');push('recoverFatigue','rest');push('sleep','sleep');
      const h=nearestAgent(st,a,'human');if((a.needs?.social||0)>14&&h)push('seekSocialContact','seekHuman',{targetAgent:h.id});
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
      case'petCat':cost=p.phase==='move'?5:10;break;
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

  if(E.registerRuntimeHook)E.registerRuntimeHook('beforeTick','intent.soft-reconsideration',()=>applySoftReconsiderations(E.getState()),700);
  else{
    const baseTick=E.tick,baseReset=E.reset;
    E.tick=(...args)=>{applySoftReconsiderations(E.getState());return baseTick(...args);};
    E.reset=(...args)=>baseReset(...args);
  }

  Object.assign(E,{DELIBERATION_SCHEMA_VERSION:VERSION,SOFT_SWITCH_MARGIN,MIN_INTENT_HOLD_TICKS,SOFT_RECONSIDERABLE_ACTIONS,utilityForIntent,candidateIntents,derivedCommitmentCost,reconsiderationSnapshot,applySoftReconsideration});
})();
