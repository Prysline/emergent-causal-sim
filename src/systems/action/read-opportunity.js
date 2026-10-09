(() => {
  const E=window.SimEngine,SP=window.SimSpatial;
  if(!E||!SP)throw new Error('systems/action/read-opportunity.js requires Engine and Spatial.');

  const READ_ACCESS_PENALTY_MAX=18;
  const readAccessPenalty=traversalCost=>Math.min(READ_ACCESS_PENALTY_MAX,Math.max(0,Number(traversalCost)||0)*1.5);
  function bestReadableObjectOpportunity(st,agent){
    const candidates=Object.values(st?.objects||{}).filter(object=>object?.affordances?.includes('read')).map(object=>{
      const result=SP.bestInteractionPositionResult?.(st,agent,{kind:'object',id:object.id},'read');
      return result&&Number.isFinite(result.traversalCost)?{object,result}:null;
    }).filter(Boolean).sort((a,b)=>a.result.traversalCost-b.result.traversalCost||String(a.object.id).localeCompare(String(b.object.id)));
    const best=candidates[0];if(!best)return null;
    return Object.freeze({targetObject:best.object.id,traversalCost:best.result.traversalCost,accessPenalty:readAccessPenalty(best.result.traversalCost)});
  }

  Object.assign(E,{bestReadableObjectOpportunity,readAccessPenalty});
})();
