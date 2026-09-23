(() => {
  const SP=window.SimSpatial;if(!SP?.normalizeNode)return;
  const VERSION='11.11.1-spatial-observability';
  const FLOOR='floor';

  function roomLabel(st,spaceId){return st.map?.rooms?.[spaceId]?.name||spaceId||'world';}
  function surfaceLabel(st,surfaceId){if(!surfaceId||surfaceId===FLOOR)return'地板';const entry=SP.surfaceEntry?.(st,surfaceId);return entry?.surface?.label||surfaceId;}
  function elevatedSolidEntries(st,node){
    if(!node||node.surfaceId!==FLOOR)return[];
    const z=SP.zOf?.(node)??node.z??0,out=[];
    for(const furniture of SP.overheadAt?.(st,node)||[])for(const solid of furniture.spatial?.solids||[]){
      if(solid.layerZ!==z||!solid.bounds||solid.bounds.z<=0)continue;
      const b=solid.bounds,overlapX=Math.min(node.x+1,b.x+b.width)-Math.max(node.x,b.x),overlapY=Math.min(node.y+1,b.y+b.depth)-Math.max(node.y,b.y);
      if(overlapX>1e-9&&overlapY>1e-9)out.push({furnitureId:furniture.id,furnitureName:furniture.name,solidKey:solid.key,bottomZ:b.z,topZ:b.z+b.height,bounds:{...b}});
    }
    return out;
  }
  function clearanceSummaryFor(st,node){const values=elevatedSolidEntries(st,node).map(entry=>entry.bottomZ).filter(Number.isFinite);return values.length?Math.min(...values):null;}
  function locomotionMode(agent){return agent?.locomotion?.mode||window.SimLocomotion?.modeFromPosture?.(agent)||'walk';}
  function movementEnvelope(agent){return agent?(window.SimPhysical?.getMovementEnvelope?.(agent,locomotionMode(agent))??null):null;}
  function requiredClearance(agent){return agent?(movementEnvelope(agent)?.clearanceHeight??SP.TRAVERSAL_PROFILES?.[agent.kind]?.requiredClearance??null):null;}
  function nodeObservation(st,p,agent=null){
    const node=SP.normalizeNode(st,p);if(!node)return null;
    const overhead=node.surfaceId===FLOOR?(SP.overheadAt?.(st,node)||[]):[];
    const elevatedSolids=elevatedSolidEntries(st,node),clearanceSummary=clearanceSummaryFor(st,node),envelope=movementEnvelope(agent),required=requiredClearance(agent);
    return {
      node,
      nodeKey:SP.nodeKey(st,node),
      spaceId:node.spaceId,
      spaceLabel:roomLabel(st,node.spaceId),
      surfaceId:node.surfaceId,
      surfaceLabel:surfaceLabel(st,node.surfaceId),
      position:SP.clonePos(node),
      covered:overhead.length>0,
      overhead:overhead.map(f=>({id:f.id,name:f.name,solids:elevatedSolids.filter(entry=>entry.furnitureId===f.id).map(entry=>({key:entry.solidKey,bottomZ:entry.bottomZ,topZ:entry.topZ,bounds:{...entry.bounds}}))})),
      elevatedSolids,
      clearanceSummary,
      requiredClearance:required,
      movementEnvelope:envelope,
      movementMode:agent?locomotionMode(agent):null,
      walkable:agent?SP.nodeWalkable(st,node,agent):SP.nodeWalkable(st,node,null)
    };
  }
  function agentObservation(st,aOrId){
    const a=typeof aOrId==='string'?st.agents?.[aOrId]:aOrId;if(!a||a.offMap)return null;
    const current=nodeObservation(st,SP.nodeForAgent(st,a),a);
    if(!current)return null;
    current.agentId=a.id;
    current.currentPosture=a.posture?.kind||null;
    current.currentLocomotion=a.locomotion?{...a.locomotion}:null;
    current.spatialGoal=a.action?.spatialGoal?nodeObservation(st,a.action.spatialGoal,a):null;
    current.routePlan=a.action?.spatialGoal&&SP.planRoute?SP.planRoute(st,a,a.action.spatialGoal,{mode:'auto',objective:'traversalCost'}):null;
    current.nextCongestion=current.routePlan?.steps?.[0]?.congestion||null;
    current.lastPath=(a.action?.lastPath||[]).map(p=>nodeObservation(st,p,a)).filter(Boolean);
    return current;
  }
  function objectObservation(st,id){const node=SP.objectNode(st,id);if(!node)return null;const out=nodeObservation(st,node,null);if(out){out.objectId=id;out.supportId=st.containers?.[id]?.supportId||null;}return out;}
  function furnitureObservation(st,id){
    const f=st.furniture?.[id];if(!f)return null;
    const surface=f.spatial?.surface||null,solids=(f.spatial?.solids||[]).map(solid=>({key:solid.key,layerZ:solid.layerZ,bounds:{...solid.bounds}}));
    return {
      furnitureId:id,
      surfaceId:surface?.id||null,
      surfaceLabel:surface?.label||null,
      traversable:!!surface?.traversable,
      cells:(surface?.cells||[]).map(p=>SP.clonePos(p)),
      allowKinds:[...(surface?.allowKinds||[])],
      solids,
      solidCount:solids.length
    };
  }
  function formatNode(st,p){const o=nodeObservation(st,p);if(!o)return'無';const z=SP.zOf?.(o.position)??o.position.z??0;return `${o.spaceLabel}・${o.surfaceLabel} (${o.position.x}, ${o.position.y}${z!==0?`, z=${z}`:''})`;}
  Object.assign(SP,{OBSERVABILITY_VERSION:VERSION,roomLabel,surfaceLabel,elevatedSolidEntries,clearanceSummaryFor,nodeObservation,agentObservation,objectObservation,furnitureObservation,formatNode});
})();