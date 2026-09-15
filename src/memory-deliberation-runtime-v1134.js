(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;
  if(!E||!W?.MEMORY_DELIBERATION_SCHEMA_VERSION||!E.MEMORY_RETENTION_SCHEMA_VERSION||!SP)return;
  const VERSION=W.MEMORY_DELIBERATION_SCHEMA_VERSION||'11.13.4-memory-deliberation-influence';
  const TOP_MEMORIES=W.MEMORY_DELIBERATION_TOP_MEMORIES||6;
  const MAX_DELTA=W.MEMORY_DELIBERATION_MAX_DELTA||18;
  const DISTANCE_WEIGHT=W.MEMORY_TARGET_DISTANCE_WEIGHT||2;
  const DISTANCE_CAP=W.MEMORY_TARGET_DISTANCE_CAP||12;
  const RECENCY_HALF_LIFE=E.MEMORY_RECENCY_HALF_LIFE||W.MEMORY_RECENCY_HALF_LIFE||32;
  const baseTick=E.tick,baseReset=E.reset;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=(v,d=3)=>{const p=10**d;return Math.round(v*p)/p;};
  const SUPPORTED_INTENTS=new Set(['socialize','interactWithCat','seekSocialContact']);
  const ACTION_TO_INTENT=Object.freeze({talk:'socialize',petCat:'interactWithCat',seekHuman:'seekSocialContact'});

  function eligibleTargets(st,a,intentKind){
    if(!a||a.offMap||!SUPPORTED_INTENTS.has(intentKind))return [];
    let kind=null,awakeOnly=false;
    if(intentKind==='socialize'){if(a.kind!=='human')return [];kind='human';awakeOnly=true;}
    else if(intentKind==='interactWithCat'){if(a.kind!=='human')return [];kind='cat';}
    else if(intentKind==='seekSocialContact'){if(a.kind!=='cat')return [];kind='human';}
    return Object.values(st.agents||{}).filter(t=>t.id!==a.id&&!t.offMap&&t.kind===kind&&(!awakeOnly||!E.isSleeping?.(t)))
      .map(target=>({target,pathDistance:SP.pathDistance(st,a,target.position)}))
      .filter(x=>Number.isFinite(x.pathDistance));
  }

  function memoryEvidence(st,a,m){
    const p=m?.appraisal||{},relevance=clamp(Number(p.relevance)||0,0,1),congruence=clamp(Number(p.goalCongruence)||0,-1,1);
    const age=Math.max(0,(Number(st?.tick)||0)-(Number(m?.lastObservedTick)||Number(m?.observedTick)||0));
    const recency=1/(1+age/RECENCY_HALF_LIFE);
    return {memoryId:m?.id||null,sourceEventId:m?.sourceEventId||null,observedTick:Number(m?.observedTick)||0,lastObservedTick:Number(m?.lastObservedTick)||Number(m?.observedTick)||0,relevance:round(relevance),goalCongruence:round(congruence),recency:round(recency),evidence:round(relevance*congruence*recency,4)};
  }

  function targetMemoryContributions(st,a,targetId){
    return (a?.episodicMemories||[])
      .filter(m=>m?.appraisal?.agency?.kind==='other'&&m.appraisal.agency.agentId===targetId)
      .map(m=>memoryEvidence(st,a,m))
      .sort((x,y)=>Math.abs(y.evidence)-Math.abs(x.evidence)||y.lastObservedTick-x.lastObservedTick||String(x.memoryId).localeCompare(String(y.memoryId)))
      .slice(0,TOP_MEMORIES);
  }

  function targetAssociation(st,a,targetId){
    const contributions=targetMemoryContributions(st,a,targetId);
    const signedEvidence=contributions.reduce((sum,c)=>sum+c.evidence,0);
    const association=Math.tanh(signedEvidence);
    const memoryUtilityDelta=clamp(association*MAX_DELTA,-MAX_DELTA,MAX_DELTA);
    return {targetId,contributions,signedEvidence:round(signedEvidence,4),association:round(association,4),memoryUtilityDelta:round(memoryUtilityDelta)};
  }

  function targetEvaluation(st,a,target,intentKind,baseUtility){
    const pathDistance=SP.pathDistance(st,a,target.position),assoc=targetAssociation(st,a,target.id);
    const distancePenalty=Math.min(Math.max(0,pathDistance)*DISTANCE_WEIGHT,DISTANCE_CAP);
    return {...assoc,intentKind,targetAgent:target.id,pathDistance:round(pathDistance),distancePenalty:round(distancePenalty),targetPreference:round(assoc.memoryUtilityDelta-distancePenalty),baseUtility:round(baseUtility),finalUtility:round(baseUtility+assoc.memoryUtilityDelta)};
  }

  function targetEvaluations(st,a,intentKind,baseUtility){
    return eligibleTargets(st,a,intentKind).map(({target})=>targetEvaluation(st,a,target,intentKind,baseUtility))
      .sort((x,y)=>y.targetPreference-x.targetPreference||y.finalUtility-x.finalUtility||x.pathDistance-y.pathDistance||String(x.targetAgent).localeCompare(String(y.targetAgent)));
  }

  function bestTargetEvaluation(st,a,intentKind,baseUtility){return targetEvaluations(st,a,intentKind,baseUtility)[0]||null;}

  function adjustIntentCandidates(st,a,candidates){
    const out=[];
    for(const c of candidates||[]){
      if(!SUPPORTED_INTENTS.has(c.intentKind)){out.push(c);continue;}
      const best=bestTargetEvaluation(st,a,c.intentKind,c.utility);
      if(!best)continue;
      out.push({...c,targetAgent:best.targetAgent,utility:best.finalUtility,targetPreference:best.targetPreference,pathDistance:best.pathDistance});
    }
    return out;
  }

  function adjustCurrentIntentUtility(st,a,intent,baseUtility){
    if(!SUPPORTED_INTENTS.has(intent?.kind))return baseUtility;
    const targetId=a?.action?.targetAgent,target=targetId&&st.agents?.[targetId];
    if(!target||target.offMap)return baseUtility;
    return targetEvaluation(st,a,target,intent.kind,baseUtility).finalUtility;
  }

  function isDistinctTargetCandidate(st,a,intent,candidate){
    if(!SUPPORTED_INTENTS.has(intent?.kind)||candidate?.intentKind!==intent.kind)return false;
    const currentTarget=a?.action?.targetAgent;
    return !!(currentTarget&&candidate?.targetAgent&&candidate.targetAgent!==currentTarget);
  }

  function coreIntentForOption(a,option){
    const intentKind=ACTION_TO_INTENT[option?.id];
    if(!intentKind)return null;
    if(option.id==='petCat'&&(a?.activeIntent?.kind==='respondSocialBid'||a?.pendingInteraction?.type==='cat_request'))return null;
    return intentKind;
  }

  function adjustCoreOptions(st,a,options){
    const adjusted=(options||[]).map(option=>{
      const intentKind=coreIntentForOption(a,option);if(!intentKind)return option;
      const best=bestTargetEvaluation(st,a,intentKind,Number(option.score)||0);if(!best)return option;
      return {...option,targetAgent:best.targetAgent,score:round((Number(option.score)||0)+best.memoryUtilityDelta)};
    });
    return adjusted.sort((x,y)=>(Number(y.score)||0)-(Number(x.score)||0)||String(x.id).localeCompare(String(y.id)));
  }

  function randomFloorTile(st,a){
    const tiles=Object.values(st.map?.tiles||{}).filter(t=>SP.walkable(st,t));
    const scored=tiles.map(t=>({t,d:SP.pathDistance(st,a,t)})).filter(x=>Number.isFinite(x.d)&&x.d>0);
    return scored.length?scored[Math.floor(E.rand(0,scored.length))]?.t||null:null;
  }
  function exitSlotFor(st,a){
    return SP.allSlots(st).filter(s=>s.canExit&&SP.slotAllows(s,a)).map(s=>({s,d:SP.pathDistance(st,a,s.position)})).filter(x=>Number.isFinite(x.d)).sort((x,y)=>x.d-y.d)[0]?.s||null;
  }
  function buildCoreAction(st,a,c){
    const base={kind:c.id,phase:'start',started:st.tick,wait:0};let action=null;
    switch(c.id){
      case'eat':action={...base,phase:'prepare'};break;
      case'drinkWater':case'drinkAlcohol':{
        const resource=c.id==='drinkWater'?'water':'alcohol';
        if(a.kind==='cat'){
          const src=Object.values(st.containers||{}).filter(x=>x.canDrinkFrom&&(x.contents?.[resource]||0)>0&&(!E.holderOf?.(x.id)||E.holderOf(x.id)?.id===a.id)).map(x=>({x,d:SP.pathDistance(st,a,SP.bestInteractionPosition(st,a,{kind:'object',id:x.id},'drinkFrom'))})).filter(x=>Number.isFinite(x.d)).sort((x,y)=>x.d-y.d)[0]?.x||null;
          action=src?{...base,phase:'move',targetObject:src.id,resource}:null;
        }else action={...base,phase:'chooseVessel',resource};
        break;
      }
      case'rest':action={...base,phase:'chooseSurface',restTicks:0};break;
      case'sleep':action={...base,phase:'chooseSurface',sleepTicks:0};break;
      case'talk':{const t=c.targetAgent&&st.agents?.[c.targetAgent];action=t&&!t.offMap?{...base,phase:'move',targetAgent:t.id}:null;break;}
      case'petCat':{const t=c.targetAgent&&st.agents?.[c.targetAgent];action=t&&!t.offMap?{...base,phase:'move',targetAgent:t.id}:null;break;}
      case'seekHuman':{const t=c.targetAgent&&st.agents?.[c.targetAgent];action=t&&!t.offMap?{...base,phase:'move',targetAgent:t.id}:null;break;}
      case'cleanFloor':{const t=SP.wettestTile?.(st);action=t?{...base,phase:'move',targetTile:{x:t.x,y:t.y}}:null;break;}
      case'groom':action={...base,phase:'groom'};break;
      case'wander':{const t=randomFloorTile(st,a);action={...base,phase:'move',targetTile:t?{x:t.x,y:t.y}:null,oneShot:true};break;}
      case'restockContainer':{const j=c.job;if(j)action={...base,phase:j.strategy==='carryContainer'?'toContainer':'toCarrier',destinationId:j.destinationId,sourceId:j.sourceId,sourceKind:j.sourceKind,resource:j.resource,strategy:j.strategy,carrierId:j.carrierId||null};break;}
      case'externalSupply':{const exit=exitSlotFor(st,a);if(exit&&c.carrierId)action={...base,phase:'toCarrier',exitSlot:exit.id,destinationId:c.destinationId,resource:c.resource,carrierId:c.carrierId,workLeft:Math.floor(E.rand(7,11)),produced:0};break;}
    }
    if(action)E.installActionKind?.(action);return action;
  }

  function samePick(a,b){return !!a&&!!b&&a.id===b.id&&(a.targetAgent||null)===(b.targetAgent||null);}
  function rewritePlanEvent(st,a,oldPick,newPick){
    const e=(st.events||[]).find(x=>x.data?.actor===a.id&&x.data?.phase==='plan'&&x.data?.action===oldPick?.id);
    if(!e)return;
    e.text=`${a.name}決定${E.ZH?.[newPick.id]||newPick.id}。`;
    e.data.action=newPick.id;
  }
  function correctInitialDeliberation(st,idleBefore){
    for(const id of idleBefore){
      const a=st.agents?.[id],thought=st.thoughts?.[id];
      if(!a||!a.action||thought?.tick!==st.tick||a.activeIntent?.kind==='respondSocialBid')continue;
      const oldPick=thought.pick,options=adjustCoreOptions(st,a,thought.options),pick=options[0]||oldPick;
      thought.options=options;thought.pick=pick;
      if(!pick)continue;
      if(samePick(oldPick,pick)){
        if(pick.targetAgent&&ACTION_TO_INTENT[pick.id]&&a.action.targetAgent!==pick.targetAgent)a.action.targetAgent=pick.targetAgent;
        continue;
      }
      const replacement=buildCoreAction(st,a,pick);if(!replacement)continue;
      rewritePlanEvent(st,a,oldPick,pick);
      a.action=replacement;a.activeIntent=null;
      E.ensureIntentForAction?.(st,a);
    }
    E.reconcileIntents?.(st);
  }

  function currentSocialTargetEvaluations(st,a){
    const out=[];
    const intents=a?.kind==='human'?['socialize','interactWithCat']:a?.kind==='cat'?['seekSocialContact']:[];
    for(const intentKind of intents){
      const base=E.utilityForIntent?.(st,a,intentKind,{intent:null})||0;
      for(const e of targetEvaluations(st,a,intentKind,base))out.push(e);
    }
    return out;
  }

  window.SimMemoryDeliberation={VERSION,adjustIntentCandidates,adjustCurrentIntentUtility,isDistinctTargetCandidate};
  E.tick=(...args)=>{
    const before=E.getState(),idleBefore=Object.values(before.agents||{}).filter(a=>!a.action&&!a.activeIntent&&!a.offMap).map(a=>a.id);
    const result=baseTick(...args),after=E.getState();
    correctInitialDeliberation(after,idleBefore);
    return result;
  };
  E.reset=(...args)=>baseReset(...args);
  Object.assign(E,{MEMORY_DELIBERATION_SCHEMA_VERSION:VERSION,MEMORY_DELIBERATION_TOP_MEMORIES:TOP_MEMORIES,MEMORY_DELIBERATION_MAX_DELTA:MAX_DELTA,targetMemoryContributions,targetAssociation,targetEvaluation,targetEvaluations,bestMemoryTargetEvaluation:bestTargetEvaluation,currentSocialTargetEvaluations,adjustInitialDeliberation:correctInitialDeliberation});
})();
