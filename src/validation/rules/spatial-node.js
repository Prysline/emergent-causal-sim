(() => {
  const V=window.SimValidator,SP=window.SimSpatial;if(!V||!SP?.nodeWalkable)return;
  const positive=v=>Number.isFinite(Number(v))&&Number(v)>0;
  const zOf=value=>SP.zOf?SP.zOf(value):(value?.z??0);
  const sameLocalPosition=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y&&zOf(a)===zOf(b);

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data}),byNode=new Map();
    for(const a of Object.values(st?.agents||{})){
      if(a.offMap||!a.position)continue;
      const node=SP.normalizeNode(st,a.position),key=SP.nodeKey(st,node),slotBound=!!a.posture?.slotId;
      if(!slotBound){
        const list=byNode.get(key)||[];list.push(a.id);byNode.set(key,list);
        if(!(SP.nodeLocomotionAccessible?.(st,node,a)??SP.nodeWalkable(st,node,a)))add('agent_on_untraversable_node',`${a.name}位於自身 locomotion 無法佔據的 Spatial Node ${key}。`,{agentId:a.id,position:key});
      }else{
        const slot=SP.getSlot?.(st,a.posture.slotId);
        if(!slot)add('slot_reference_missing',`${a.name} 的 posture.slotId=${a.posture.slotId} 不存在。`,{agentId:a.id,slotId:a.posture.slotId});
        else{
          if(a.posture.furnitureId!==slot.furnitureId)add('slot_furniture_mismatch',`${a.name} 的 posture.furnitureId 與 Slot owner 不一致。`,{agentId:a.id,slotId:slot.id,furnitureId:a.posture.furnitureId,expectedFurnitureId:slot.furnitureId});
          if(!SP.nodeSame?.(st,node,slot.position))add('slot_anchor_position_mismatch',`${a.name} 的 slot-bound coarse position 與 ${slot.id} anchor 不一致。`,{agentId:a.id,slotId:slot.id,position:key});
          if(!SP.slotAllows?.(slot,a))add('slot_kind_mismatch',`${a.name} 的種類不符合 ${slot.id} 的 allowKinds。`,{agentId:a.id,slotId:slot.id,kind:a.kind});
          if(['sitting','lying'].includes(a.posture?.kind)&&!SP.slotPoseFits?.(slot,a,a.posture.kind))add('slot_pose_fit_invalid',`${a.name} 的 ${a.posture.kind} PoseEnvelope 無法放入 ${slot.id} 的 usable space。`,{agentId:a.id,slotId:slot.id,posture:a.posture.kind});
        }
      }
      if(a.held){const held=SP.objectNode(st,a.held);if(held&&!SP.nodeSame(st,node,held))add('held_spatial_node_mismatch',`${a.name}持有的 ${a.held} 與角色不在同一 Spatial Node。`,{agentId:a.id,containerId:a.held,agentNode:key,objectNode:SP.nodeKey(st,held)});}
    }
    const supportedCollections=[['container',st?.containers||{}],['object',st?.objects||{}]];
    for(const [entityType,collection] of supportedCollections)for(const entity of Object.values(collection)){
      const holder=SP.holderOf(st,entity.id);
      if(holder&&entity.supportId){
        add('held_object_support_conflict',`${entity.name||entity.id} 同時被 ${holder.id} 持有且仍宣告 supportId=${entity.supportId}。`,{entityType,entityId:entity.id,holderId:holder.id,supportId:entity.supportId});
        continue;
      }
      if(!entity.position||holder)continue;
      const node=SP.objectNode(st,entity.id);if(!node)continue;
      if(entity.supportId){
        const support=SP.supportSurfaceForFurniture?.(st,entity.supportId)||null,expected=support?.surface?.id||null;
        if(!expected)add('supported_object_surface_ambiguous',`${entity.name||entity.id}承載於 ${entity.supportId}，但找不到唯一 canonical support Surface。`,{entityType,entityId:entity.id,supportId:entity.supportId});
        else {
          if(node.surfaceId!==expected)add('supported_object_surface_mismatch',`${entity.name||entity.id}承載於 ${entity.supportId}，但 Spatial Node 不在其 Surface。`,{entityType,entityId:entity.id,supportId:entity.supportId,surfaceId:node.surfaceId,expectedSurfaceId:expected});
          if(!(support.surface.cells||[]).some(cell=>sameLocalPosition(cell,entity.position)))add('supported_object_cell_mismatch',`${entity.name||entity.id} 的 position 不在 ${entity.supportId} canonical support Surface 的任何 Cell。`,{entityType,entityId:entity.id,supportId:entity.supportId,position:SP.nodeKey(st,SP.normalizeNode(st,entity.position,'floor')),surfaceId:expected});
        }
      }
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