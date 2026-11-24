(() => {
  const SP=window.SimSpatial;
  if(!SP?.planRoute||!SP?.normalizeNode||!SP?.nodeKey||!SP?.nodeForAgent||!SP?.supportSurfaceForFurniture||!SP?.supportContactNodes)throw new Error('spatial-candidate-selection.js requires Spatial Traversal route and support-contact authority.');

  const VERSION='11.46.0-sleep-carry-integration';
  const NEARBY_PLACEMENT_VERSION='nearby-placement-v3-targeted-support';
  const SUPPORTED_OBJECTIVES=new Set(['traversalCost','pathDistance']);

  function agentFor(st,aOrId){return typeof aOrId==='string'?st.agents?.[aOrId]||null:aOrId||null;}
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

  function nearbySupportPlacementResults(st,aOrId,{supportId=null}={}){
    const a=agentFor(st,aOrId),actorNode=a&&SP.nodeForAgent(st,a);if(!a||!actorNode)return [];
    const results=[];
    for(const furniture of Object.values(st.furniture||{}).sort((x,y)=>String(x.id).localeCompare(String(y.id)))){
      if(furniture?.supportsObjects!==true||(supportId!==null&&furniture.id!==supportId))continue;
      const entry=SP.supportSurfaceForFurniture(st,furniture);if(!entry?.surface)continue;
      const contacts=SP.supportContactNodes(st,furniture.id,a);
      if(!contacts.some(node=>SP.nodeSame(st,node,actorNode)))continue;
      for(const cell of entry.surface.cells||[]){
        const node=SP.normalizeNode(st,cell,entry.surface.id);if(!node)continue;
        const dx=Math.abs((actorNode.x??0)-(node.x??0)),dy=Math.abs((actorNode.y??0)-(node.y??0));
        results.push(Object.freeze({
          supportId:furniture.id,
          surfaceId:entry.surface.id,
          node:Object.freeze({...node}),
          nodeKey:SP.nodeKey(st,node),
          locality:dx+dy
        }));
      }
    }
    results.sort((a,b)=>a.locality-b.locality||String(a.supportId).localeCompare(String(b.supportId))||String(a.surfaceId).localeCompare(String(b.surfaceId))||a.nodeKey.localeCompare(b.nodeKey));
    return results;
  }

  function bestNearbySupportPlacement(st,aOrId,options={}){return nearbySupportPlacementResults(st,aOrId,options)[0]||null;}

  // One mutation owner for deliberate support placement and ordinary nearby release.
  function commitSupportPlacement(st,a,placement){
    const objectId=a?.held,object=objectId&&st.objects?.[objectId];
    if(!object||!placement)return null;
    object.position={...placement.node};object.supportId=placement.supportId;delete object.containedBy;a.held=null;
    return Object.freeze({kind:'surface',objectId,supportId:placement.supportId,surfaceId:placement.surfaceId,node:Object.freeze({...placement.node})});
  }
  function releaseHeldObjectOnSupport(st,aOrId,supportId){
    const a=agentFor(st,aOrId);
    if(!a||a.offMap||!a.held||typeof supportId!=='string'||!supportId||st.furniture?.[supportId]?.supportsObjects!==true)return null;
    if(st.reservations?.['furniture:'+supportId]&&st.reservations['furniture:'+supportId]!==a.id)return null;
    if(st.reservations?.['object:'+a.held]&&st.reservations['object:'+a.held]!==a.id)return null;
    return commitSupportPlacement(st,a,bestNearbySupportPlacement(st,a,{supportId}));
  }

  function releaseHeldObjectNearby(st,aOrId){
    const a=agentFor(st,aOrId),objectId=a?.held,object=objectId&&st.objects?.[objectId];
    if(!a||!objectId||!object)return null;
    const placement=bestNearbySupportPlacement(st,a);
    if(placement)return commitSupportPlacement(st,a,placement);
    const actorNode=SP.nodeForAgent(st,a),floorNode=actorNode&&SP.normalizeNode(st,{x:actorNode.x,y:actorNode.y,...(Number.isFinite(actorNode.z)&&actorNode.z!==0?{z:actorNode.z}:{})},'floor');
    if(!floorNode)return null;
    object.position={...floorNode};delete object.supportId;delete object.containedBy;a.held=null;
    return Object.freeze({kind:'floor',objectId,supportId:null,surfaceId:'floor',node:Object.freeze({...floorNode})});
  }

  Object.assign(SP,{
    CANDIDATE_NODE_SELECTION_VERSION:VERSION,
    NEARBY_PLACEMENT_VERSION,
    candidateNodeResults,
    bestCandidateNodeResult,
    bestCandidateNode,
    nearbySupportPlacementResults,
    bestNearbySupportPlacement,
    releaseHeldObjectNearby,
    releaseHeldObjectOnSupport
  });
})();