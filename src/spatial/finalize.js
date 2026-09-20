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
      const surfaceId=c.supportId&&st.furniture?.[c.supportId]?.spatial?.surface?.id||c.position.surfaceId||FLOOR;
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

  function finalizeSpatialState(st){
    SP.recomputeRooms(st);
    normalizePersistentPositions(st);
    return st;
  }

  W.registerInitialStateFinalizer('spatial.finalize',finalizeSpatialState,100);
  SP.normalizePersistentPositions=normalizePersistentPositions;
})();
