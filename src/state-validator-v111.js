(() => {
  const V=window.SimValidator,SP=window.SimSpatial;if(!V||!SP?.nodeWalkable)return;
  const baseValidate=V.validateState;

  function validateState(st){
    const base=baseValidate(st),issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data}),byNode=new Map();
    for(const a of Object.values(st?.agents||{})){
      if(a.offMap||!a.position)continue;
      const node=SP.normalizeNode(st,a.position),key=SP.nodeKey(st,node),list=byNode.get(key)||[];list.push(a.id);byNode.set(key,list);
      if(!SP.nodeWalkable(st,node,a))add('agent_on_untraversable_node',`${a.name}位於自身 locomotion 無法通行的 Spatial Node ${key}。`,{agentId:a.id,position:key});
      if(a.held){const held=SP.objectNode(st,a.held);if(held&&!SP.nodeSame(st,node,held))add('held_spatial_node_mismatch',`${a.name}持有的 ${a.held} 與角色不在同一 Spatial Node。`,{agentId:a.id,containerId:a.held,agentNode:key,objectNode:SP.nodeKey(st,held)});}
    }
    for(const c of Object.values(st?.containers||{})){
      if(!c.position||SP.holderOf(st,c.id))continue;
      const node=SP.objectNode(st,c.id);if(!node)continue;
      if(c.supportId){const expected=st.furniture?.[c.supportId]?.spatial?.surface?.id;if(expected&&node.surfaceId!==expected)add('supported_object_surface_mismatch',`${c.name}承載於 ${c.supportId}，但 Spatial Node 不在其 surface。`,{containerId:c.id,supportId:c.supportId,surfaceId:node.surfaceId,expectedSurfaceId:expected});}
    }
    const crowdingNodes=[];for(const [position,ids] of byNode)if(ids.length>1)crowdingNodes.push({position,agentIds:[...ids],count:ids.length});
    return {...base,issueCount:issues.length,issues,crowdingTiles:crowdingNodes,crowdingNodes,ok:issues.length===0};
  }

  V.validateState=validateState;
})();
