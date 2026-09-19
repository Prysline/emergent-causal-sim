(() => {
  const A=window.SimWorldAuthoring;
  if(!A?.DEFAULT_WORLD_AUTHORING)throw new Error('SimWorldAuthoring must load before world-initializer.js.');
  const clone=value=>JSON.parse(JSON.stringify(value));
  const POSTURES=new Set(['standing','sitting','lying','kneeling','prone']);
  const posKey=p=>p?`${p.x},${p.y}`:'?';
  const sameAuthoredPos=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y&&(a.z??0)===(b.z??0);

  function runtimePosition(position){
    if(!position)return null;
    const z=position.z??0;
    if(z!==0)throw new Error(A.VERSION+' runtime adapter only supports z=0; received z='+z+'.');
    const out={x:position.x,y:position.y};
    if(position.spaceId!==undefined)out.spaceId=position.spaceId;
    if(position.surfaceId!==undefined)out.surfaceId=position.surfaceId;
    return out;
  }

  function singleRuntimeLayer(authoring){
    if(authoring?.authoringSchema!==A.VERSION)throw new Error('Unsupported authoringSchema: '+String(authoring?.authoringSchema));
    const layers=authoring?.map?.layers;
    if(!Array.isArray(layers)||layers.length!==1||layers[0]?.z!==0)throw new Error(A.VERSION+' runtime adapter requires exactly one z=0 layer.');
    return layers[0];
  }

  function buildTiles(authoring,topology=A.deriveHorizontalTopology(authoring,{z:0})){
    const layer=singleRuntimeLayer(authoring),width=authoring.map.width,height=authoring.map.height,tiles={};
    if(!Number.isInteger(width)||width<=0||!Number.isInteger(height)||height<=0)throw new Error('World authoring map width/height must be positive integers.');
    for(const [id,cell] of Object.entries(layer.cells||{})){
      const parts=id.split(','),x=Number(parts[0]),y=Number(parts[1]);
      if(parts.length!==2||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=width||y>=height)throw new Error('Invalid authored cell id: '+id);
      if(!cell?.terrain)throw new Error('Authored cell '+id+' is missing terrain.');
      const derived=topology.cells[id];
      tiles[id]={id,x,y,terrain:cell.terrain,material:cell.material??null,walkable:!!derived?.structuralOpen,surface:{contents:{}},roomId:null,furnitureIds:[...(derived?.furnitureIds||[])]};
    }
    if(Object.keys(tiles).length!==width*height)throw new Error('Authored z=0 layer must define every map cell for runtime initialization.');
    return tiles;
  }

  function buildFurniture(authoring){
    const furniture=clone(authoring.furniture||{});
    for(const f of Object.values(furniture)){
      f.footprint=(f.footprint||[]).map(runtimePosition);
      if(f.displayAt)f.displayAt=runtimePosition(f.displayAt);
      for(const slot of f.slots||[]){
        slot.position=runtimePosition(slot.position);
        slot.furnitureId=f.id;
      }
    }
    return furniture;
  }

  function buildContainers(authoring){
    const containers=clone(authoring.entities?.containers||{});
    for(const c of Object.values(containers))if(c.position)c.position=runtimePosition(c.position);
    return containers;
  }

  function buildSources(authoring){
    const sources=clone(authoring.entities?.sources||{});
    for(const s of Object.values(sources)){
      if(s.position)s.position=runtimePosition(s.position);
      for(const port of s.interactionPorts||[])if(port.position)port.position=runtimePosition(port.position);
    }
    return sources;
  }

  function contactState(kind){
    return kind==='cat'?{paws:{}}:{hands:{},feet:{}};
  }

  function authoringSlots(authoring){
    const out=[];
    for(const furnitureId of Object.keys(authoring.furniture||{}).sort()){
      const furniture=authoring.furniture[furnitureId];
      for(const slot of furniture.slots||[])out.push({...slot,furnitureId:furniture.id||furnitureId});
    }
    return out;
  }

  function slotIndex(authoring){
    const index=new Map();
    for(const slot of authoringSlots(authoring)){
      const list=index.get(slot.id)||[];
      list.push(slot);
      index.set(slot.id,list);
    }
    return index;
  }

  function authoredCellAt(authoring,p){
    if(!p)return null;
    return singleRuntimeLayer(authoring).cells?.[posKey(p)]||null;
  }

  function authoredBlockerAt(authoring,p){
    const cell=authoredCellAt(authoring,p);
    if(!cell)return 'out-of-bounds';
    const topology=A.deriveHorizontalTopology(authoring,{z:p?.z??0}),derived=topology.cells[posKey(p)];
    if(!derived?.structuralOpen)return `terrain:${cell.terrain}`;
    if(derived.staticBlocked)return derived.blockedBy[0]||'static-blocker';
    if(derived.under?.length)return `furniture:${derived.under[0].furnitureId}`;
    return null;
  }

  function issue(code,message,data={}){return {code,message,...data};}

  function validateAuthoredFloorNode(authoring,residentId,node,errors){
    if(!node||!Number.isInteger(node.x)||!Number.isInteger(node.y)){
      errors.push(issue('initial_placement_node_invalid',`${residentId} 的 initial placement 缺少合法整數 x/y。`,{residentId}));
      return null;
    }
    const z=node.z??0;
    if(z!==0){
      errors.push(issue('initial_placement_unsupported_z',`${residentId} 的 initial placement 使用 z=${z}；current runtime只支援 z=0。`,{residentId,z}));
      return null;
    }
    if(node.surfaceId!==undefined&&node.surfaceId!==null&&node.surfaceId!=='floor'){
      errors.push(issue('initial_placement_surface_unsupported',`${residentId} 的 initial placement surfaceId=${node.surfaceId}；Slice B只支援 floor initial occupancy。`,{residentId,surfaceId:node.surfaceId}));
      return null;
    }
    const width=authoring.map?.width,height=authoring.map?.height;
    if(node.x<0||node.y<0||node.x>=width||node.y>=height||!authoredCellAt(authoring,node)){
      errors.push(issue('initial_placement_out_of_bounds',`${residentId} 的 initial placement ${posKey(node)} 不存在於 authored world。`,{residentId,position:posKey(node)}));
      return null;
    }
    const blocker=authoredBlockerAt(authoring,node);
    if(blocker){
      errors.push(issue('initial_placement_blocked',`${residentId} 的 initial placement ${posKey(node)} 被 ${blocker} 阻擋。`,{residentId,position:posKey(node),blocker}));
      return null;
    }
    return {x:node.x,y:node.y,z:0,...(node.surfaceId!==undefined?{surfaceId:node.surfaceId}:{})};
  }

  function validatePostureKind(residentId,posture,errors){
    const kind=posture?.kind||'standing';
    if(!POSTURES.has(kind)){
      errors.push(issue('initial_posture_invalid',`${residentId} 的 initial posture ${String(kind)} 無效。`,{residentId,posture:kind}));
      return null;
    }
    return kind;
  }

  function resolveUniqueSlot(index,residentId,slotId,errors){
    if(typeof slotId!=='string'||!slotId){
      errors.push(issue('initial_anchor_id_missing',`${residentId} 的 furnitureSlot anchor 缺少 id。`,{residentId}));
      return null;
    }
    const matches=index.get(slotId)||[];
    if(!matches.length){
      errors.push(issue('initial_anchor_missing',`${residentId} 指向不存在的 furnitureSlot ${slotId}。`,{residentId,slotId}));
      return null;
    }
    if(matches.length>1){
      errors.push(issue('initial_anchor_ambiguous',`${residentId} 的 furnitureSlot ${slotId} 在 authoring package 中不唯一。`,{residentId,slotId,count:matches.length}));
      return null;
    }
    return matches[0];
  }

  function validateSlotUse(authoring,index,entry,residentId,slotId,posture,errors,{requireExplicitPosture=false}={}){
    const slot=resolveUniqueSlot(index,residentId,slotId,errors);
    if(!slot)return null;
    if(slot.allowKinds?.length&&!slot.allowKinds.includes(entry.kind)){
      errors.push(issue('initial_anchor_kind_mismatch',`${residentId}（${entry.kind}）不能使用 ${slotId}。`,{residentId,slotId,kind:entry.kind}));
    }
    if(requireExplicitPosture&&!posture?.kind){
      errors.push(issue('initial_anchor_posture_missing',`${residentId} 使用 furnitureSlot anchor ${slotId} 時必須明確 author initial posture.kind。`,{residentId,slotId}));
    }
    const postureKind=validatePostureKind(residentId,posture,errors);
    if(posture?.slotId&&posture.slotId!==slotId){
      errors.push(issue('initial_anchor_posture_slot_conflict',`${residentId} 的 anchor=${slotId} 與 posture.slotId=${posture.slotId} 不一致。`,{residentId,slotId,postureSlotId:posture.slotId}));
    }
    if(posture?.furnitureId&&posture.furnitureId!==slot.furnitureId){
      errors.push(issue('initial_anchor_posture_furniture_conflict',`${residentId} 的 anchor ${slotId} 屬於 ${slot.furnitureId}，但 posture.furnitureId=${posture.furnitureId}。`,{residentId,slotId,furnitureId:slot.furnitureId,postureFurnitureId:posture.furnitureId}));
    }
    if(postureKind==='lying'&&!slot.canRest&&!slot.canSleep){
      errors.push(issue('initial_anchor_lying_unusable',`${residentId} 不能以 lying posture 使用 ${slotId}；該 slot 不支援 rest / sleep。`,{residentId,slotId}));
    }
    const position=validateAuthoredFloorNode(authoring,residentId,slot.position,errors);
    if(!position)return null;
    return {position,slot,posture:{kind:postureKind,slotId:slot.id,furnitureId:slot.furnitureId}};
  }

  function resolveResidentPlacement(authoring,index,residentId,entry,errors){
    const initial=entry.initial||{},placement=initial.placement,posture=initial.posture||{};
    if(!placement||typeof placement.mode!=='string'){
      errors.push(issue('initial_placement_missing',`${residentId} 缺少 initial.placement。`,{residentId}));
      return null;
    }
    if(placement.mode==='exact'){
      const position=validateAuthoredFloorNode(authoring,residentId,placement.node,errors);
      const postureKind=validatePostureKind(residentId,posture,errors);
      let slot=null;
      if(posture.slotId){
        const resolved=validateSlotUse(authoring,index,entry,residentId,posture.slotId,posture,errors);
        slot=resolved?.slot||null;
        if(resolved&&position&&!sameAuthoredPos(position,resolved.position)){
          errors.push(issue('initial_exact_posture_position_mismatch',`${residentId} 的 exact placement ${posKey(position)} 與 posture slot ${posture.slotId} 的位置 ${posKey(resolved.position)} 不一致。`,{residentId,slotId:posture.slotId}));
        }
      }else if(postureKind==='sitting'){
        errors.push(issue('initial_sitting_without_slot',`${residentId} 的 exact initial posture 是 sitting，但沒有 posture.slotId。`,{residentId}));
      }
      if(!position||!postureKind)return null;
      return {
        mode:'exact',
        position,
        slotId:slot?.id||null,
        posture:{kind:postureKind,slotId:slot?.id||null,furnitureId:slot?.furnitureId||null}
      };
    }
    if(placement.mode==='anchor'){
      const anchor=placement.anchor;
      if(anchor?.kind!=='furnitureSlot'){
        errors.push(issue('initial_anchor_kind_unsupported',`${residentId} 的 initial anchor kind=${String(anchor?.kind)}；Slice B只支援 furnitureSlot。`,{residentId,anchorKind:anchor?.kind??null}));
        return null;
      }
      const resolved=validateSlotUse(authoring,index,entry,residentId,anchor.id,posture,errors,{requireExplicitPosture:true});
      if(!resolved)return null;
      return {mode:'anchor',anchor:{kind:'furnitureSlot',id:anchor.id},position:resolved.position,slotId:resolved.slot.id,posture:resolved.posture};
    }
    errors.push(issue('initial_placement_mode_unsupported',`${residentId} 的 initial placement mode=${placement.mode} 不受 Slice B支援。`,{residentId,mode:placement.mode}));
    return null;
  }

  function baseWalkable(authoring,p,topology=null){const derived=(topology||A.deriveHorizontalTopology(authoring,{z:p?.z??0})).cells[posKey(p)];return !!derived?.open;}
  function neighborPositions(authoring,p,topology=null){
    const out=[];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const q={x:p.x+dx,y:p.y+dy,z:0};
      if(baseWalkable(authoring,q,topology))out.push(q);
    }
    return out;
  }
  function reachableKeys(authoring,start,topology=null){
    const seen=new Set();
    if(!start||!baseWalkable(authoring,start,topology))return seen;
    const queue=[{x:start.x,y:start.y,z:0}];
    seen.add(posKey(start));
    while(queue.length){
      const cur=queue.shift();
      for(const q of neighborPositions(authoring,cur,topology)){
        const k=posKey(q);
        if(!seen.has(k)){seen.add(k);queue.push(q);}
      }
    }
    return seen;
  }
  function dedupePositions(authoring,list,topology=null){
    const out=new Map();
    for(const p of list||[])if(p&&baseWalkable(authoring,p,topology))out.set(posKey(p),{x:p.x,y:p.y,z:0});
    return [...out.values()];
  }

  function reachPositions(authoring,p,topology=null){
    if(!p)return [];
    const out=neighborPositions(authoring,p,topology);
    if(baseWalkable(authoring,p,topology))out.push({x:p.x,y:p.y,z:0});
    return dedupePositions(authoring,out,topology);
  }
  function supportReachPositions(authoring,supportId,topology=null){
    const furniture=authoring.furniture?.[supportId];
    if(!furniture)return [];
    const out=[];
    for(const p of furniture.footprint||[])out.push(...neighborPositions(authoring,p,topology));
    for(const slot of furniture.slots||[])if(slot.position&&baseWalkable(authoring,slot.position,topology))out.push(slot.position);
    return dedupePositions(authoring,out,topology);
  }
  function objectAccessPositions(authoring,obj,affordance,topology=null){
    if(!obj?.position)return [];
    const rule=obj.interactions?.[affordance]||obj.interactions?.default||null;
    if(rule?.mode==='supportReach'&&obj.supportId)return supportReachPositions(authoring,obj.supportId,topology);
    if(rule?.mode==='port')return dedupePositions(authoring,(obj.interactionPorts||[]).filter(p=>!p.affordances?.length||p.affordances.includes(affordance)).map(p=>p.position),topology);
    return reachPositions(authoring,obj.position,topology);
  }
  function accessTargets(authoring,kind,type,topology=null){
    const out=[];
    if(type==='exit'){
      for(const slot of authoringSlots(authoring))if(slot.canExit&&slot.position&&baseWalkable(authoring,slot.position,topology))out.push(slot.position);
    }else if(type==='food'){
      for(const c of Object.values(authoring.entities?.containers||{}))if(c.canEatFrom&&Number(c.contents?.food)>0)out.push(...objectAccessPositions(authoring,c,'eatFrom',topology));
    }else if(type==='water'){
      for(const c of Object.values(authoring.entities?.containers||{}))if(c.canDrinkFrom&&Number(c.contents?.water)>0)out.push(...objectAccessPositions(authoring,c,'drinkFrom',topology));
      for(const s of Object.values(authoring.entities?.sources||{}))if(s.resource==='water')out.push(...objectAccessPositions(authoring,s,'fill',topology));
    }else if(type==='sleep'){
      for(const slot of authoringSlots(authoring))if(slot.canSleep&&(!slot.allowKinds?.length||slot.allowKinds.includes(kind))&&slot.position&&baseWalkable(authoring,slot.position,topology))out.push(slot.position);
    }
    return dedupePositions(authoring,out,topology);
  }

  function analyzeInitialPlacements(authoring){
    singleRuntimeLayer(authoring);
    const topology=A.deriveHorizontalTopology(authoring,{z:0});
    const hardErrors=[],diagnostics=[],resolvedPlacements={},index=slotIndex(authoring);
    const residentIds=Object.keys(authoring.residents||{}).sort();
    for(const residentId of residentIds){
      const resolved=resolveResidentPlacement(authoring,index,residentId,authoring.residents[residentId],hardErrors);
      if(resolved)resolvedPlacements[residentId]=resolved;
    }

    const slotUsers=new Map();
    for(const residentId of residentIds){
      const slotId=resolvedPlacements[residentId]?.slotId;
      if(!slotId)continue;
      const users=slotUsers.get(slotId)||[];
      users.push(residentId);
      slotUsers.set(slotId,users);
    }
    for(const [slotId,residentIdsForSlot] of slotUsers){
      if(residentIdsForSlot.length>1)hardErrors.push(issue('initial_slot_double_assigned',`${slotId} 同時被 ${residentIdsForSlot.join('、')} 指定為 initial slot。`,{slotId,residentIds:[...residentIdsForSlot]}));
    }

    const nodeUsers=new Map();
    for(const residentId of residentIds){
      const p=resolvedPlacements[residentId]?.position;
      if(!p)continue;
      const k=posKey(p),users=nodeUsers.get(k)||[];
      users.push(residentId);nodeUsers.set(k,users);
    }
    for(const [position,residentIdsAtNode] of nodeUsers){
      if(residentIdsAtNode.length>1)diagnostics.push(issue('initial_node_overlap',`${position} 有多名居民初始重疊：${residentIdsAtNode.join('、')}。`,{position,residentIds:[...residentIdsAtNode]}));
    }

    for(const residentId of residentIds){
      const resolved=resolvedPlacements[residentId];
      if(!resolved)continue;
      const entry=authoring.residents[residentId],reachable=reachableKeys(authoring,resolved.position,topology);
      for(const [type,code,label] of [
        ['exit','initial_no_exit_route','出口'],
        ['food','initial_food_unreachable','食物'],
        ['water','initial_water_unreachable','飲水'],
        ['sleep','initial_sleep_unreachable','可睡眠位置']
      ]){
        const targets=accessTargets(authoring,entry.kind,type,topology);
        if(!targets.length){
          if(type!=='exit')diagnostics.push(issue(`initial_${type}_unavailable`,`${residentId} 的 authored world沒有可用${label} target。`,{residentId}));
          continue;
        }
        if(!targets.some(p=>reachable.has(posKey(p))))diagnostics.push(issue(code,`${residentId} 從初始位置 ${posKey(resolved.position)} 無法經 base authored floor connectivity 到達${label}。`,{residentId,position:posKey(resolved.position)}));
      }
    }

    return {ok:hardErrors.length===0,hardErrors,diagnostics,resolvedPlacements};
  }

  function assertInitialPlacements(authoring){
    const report=analyzeInitialPlacements(authoring);
    if(report.hardErrors.length){
      const error=new Error('Initial population placement invalid: '+report.hardErrors.map(x=>x.code).join(', '));
      error.code='initial_population_placement_invalid';
      error.issues=clone(report.hardErrors);
      throw error;
    }
    return report;
  }

  function analyzeRuntimeCompatibility(authoring){
    const schema=A.validateAuthoring(authoring);
    if(!schema.ok)return {ok:false,stage:'schema',hardErrors:clone(schema.errors||[]),diagnostics:[]};
    try{
      const placement=analyzeInitialPlacements(authoring);
      return {
        ok:placement.hardErrors.length===0,
        stage:'runtime',
        hardErrors:clone(placement.hardErrors),
        diagnostics:clone(placement.diagnostics),
        resolvedPlacements:clone(placement.resolvedPlacements)
      };
    }catch(error){
      return {ok:false,stage:'runtime',hardErrors:[issue(error.code||'runtime_authoring_incompatible',error.message||String(error))],diagnostics:[]};
    }
  }

  function assertRuntimeCompatibleAuthoring(authoring){
    const report=analyzeRuntimeCompatibility(authoring);
    if(!report.ok){
      const error=new Error('Runtime authoring incompatible: '+report.hardErrors.map(x=>x.code||x.message).join(', '));
      error.code='runtime_authoring_incompatible';
      error.issues=clone(report.hardErrors);
      throw error;
    }
    return report;
  }
  function buildResidents(authoring,resolvedPlacements){
    const agents={};
    for(const [id,entry] of Object.entries(authoring.residents||{})){
      const initial=entry.initial||{},resolved=resolvedPlacements[id];
      if(!resolved)throw new Error('Missing resolved initial placement for '+id+'.');
      const contacts=contactState(entry.kind);
      agents[id]={
        id:entry.id||id,
        name:entry.name||id,
        kind:entry.kind,
        position:runtimePosition(resolved.position),
        needs:clone(initial.needs||{}),
        wellbeing:clone(initial.wellbeing||{}),
        status:clone(initial.status||{}),
        contacts:clone(contacts),
        causes:{intoxication:null,contacts:clone(contacts)},
        traits:clone(entry.traits||{}),
        metrics:{exertionToday:0,lastExertion:null},
        held:null,
        posture:clone(resolved.posture),
        action:null,
        offMap:false
      };
    }
    return agents;
  }

  function createInitialState(authoring,{seed=20260911,version,supplyTrigger=70}={}){
    const n=(Number(seed)>>>0)||20260911,placementReport=assertInitialPlacements(authoring),topology=A.deriveHorizontalTopology(authoring,{z:0});
    const map={width:authoring.map.width,height:authoring.map.height,tiles:buildTiles(authoring,topology),rooms:{},roomRevision:0};
    const lowLevel=authoring.compatibility?.passageConstraints;
    if(lowLevel&&Object.keys(lowLevel).length)map.passageConstraints=clone(lowLevel);
    const furniture=buildFurniture(authoring);
    const state={
      version,tick:0,day:authoring.scenario?.startDay??1,minute:authoring.scenario?.startMinute??12*60,seed:n,rngState:n,
      map,
      furniture,activityAreas:{},reservations:{},noiseEvents:[],endpointCauses:{},
      supply:{trigger:supplyTrigger,trips:0,totalProduced:0},
      containers:buildContainers(authoring),
      sources:buildSources(authoring),
      agents:buildResidents(authoring,placementReport.resolvedPlacements),
      events:[],causes:{},thoughts:{}
    };
    return state;
  }

  window.SimWorldInitializer={createInitialState,analyzeInitialPlacements,assertInitialPlacements,analyzeRuntimeCompatibility,assertRuntimeCompatibleAuthoring};
})();