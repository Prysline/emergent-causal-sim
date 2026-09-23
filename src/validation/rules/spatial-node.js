(() => {
  const V=window.SimValidator,SP=window.SimSpatial;if(!V||!SP?.nodeWalkable)return;
  const positive=v=>Number.isFinite(Number(v))&&Number(v)>0;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data}),byNode=new Map();
    for(const a of Object.values(st?.agents||{})){
      if(a.offMap||!a.position)continue;
      const node=SP.normalizeNode(st,a.position),key=SP.nodeKey(st,node),slotBound=!!a.posture?.slotId;
      if(!slotBound){
        const list=byNode.get(key)||[];list.push(a.id);byNode.set(key,list);
        if(!(SP.nodeLocomotionAccessible?.(st,node,a)??SP.nodeWalkable(st,node,a)))add('agent_on_untraversable_node',`${a.name}位於自身 locomotion 無法佔據的 Spatial Node ${key}。`,{agentId:a.id,position:key});
      }
      if(a.held){const held=SP.objectNode(st,a.held);if(held&&!SP.nodeSame(st,node,held))add('held_spatial_node_mismatch',`${a.name}持有的 ${a.held} 與角色不在同一 Spatial Node。`,{agentId:a.id,containerId:a.held,agentNode:key,objectNode:SP.nodeKey(st,held)});}
    }
    for(const c of Object.values(st?.containers||{})){
      if(!c.position||SP.holderOf(st,c.id))continue;
      const node=SP.objectNode(st,c.id);if(!node)continue;
      if(c.supportId){const expected=st.furniture?.[c.supportId]?.spatial?.surface?.id;if(expected&&node.surfaceId!==expected)add('supported_object_surface_mismatch',`${c.name}承載於 ${c.supportId}，但 Spatial Node 不在其 surface。`,{containerId:c.id,supportId:c.supportId,surfaceId:node.surfaceId,expectedSurfaceId:expected});}
    }
    for(const f of Object.values(st?.furniture||{})){
      const solids=f.spatial?.solids;
      if(!Array.isArray(solids)||!solids.length){add('spatial_furniture_solids_missing',`${f.name} 缺少 runtime metric solids。`,{furnitureId:f.id});continue;}
      const seen=new Set();
      for(const solid of solids){
        if(!solid?.key||seen.has(solid.key)){add('spatial_furniture_solid_key_invalid',`${f.name} 有缺失或重複的 solid key。`,{furnitureId:f.id,solidKey:solid?.key||null});continue;}
        seen.add(solid.key);
        if(!Number.isInteger(solid.layerZ))add('spatial_furniture_solid_layer_invalid',`${f.name} solid ${solid.key} 缺少 integer layerZ。`,{furnitureId:f.id,solidKey:solid.key,layerZ:solid.layerZ});
        const b=solid.bounds||{};
        for(const field of ['x','y','z'])if(!Number.isFinite(Number(b[field]))||Number(b[field])<0)add('spatial_furniture_solid_bounds_invalid',`${f.name} solid ${solid.key} 的 ${field} 無效。`,{furnitureId:f.id,solidKey:solid.key,field,value:b[field]});
        for(const field of ['width','depth','height'])if(!positive(b[field]))add('spatial_furniture_solid_bounds_invalid',`${f.name} solid ${solid.key} 的 ${field} 必須是正數。`,{furnitureId:f.id,solidKey:solid.key,field,value:b[field]});
      }
    }
    for(const [edgeKey,constraint] of Object.entries(st?.map?.passageConstraints||{})){
      if(constraint?.clearanceHeight!=null&&!positive(constraint.clearanceHeight))add('spatial_passage_height_invalid',`Passage ${edgeKey} 的 clearanceHeight 必須是正數或未設定。`,{edgeKey,value:constraint.clearanceHeight});
      if(constraint?.clearanceWidth!=null&&!positive(constraint.clearanceWidth))add('spatial_passage_width_invalid',`Passage ${edgeKey} 的 clearanceWidth 必須是正數或未設定。`,{edgeKey,value:constraint.clearanceWidth});
    }
    const crowdingNodes=[];for(const [position,ids] of byNode)if(ids.length>1)crowdingNodes.push({position,agentIds:[...ids],count:ids.length});
    return {...base,issueCount:issues.length,issues,crowdingTiles:crowdingNodes,crowdingNodes,ok:issues.length===0};
  }

  V.registerValidationLayer('spatial.node',validateLayer,100);
})();
