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
      if(a.seatedOn){
        const seat=st.furniture?.[a.seatedOn];
        const valid=!!seat?.footprint?.some(p=>same(p,a.position));
        if(valid){a.posture={kind:'sitting',furnitureId:a.seatedOn};continue;}
      }
      if(a.posture?.kind!=='lying')a.posture={kind:'standing',furnitureId:null};
    }
  }

  function validateState(st=E.getState()){
    const issues=[];
    const add=(code,message,data={})=>issues.push({code,message,...data});
    const byTile=new Map(),bySeat=new Map();

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
          if(c.position&&!same(c.position,a.position))add('held_position_mismatch',`${c.name}被${a.name}持有，但座標不同。`,{agentId:a.id,containerId:c.id});
        }
      }
      if(a.carrying&&(!Number.isFinite(a.carrying.amount)||a.carrying.amount<=0))add('invalid_carrying',`${a.name}的搬運數量無效。`,{agentId:a.id});

      if(a.seatedOn){
        const seat=st.furniture?.[a.seatedOn];
        if(!seat)add('seat_missing',`${a.name}坐在不存在的家具 ${a.seatedOn}。`,{agentId:a.id});
        else if(!seat.footprint?.some(p=>same(p,a.position)))add('seat_position_mismatch',`${a.name}標記坐在${seat.name}，但不在其 footprint。`,{agentId:a.id,furnitureId:seat.id});
        const occupants=bySeat.get(a.seatedOn)||[];occupants.push(a.id);bySeat.set(a.seatedOn,occupants);
      }
      if(a.__eatAfterSeat&&!a.__seatTarget)add('seat_transition_incomplete',`${a.name}保留待用餐 plan，但沒有座位目標。`,{agentId:a.id});
      if(a.plan?.__spatialTarget&&a.position&&!same(a.position,a.plan.__spatialTarget)){
        const path=SP.astar(a.position,a.plan.__spatialTarget,a.id);
        if(!path.length)add('unreachable_spatial_target',`${a.name}目前的空間目標 ${key(a.plan.__spatialTarget)} 不可達。`,{agentId:a.id,target:key(a.plan.__spatialTarget)});
      }
    }

    for(const [tile,ids] of byTile)if(ids.length>1)add('agent_tile_overlap',`Tile ${tile} 同時有 ${ids.join('、')}。`,{position:tile,agentIds:ids});
    for(const [seat,ids] of bySeat)if(ids.length>1)add('seat_double_occupied',`${seat} 同時被 ${ids.join('、')} 標記占用。`,{furnitureId:seat,agentIds:ids});

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
    st.debug.validation={tick:st.tick,issueCount:issues.length,issues,ok:issues.length===0};
    return st.debug.validation;
  }

  function tick(){const out=baseTick();const st=E.getState();syncPosture(st);validateState(st);return out;}
  function reset(seed){const st=baseReset(seed);syncPosture(st);validateState(st);return st;}

  E.tick=tick;E.reset=reset;E.validateState=validateState;E.validationStatus=()=>E.getState().debug?.validation||validateState();
  syncPosture(E.getState());validateState(E.getState());
})();
