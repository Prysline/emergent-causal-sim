(() => {
  const A=window.SimWorldAuthoring,C=window.SimEmbodimentCapabilities;
  if(!A?.DEFAULT_WORLD_AUTHORING)throw new Error('SimWorldAuthoring must load before world-initializer.js.');
  if(!C?.ALL_POSTURES)throw new Error('SimEmbodimentCapabilities must load before world-initializer.js.');
  const clone=value=>JSON.parse(JSON.stringify(value));
  const POSTURES=new Set(C.ALL_POSTURES);
  const zOf=p=>p?.z??0;
  const cellKey=p=>p?`${p.x},${p.y}`:'?';
  const posKey=p=>p?(zOf(p)===0?cellKey(p):`${p.x},${p.y},${zOf(p)}`):'?';
  const sameAuthoredPos=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y&&zOf(a)===zOf(b);

  function runtimePosition(position){
    if(!position)return null;
    const z=zOf(position);
    if(!Number.isInteger(z))throw new Error('Runtime position z must be an integer.');
    const out={x:position.x,y:position.y};
    if(z!==0)out.z=z;
    if(position.spaceId!==undefined)out.spaceId=position.spaceId;
    if(position.surfaceId!==undefined)out.surfaceId=position.surfaceId;
    return out;
  }

  function runtimeLayers(authoring){
    if(authoring?.authoringSchema!==A.VERSION)throw new Error('Unsupported authoringSchema: '+String(authoring?.authoringSchema));
    if(authoring?.furnitureCatalogVersion!==A.FURNITURE_CATALOG_VERSION)throw new Error('Unsupported furnitureCatalogVersion: '+String(authoring?.furnitureCatalogVersion));
    const layers=authoring?.map?.layers;
    if(!Array.isArray(layers)||!layers.length)throw new Error(A.VERSION+' runtime adapter requires at least one authored layer.');
    for(const layer of layers)if(!Number.isInteger(layer?.z))throw new Error(A.VERSION+' runtime adapter requires integer layer z values.');
    return [...layers].sort((a,b)=>a.z-b.z);
  }
  function layerAt(authoring,z){return runtimeLayers(authoring).find(layer=>layer.z===z)||null;}

  function buildTiles(authoring){
    const width=authoring.map.width,height=authoring.map.height,tiles={};
    if(!Number.isInteger(width)||width<=0||!Number.isInteger(height)||height<=0)throw new Error('World authoring map width/height must be positive integers.');
    for(const layer of runtimeLayers(authoring)){
      const topology=A.deriveHorizontalTopology(authoring,{z:layer.z});
      for(const [id,cell] of Object.entries(layer.cells||{})){
        const parts=id.split(','),x=Number(parts[0]),y=Number(parts[1]);
        if(parts.length!==2||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=width||y>=height)throw new Error('Invalid authored cell id: '+id);
        if(!cell?.terrain)throw new Error('Authored cell '+id+' is missing terrain.');
      }
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const planarId=`${x},${y}`,cell=layer.cells?.[planarId]||{terrain:'void'},derived=topology.cells[planarId];
        const id=posKey({x,y,z:layer.z});
        tiles[id]={id,x,y,z:layer.z,terrain:cell.terrain,material:cell.material??null,walkable:!!derived?.structuralOpen,surface:{contents:{}},roomId:null,furnitureIds:[...(derived?.furnitureIds||[])]};
      }
    }
    return tiles;
  }

  function buildFurniture(authoring){
    const furniture={};
    for(const [id,instance] of Object.entries(authoring.furniture||{})){
      const f=clone(A.resolveFurnitureInstance(instance));
      f.footprint=(f.footprint||[]).map(runtimePosition);
      if(f.displayAt)f.displayAt=runtimePosition(f.displayAt);
      for(const slot of f.slots||[]){
        slot.position=runtimePosition(slot.position);
        slot.furnitureId=f.id;
      }
      furniture[id]=f;
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
      const furniture=A.resolveFurnitureInstance(authoring.furniture[furnitureId]);
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
    return layerAt(authoring,zOf(p))?.cells?.[cellKey(p)]||null;
  }

  function authoredBlockerAt(authoring,p){
    const cell=authoredCellAt(authoring,p);
    if(!cell)return 'out-of-bounds';
    const topology=A.deriveHorizontalTopology(authoring,{z:zOf(p)}),derived=topology.cells[cellKey(p)];
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
    const z=zOf(node);
    if(!Number.isInteger(z)||!layerAt(authoring,z)){
      errors.push(issue('initial_placement_layer_missing',`${residentId} 的 initial placement 使用不存在的 z=${z} layer。`,{residentId,z}));
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
    return {x:node.x,y:node.y,z,...(node.surfaceId!==undefined?{surfaceId:node.surfaceId}:{})};
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

  function topologyFor(authoring,z,cache=null){
    if(!cache)return A.deriveHorizontalTopology(authoring,{z});
    if(!cache.has(z))cache.set(z,A.deriveHorizontalTopology(authoring,{z}));
    return cache.get(z);
  }
  function baseWalkable(authoring,p,cache=null){const derived=topologyFor(authoring,zOf(p),cache).cells[cellKey(p)];return !!derived?.open;}
  function neighborPositions(authoring,p,cache=null){
    const out=[],z=zOf(p);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const q={x:p.x+dx,y:p.y+dy,z};
      if(baseWalkable(authoring,q,cache))out.push(q);
    }
    return out;
  }
  function reachableKeys(authoring,start,cache=null){
    const seen=new Set(),z=zOf(start);
    if(!start||!baseWalkable(authoring,start,cache))return seen;
    const queue=[{x:start.x,y:start.y,z}];
    seen.add(posKey(start));
    while(queue.length){
      const cur=queue.shift();
      for(const q of neighborPositions(authoring,cur,cache)){
        const k=posKey(q);
        if(!seen.has(k)){seen.add(k);queue.push(q);}
      }
    }
    return seen;
  }
  function dedupePositions(authoring,list,cache=null){
    const out=new Map();
    for(const p of list||[])if(p&&baseWalkable(authoring,p,cache))out.set(posKey(p),{x:p.x,y:p.y,z:zOf(p)});
    return [...out.values()];
  }

  function reachPositions(authoring,p,cache=null){
    if(!p)return [];
    const out=neighborPositions(authoring,p,cache);
    if(baseWalkable(authoring,p,cache))out.push({x:p.x,y:p.y,z:zOf(p)});
    return dedupePositions(authoring,out,cache);
  }
  function supportReachPositions(authoring,supportId,cache=null){
    const instance=authoring.furniture?.[supportId];
    if(!instance)return [];
    const furniture=A.resolveFurnitureInstance(instance);
    const out=[];
    for(const p of furniture.footprint||[])out.push(...neighborPositions(authoring,p,cache));
    for(const slot of furniture.slots||[])if(slot.position&&baseWalkable(authoring,slot.position,cache))out.push(slot.position);
    return dedupePositions(authoring,out,cache);
  }
  function objectAccessPositions(authoring,obj,affordance,cache=null){
    if(!obj?.position)return [];
    const rule=obj.interactions?.[affordance]||obj.interactions?.default||null;
    if(rule?.mode==='supportReach'&&obj.supportId)return supportReachPositions(authoring,obj.supportId,cache);
    if(rule?.mode==='port')return dedupePositions(authoring,(obj.interactionPorts||[]).filter(p=>!p.affordances?.length||p.affordances.includes(affordance)).map(p=>p.position),cache);
    return reachPositions(authoring,obj.position,cache);
  }
  function accessTargets(authoring,kind,type,cache=null){
    const out=[];
    if(type==='exit'){
      for(const slot of authoringSlots(authoring))if(slot.canExit&&slot.position&&baseWalkable(authoring,slot.position,cache))out.push(slot.position);
    }else if(type==='food'){
      for(const c of Object.values(authoring.entities?.containers||{}))if(c.canEatFrom&&Number(c.contents?.food)>0)out.push(...objectAccessPositions(authoring,c,'eatFrom',cache));
    }else if(type==='water'){
      for(const c of Object.values(authoring.entities?.containers||{}))if(c.canDrinkFrom&&Number(c.contents?.water)>0)out.push(...objectAccessPositions(authoring,c,'drinkFrom',cache));
      for(const s of Object.values(authoring.entities?.sources||{}))if(s.resource==='water')out.push(...objectAccessPositions(authoring,s,'fill',cache));
    }else if(type==='sleep'){
      for(const slot of authoringSlots(authoring))if(slot.canSleep&&(!slot.allowKinds?.length||slot.allowKinds.includes(kind))&&slot.position&&baseWalkable(authoring,slot.position,cache))out.push(slot.position);
    }
    return dedupePositions(authoring,out,cache);
  }

  function analyzeInitialPlacements(authoring){
    runtimeLayers(authoring);
    const topologyCache=new Map();
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
      const entry=authoring.residents[residentId],reachable=reachableKeys(authoring,resolved.position,topologyCache);
      for(const [type,code,label] of [
        ['exit','initial_no_exit_route','出口'],
        ['food','initial_food_unreachable','食物'],
        ['water','initial_water_unreachable','飲水'],
        ['sleep','initial_sleep_unreachable','可睡眠位置']
      ]){
        const targets=accessTargets(authoring,entry.kind,type,topologyCache);
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
    const n=(Number(seed)>>>0)||20260911,placementReport=assertInitialPlacements(authoring),zLevels=runtimeLayers(authoring).map(layer=>layer.z);
    const map={width:authoring.map.width,height:authoring.map.height,zLevels,tiles:buildTiles(authoring),rooms:{},roomRevision:0};
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