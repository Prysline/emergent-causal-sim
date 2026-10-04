(() => {
  const W=window.SimWorld,SP=window.SimSpatial;
  if(!W?.registerInitialStateFinalizer)throw new Error('spatial/finalize.js requires world.js initial-state pipeline.');
  if(!SP?.recomputeRooms||!SP?.normalizeNode)throw new Error('spatial/finalize.js requires Spatial core topology and node normalization.');
  const FLOOR='floor';

  function normalizePersistentPositions(st){
    for(const a of Object.values(st.agents||{})){
      if(!a.position)continue;
      const n=SP.normalizeNode(st,a.position,a.position.surfaceId||FLOOR);
      a.position={...a.position,spaceId:n.spaceId,surfaceId:n.surfaceId};
    }
    for(const c of Object.values(st.containers||{})){
      if(!c.position)continue;
      const supportedSurfaceId=c.supportId&&SP.supportSurfaceForFurniture?.(st,c.supportId)?.surface?.id||null;
      const surfaceId=supportedSurfaceId||c.position.surfaceId||FLOOR;
      const n=SP.normalizeNode(st,c.position,surfaceId);
      c.position={...c.position,spaceId:n.spaceId,surfaceId:n.surfaceId};
    }
    for(const s of Object.values(st.sources||{})){
      if(!s.position)continue;
      const n=SP.normalizeNode(st,s.position,s.position.surfaceId||FLOOR);
      s.position={...s.position,spaceId:n.spaceId,surfaceId:n.surfaceId};
    }
    return st;
  }

  function candidateObjectiveValue(route,objective){
    if(objective==='weighted')return Number(route?.decisionScore);
    return Number(route?.[objective]);
  }
  function bestCandidateNodeResult(st,aOrId,candidates,{mode='auto',objective='traversalCost',weights=null}={}){
    if(typeof SP.planRoute!=='function'||typeof SP.nodeKey!=='function')throw new Error('bestCandidateNodeResult() requires Spatial / Route planRoute + nodeKey authority.');
    if(!['traversalCost','pathDistance','weighted'].includes(objective))throw new RangeError(`Unsupported candidate-node objective: ${objective}`);
    const unique=new Map();
    for(const candidate of candidates||[]){
      const node=SP.normalizeNode(st,candidate);if(!node)continue;
      unique.set(SP.nodeKey(st,node),node);
    }
    const scored=[];
    for(const [key,node] of unique){
      const route=SP.planRoute(st,aOrId,node,{mode,objective,weights}),objectiveValue=candidateObjectiveValue(route,objective),pathDistance=Number(route?.pathDistance);
      if(!Number.isFinite(objectiveValue)||!Number.isFinite(pathDistance))continue;
      scored.push({node:{...node},route,objective,objectiveValue,pathDistance,key});
    }
    scored.sort((a,b)=>a.objectiveValue-b.objectiveValue||a.pathDistance-b.pathDistance||a.key.localeCompare(b.key));
    const winner=scored[0];
    return winner?Object.freeze({...winner,node:Object.freeze({...winner.node})}):null;
  }
  function bestCandidateNode(st,aOrId,candidates,options={}){return bestCandidateNodeResult(st,aOrId,candidates,options)?.node||null;}

  function finalizeSpatialState(st){
    SP.recomputeRooms(st);
    normalizePersistentPositions(st);
    return st;
  }

  W.registerInitialStateFinalizer('spatial.finalize',finalizeSpatialState,100);
  SP.normalizePersistentPositions=normalizePersistentPositions;
  SP.bestCandidateNodeResult=bestCandidateNodeResult;
  SP.bestCandidateNode=bestCandidateNode;
})();
