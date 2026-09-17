(() => {
  const W=window.SimWorld,SP=window.SimSpatial;if(!W||!SP?.normalizeNode)return;
  const VERSION='11.11.1-spatial-observability';
  const FLOOR='floor';
  const baseCreateInitialState=W.createInitialState;

  function roomLabel(st,spaceId){return st.map?.rooms?.[spaceId]?.name||spaceId||'world';}
  function surfaceLabel(st,surfaceId){if(!surfaceId||surfaceId===FLOOR)return'地板';const entry=SP.surfaceEntry?.(st,surfaceId);return entry?.surface?.label||surfaceId;}
  function clearanceFor(st,node){if(!node||node.surfaceId!==FLOOR)return null;const values=(SP.overheadAt?.(st,node)||[]).map(f=>f.spatial?.under?.clearance).filter(Number.isFinite);return values.length?Math.min(...values):null;}
  function movementEnvelope(agent){return agent?(window.SimPhysical?.getMovementEnvelope?.(agent,'walk')??null):null;}
  function requiredClearance(agent){return agent?(movementEnvelope(agent)?.clearanceHeight??SP.TRAVERSAL_PROFILES?.[agent.kind]?.requiredClearance??null):null;}
  function nodeObservation(st,p,agent=null){
    const node=SP.normalizeNode(st,p);if(!node)return null;
    const overhead=node.surfaceId===FLOOR?(SP.overheadAt?.(st,node)||[]):[];
    const clearance=clearanceFor(st,node),envelope=movementEnvelope(agent),required=requiredClearance(agent);
    return {
      node,
      nodeKey:SP.nodeKey(st,node),
      spaceId:node.spaceId,
      spaceLabel:roomLabel(st,node.spaceId),
      surfaceId:node.surfaceId,
      surfaceLabel:surfaceLabel(st,node.surfaceId),
      position:{x:node.x,y:node.y},
      covered:overhead.length>0,
      overhead:overhead.map(f=>({id:f.id,name:f.name,clearance:f.spatial?.under?.clearance??null,clearanceWidth:f.spatial?.under?.clearanceWidth??null})),
      clearance,
      requiredClearance:required,
      movementEnvelope:envelope,
      walkable:agent?SP.nodeWalkable(st,node,agent):SP.nodeWalkable(st,node,null)
    };
  }
  function agentObservation(st,aOrId){
    const a=typeof aOrId==='string'?st.agents?.[aOrId]:aOrId;if(!a||a.offMap)return null;
    const current=nodeObservation(st,SP.nodeForAgent(st,a),a);
    if(!current)return null;
    current.agentId=a.id;
    current.spatialGoal=a.action?.spatialGoal?nodeObservation(st,a.action.spatialGoal,a):null;
    current.lastPath=(a.action?.lastPath||[]).map(p=>nodeObservation(st,p,a)).filter(Boolean);
    return current;
  }
  function objectObservation(st,id){const node=SP.objectNode(st,id);if(!node)return null;const out=nodeObservation(st,node,null);if(out){out.objectId=id;out.supportId=st.containers?.[id]?.supportId||null;}return out;}
  function furnitureObservation(st,id){
    const f=st.furniture?.[id];if(!f)return null;
    const surface=f.spatial?.surface||null,under=f.spatial?.under||null;
    return {
      furnitureId:id,
      surfaceId:surface?.id||null,
      surfaceLabel:surface?.label||null,
      traversable:!!surface?.traversable,
      cells:(surface?.cells||[]).map(p=>({x:p.x,y:p.y})),
      allowKinds:[...(surface?.allowKinds||[])],
      clearance:Number.isFinite(under?.clearance)?under.clearance:null,
      clearanceWidth:Number.isFinite(under?.clearanceWidth)?under.clearanceWidth:null,
      cover:under?.cover||null
    };
  }
  function formatNode(st,p){const o=nodeObservation(st,p);return o?`${o.spaceLabel}・${o.surfaceLabel} (${o.position.x}, ${o.position.y})`:'無';}

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{const st=baseCreateInitialState(seed);st.version=VERSION;return st;};
  Object.assign(SP,{OBSERVABILITY_VERSION:VERSION,roomLabel,surfaceLabel,nodeObservation,agentObservation,objectObservation,furnitureObservation,formatNode});
})();