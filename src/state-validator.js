(() => {
  const E=window.SimEngine,SP=window.SimSpatial,F=window.SimFurniture;
  if(!E||!SP||!F||E.__stateValidatorV103)return;
  E.__stateValidatorV103=true;

  const baseTick=E.tick.bind(E),baseReset=E.reset.bind(E);
  const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
  const key=p=>p?`${p.x},${p.y}`:'?';

  if(!SP.__v103NormalizedAstar){
    const rawAstar=SP.astar.bind(SP);
    SP.astar=(start,goal,agentId)=>{
      const path=rawAstar(start,goal,agentId)||[];
      if(path.length===1&&start&&goal&&!same(start,goal))return [];
      return path;
    };
    SP.__v103NormalizedAstar=true;
  }

  function syncPosture(st){
    for(const a of Object.values(st.agents||{})){
      if(a.seatSlot){
        const slot=F.getSlot(a.seatSlot);
        const valid=!!slot?.position&&same(slot.position,a.position);
        if(valid){
          a.seatedOn=slot.furnitureId;
          a.posture={kind:'sitting',furnitureId:slot.furnitureId,slotId:slot.id};
          continue;
        }
        delete a.seatSlot;
        delete a.seatedOn;
      }else if(a.seatedOn){
        const slot=F.slotsForFurniture(a.seatedOn).find(s=>same(s.position,a.position));
        if(slot){
          a.seatSlot=slot.id;
          a.posture={kind:'sitting',furnitureId:slot.furnitureId,slotId:slot.id};
          continue;
        }
        delete a.seatedOn;
      }
      if(a.posture?.kind!=='lying')a.posture={kind:'standing',furnitureId:null,slotId:null};
    }
  }

  function validateState(st=E.getState()){
    const issues=[];
    const add=(code,message,data={})=>issues.push({code,message,...data});
    const byTile=new Map(),bySlot=new Map(),reservedSlots=new Map();

    for(const a of Object.values(st.agents||{})){
      if(!a.position){add('agent_position_missing',`${a.name}沒有 Tile 座標。`,{agentId:a.id});continue;}
      const physical=SP.zoneAt(a.position);
      if(physical&&physical!==a.location)add('zone_position_mismatch',`${a.name} 的 Zone=${a.location}，但座標 ${key(a.position)} 位於 ${physical}。`,{agentId:a.id,position:key(a.position)});
      const k=key(a.position);const list=byTile.get(k)||[];list.push(a.id);byTile.set(k,list);

      if(a.held){
        const c=st.containers?.[a.held];
        if(!c)add('held_missing_container',`${a.name}持有不存在的容器 ${a.held}。`,{agentId:a.id});
        else{
          if(c.heldBy!==a.id)add('held_owner_mismatch',`${a.name}.held=${a.held}，但容器 heldBy=${c.heldBy||'null'}。`,{agentId:a.id,containerId:a.held});
          const effective=SP.objectPosition(c.id);
          if(effective&&!same(effective,a.position))add('held_effective_position_mismatch',`${c.name}的有效位置 ${key(effective)} 與持有者 ${a.name} 的 ${key(a.position)} 不一致。`,{agentId:a.id,containerId:c.id,effectivePosition:key(effective),agentPosition:key(a.position)});
        }
      }
      if(a.carrying&&(!Number.isFinite(a.carrying.amount)||a.carrying.amount<=0))add('invalid_carrying',`${a.name}的搬運數量無效。`,{agentId:a.id});

      if(a.seatSlot){
        const slot=F.getSlot(a.seatSlot);
        if(!slot)add('slot_missing',`${a.name}使用不存在的座位 slot ${a.seatSlot}。`,{agentId:a.id,slotId:a.seatSlot});
        else{
          if(!same(slot.position,a.position))add('slot_position_mismatch',`${a.name}標記使用 ${slot.id}，但角色不在該 slot 座標。`,{agentId:a.id,slotId:slot.id});
          if(a.seatedOn!==slot.furnitureId)add('slot_furniture_mismatch',`${a.name}.seatedOn=${a.seatedOn||'null'}，但 ${slot.id} 屬於 ${slot.furnitureId}。`,{agentId:a.id,slotId:slot.id,furnitureId:slot.furnitureId});
          const occupants=bySlot.get(slot.id)||[];occupants.push(a.id);bySlot.set(slot.id,occupants);
        }
      }else if(a.seatedOn){
        add('seat_slot_missing',`${a.name}標記坐在 ${a.seatedOn}，但沒有 seatSlot。`,{agentId:a.id,furnitureId:a.seatedOn});
      }

      if(a.__slotTarget){
        const slot=F.getSlot(a.__slotTarget);
        if(!slot)add('reserved_slot_missing',`${a.name}預約不存在的 slot ${a.__slotTarget}。`,{agentId:a.id,slotId:a.__slotTarget});
        else{const ids=reservedSlots.get(slot.id)||[];ids.push(a.id);reservedSlots.set(slot.id,ids);}
      }
      if(a.__eatAfterSeat&&!a.__slotTarget)add('seat_transition_incomplete',`${a.name}保留待用餐 plan，但沒有座位 slot 目標。`,{agentId:a.id});
      if(a.__restAfterSlot&&!a.__slotTarget)add('rest_slot_transition_incomplete',`${a.name}保留待休息 plan，但沒有休息 slot 目標。`,{agentId:a.id});
    }

    const crowdingTiles=[];
    for(const [tile,ids] of byTile)if(ids.length>1)crowdingTiles.push({position:tile,agentIds:[...ids],count:ids.length});
    for(const [slot,ids] of bySlot)if(ids.length>1)add('slot_double_occupied',`${slot} 同時被 ${ids.join('、')} 占用。`,{slotId:slot,agentIds:ids});
    for(const [slot,ids] of reservedSlots)if(ids.length>1)add('slot_double_reserved',`${slot} 同時被 ${ids.join('、')} 預約。`,{slotId:slot,agentIds:ids});

    for(const c of Object.values(st.containers||{}))if(c.heldBy){
      const a=st.agents?.[c.heldBy];
      if(!a)add('container_holder_missing',`${c.name}.heldBy 指向不存在的 Agent ${c.heldBy}。`,{containerId:c.id});
      else if(a.held!==c.id)add('container_owner_mismatch',`${c.name}.heldBy=${a.name}，但 ${a.name}.held=${a.held||'null'}。`,{containerId:c.id,agentId:a.id});
    }

    const supply=st.supply;
    if(supply?.workerId){
      const worker=st.agents?.[supply.workerId];
      if(!worker?.supplyTask)add('supply_worker_mismatch',`supply.workerId=${supply.workerId}，但該角色沒有 supplyTask。`,{agentId:supply.workerId});
    }
    const taskAgents=Object.values(st.agents||{}).filter(a=>a.supplyTask);
    if(taskAgents.length>1)add('multiple_supply_tasks',`同時存在 ${taskAgents.length} 個補給工作。`,{agentIds:taskAgents.map(a=>a.id)});
    for(const a of taskAgents)if(supply?.workerId!==a.id)add('supply_task_owner_mismatch',`${a.name}有 supplyTask，但 supply.workerId=${supply?.workerId||'null'}。`,{agentId:a.id});

    st.debug??={};
    st.debug.validation={tick:st.tick,issueCount:issues.length,issues,crowdingTiles,ok:issues.length===0};
    return st.debug.validation;
  }

  function tick(){const out=baseTick();const st=E.getState();syncPosture(st);validateState(st);return out;}
  function reset(seed){const st=baseReset(seed);syncPosture(st);validateState(st);return st;}

  E.tick=tick;E.reset=reset;E.validateState=validateState;E.validationStatus=()=>E.getState().debug?.validation||validateState();
  syncPosture(E.getState());validateState(E.getState());
})();