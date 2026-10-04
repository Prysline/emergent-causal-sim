(() => {
  const V=window.SimValidator,A=window.SimAgentCarry,C=window.SimEmbodimentCapabilities,P=window.SimPhysical,R=window.SimResources,SP=window.SimSpatial;
  if(!V||!A||!C||!P||!R||!SP)return;
  const positive=v=>Number.isFinite(Number(v))&&Number(v)>0;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data}),carrierIds=new Set(),carriedIds=new Set(),relations=st?.agentCarries||{};
    if(st?.agentCarryVersion!==A.VERSION)add('agent_carry_version_mismatch','Agent carry state marker 與 runtime marker 不一致。',{stateVersion:st?.agentCarryVersion,runtimeVersion:A.VERSION});
    for(const [key,relation] of Object.entries(relations)){
      if(!relation||typeof relation!=='object'){add('agent_carry_relation_invalid',`${key} 的 Agent carry relation 無效。`,{carriedAgentId:key});continue;}
      const carrier=st.agents?.[relation.carrierId],carried=st.agents?.[relation.carriedAgentId];
      if(key!==relation.carriedAgentId)add('agent_carry_key_mismatch',`${key} 的 relation key 與 carriedAgentId 不一致。`,{key,carriedAgentId:relation.carriedAgentId});
      if(!carrier)add('agent_carry_carrier_missing',`Agent carry relation ${relation.id||key} 的 carrier 不存在。`,{carrierId:relation.carrierId});
      if(!carried)add('agent_carry_target_missing',`Agent carry relation ${relation.id||key} 的 carried Agent 不存在。`,{carriedAgentId:relation.carriedAgentId});
      if(!carrier||!carried)continue;
      if(carrier.id===carried.id)add('agent_carry_self_relation',`${carrier.name} 不得抱持自己。`,{agentId:carrier.id});
      if(carrierIds.has(carrier.id))add('agent_carry_multiple_targets',`${carrier.name} 同時出現在多個 Agent carry relation 中。`,{carrierId:carrier.id});
      carrierIds.add(carrier.id);carriedIds.add(carried.id);
      if(relation.method!==A.METHOD)add('agent_carry_method_invalid',`Agent carry v1 只支援 ${A.METHOD}。`,{relationId:relation.id,method:relation.method});
      if(!['cooperative','sleeping'].includes(relation.responderMode))add('agent_carry_responder_mode_invalid',`Agent carry relation ${relation.id} 的 responderMode 無效。`,{relationId:relation.id,responderMode:relation.responderMode});
      const capability=C.agentCarryCapabilityForKind?.(carrier.kind,relation.method);
      if(!capability)add('agent_carry_capability_missing',`${carrier.name} 沒有 ${relation.method} capability。`,{carrierId:carrier.id,method:relation.method});
      else{
        const mass=Number(carried.physical?.mass);if(!positive(mass)||mass>capability.massCapacity)add('agent_carry_mass_capacity_invalid',`${carrier.name} 抱持 ${carried.name} 時超出或缺少合法 mass capacity。`,{carrierId:carrier.id,carriedAgentId:carried.id,mass,massCapacity:capability.massCapacity});
      }
      if(carried.position!==null)add('agent_carry_competing_position_truth',`${carried.name} 被抱持時仍保存 ordinary position truth。`,{carriedAgentId:carried.id,position:carried.position});
      if(carried.posture?.kind!=='carried'||carried.posture?.slotId||carried.posture?.furnitureId)add('agent_carry_competing_occupancy_truth',`${carried.name} 被抱持時仍保留 ordinary posture / Slot occupancy。`,{carriedAgentId:carried.id,posture:carried.posture});
      if(carried.held)add('agent_carry_nested_held_container',`${carried.name} 被抱持時仍持有 Container；v1 不支援 nested carry。`,{carriedAgentId:carried.id,containerId:carried.held});
      const projected=A.projectedPosition(st,carried),carrierNode=SP.nodeForAgent?.(st,carrier),projectedNode=projected&&SP.normalizeNode?.(st,projected);
      if(!projectedNode||!carrierNode||!SP.nodeSame?.(st,projectedNode,carrierNode))add('agent_carry_projection_mismatch',`${carried.name} 的 observable position 沒有由 carrier 投影。`,{carrierId:carrier.id,carriedAgentId:carried.id});
      const profile=A.carryingHandlingProfile(st,carrier);
      if(!profile||!positive(profile.carryGeometry?.height)||!positive(profile.carryGeometry?.width)||!positive(profile.carryGeometry?.length))add('agent_carry_geometry_invalid',`${carrier.name} 無法從 carried Agent bodyGeometry 推導 carry geometry。`,{carrierId:carrier.id,carriedAgentId:carried.id});
      const handCapacity=R.handCapacity(carrier),hands=P.carriedHandsRequired?.(st,carrier);
      if(!Number.isFinite(hands)||handCapacity<hands)add('agent_carry_hand_capacity_exceeded',`${carrier.name} 的 handCapacity 不足以維持目前 Agent carry relation。`,{carrierId:carrier.id,handCapacity,handsRequired:hands});
    }
    for(const id of carrierIds)if(carriedIds.has(id))add('agent_carry_chain_unsupported',`${st.agents[id]?.name||id} 同時是 carrier 與 carried Agent；v1 不支援 carry chain。`,{agentId:id});
    for(const a of Object.values(st?.agents||{}))if(a.posture?.kind==='carried'&&!relations[a.id])add('agent_carry_posture_orphan',`${a.name} 的 carried posture 沒有對應 canonical relation。`,{agentId:a.id});
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.registerValidationLayer('agent-carry',validateLayer,92);
})();