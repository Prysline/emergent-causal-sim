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

  function resolvedFurniture(authoring,furnitureId){
    const instance=authoring.furniture?.[furnitureId];
    return instance?A.resolveFurnitureInstance(instance):null;
  }

  function furnitureAnchor(authoring,furnitureId){
    const furniture=resolvedFurniture(authoring,furnitureId);
    return furniture?.displayAt||furniture?.footprint?.[0]||furniture?.slots?.[0]?.position||null;
  }

  function furnitureAtTarget(authoring,target,{supportsObjectsOnly=false}={}){
    const out=[];
    for(const id of Object.keys(authoring.furniture||{}).sort()){
      const furniture=resolvedFurniture(authoring,id);
      if(!furniture)continue;
      if(supportsObjectsOnly&&furniture.supportsObjects!==true)continue;
      if((furniture.footprint||[]).some(position=>samePosition(position,target))){
        out.push({id,name:furniture.name||id,supportsObjects:furniture.supportsObjects===true});
      }
    }
    return out;
  }

  function allSlots(authoring){
    const out=[];
    for(const furnitureId of Object.keys(authoring.furniture||{}).sort()){
      const furniture=resolvedFurniture(authoring,furnitureId);
      for(const slot of furniture?.slots||[])out.push({slot,furnitureId,name:furniture.name||furnitureId});
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
    const furniture=resolvedFurniture(authoring,furnitureId);
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

  function setCellMaterial(authoring,{x,y,z,material}={}){
    return mutationResult(authoring,candidate=>{
      if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z)){
        return reject('cell_material_target_invalid','材質編輯需要有效的 Cell x / y / z。',{x,y,z});
      }
      const layer=(candidate.map?.layers||[]).find(item=>item.z===z);
      const cell=layer?.cells?.[x+','+y];
      if(!cell)return reject('cell_material_cell_missing','只能編輯已建構 Cell 的材質。',{x,y,z});
      if(material!==null&&material!==undefined&&typeof material!=='string'){
        return reject('cell_material_value_invalid','Cell material 必須是字串或空值。',{x,y,z,material});
      }
      const normalized=typeof material==='string'?material.trim():'';
      if(normalized)cell.material=normalized;
      else delete cell.material;
      return {meta:{operation:'setCellMaterial',target:{x,y,z},material:normalized||null}};
    });
  }

  function moveFurniture(authoring,{furnitureId,target}={}){
    return mutationResult(authoring,candidate=>{
      const furniture=candidate.furniture?.[furnitureId];
      if(!furniture)return reject('furniture_missing','找不到 Furniture '+String(furnitureId)+'.',{furnitureId});
      if(!furniture.origin||!target)return reject('furniture_move_target_invalid','Furniture move 需要目前 origin 與 target。',{furnitureId,target:target||null});
      const dx=target.x-furniture.origin.x,dy=target.y-furniture.origin.y,dz=(target.z??0)-(furniture.origin.z??0);
      furniture.origin=clone(target);
      const followers=[];
      const followerPositions=[];
      for(const [containerId,container] of Object.entries(candidate.entities?.containers||{})){
        if(container.supportId!==furnitureId)continue;
        if(container.position)container.position=translatePosition(container.position,dx,dy,dz);
        for(const port of container.interactionPorts||[])if(port.position)port.position=translatePosition(port.position,dx,dy,dz);
        followers.push(containerId);
        if(container.position)followerPositions.push({id:containerId,position:clone(container.position)});
      }
      const preview=A.resolveFurnitureInstance(furniture);
      return {meta:{
        operation:'moveFurniture',
        furnitureId,
        delta:{dx,dy,dz},
        followers,
        preview:{
          footprint:clone(preview.footprint||[]),
          displayAt:clone(preview.displayAt||null),
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
      const previousFurniture=previousSupport?resolvedFurniture(candidate,previousSupport):null;
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

  function nextFurnitureId(authoring,definitionId){
    const furniture=authoring.furniture||{};
    for(let i=1;;i++){
      const candidate=definitionId+'-'+i;
      if(!furniture[candidate])return candidate;
    }
  }

  function createFurnitureFromDefinition(authoring,{definitionId,target,name}={}){
    if(!A.listFurnitureDefinitions().some(definition=>definition.id===definitionId)){
      return {ok:false,candidate:null,issues:[issue('furniture_definition_missing','找不到 Furniture Definition '+String(definitionId)+'.',{definitionId})],meta:{}};
    }
    return mutationResult(authoring,candidate=>{
      if(!target)return reject('furniture_create_target_invalid','新增 Furniture 需要 placement target。',{definitionId});
      const newId=nextFurnitureId(candidate,definitionId);
      const instance={id:newId,definitionId,origin:clone(target)};
      if(typeof name==='string'&&name.trim())instance.name=name.trim();
      candidate.furniture??={};
      candidate.furniture[newId]=instance;
      const resolved=A.resolveFurnitureInstance(instance);
      return {meta:{operation:'createFurnitureFromDefinition',definitionId,newId,preview:{footprint:clone(resolved.footprint||[]),displayAt:clone(resolved.displayAt||null)}}};
    });
  }

  function duplicateFurniture(authoring,{sourceId,target}={}){
    return mutationResult(authoring,candidate=>{
      const source=candidate.furniture?.[sourceId];
      if(!source)return reject('furniture_missing','找不到要複製的 Furniture '+String(sourceId)+'.',{sourceId});
      if(!source.origin||!target)return reject('furniture_duplicate_target_invalid','Furniture duplicate 需要 source origin 與 target。',{sourceId,target:target||null});
      const newId=nextFurnitureId(candidate,source.definitionId);
      const copy={id:newId,definitionId:source.definitionId,origin:clone(target)};
      if(typeof source.name==='string'&&source.name)copy.name=source.name;
      candidate.furniture??={};
      candidate.furniture[newId]=copy;
      const sourceResolved=A.resolveFurnitureInstance(source),copyResolved=A.resolveFurnitureInstance(copy);
      const slotIdMap={};
      for(let index=0;index<Math.min(sourceResolved.slots?.length||0,copyResolved.slots?.length||0);index++){
        slotIdMap[sourceResolved.slots[index].id]=copyResolved.slots[index].id;
      }
      const dx=target.x-source.origin.x,dy=target.y-source.origin.y,dz=(target.z??0)-(source.origin.z??0);
      return {meta:{operation:'duplicateFurniture',sourceId,newId,definitionId:source.definitionId,slotIdMap,delta:{dx,dy,dz}}};
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
    setCellMaterial,
    moveFurniture,
    moveObject,
    createFurnitureFromDefinition,
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