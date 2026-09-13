(() => {
  const SP=window.SimSpatial;if(!SP)return;

  function validateState(st){
    const issues=[],add=(code,message,data={})=>issues.push({code,message,...data}),byTile=new Map(),bySlot=new Map(),heldByContainer=new Map();
    if(!st)return {tick:null,issueCount:1,issues:[{code:'state_missing',message:'沒有可驗證的 simulation state。'}],crowdingTiles:[],ok:false};
    if(st.zones)add('legacy_zones_present','v11 state 不應再含有舊 zones。');
    if(st.surfaces)add('legacy_surfaces_present','v11 state 不應再含有舊 zone surfaces。');
    if(st.interactionModel)add('legacy_interaction_model','Interaction Geometry 已是 core contract，不應另存 interactionModel 版本欄位。');
    if(Object.prototype.hasOwnProperty.call(st.supply||{},'workerId'))add('duplicate_supply_owner','supply.workerId 是重複 truth；補給者應由 Agent.action 推導。');
    if(st.debug?.validation)add('validator_state_mutation','Validator 結果不應寫回 simulation state。');

    for(const [id,t] of Object.entries(st.map?.tiles||{})){
      if(t.terrain==='floor'&&!t.roomId)add('room_missing',`Floor Tile ${id} 沒有由拓撲推導出的 roomId。`,{position:id});
      if(t.terrain!=='floor'&&t.walkable)add('non_floor_base_walkable',`${id} 的 terrain=${t.terrain} 卻把 base walkable 標成 true。`,{position:id});
      if(Object.prototype.hasOwnProperty.call(t,'staticBlockedBy'))add('cached_blocker_present',`${id} 仍保存 staticBlockedBy；阻擋應由目前實體推導。`,{position:id});
    }

    for(const c of Object.values(st.containers||{})){
      if(SP.hasRole(c,'logisticsContainer')){
        if(!c.portable)add('logistics_container_not_portable',`${c.name}是 logisticsContainer 卻不可攜帶。`,{containerId:c.id});
        if(!Number.isFinite(c.capacity)||c.capacity<=0)add('logistics_container_capacity_invalid',`${c.name}沒有合法容量。`,{containerId:c.id});
      }
    }

    for(const a of Object.values(st.agents||{})){
      for(const legacy of ['location','plan','seatSlot','seatedOn','__slotTarget','__eatAfterSeat','__restAfterSlot','carrying'])if(Object.prototype.hasOwnProperty.call(a,legacy))add('legacy_agent_state',`${a.name}仍含舊欄位 ${legacy}。`,{agentId:a.id,field:legacy});
      if(!Number.isFinite(a.needs?.sleepNeed)||a.needs.sleepNeed<0||a.needs.sleepNeed>100)add('sleep_need_invalid',`${a.name}的 sleepNeed 必須是 0–100 的有限數值。`,{agentId:a.id,value:a.needs?.sleepNeed});
      if(a.traits?.circadianPattern&&!['diurnal','nocturnal','crepuscular'].includes(a.traits.circadianPattern))add('circadian_pattern_invalid',`${a.name}的 circadianPattern 無效。`,{agentId:a.id,value:a.traits.circadianPattern});
      if(a.traits?.circadianPhaseOffsetMinutes!==undefined&&!Number.isFinite(a.traits.circadianPhaseOffsetMinutes))add('circadian_phase_invalid',`${a.name}的 circadianPhaseOffsetMinutes 必須是有限數值。`,{agentId:a.id,value:a.traits.circadianPhaseOffsetMinutes});
      if(!a.offMap){
        if(!a.position)add('agent_position_missing',`${a.name}沒有 Tile 座標。`,{agentId:a.id});
        else if(!SP.walkable(st,a.position))add('agent_on_blocked_tile',`${a.name}位於不可通行 Tile ${SP.key(a.position)}。`,{agentId:a.id,position:SP.key(a.position),blocker:SP.blockerAt(st,a.position)});
        else{const list=byTile.get(SP.key(a.position))||[];list.push(a.id);byTile.set(SP.key(a.position),list);}
      }
      if(!a.posture||!['standing','sitting','lying'].includes(a.posture.kind))add('invalid_posture',`${a.name}的 posture 無效。`,{agentId:a.id});
      const usesSlot=!!a.posture?.slotId;
      if(usesSlot){
        const slot=SP.getSlot(st,a.posture.slotId);
        if(!slot)add('posture_slot_missing',`${a.name}使用不存在的 slot ${a.posture.slotId}。`,{agentId:a.id,slotId:a.posture.slotId});
        else{
          if(!SP.same(a.position,slot.position))add('posture_position_mismatch',`${a.name}標記使用 ${slot.id}，但位置是 ${SP.key(a.position)}。`,{agentId:a.id,slotId:slot.id});
          if(a.posture.furnitureId!==slot.furnitureId)add('posture_furniture_mismatch',`${a.name}的 posture furniture 與 slot 不一致。`,{agentId:a.id,slotId:slot.id});
          if(!SP.slotAllows(slot,a))add('posture_slot_kind_mismatch',`${a.name}不能使用 ${slot.id}。`,{agentId:a.id,slotId:slot.id});
          if(a.posture.kind==='lying'&&!slot.canRest&&!slot.canSleep)add('lying_slot_unusable',`${a.name}躺在不能休息或睡眠的 slot ${slot.id}。`,{agentId:a.id,slotId:slot.id});
          const list=bySlot.get(slot.id)||[];list.push(a.id);bySlot.set(slot.id,list);
        }
      }else if(a.posture?.kind==='sitting')add('sitting_without_slot',`${a.name}標記 sitting 卻沒有 slot。`,{agentId:a.id});
      if(a.action?.intent==='sleep'&&a.action.phase==='sleeping'){
        const slot=usesSlot?SP.getSlot(st,a.posture.slotId):null;
        if(a.posture?.kind!=='lying'||!slot?.canSleep)add('sleep_posture_invalid',`${a.name}正在 sleeping，但沒有躺在可睡眠 slot。`,{agentId:a.id,slotId:a.posture?.slotId||null});
      }
      if(a.held){
        if(!st.containers[a.held])add('held_missing_container',`${a.name}持有不存在的容器 ${a.held}。`,{agentId:a.id,containerId:a.held});
        const owners=heldByContainer.get(a.held)||[];owners.push(a.id);heldByContainer.set(a.held,owners);
        const effective=SP.objectPosition(st,a.held);if(effective&&!a.offMap&&!SP.same(effective,a.position))add('held_position_mismatch',`${a.name}持有的 ${a.held} 有效位置與角色不一致。`,{agentId:a.id,containerId:a.held});
      }
      if(a.action&&(!a.action.intent||!a.action.phase))add('invalid_action',`${a.name}的 action 缺少 intent / phase。`,{agentId:a.id});
      if(a.action?.intent==='externalSupply'||(a.action?.intent==='restockContainer'&&a.action.strategy==='logisticsContainer')){
        const carrier=a.action.carrierId&&st.containers[a.action.carrierId];
        if(!carrier||!SP.hasRole(carrier,'logisticsContainer'))add('logistics_action_carrier_invalid',`${a.name}的物流行動沒有合法 logisticsContainer。`,{agentId:a.id,carrierId:a.action.carrierId||null});
        const mustHold=['toExit','exit','work','toSource','loadCarrier','toDestination','deposit'].includes(a.action.phase);
        if(mustHold&&carrier&&a.held!==carrier.id)add('logistics_action_not_holding_carrier',`${a.name}進入 ${a.action.phase} 階段卻沒有持有物流容器。`,{agentId:a.id,carrierId:carrier.id,phase:a.action.phase});
      }
    }

    for(const [slot,ids] of bySlot)if(ids.length>1)add('slot_double_occupied',`${slot} 同時被 ${ids.join('、')} 使用。`,{slotId:slot,agentIds:ids});
    for(const [cid,ids] of heldByContainer)if(ids.length>1)add('container_double_held',`${cid} 同時被 ${ids.join('、')} 持有。`,{containerId:cid,agentIds:ids});
    for(const [rkey,aid] of Object.entries(st.reservations||{})){
      const a=st.agents[aid];if(!a)add('reservation_owner_missing',`${rkey} 的 reservation 指向不存在的 Agent ${aid}。`,{reservation:rkey});
      if(rkey.startsWith('slot:')){const sid=rkey.slice(5);if(!SP.getSlot(st,sid))add('reservation_slot_missing',`${rkey} 指向不存在的 slot。`,{slotId:sid});}
      if(rkey.startsWith('object:')){const oid=rkey.slice(7);if(!st.containers[oid]&&!st.sources[oid])add('reservation_object_missing',`${rkey} 指向不存在的物件。`,{objectId:oid});}
    }

    const supplyActors=Object.values(st.agents||{}).filter(a=>a.action?.intent==='externalSupply');
    if(supplyActors.length>1)add('multiple_supply_workers','同時存在多名外出補給者。',{agentIds:supplyActors.map(a=>a.id)});
    const crowdingTiles=[];for(const [position,ids] of byTile)if(ids.length>1)crowdingTiles.push({position,agentIds:[...ids],count:ids.length});
    return {tick:st.tick,issueCount:issues.length,issues,crowdingTiles,ok:issues.length===0};
  }

  window.SimValidator={validateState};
})();