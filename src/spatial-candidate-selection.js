(() => {
  const SP=window.SimSpatial;
  if(!SP?.planRoute||!SP?.normalizeNode||!SP?.nodeKey)throw new Error('spatial-candidate-selection.js requires Spatial Traversal route authority.');

  const VERSION='11.46.0-sleep-carry-integration';
  const SUPPORTED_OBJECTIVES=new Set(['traversalCost','pathDistance']);

  function candidateNodeResults(st,aOrId,candidates,{mode='auto',objective='traversalCost'}={}){
    if(!SUPPORTED_OBJECTIVES.has(objective))throw new RangeError(`Unsupported candidate-node objective: ${objective}`);
    const unique=new Map();
    for(const raw of candidates||[]){
      const node=SP.normalizeNode(st,raw);if(!node)continue;
      unique.set(SP.nodeKey(st,node),node);
    }
    const results=[];
    for(const [key,node] of unique){
      const route=SP.planRoute(st,aOrId,node,{mode,objective});
      const objectiveCost=Number(route?.[objective]),pathDistance=Number(route?.pathDistance);
      if(!Number.isFinite(objectiveCost)||!Number.isFinite(pathDistance))continue;
      results.push(Object.freeze({node:Object.freeze({...node}),nodeKey:key,objective,objectiveCost,pathDistance,route}));
    }
    results.sort((a,b)=>a.objectiveCost-b.objectiveCost||a.pathDistance-b.pathDistance||a.nodeKey.localeCompare(b.nodeKey));
    return results;
  }

  function bestCandidateNodeResult(st,aOrId,candidates,options={}){
    return candidateNodeResults(st,aOrId,candidates,options)[0]||null;
  }

  function bestCandidateNode(st,aOrId,candidates,options={}){
    const result=bestCandidateNodeResult(st,aOrId,candidates,options);
    return result?{...result.node}:null;
  }

  Object.assign(SP,{
    VERSION,
    ROUTE_SEMANTICS_VERSION:VERSION,
    CANDIDATE_NODE_SELECTION_VERSION:VERSION,
    candidateNodeResults,
    bestCandidateNodeResult,
    bestCandidateNode
  });
})();
