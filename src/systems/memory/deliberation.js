(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;
  if(!E||!W?.MEMORY_DELIBERATION_SCHEMA_VERSION||!E.MEMORY_RETENTION_SCHEMA_VERSION||!SP)return;
  const VERSION=W.MEMORY_DELIBERATION_SCHEMA_VERSION||'11.13.4-memory-deliberation-influence';
  const TOP_MEMORIES=W.MEMORY_DELIBERATION_TOP_MEMORIES||6;
  const MAX_DELTA=W.MEMORY_DELIBERATION_MAX_DELTA||18;
  const ACCESS_COST_WEIGHT=W.MEMORY_TARGET_ACCESS_COST_WEIGHT||2;
  const ACCESS_COST_CAP=W.MEMORY_TARGET_ACCESS_COST_CAP||12;
  const RECENCY_HALF_LIFE=E.MEMORY_RECENCY_HALF_LIFE||W.MEMORY_RECENCY_HALF_LIFE||32;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=(v,d=3)=>{const p=10**d;return Math.round(v*p)/p;};
  const SUPPORTED_INTENTS=new Set(['socialize','interactWithAnimal','seekSocialContact']);
  const ACTION_TO_INTENT=Object.freeze({talk:'socialize',petAnimal:'interactWithAnimal',seekHuman:'seekSocialContact'});

  function eligibleTargets(st,a,intentKind){
    if(!a||a.offMap||!SUPPORTED_INTENTS.has(intentKind))return [];
    let predicate=null,awakeOnly=false;
    if(intentKind==='socialize'){
      if(a.kind!=='human')return [];
      awakeOnly=true;predicate=t=>t.kind==='human';
    }else if(intentKind==='interactWithAnimal'){
      if(a.kind!=='human')return [];
      predicate=t=>E.canPetAnimal?.(a,t)===true;
    }else if(intentKind==='seekSocialContact'){
      if(E.isAnimalAgent?.(a)!==true)return [];
      predicate=t=>t.kind==='human';
    }
    return Object.values(st.agents||{}).filter(t=>t.id!==a.id&&!t.offMap&&predicate?.(t)&&(!awakeOnly||!E.isSleeping?.(t))).map(target=>({target,route:SP.planRoute(st,a,target.position,{objective:'traversalCost'})})).filter(x=>Number.isFinite(x.route.traversalCost));
  }
  function memoryEvidence(st,a,m){
    const p=m?.appraisal||{},relevance=clamp(Number(p.relevance)||0,0,1),congruence=clamp(Number(p.goalCongruence)||0,-1,1),age=Math.max(0,(Number(st?.tick)||0)-(Number(m?.lastObservedTick)||Number(m?.observedTick)||0)),recency=1/(1+age/RECENCY_HALF_LIFE);
    return {memoryId:m?.id||null,sourceEventId:m?.sourceEventId||null,observedTick:Number(m?.observedTick)||0,lastObservedTick:Number(m?.lastObservedTick)||Number(m?.observedTick)||0,relevance:round(relevance),goalCongruence:round(congruence),recency:round(recency),evidence:round(relevance*congruence*recency,4)};
  }
  function memoryAssociatedWithTarget(m,targetId){if(!m||!targetId)return false;if(m?.appraisal?.agency?.kind==='other'&&m.appraisal.agency.agentId===targetId)return true;return m.episodeKind==='privateSocialOutcome'&&m?.experienced?.kind==='socialNoResponse'&&m.experienced.counterpartId===targetId;}
  function targetMemoryContributions(st,a,targetId){return (a?.episodicMemories||[]).filter(m=>memoryAssociatedWithTarget(m,targetId)).map(m=>memoryEvidence(st,a,m)).sort((x,y)=>Math.abs(y.evidence)-Math.abs(x.evidence)||y.lastObservedTick-x.lastObservedTick||String(x.memoryId).localeCompare(String(y.memoryId))).slice(0,TOP_MEMORIES);}
  function targetAssociation(st,a,targetId){const contributions=targetMemoryContributions(st,a,targetId),signedEvidence=contributions.reduce((sum,c)=>sum+c.evidence,0),association=Math.tanh(signedEvidence),memoryUtilityDelta=clamp(association*MAX_DELTA,-MAX_DELTA,MAX_DELTA);return {targetId,contributions,signedEvidence:round(signedEvidence,4),association:round(association,4),memoryUtilityDelta:round(memoryUtilityDelta)};}
  function targetEvaluation(st,a,target,intentKind,baseUtility,routeOverride=null){
    const route=routeOverride||SP.planRoute(st,a,target.position,{objective:'traversalCost'}),assoc=targetAssociation(st,a,target.id),relationshipTargetDelta=round(E.relationshipTargetDelta?.(a,target.id)||0),accessPenalty=Math.min(Math.max(0,route.traversalCost)*ACCESS_COST_WEIGHT,ACCESS_COST_CAP);
    return {...assoc,intentKind,targetAgent:target.id,pathDistance:round(route.pathDistance),traversalCost:round(route.traversalCost),travelTime:round(route.travelTime),relationshipTargetDelta,accessPenalty:round(accessPenalty),targetPreference:round(assoc.memoryUtilityDelta+relationshipTargetDelta-accessPenalty),baseUtility:round(baseUtility),finalUtility:round(baseUtility+assoc.memoryUtilityDelta)};
  }
  function targetEvaluations(st,a,intentKind,baseUtility){return eligibleTargets(st,a,intentKind).map(({target,route})=>targetEvaluation(st,a,target,intentKind,baseUtility,route)).sort((x,y)=>y.targetPreference-x.targetPreference||y.finalUtility-x.finalUtility||x.traversalCost-y.traversalCost||x.pathDistance-y.pathDistance||String(x.targetAgent).localeCompare(String(y.targetAgent)));}

  function bestTargetEvaluation(st,a,intentKind,baseUtility){return targetEvaluations(st,a,intentKind,baseUtility)[0]||null;}
  function adjustIntentCandidates(st,a,candidates){
    const out=[];
    for(const c of candidates||[]){if(!SUPPORTED_INTENTS.has(c.intentKind)){out.push(c);continue;}const best=bestTargetEvaluation(st,a,c.intentKind,c.utility);if(!best)continue;out.push({...c,targetAgent:best.targetAgent,utility:best.finalUtility,targetPreference:best.targetPreference,pathDistance:best.pathDistance,traversalCost:best.traversalCost,travelTime:best.travelTime,accessPenalty:best.accessPenalty});}
    return out;
  }
  function adjustCurrentIntentUtility(st,a,intent,baseUtility){if(!SUPPORTED_INTENTS.has(intent?.kind))return baseUtility;const targetId=a?.action?.targetAgent,target=targetId&&st.agents?.[targetId];if(!target||target.offMap)return baseUtility;return targetEvaluation(st,a,target,intent.kind,baseUtility).finalUtility;}
  function isDistinctTargetCandidate(st,a,intent,candidate){if(!SUPPORTED_INTENTS.has(intent?.kind)||candidate?.intentKind!==intent.kind)return false;const currentTarget=a?.action?.targetAgent;return !!(currentTarget&&candidate?.targetAgent&&candidate.targetAgent!==currentTarget);}
  function coreIntentForOption(a,option){const intentKind=ACTION_TO_INTENT[option?.id];if(!intentKind)return null;if(option.id==='petAnimal'&&a?.activeIntent?.kind==='respondSocialBid')return null;return intentKind;}
  function adjustCoreOptions(st,a,options){const adjusted=(options||[]).map(option=>{const intentKind=coreIntentForOption(a,option);if(!intentKind)return option;const best=bestTargetEvaluation(st,a,intentKind,Number(option.score)||0);if(!best)return option;return {...option,targetAgent:best.targetAgent,score:round((Number(option.score)||0)+best.memoryUtilityDelta)};});return adjusted.sort((x,y)=>(Number(y.score)||0)-(Number(x.score)||0)||String(x.id).localeCompare(String(y.id)));}
  function samePick(a,b){return !!a&&!!b&&a.id===b.id&&(a.targetAgent||null)===(b.targetAgent||null);}
  function rewritePlanEvent(st,a,oldPick,newPick){const e=(st.events||[]).find(x=>x.tick===st.tick&&x.type==='system'&&x.data?.actor===a.id&&x.data?.phase==='plan'&&x.data?.planLifecycle==='initialProvisional'&&x.data?.action===oldPick?.id);if(!e)return;e.text=`${a.name}決定${E.ZH?.[newPick.id]||newPick.id}。`;e.data.action=newPick.id;}
  function correctInitialDeliberation(st,idleBefore){
    for(const id of idleBefore||[]){
      const a=st.agents?.[id],thought=st.thoughts?.[id];if(!a||!a.action||thought?.tick!==st.tick||a.activeIntent?.kind==='respondSocialBid')continue;
      const oldPick=thought.pick,options=adjustCoreOptions(st,a,thought.options),pick=options[0]||oldPick;thought.options=options;thought.pick=pick;if(!pick)continue;
      if(samePick(oldPick,pick)){if(pick.targetAgent&&ACTION_TO_INTENT[pick.id]&&a.action.targetAgent!==pick.targetAgent)a.action.targetAgent=pick.targetAgent;continue;}
      const replacement=E.buildAction?.(a,pick);if(!replacement)continue;rewritePlanEvent(st,a,oldPick,pick);a.action=replacement;a.activeIntent=null;E.ensureIntentForAction?.(st,a);
    }
    E.reconcileIntents?.(st);
  }
  function currentSocialTargetEvaluations(st,a){const out=[];const intents=a?.kind==='human'?['socialize','interactWithAnimal']:E.isAnimalAgent?.(a)?['seekSocialContact']:[];for(const intentKind of intents){const base=E.utilityForIntent?.(st,a,intentKind,{intent:null})||0;for(const e of targetEvaluations(st,a,intentKind,base))out.push(e);}return out;}
  function captureIdle(st){return Object.values(st.agents||{}).filter(a=>!a.action&&!a.activeIntent&&!a.offMap).map(a=>a.id);}

  window.SimMemoryDeliberation={VERSION,adjustIntentCandidates,adjustCurrentIntentUtility,isDistinctTargetCandidate};
  if(!E.registerRuntimeHook)throw new Error('systems/memory/deliberation.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','memoryDeliberation.capture-idle',(ctx)=>{ctx.locals.memoryDeliberationV1134=captureIdle(E.getState());},200);
  E.registerRuntimeHook('afterTick','memoryDeliberation.correct-initial',(ctx)=>correctInitialDeliberation(E.getState(),ctx.locals.memoryDeliberationV1134),800);
  Object.assign(E,{MEMORY_DELIBERATION_SCHEMA_VERSION:VERSION,MEMORY_DELIBERATION_TOP_MEMORIES:TOP_MEMORIES,MEMORY_DELIBERATION_MAX_DELTA:MAX_DELTA,memoryAssociatedWithTarget,targetMemoryContributions,targetAssociation,targetEvaluation,targetEvaluations,bestMemoryTargetEvaluation:bestTargetEvaluation,currentSocialTargetEvaluations,adjustInitialDeliberation:correctInitialDeliberation});
})();
