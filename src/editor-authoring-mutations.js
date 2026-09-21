(() => {
  const A=window.SimWorldAuthoring,C=window.SimEmbodimentCapabilities;
  if(!A?.cloneAuthoring||!A?.validateAuthoring||!A?.canonicalizeAuthoring||!A?.semanticFingerprint){
    throw new Error('SimWorldAuthoring must load before editor-authoring-mutations.js.');
  }
  if(!C?.freePosturesForKind||!C?.slotPosturesForKind)throw new Error('SimEmbodimentCapabilities must load before editor-authoring-mutations.js.');
  const issue=(code,message,data={})=>({code,message,...data});
  const clone=value=>A.cloneAuthoring(value);
  const samePosition=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y&&(a.z??0)===(b.z??0);
  const translatePosition=(position,dx,dy,dz)=>position?{...position,x:position.x+dx,y:position.y+dy,z:(position.z??0)+dz}:position;

  function mutationResult(authoring,apply){
    const inputReport=A.validateAuthoring(authoring);
    if(!inputReport.ok)return {ok:false,candidate:null,issues:clone(inputReport.errors),meta:{phase:'input-validation'}};
    const before=A.semanticFingerprint(authoring);
    const candidate=clone(authoring);
    let meta={};
    try{
      const outcome=apply(candidate)||{};
      if(outcome.reject){
        return {ok:false,candidate:null,issues:clone(outcome.issues||[]),meta:clone(outcome.meta||{})};
      }
      meta=outcome.meta||{};
    }catch(error){
      return {ok:false,candidate:null,issues:[issue(error.code||'editor_mutation_exception',error.message||String(error))],meta:{phase:'apply'}};
    }
    const report=A.validateAuthoring(candidate);
    if(!report.ok)return {ok:false,candidate:null,issues:clone(report.errors),meta:{...clone(meta),phase:'candidate-validation'}};
    const canonical=A.canonicalizeAuthoring(candidate);
    return {
      ok:true,
      candidate:canonical,
      issues:[],
      meta:{...clone(meta),beforeFingerprint:before,afterFingerprint:A.semanticFingerprint(canonical)}
    };
  }

  function reject(code,message,data={},meta={}){
    return {reject:true,issues:[issue(code,message,data)],meta};
  }

  function furnitureAnchor(furniture){
    return furniture?.displayAt||furniture?.footprint?.[0]||furniture?.slots?.[0]?.position||null;
  }

  function furnitureAtTarget(authoring,target,{supportsObjectsOnly=false}={}){
    const out=[];
    for(const [id,furniture] of Object.entries(authoring.furniture||{})){
      if(supportsObjectsOnly&&furniture.supportsObjects!==true)continue;
      if((furniture.footprint||[]).some(position=>samePosition(position,target))){
        out.push({id,name:furniture.name||id,supportsObjects:furniture.supportsObjects===true});
      }
    }
    return out.sort((a,b)=>a.id.localeCompare(b.id));
  }

  function allSlots(authoring){
    const out=[];
    for(const furnitureId of Object.keys(authoring.furniture||{}).sort()){
      const furniture=authoring.furniture[furnitureId];
      for(const slot of furniture.slots||[])out.push({slot,furnitureId,name:furniture.name||furnitureId});
    }
    return out;
  }

  function uniqueSlot(authoring,slotId){
    const matches=allSlots(authoring).filter(entry=>entry.slot?.id===slotId);
    return matches.length===1?matches[0]:null;
  }

  function listSupportCandidates(authoring,target){
    return furnitureAtTarget(authoring,target,{supportsObjectsOnly:true});
  }

  function listResidentSlots(authoring,residentId){
    const resident=authoring.residents?.[residentId];
    if(!resident)return [];
    return allSlots(authoring).map(entry=>({
      id:entry.slot.id,
      label:entry.slot.label||entry.slot.id,
      furnitureId:entry.furnitureId,
      furnitureName:entry.name,
      position:clone(entry.slot.position),
      canRest:!!entry.slot.canRest,
      canSleep:!!entry.slot.canSleep,
      allowKinds:clone(entry.slot.allowKinds||[]),
      compatible:!entry.slot.allowKinds?.length||entry.slot.allowKinds.includes(resident.kind)
    }));
  }

  function postureOptions(kinds){return kinds.map(kind=>({kind,label:C.postureLabel(kind)}));}

  function listResidentFreePostures(authoring,residentId){
    const resident=authoring.residents?.[residentId];
    return resident?postureOptions(C.freePosturesForKind(resident.kind)):[];
  }

  function listResidentSlotPostures(authoring,residentId,slotId){
    const resident=authoring.residents?.[residentId],resolved=uniqueSlot(authoring,slotId);
    if(!resident||!resolved)return [];
    const {slot}=resolved;
    if(slot.allowKinds?.length&&!slot.allowKinds.includes(resident.kind))return [];
    return postureOptions(C.slotPosturesForKind(resident.kind,slot));
  }

  function residentBinding(authoring,residentId){
    const resident=authoring.residents?.[residentId];
    if(!resident)return null;
    const placement=resident.initial?.placement;
    const posture=resident.initial?.posture||{};
    return {
      bound:placement?.mode==='anchor'||!!posture.slotId||!!posture.furnitureId,
      placementMode:placement?.mode||null,
      anchor:placement?.mode==='anchor'?clone(placement.anchor||null):null,
      slotId:posture.slotId||null,
      furnitureId:posture.furnitureId||null,
      postureKind:posture.kind||null
    };
  }

  function furnitureReferenceReport(authoring,furnitureId){
    const furniture=authoring.furniture?.[furnitureId];
    if(!furniture)return [];
    const slotIds=new Set((furniture.slots||[]).map(slot=>slot.id));
    const blockers=[];
    for(const [id,container] of Object.entries(authoring.entities?.containers||{})){
      if(container.supportId===furnitureId)blockers.push({ownerType:'container',ownerId:id,ownerName:container.name||id,referenceKind:'supportId',referenceValue:furnitureId});
    }
    for(const [id,resident] of Object.entries(authoring.residents||{})){
      const placement=resident.initial?.placement,posture=resident.initial?.posture||{};
      if(placement?.mode==='anchor'&&placement.anchor?.kind==='furnitureSlot'&&slotIds.has(placement.anchor.id)){
        blockers.push({ownerType:'resident',ownerId:id,ownerName:resident.name||id,referenceKind:'initial.placement.anchor',referenceValue:placement.anchor.id});
      }
      if(posture.slotId&&slotIds.has(posture.slotId)){
        blockers.push({ownerType:'resident',ownerId:id,ownerName:resident.name||id,referenceKind:'initial.posture.slotId',referenceValue:posture.slotId});
      }
      if(posture.furnitureId===furnitureId){
        blockers.push({ownerType:'resident',ownerId:id,ownerName:resident.name||id,referenceKind:'initial.posture.furnitureId',referenceValue:furnitureId});
      }
    }
    return blockers;
  }

  function moveFurniture(authoring,{furnitureId,target}={}){
    return mutationResult(authoring,candidate=>{
      const furniture=candidate.furniture?.[furnitureId];
      const anchor=furnitureAnchor(furniture);
      if(!furniture)return reject('furniture_missing','找不到 Furniture '+String(furnitureId)+'.',{furnitureId});
      if(!anchor||!target)return reject('furniture_move_target_invalid','Furniture move 需要可用 anchor 與 target。',{furnitureId,target:target||null});
      const dx=target.x-anchor.x,dy=target.y-anchor.y,dz=(target.z??0)-(anchor.z??0);
      furniture.footprint=(furniture.footprint||[]).map(position=>translatePosition(position,dx,dy,dz));
      if(furniture.displayAt)furniture.displayAt=translatePosition(furniture.displayAt,dx,dy,dz);
      for(const slot of furniture.slots||[])if(slot.position)slot.position=translatePosition(slot.position,dx,dy,dz);
      const followers=[];
      const followerPositions=[];
      for(const [containerId,container] of Object.entries(candidate.entities?.containers||{})){
        if(container.supportId!==furnitureId)continue;
        if(container.position)container.position=translatePosition(container.position,dx,dy,dz);
        for(const port of container.interactionPorts||[])if(port.position)port.position=translatePosition(port.position,dx,dy,dz);
        followers.push(containerId);
        if(container.position)followerPositions.push({id:containerId,position:clone(container.position)});
      }
      return {meta:{
        operation:'moveFurniture',
        furnitureId,
        delta:{dx,dy,dz},
        followers,
        preview:{
          footprint:clone(furniture.footprint||[]),
          displayAt:clone(furniture.displayAt||null),
          followerPositions
        }
      }};
    });
  }

  function moveObject(authoring,{entityType,entityId,target,supportChoice=null}={}){
    if(!['container','source'].includes(entityType)){
      return {ok:false,candidate:null,issues:[issue('object_type_unsupported','Object move 只支援 container / source。',{entityType,entityId})],meta:{}};
    }
    return mutationResult(authoring,candidate=>{
      const collection=entityType==='container'?candidate.entities?.containers:candidate.entities?.sources;
      const entity=collection?.[entityId];
      if(!entity)return reject('object_missing','找不到 '+entityType+' '+String(entityId)+'.',{entityType,entityId});
      if(!entity.position||!target)return reject('object_move_target_invalid','Object move 需要目前 position 與 target。',{entityType,entityId,target:target||null});
      const dx=target.x-entity.position.x,dy=target.y-entity.position.y,dz=(target.z??0)-(entity.position.z??0);
      entity.position=translatePosition(entity.position,dx,dy,dz);
      for(const port of entity.interactionPorts||[])if(port.position)port.position=translatePosition(port.position,dx,dy,dz);
      if(entityType==='source')return {meta:{operation:'moveObject',entityType,entityId,delta:{dx,dy,dz}}};

      const previousSupport=entity.supportId||null;
      const previousFurniture=previousSupport?candidate.furniture?.[previousSupport]:null;
      const remainsOnPrevious=!!previousFurniture&&(previousFurniture.footprint||[]).some(position=>samePosition(position,entity.position));
      const candidates=listSupportCandidates(candidate,entity.position);
      if(remainsOnPrevious){
        entity.supportId=previousSupport;
      }else if(supportChoice?.kind==='floor'){
        delete entity.supportId;
      }else if(supportChoice?.kind==='furniture'){
        const supportId=supportChoice.furnitureId;
        const allowed=candidates.find(item=>item.id===supportId);
        if(!allowed)return reject('support_choice_invalid','指定 support 不在 target footprint，或不是 supportsObjects Furniture。',{entityId,supportId,target:clone(entity.position)},{candidates});
        entity.supportId=supportId;
      }else if(candidates.length){
        return reject('support_choice_required','Target 同時可解讀為 Floor 或 Furniture support；必須明確選擇。',{entityId,target:clone(entity.position)},{candidates,target:clone(entity.position),previousSupport});
      }else{
        delete entity.supportId;
      }
      return {meta:{operation:'moveObject',entityType,entityId,delta:{dx,dy,dz},supportId:entity.supportId||null,previousSupport}};
    });
  }

  function nextFurnitureId(authoring,sourceId){
    const furniture=authoring.furniture||{};
    const base=sourceId+'-copy';
    if(!furniture[base])return base;
    for(let i=2;;i++)if(!furniture[base+'-'+i])return base+'-'+i;
  }

  function uniqueSlotId(base,used){
    if(!used.has(base)){used.add(base);return base;}
    for(let i=2;;i++){
      const candidate=base+'-'+i;
      if(!used.has(candidate)){used.add(candidate);return candidate;}
    }
  }

  function duplicateFurniture(authoring,{sourceId,target}={}){
    return mutationResult(authoring,candidate=>{
      const source=candidate.furniture?.[sourceId];
      const anchor=furnitureAnchor(source);
      if(!source)return reject('furniture_missing','找不到要複製的 Furniture '+String(sourceId)+'.',{sourceId});
      if(!anchor||!target)return reject('furniture_duplicate_target_invalid','Furniture duplicate 需要 source anchor 與 target。',{sourceId,target:target||null});
      const newId=nextFurnitureId(candidate,sourceId);
      const copy=clone(source);
      copy.id=newId;
      const used=new Set(allSlots(candidate).map(entry=>entry.slot.id));
      const slotIdMap={};
      copy.slots=(copy.slots||[]).map((slot,index)=>{
        const next=clone(slot);
        const semanticPrefix=typeof slot.id==='string'&&slot.id.startsWith(sourceId+':');
        const suffix=semanticPrefix?slot.id.slice(sourceId.length+1):'slot-'+(index+1);
        const base=newId+':'+suffix;
        next.id=uniqueSlotId(base,used);
        if(slot.id)slotIdMap[slot.id]=next.id;
        return next;
      });
      const dx=target.x-anchor.x,dy=target.y-anchor.y,dz=(target.z??0)-(anchor.z??0);
      copy.footprint=(copy.footprint||[]).map(position=>translatePosition(position,dx,dy,dz));
      if(copy.displayAt)copy.displayAt=translatePosition(copy.displayAt,dx,dy,dz);
      for(const slot of copy.slots||[])if(slot.position)slot.position=translatePosition(slot.position,dx,dy,dz);
      candidate.furniture??={};
      candidate.furniture[newId]=copy;
      return {meta:{operation:'duplicateFurniture',sourceId,newId,slotIdMap,delta:{dx,dy,dz}}};
    });
  }

  function deleteFurniture(authoring,{furnitureId}={}){
    const blockers=furnitureReferenceReport(authoring,furnitureId);
    if(!authoring.furniture?.[furnitureId]){
      return {ok:false,candidate:null,issues:[issue('furniture_missing','找不到 Furniture '+String(furnitureId)+'.',{furnitureId})],meta:{blockers:[]}};
    }
    if(blockers.length){
      return {ok:false,candidate:null,issues:[issue('furniture_delete_blocked','Furniture 仍被其他 authored entity 引用；delete 已拒絕。',{furnitureId,blockers:clone(blockers)})],meta:{blockers:clone(blockers)}};
    }
    return mutationResult(authoring,candidate=>{
      delete candidate.furniture[furnitureId];
      return {meta:{operation:'deleteFurniture',furnitureId}};
    });
  }

  function moveResidentToExact(authoring,{residentId,target,postureKind}={}){
    return mutationResult(authoring,candidate=>{
      const resident=candidate.residents?.[residentId];
      if(!resident)return reject('resident_missing','找不到 Resident '+String(residentId)+'.',{residentId});
      if(!target)return reject('resident_move_target_invalid','Resident move 缺少 target。',{residentId});
      const allowed=C.freePosturesForKind(resident.kind);
      if(!allowed.includes(postureKind)){
        return reject('resident_free_posture_unsupported','Resident free posture 不受該居民能力支援。',{residentId,kind:resident.kind,postureKind,allowed:clone(allowed)});
      }
      const binding=residentBinding(candidate,residentId);
      resident.initial??={};
      resident.initial.placement={mode:'exact',node:clone(target)};
      resident.initial.posture={kind:postureKind};
      return {meta:{operation:'moveResidentToExact',residentId,postureKind,detachedBinding:!!binding?.bound,previousBinding:clone(binding)}};
    });
  }

  function rebindResidentToSlot(authoring,{residentId,slotId,postureKind}={}){
    return mutationResult(authoring,candidate=>{
      const resident=candidate.residents?.[residentId];
      if(!resident)return reject('resident_missing','找不到 Resident '+String(residentId)+'.',{residentId});
      if(!C.ALL_POSTURES.includes(postureKind))return reject('resident_posture_invalid','重新綁定 slot 時必須明確選擇合法 posture。',{residentId,slotId,postureKind});
      const resolved=uniqueSlot(candidate,slotId);
      if(!resolved)return reject('resident_slot_missing_or_ambiguous','Target furnitureSlot 不存在或不唯一。',{residentId,slotId});
      const {slot,furnitureId}=resolved;
      if(slot.allowKinds?.length&&!slot.allowKinds.includes(resident.kind)){
        return reject('resident_slot_kind_mismatch','Resident kind 不在 slot.allowKinds。',{residentId,slotId,kind:resident.kind,allowKinds:clone(slot.allowKinds)});
      }
      const allowed=C.slotPosturesForKind(resident.kind,slot);
      if(!allowed.includes(postureKind)){
        return reject('resident_slot_posture_unsupported','Resident posture 不受該居民能力或 slot 能力支援。',{residentId,slotId,kind:resident.kind,postureKind,allowed:clone(allowed)});
      }
      resident.initial??={};
      resident.initial.placement={mode:'anchor',anchor:{kind:'furnitureSlot',id:slotId}};
      resident.initial.posture={kind:postureKind,slotId,furnitureId};
      return {meta:{operation:'rebindResidentToSlot',residentId,slotId,furnitureId,postureKind}};
    });
  }

  window.SimEditorAuthoringMutations={
    moveFurniture,
    moveObject,
    duplicateFurniture,
    deleteFurniture,
    moveResidentToExact,
    rebindResidentToSlot,
    listSupportCandidates,
    listResidentSlots,
    listResidentFreePostures,
    listResidentSlotPostures,
    residentBinding,
    furnitureReferenceReport
  };
})();