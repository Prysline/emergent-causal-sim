(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W?.DELIBERATION_SCHEMA_VERSION)return;
  const VERSION=W.DELIBERATION_SCHEMA_VERSION;
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const SOCIAL_TARGET_INTENTS=new Set(['socialize','interactWithAnimal','seekSocialContact']);

  function actionContext(action){
    if(!action)return null;
    const out={kind:action.kind,started:action.started};
    for(const key of ['targetAgent','targetObject','destinationId','sourceId','resource','exitId'])if(action[key]!=null)out[key]=clone(action[key]);
    if(action.targetTile!=null)out.targetTile=clone(action.targetTile);
    return out;
  }
  function sameValue(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function decisionEvidenceMatchesAction(a){
    const action=a?.action,evidence=a?.decisionEvidence,ctx=evidence?.action;
    if(!action||!evidence||!ctx||action.decisionId!==evidence.id||ctx.kind!==action.kind||ctx.started!==action.started)return false;
    if(evidence.intentId&&action.intentId!==evidence.intentId)return false;
    for(const key of ['targetAgent','targetObject','destinationId','sourceId','resource','exitId','targetTile'])if(Object.prototype.hasOwnProperty.call(ctx,key)&&!sameValue(ctx[key],action[key]))return false;
    return true;
  }
  function selectedSocialTargetContributor(st,a,action,source){
    const intentKind=source?.intentKind||a?.activeIntent?.kind,targetId=action?.targetAgent;
    if(!targetId||!SOCIAL_TARGET_INTENTS.has(intentKind)||typeof E.targetEvaluation!=='function'||typeof E.utilityForIntent!=='function')return null;
    const target=st.agents?.[targetId];if(!target||target.offMap)return null;
    const baseUtility=E.utilityForIntent(st,a,intentKind,{intent:null}),e=E.targetEvaluation(st,a,target,intentKind,baseUtility);
    return {kind:'socialTarget',key:'selectedTarget',role:'targetSelection',targetAgent:targetId,memoryUtilityDelta:e.memoryUtilityDelta,relationshipTargetDelta:e.relationshipTargetDelta,accessPenalty:e.accessPenalty,pathDistance:e.pathDistance,traversalCost:e.traversalCost,travelTime:e.travelTime,memories:(e.contributions||[]).map(c=>({memoryId:c.memoryId,sourceEventId:c.sourceEventId,observedTick:c.observedTick,lastObservedTick:c.lastObservedTick,relevance:c.relevance,goalCongruence:c.goalCongruence,recency:c.recency,evidence:c.evidence}))};
  }
  function normalizedContributors(st,a,action,contributors,source){
    const out=clone(contributors||[]);
    if((source?.type==='initialDeliberation'||source?.type==='softReconsideration')&&!out.some(c=>c?.kind==='socialTarget')){const target=selectedSocialTargetContributor(st,a,action,source);if(target)out.push(target);}
    return out;
  }
  function adoptDecisionEvidence(st,a,action,{source={},contributors=[],utility=null,priorDecisionId=null}={}){
    if(!st||!a||!action)return null;
    const sequence=Math.max(0,Number(a.decisionEvidence?.sequence)||0)+1,id=`decision:${a.id}:${st.tick}:${sequence}`;
    const evidence={id,sequence,adoptedTick:st.tick,intentId:action.intentId||a.activeIntent?.id||null,action:actionContext(action),source:clone(source)||{},contributors:normalizedContributors(st,a,action,contributors,source)};
    if(Number.isFinite(utility))evidence.utility=utility;
    if(priorDecisionId)evidence.priorDecisionId=priorDecisionId;
    a.decisionEvidence=evidence;action.decisionId=id;return evidence;
  }
  function finalizeInitialDecisionEvidence(st){
    for(const a of Object.values(st.agents||{})){
      const action=a.action,thought=st.thoughts?.[a.id],pick=thought?.pick;
      if(!action||action.decisionId||!thought||thought.tick!==st.tick||action.started!==st.tick||pick?.id!==action.kind)continue;
      if(pick.targetAgent&&action.targetAgent!==pick.targetAgent)continue;
      adoptDecisionEvidence(st,a,action,{source:{type:'initialDeliberation',tick:thought.tick,intentKind:a.activeIntent?.kind||null,providerId:pick.decisionProviderId||null,socialBidId:pick.socialBidId||null},contributors:pick.decisionContributors||[],utility:Number.isFinite(pick.score)?pick.score:null});
    }
  }
  function currentDecisionEvidence(a){return decisionEvidenceMatchesAction(a)?a.decisionEvidence:null;}
  function captureTargetSelectionEvidence(st,a,action,{activity,selectedTarget,objectiveScore,preferenceDelta,effectiveScore,contributors=[],priorTargetDecisionId=null}={}){
    const parentDecisionId=action?.decisionId;
    if(!st||!a||!action||!parentDecisionId||!activity||!selectedTarget?.kind||!selectedTarget?.id)return null;
    if(!Array.isArray(a.targetSelectionEvidence))a.targetSelectionEvidence=[];
    const sequence=a.targetSelectionEvidence.reduce((max,e)=>Math.max(max,Number(e?.sequence)||0),0)+1;
    const id=`target-decision:${a.id}:${st.tick}:${sequence}`;
    const evidence={id,sequence,parentDecisionId,activity,selectedTarget:clone(selectedTarget),evaluatedTick:st.tick,objectiveScore:Number(objectiveScore),preferenceDelta:Number(preferenceDelta)||0,effectiveScore:Number(effectiveScore),contributors:clone(contributors||[])};
    if(priorTargetDecisionId)evidence.priorTargetDecisionId=priorTargetDecisionId;
    a.targetSelectionEvidence.push(evidence);action.targetSelectionDecisionId=id;return evidence;
  }
  function currentTargetSelectionEvidence(a){
    const id=a?.action?.targetSelectionDecisionId;if(!id||!Array.isArray(a?.targetSelectionEvidence))return null;
    const evidence=a.targetSelectionEvidence.find(item=>item?.id===id)||null;
    return evidence&&evidence.parentDecisionId===a.action?.decisionId?evidence:null;
  }
  function routePathsSame(st,left,right){const a=left?.path||[],b=right?.path||[];return a.length===b.length&&a.every((node,index)=>SP?.nodeSame?SP.nodeSame(st,node,b[index]):sameValue(node,b[index]));}
  function handlingRouteMetrics(route,score){return {pathDistance:Number(route?.pathDistance),traversalCost:Number(route?.traversalCost),travelTime:Number(route?.travelTime),handlingRisk:{contentsLoss:Number(route?.handlingRisk?.contentsLoss)||0,containerDrop:Number(route?.handlingRisk?.containerDrop)||0},decisionScore:Number(score)};}
  function handlingRouteContributor(st,a,selected,baseline,preference){
    const weights=clone(preference?.weights)||{},contentsWeight=Math.max(0,Number(weights.contentsRiskWeight)||0),dropWeight=Math.max(0,Number(weights.dropRiskWeight)||0),selectedScore=SP?.routeDecisionScore?.(selected,weights),baselineScore=SP?.routeDecisionScore?.(baseline,weights);
    const selectedRisk=(Number(selected?.handlingRisk?.contentsLoss)||0)*contentsWeight+(Number(selected?.handlingRisk?.containerDrop)||0)*dropWeight,baselineRisk=(Number(baseline?.handlingRisk?.contentsLoss)||0)*contentsWeight+(Number(baseline?.handlingRisk?.containerDrop)||0)*dropWeight;
    if(!a?.held||!Number.isFinite(selectedScore)||!Number.isFinite(baselineScore)||routePathsSame(st,selected,baseline)||selectedScore>=baselineScore-1e-9||selectedRisk>=baselineRisk-1e-9)return null;
    return {kind:'handlingRisk',key:'routeSelection',role:'routeSelection',containerId:a.held,weights,selected:handlingRouteMetrics(selected,selectedScore),baseline:handlingRouteMetrics(baseline,baselineScore),sources:clone(preference?.contributors)||[]};
  }
  function appendHandlingRouteContributor(list,contributor){const out=clone(list||[]);if(!contributor||out.some(c=>c?.kind==='handlingRisk'&&c?.key==='routeSelection'))return out;out.push(contributor);return out;}
  function captureHandlingRouteDecisionEvidence(st,a,selected,baseline,preference){
    const contributor=handlingRouteContributor(st,a,selected,baseline,preference);if(!contributor)return null;
    const evidence=currentDecisionEvidence(a);if(evidence){evidence.contributors=appendHandlingRouteContributor(evidence.contributors,contributor);return contributor;}
    const thought=st?.thoughts?.[a?.id],pick=thought?.pick;
    if(thought?.tick===st?.tick&&pick?.id===a?.action?.kind&&a?.action?.started===st?.tick){pick.decisionContributors=appendHandlingRouteContributor(pick.decisionContributors,contributor);return contributor;}
    return null;
  }

  if(!E.registerRuntimeHook)throw new Error('systems/intent/decision-evidence.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('afterTick','deliberation.finalize-decision-evidence',()=>finalizeInitialDecisionEvidence(E.getState()),850);
  Object.assign(E,{DECISION_EVIDENCE_SCHEMA_VERSION:VERSION,adoptDecisionEvidence,decisionEvidenceMatchesAction,currentDecisionEvidence,captureTargetSelectionEvidence,currentTargetSelectionEvidence,captureHandlingRouteDecisionEvidence,finalizeInitialDecisionEvidence});
})();
