(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W?.DELIBERATION_SCHEMA_VERSION)return;
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

  if(!E.registerRuntimeHook)throw new Error('systems/intent/decision-evidence.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('afterTick','deliberation.finalize-decision-evidence',()=>finalizeInitialDecisionEvidence(E.getState()),850);
  Object.assign(E,{DECISION_EVIDENCE_SCHEMA_VERSION:VERSION,adoptDecisionEvidence,decisionEvidenceMatchesAction,currentDecisionEvidence,finalizeInitialDecisionEvidence});
})();
