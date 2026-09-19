(() => {
  const A=window.SimWorldAuthoring;
  const M=window.SimEditorAuthoringMutations;
  if(!A?.DEFAULT_WORLD_AUTHORING||!A?.validateAuthoring||!A?.serializeAuthoring||!M?.moveFurniture||!M?.moveObject){
    throw new Error('World authoring helpers and editor mutation owner must load before editor-ui.js.');
  }

  const $=id=>document.getElementById(id);
  const cloneUi=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let authored=A.canonicalizeAuthoring(A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING));
  let baselineFingerprint=A.semanticFingerprint(authored);
  let currentZ=authored.map.layers.some(layer=>layer.z===0)?0:authored.map.layers[0].z;
  let selectedTool='floor';
  let selectedFurnitureId=Object.keys(authored.furniture||{})[0]||null;
  let selection=null;
  let pendingOperation=null;
  let operationIssues=[];
  let lastOperationMeta=null;
  let transientMessage='';

  function layers(){return [...(authored.map.layers||[])].sort((a,b)=>a.z-b.z);}
  function layerAt(z){return (authored.map.layers||[]).find(layer=>layer.z===z)||null;}
  function fingerprint(){return A.semanticFingerprint(authored);}
  function isDirty(){return fingerprint()!==baselineFingerprint;}
  function report(){return A.validateAuthoring(authored);}
  function derivedTopology(z=currentZ){return A.deriveHorizontalTopology(authored,{z});}
  function zLabel(z){return z===0?'Z 0・地面':z>0?`Z +${z}`:`Z ${z}`;}
  function cellId(x,y){return `${x},${y}`;}
  function cellAt(layer,x,y){return layer?.cells?.[cellId(x,y)]||null;}
  function setMessage(message=''){transientMessage=message;}
  function clearOperationState({clearIssues=true}={}){
    pendingOperation=null;
    if(clearIssues)operationIssues=[];
  }
  function beginOperation(operation,message=''){
    pendingOperation=cloneUi(operation);
    operationIssues=[];
    lastOperationMeta=null;
    setMessage(message);
    render();
  }
  function commitMutation(result,{message='',select=null,keepPendingOnFailure=true}={}){
    lastOperationMeta=cloneUi(result?.meta||null);
    if(!result?.ok){
      operationIssues=cloneUi(result?.issues||[]);
      if(!keepPendingOnFailure)pendingOperation=null;
      setMessage(result?.issues?.[0]?.message||'操作被拒絕。');
      render();
      return false;
    }
    authored=result.candidate;
    operationIssues=[];
    pendingOperation=null;
    if(select){
      selection={kind:'entity',type:select.type,id:select.id};
      if(select.type==='furniture')selectedFurnitureId=select.id;
    }
    setMessage(message);
    render();
    return true;
  }

  function residentPosition(resident){
    const placement=resident?.initial?.placement;
    if(placement?.mode==='exact')return placement.node||null;
    if(placement?.mode==='anchor'&&placement.anchor?.kind==='furnitureSlot'){
      const matches=[];
      for(const furniture of Object.values(authored.furniture||{})){
        for(const slot of furniture.slots||[])if(slot.id===placement.anchor.id)matches.push(slot.position);
      }
      return matches.length===1?matches[0]:null;
    }
    return null;
  }

  function furniturePosition(furniture){
    return furniture?.displayAt||furniture?.footprint?.[0]||furniture?.slots?.[0]?.position||null;
  }

  function sceneEntries(){
    const out=[];
    const push=(type,id,entity,position,icon,label)=>out.push({type,id,entity,position:position||null,icon:icon||'•',label});
    for(const [id,furniture] of Object.entries(authored.furniture||{}))push('furniture',id,furniture,furniturePosition(furniture),furniture.icon||'▰','Furniture');
    for(const [id,container] of Object.entries(authored.entities?.containers||{}))push('container',id,container,container.position,container.icon||'◈','Object · Container');
    for(const [id,source] of Object.entries(authored.entities?.sources||{}))push('source',id,source,source.position,source.icon||'◆','Object · Source');
    for(const [id,resident] of Object.entries(authored.residents||{}))push('resident',id,resident,residentPosition(resident),resident.icon||(resident.kind==='cat'?'🐈':'👤'),'Resident');
    return out;
  }

  function sceneEntry(type,id){return sceneEntries().find(entry=>entry.type===type&&entry.id===id)||null;}

  function selectionPosition(){
    if(!selection)return null;
    if(selection.kind==='cell')return {x:selection.x,y:selection.y,z:selection.z};
    if(selection.kind==='entity')return sceneEntry(selection.type,selection.id)?.position||null;
    return null;
  }

  function selectSceneEntity(type,id){
    const entry=sceneEntry(type,id);
    if(!entry)return;
    clearOperationState();
    lastOperationMeta=null;
    selection={kind:'entity',type,id};
    if(type==='furniture')selectedFurnitureId=id;
    if(entry.position&&layerAt(entry.position.z??0))currentZ=entry.position.z??0;
    setMessage('');
    render();
  }

  function allAuthoredPositions(){
    const out=[];
    const push=(position,label)=>{if(position&&Number.isInteger(position.z))out.push({position,label});};
    for(const [id,furniture] of Object.entries(authored.furniture||{})){
      for(const p of furniture.footprint||[])push(p,`furniture:${id}`);
      if(furniture.displayAt)push(furniture.displayAt,`furniture-display:${id}`);
      for(const slot of furniture.slots||[])push(slot.position,`slot:${slot.id}`);
    }
    for(const [id,container] of Object.entries(authored.entities?.containers||{})){
      push(container.position,`container:${id}`);
      for(const port of container.interactionPorts||[])push(port.position,`container-port:${id}`);
    }
    for(const [id,source] of Object.entries(authored.entities?.sources||{})){
      push(source.position,`source:${id}`);
      for(const port of source.interactionPorts||[])push(port.position,`source-port:${id}`);
    }
    for(const [id,resident] of Object.entries(authored.residents||{})){
      const position=residentPosition(resident);
      if(position)push(position,`resident:${id}`);
    }
    return out;
  }

  function layerReferenceCount(z){
    return allAuthoredPositions().filter(entry=>entry.position.z===z).length;
  }

  function terrainForTool(tool){
    return tool==='floor'?'floor':tool==='wall'?'wall':tool==='opening'?'doorway':null;
  }

  function setTerrain(x,y,tool){
    const layer=layerAt(currentZ);
    if(!layer)return;
    const id=cellId(x,y);
    if(tool==='erase')delete layer.cells[id];
    else{
      const terrain=terrainForTool(tool);
      if(!terrain)return;
      const previous=layer.cells[id]||{};
      layer.cells[id]={...previous,terrain};
      for(const derived of ['walkable','roomId','furnitureIds'])delete layer.cells[id][derived];
    }
    selection={kind:'cell',x,y,z:currentZ};
    setMessage(tool==='erase'?`已清除 cell ${id}`:`${id} → ${terrainForTool(tool)}`);
    render();
  }

  function handleFurniturePlacement(target){
    if(!selectedFurnitureId){setMessage('請先選擇 furniture instance。');render();return;}
    const furniture=authored.furniture?.[selectedFurnitureId];
    const result=M.moveFurniture(authored,{furnitureId:selectedFurnitureId,target});
    commitMutation(result,{message:result.ok?`已移動 ${furniture?.name||selectedFurnitureId}；explicit supported Containers 已同步平移。`:'',select:result.ok?{type:'furniture',id:selectedFurnitureId}:null});
  }

  function handlePendingCellClick(x,y){
    if(!pendingOperation)return false;
    const target={x,y,z:currentZ};
    const operation=cloneUi(pendingOperation);
    if(operation.kind==='duplicate-furniture'){
      const result=M.duplicateFurniture(authored,{sourceId:operation.furnitureId,target});
      const newId=result?.meta?.newId;
      commitMutation(result,{message:result.ok?`已新增同型家具 ${newId}。`:'',select:result.ok?{type:'furniture',id:newId}:null});
      return true;
    }
    if(operation.kind==='move-object'){
      const result=M.moveObject(authored,{entityType:operation.entityType,entityId:operation.entityId,target});
      if(!result.ok&&result.issues?.some(item=>item.code==='support_choice_required')){
        pendingOperation={kind:'resolve-object-support',entityType:operation.entityType,entityId:operation.entityId,target:cloneUi(target),candidates:cloneUi(result.meta?.candidates||[])};
        operationIssues=cloneUi(result.issues||[]);
        lastOperationMeta=cloneUi(result.meta||null);
        setMessage('此位置可視為 Floor 或 Furniture support；請明確選擇。');
        render();
        return true;
      }
      commitMutation(result,{message:result.ok?'已移動物件。':'',select:result.ok?{type:operation.entityType,id:operation.entityId}:null});
      return true;
    }
    if(operation.kind==='move-resident-exact'){
      const result=M.moveResidentExact(authored,{residentId:operation.residentId,target});
      commitMutation(result,{message:result.ok?'已移動 exact Resident。':'',select:result.ok?{type:'resident',id:operation.residentId}:null});
      return true;
    }
    if(operation.kind==='convert-resident-exact'){
      const result=M.convertResidentToExactStanding(authored,{residentId:operation.residentId,target});
      commitMutation(result,{message:result.ok?'已改為 exact（standing）placement。':'',select:result.ok?{type:'resident',id:operation.residentId}:null});
      return true;
    }
    return false;
  }

  function resolvePendingSupport(supportChoice){
    const operation=pendingOperation;
    if(operation?.kind!=='resolve-object-support')return;
    const result=M.moveObject(authored,{entityType:operation.entityType,entityId:operation.entityId,target:operation.target,supportChoice});
    commitMutation(result,{message:result.ok?(supportChoice.kind==='floor'?'已移到 Floor。':`已移到 support ${supportChoice.furnitureId}。`):'',select:result.ok?{type:operation.entityType,id:operation.entityId}:null});
  }

  function deleteSelectedFurniture(furnitureId){
    const result=M.deleteFurniture(authored,{furnitureId});
    lastOperationMeta=cloneUi(result?.meta||null);
    if(!result.ok){
      operationIssues=cloneUi(result.issues||[]);
      setMessage(result.issues?.[0]?.message||'刪除被拒絕。');
      render();
      return;
    }
    authored=result.candidate;
    operationIssues=[];
    pendingOperation=null;
    selection=null;
    if(selectedFurnitureId===furnitureId)selectedFurnitureId=Object.keys(authored.furniture||{})[0]||null;
    setMessage(`已刪除 Furniture ${furnitureId}。`);
    render();
  }

  function confirmResidentRebind(){
    const operation=pendingOperation;
    if(operation?.kind!=='rebind-resident-slot')return;
    if(!operation.slotId||!operation.postureKind){
      operationIssues=[{code:'resident_rebind_selection_required',message:'請明確選擇 furnitureSlot 與 posture。'}];
      setMessage(operationIssues[0].message);
      render();
      return;
    }
    const result=M.rebindResidentToSlot(authored,{residentId:operation.residentId,slotId:operation.slotId,postureKind:operation.postureKind});
    commitMutation(result,{message:result.ok?'已重新綁定 Resident slot / posture。':'',select:result.ok?{type:'resident',id:operation.residentId}:null});
  }

  function handleCellClick(x,y){
    if(selectedTool==='furniture'){
      handleFurniturePlacement({x,y,z:currentZ});
      return;
    }
    setTerrain(x,y,selectedTool);
  }

  function addLayer(){
    const z=Number($('newLayerZ').value);
    if(!Number.isInteger(z)){setMessage('Z-level 必須是整數。');render();return;}
    if(layerAt(z)){setMessage(`Z ${z} 已存在。`);render();return;}
    authored.map.layers.push({z,cells:{}});
    authored.map.layers.sort((a,b)=>a.z-b.z);
    currentZ=z;
    selection=null;
    setMessage(`已新增 Z ${z} 空層。`);
    render();
  }

  function deleteCurrentLayer(){
    const layer=layerAt(currentZ);
    if(!layer)return;
    if(layers().length<=1){setMessage('至少必須保留一個 Z-level。');render();return;}
    const cellCount=Object.keys(layer.cells||{}).length,refs=layerReferenceCount(currentZ);
    if(cellCount||refs){setMessage(`Z ${currentZ} 仍有 ${cellCount} 個 cells、${refs} 個 position references；不自動刪除或搬移。`);render();return;}
    const oldZ=currentZ;
    authored.map.layers=authored.map.layers.filter(item=>item!==layer);
    const list=layers();
    currentZ=list.reduce((best,item)=>Math.abs(item.z-oldZ)<Math.abs(best.z-oldZ)?item:best,list[0]).z;
    selection=null;
    setMessage(`已刪除空層 Z ${oldZ}。`);
    render();
  }

  function navigateLayer(delta){
    const list=layers(),index=list.findIndex(layer=>layer.z===currentZ),target=list[index+delta];
    if(!target)return;
    currentZ=target.z;
    selection=null;
    setMessage('');
    render();
  }

  function setCurrentLayer(z){
    if(!layerAt(z))return;
    currentZ=z;
    selection=null;
    setMessage('');
    render();
  }

  function loadDocument(next,{clean=true,message='已載入 authoring document。'}={}){
    A.assertValidAuthoring(next);
    authored=A.canonicalizeAuthoring(A.cloneAuthoring(next));
    if(clean)baselineFingerprint=A.semanticFingerprint(authored);
    const list=layers();
    currentZ=list.some(layer=>layer.z===0)?0:list[0].z;
    selectedFurnitureId=Object.keys(authored.furniture||{})[0]||null;
    selection=null;
    pendingOperation=null;
    operationIssues=[];
    lastOperationMeta=null;
    setMessage(message);
    render();
  }

  async function importFile(file){
    if(!file)return;
    try{
      const text=await file.text();
      loadDocument(A.parseAuthoringJSON(text),{clean:true,message:`已匯入 ${file.name}。`});
    }catch(error){
      setMessage(`匯入失敗：${error.message}`);
      render();
    }finally{
      $('importWorld').value='';
    }
  }

  function exportWorld(){
    try{
      const json=A.serializeAuthoring(authored);
      const blob=new Blob([json+'\n'],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      const safeId=String(authored.id||'world').replace(/[^a-zA-Z0-9._-]+/g,'-');
      link.href=url;
      link.download=`${safeId}.world.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),0);
      baselineFingerprint=fingerprint();
      setMessage('已匯出 canonical authoring JSON。');
      render();
    }catch(error){
      setMessage(`無法匯出：${error.message}`);
      render();
    }
  }

  function furnitureAtCell(x,y,z){
    return Object.entries(authored.furniture||{}).filter(([,furniture])=>(furniture.footprint||[]).some(p=>p.x===x&&p.y===y&&(p.z??0)===z));
  }

  function nonFurnitureEntitiesAtCell(x,y,z){
    return sceneEntries().filter(entry=>entry.type!=='furniture'&&entry.position?.x===x&&entry.position?.y===y&&(entry.position?.z??0)===z);
  }

  function renderMap(){
    const host=$('editorMap'),layer=layerAt(currentZ),width=authored.map.width,height=authored.map.height;
    host.style.setProperty('--grid-w',width);
    host.style.setProperty('--grid-h',height);
    const selectedPosition=selectionPosition();
    let html='';
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const cell=cellAt(layer,x,y),terrain=cell?.terrain||'void',furniture=furnitureAtCell(x,y,currentZ),entities=nonFurnitureEntitiesAtCell(x,y,currentZ);
      const selected=selectedPosition?.x===x&&selectedPosition?.y===y&&(selectedPosition?.z??0)===currentZ;
      const furnitureName=furniture.map(([id,item])=>item.name||id).join('、');
      const entityName=entities.map(entry=>entry.entity.name||entry.id).join('、');
      const furnitureMarkup=furniture.length?furniture.map(([id,item])=>{
        const isSelected=selection?.kind==='entity'&&selection.type==='furniture'&&selection.id===id;
        const isTarget=id===selectedFurnitureId;
        return `<span class="furniture-mark ${isSelected?'selected':''} ${isTarget?'placement-target':''} ${furniture.length>1?'multi':''}" data-entity-type="furniture" data-entity-id="${esc(id)}" title="Furniture：${esc(item.name||id)}${isTarget?' · placement target':''}">${esc(item.icon||'▰')}</span>`;
      }).join(''):'';
      const entityMarkup=entities.length?`<span class="entity-markers">${entities.slice(0,3).map(entry=>{
        const isSelected=selection?.kind==='entity'&&selection.type===entry.type&&selection.id===entry.id;
        return `<span class="entity-marker marker-${esc(entry.type)} ${isSelected?'selected':''}" data-entity-type="${esc(entry.type)}" data-entity-id="${esc(entry.id)}" title="${esc(entry.label)}：${esc(entry.entity.name||entry.id)}">${esc(entry.icon)}</span>`;
      }).join('')}${entities.length>3?`<span class="entity-overflow">+${entities.length-3}</span>`:''}</span>`:'';
      html+=`<button class="author-cell terrain-${esc(terrain)} ${selected?'selected-cell':''}" type="button" data-cell="${x},${y}" aria-label="(${x},${y},${currentZ}) ${esc(terrain)}" title="(${x}, ${y}, ${currentZ})・${esc(terrain)}${furnitureName?'・Furniture: '+esc(furnitureName):''}${entityName?'・Entities: '+esc(entityName):''}"><span class="cell-coord">${x},${y}</span>${furnitureMarkup}${entityMarkup}</button>`;
    }
    host.innerHTML=html;
  }

  function renderLayers(){
    const list=layers(),select=$('layerSelect');
    select.innerHTML=list.map(layer=>`<option value="${layer.z}" ${layer.z===currentZ?'selected':''}>${esc(zLabel(layer.z))}</option>`).join('');
    const index=list.findIndex(layer=>layer.z===currentZ);
    $('layerPrev').disabled=index<=0;
    $('layerNext').disabled=index<0||index>=list.length-1;
    $('layerTitle').textContent=`Z = ${currentZ}`;
    const layer=layerAt(currentZ),cellCount=Object.keys(layer?.cells||{}).length,refs=layerReferenceCount(currentZ);
    $('layerSummary').textContent=`${cellCount} authored cells・${refs} positioned references`;
    const proposed=Math.max(...list.map(layer=>layer.z))+1;
    if(document.activeElement!==$('newLayerZ'))$('newLayerZ').value=String(proposed);
  }

  function renderTools(){
    document.querySelectorAll('[data-tool]').forEach(button=>button.classList.toggle('active',button.dataset.tool===selectedTool));
  }

  function renderSceneList(){
    const host=$('sceneList'),entries=sceneEntries();
    const groups=[
      ['Furniture',entries.filter(entry=>entry.type==='furniture')],
      ['Objects',entries.filter(entry=>entry.type==='container'||entry.type==='source')],
      ['Residents',entries.filter(entry=>entry.type==='resident')]
    ];
    host.innerHTML=groups.map(([label,items])=>`<div class="scene-group"><div class="scene-group-head"><span>${esc(label)}</span><span>${items.length}</span></div><div class="scene-items">${items.length?items.map(entry=>{
      const selected=selection?.kind==='entity'&&selection.type===entry.type&&selection.id===entry.id;
      const placementTarget=entry.type==='furniture'&&entry.id===selectedFurnitureId;
      const position=entry.position?`(${entry.position.x}, ${entry.position.y}, ${entry.position.z??0})`:'position unresolved';
      return `<button class="scene-item ${selected?'selected':''} ${placementTarget?'placement-target':''}" type="button" data-scene-type="${esc(entry.type)}" data-scene-id="${esc(entry.id)}"><span class="scene-icon">${esc(entry.icon)}</span><span class="scene-copy"><b>${esc(entry.entity.name||entry.id)}</b><small>${esc(entry.label)} · ${esc(position)}${placementTarget?' · placement target':''}</small></span></button>`;
    }).join(''):'<div class="scene-empty">目前沒有項目</div>'}</div></div>`).join('');
  }

  function renderSummary(validation,topology){
    const layerList=layers(),furnitureCount=Object.keys(authored.furniture||{}).length,residentCount=Object.keys(authored.residents||{}).length;
    $('documentSummary').innerHTML=[
      ['ID',authored.id||'—'],
      ['Schema',authored.authoringSchema],
      ['Bounds',`${authored.map.width} × ${authored.map.height}`],
      ['Z-levels',layerList.map(layer=>layer.z).join(', ')],
      ['Furniture',furnitureCount],
      ['Residents',residentCount],
      ['Horizontal components',topology?topology.components.length:'—'],
      ['Validation',validation.ok?'valid':`${validation.errors.length} error(s)`]
    ].map(([key,value])=>`<div class="key">${esc(key)}</div><div>${esc(value)}</div>`).join('');

    const position=selectionPosition();
    let heading='',details='';
    if(selection?.kind==='entity'){
      const entry=sceneEntry(selection.type,selection.id);
      if(entry){
        heading=`${esc(entry.icon)} ${esc(entry.entity.name||entry.id)}`;
        details=`<br>${esc(entry.label)} · <code>${esc(entry.id)}</code>`;
        if(entry.type==='furniture')details+=`<br>footprint: ${(entry.entity.footprint||[]).length} cell(s)`;
        if((entry.type==='container'||entry.type==='source')&&entry.entity.supportId)details+=`<br>support: <code>${esc(entry.entity.supportId)}</code>`;
        if(entry.type==='resident'){
          const placement=entry.entity.initial?.placement;
          details+=`<br>placement: <code>${esc(placement?.mode||'—')}</code>`;
          if(placement?.mode==='anchor')details+=` · <code>${esc(placement.anchor?.id||'—')}</code>`;
        }
      }
    }else if(selection?.kind==='cell'){
      heading=`Cell (${selection.x}, ${selection.y}, ${selection.z})`;
    }

    if(position){
      const z=position.z??0,layer=layerAt(z),cell=cellAt(layer,position.x,position.y),furniture=furnitureAtCell(position.x,position.y,z);
      const derived=z===currentZ?topology?.cells?.[cellId(position.x,position.y)]:null;
      details+=`<br>position: <code>(${position.x}, ${position.y}, ${z})</code><br>terrain: <code>${esc(cell?.terrain||'void')}</code>`;
      if(cell?.material)details+=`<br>material: <code>${esc(cell.material)}</code>`;
      if(furniture.length)details+=`<br>furniture here: ${furniture.map(([id,item])=>esc(item.name||id)).join('、')}`;
      if(derived){
        details+=`<br>derived: <code>${derived.structuralOpen?'structural-open':'structural-closed'}</code> · <code>${derived.open?'connected-open':'blocked'}</code>${derived.componentId?` · ${esc(derived.componentId)}`:''}`;
        if(derived.blockedBy.length)details+=`<br>blocked by: ${derived.blockedBy.map(esc).join('、')}`;
        if(derived.under.length)details+=`<br>under clearance: ${derived.under.map(item=>`${esc(item.furnitureId)} ${item.clearanceHeight??'—'}m`).join('、')}`;
      }
    }
    if(heading)$('selectionSummary').innerHTML=`<b>${heading}</b>${details}${transientMessage?`<br><br><span>${esc(transientMessage)}</span>`:''}`;
    else $('selectionSummary').textContent=transientMessage||'尚未選取。';
  }

  function renderSelectionActions(){
    const host=$('selectionActions');
    if(!host)return;
    const entry=selection?.kind==='entity'?sceneEntry(selection.type,selection.id):null;
    const issueMarkup=operationIssues.length?`<div class="operation-issues">${operationIssues.map(item=>{
      const blockers=Array.isArray(item.blockers)?item.blockers:[];
      return `<div class="operation-issue"><b>${esc(item.code||'mutation_rejected')}</b><span>${esc(item.message||'操作被拒絕。')}</span>${blockers.map(blocker=>`<small>${esc(blocker.ownerType)} · ${esc(blocker.ownerName||blocker.ownerId)} (<code>${esc(blocker.ownerId)}</code>) → ${esc(blocker.referenceKind)} = <code>${esc(blocker.referenceValue)}</code></small>`).join('')}</div>`;
    }).join('')}</div>`:'';
    let pendingMarkup='';
    if(pendingOperation){
      const operation=pendingOperation;
      const labels={'duplicate-furniture':'下一次點擊：放置新增同型家具','move-object':'下一次點擊：移動物件','resolve-object-support':'選擇物件承載關係','move-resident-exact':'下一次點擊：移動 exact Resident','convert-resident-exact':'下一次點擊：改為 exact（standing）','rebind-resident-slot':'重新綁定 furnitureSlot'};
      pendingMarkup+=`<div class="pending-operation"><b>${esc(labels[operation.kind]||operation.kind)}</b>`;
      if(operation.kind==='resolve-object-support'){
        pendingMarkup+=`<small>target: <code>(${operation.target.x}, ${operation.target.y}, ${operation.target.z})</code></small><div class="action-row"><button type="button" data-editor-action="resolve-support" data-support-kind="floor">Floor</button>${(operation.candidates||[]).map(candidate=>`<button type="button" data-editor-action="resolve-support" data-support-kind="furniture" data-support-id="${esc(candidate.id)}">Support：${esc(candidate.name||candidate.id)}</button>`).join('')}</div>`;
      }else if(operation.kind==='rebind-resident-slot'){
        const slots=M.listResidentSlots(authored,operation.residentId).filter(slot=>slot.compatible);
        pendingMarkup+=`<label class="operation-field">Furniture slot<select data-operation-field="slotId"><option value="">請選擇…</option>${slots.map(slot=>`<option value="${esc(slot.id)}" ${operation.slotId===slot.id?'selected':''}>${esc(slot.furnitureName)} · ${esc(slot.label)} (${slot.position.x},${slot.position.y},${slot.position.z??0})</option>`).join('')}</select></label>`;
        pendingMarkup+=`<label class="operation-field">Posture<select data-operation-field="postureKind"><option value="">請選擇…</option>${['standing','sitting','lying','kneeling','prone'].map(kind=>`<option value="${kind}" ${operation.postureKind===kind?'selected':''}>${kind}</option>`).join('')}</select></label><button type="button" data-editor-action="confirm-resident-rebind" ${!operation.slotId||!operation.postureKind?'disabled':''}>套用 slot rebind</button>`;
      }else{
        pendingMarkup+='<small>點擊地圖 cell 執行；失敗時原 canonical document 不會改變。</small>';
      }
      pendingMarkup+='<button type="button" class="ghost-action" data-editor-action="cancel-operation">取消 pending operation</button></div>';
    }
    let entityMarkup='';
    if(entry?.type==='furniture'){
      entityMarkup=`<div class="action-row"><button type="button" data-editor-action="arm-furniture-placement">啟用家具放置</button><button type="button" data-editor-action="duplicate-furniture">新增同型家具</button><button type="button" class="danger-action" data-editor-action="delete-furniture">刪除家具</button></div>`;
    }else if(entry?.type==='container'||entry?.type==='source'){
      entityMarkup=`<div class="action-row"><button type="button" data-editor-action="move-object">移動物件</button></div>`;
    }else if(entry?.type==='resident'){
      const binding=M.residentBinding(authored,entry.id);
      entityMarkup=`<div class="action-row"><button type="button" data-editor-action="move-resident-exact">移動居民（exact only）</button><button type="button" data-editor-action="convert-resident-exact">改為 exact（standing）</button><button type="button" data-editor-action="rebind-resident-slot">重新綁定 slot</button></div><small class="operation-note">binding: ${binding?.bound?'bound':'unbound'} · posture: ${esc(binding?.postureKind||'—')}</small>`;
    }
    const metaMarkup=lastOperationMeta?`<div class="operation-meta">last operation: <code>${esc(lastOperationMeta.operation||lastOperationMeta.phase||'result')}</code></div>`:'';
    host.innerHTML=pendingMarkup+entityMarkup+issueMarkup+metaMarkup;
  }

  function renderValidation(validation){
    const dirty=isDirty();
    $('dirtyStatus').textContent=dirty?'有未匯出修改':'未修改';
    $('dirtyStatus').className=`status-pill ${dirty?'dirty':'clean'}`;
    $('validationStatus').textContent=validation.ok?'Schema valid':`Schema invalid · ${validation.errors.length}`;
    $('validationStatus').className=`status-pill ${validation.ok?'clean':'invalid'}`;
    $('exportWorld').disabled=!validation.ok;
    $('validationList').innerHTML=validation.ok?'<div class="validation-ok">✓ canonical authoring schema valid</div>':validation.errors.slice(0,12).map(issue=>`<div class="validation-item"><b>${esc(issue.code)}</b><br><code>${esc(issue.path)}</code><br>${esc(issue.message)}</div>`).join('');
  }

  function render(){
    const validation=report(),topology=validation.ok?derivedTopology():null;
    renderLayers();
    renderTools();
    renderSceneList();
    renderMap();
    renderSummary(validation,topology);
    renderSelectionActions();
    renderValidation(validation);
  }

  $('editorMap').addEventListener('click',event=>{
    const cell=event.target.closest('[data-cell]');
    if(cell&&pendingOperation){
      const [x,y]=cell.dataset.cell.split(',').map(Number);
      if(handlePendingCellClick(x,y))return;
    }
    const entity=event.target.closest('[data-entity-type][data-entity-id]');
    if(entity){
      selectSceneEntity(entity.dataset.entityType,entity.dataset.entityId);
      return;
    }
    if(!cell)return;
    const [x,y]=cell.dataset.cell.split(',').map(Number);
    handleCellClick(x,y);
  });
  document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>{
    selectedTool=button.dataset.tool;
    clearOperationState();
    lastOperationMeta=null;
    setMessage('');
    render();
  }));
  $('sceneList').addEventListener('click',event=>{
    const item=event.target.closest('[data-scene-type][data-scene-id]');
    if(!item)return;
    selectSceneEntity(item.dataset.sceneType,item.dataset.sceneId);
  });
  $('selectionActions').addEventListener('click',event=>{
    const button=event.target.closest('[data-editor-action]');
    if(!button)return;
    const action=button.dataset.editorAction;
    const entry=selection?.kind==='entity'?sceneEntry(selection.type,selection.id):null;
    if(action==='cancel-operation'){clearOperationState();lastOperationMeta=null;setMessage('');render();return;}
    if(action==='resolve-support'){resolvePendingSupport(button.dataset.supportKind==='floor'?{kind:'floor'}:{kind:'furniture',furnitureId:button.dataset.supportId});return;}
    if(action==='confirm-resident-rebind'){confirmResidentRebind();return;}
    if(!entry)return;
    if(action==='arm-furniture-placement'&&entry.type==='furniture'){selectedFurnitureId=entry.id;selectedTool='furniture';clearOperationState();setMessage('Furniture placement 已啟用；點擊地圖決定新 anchor。');render();return;}
    if(action==='duplicate-furniture'&&entry.type==='furniture'){beginOperation({kind:'duplicate-furniture',furnitureId:entry.id},'新增同型家具：下一次點擊決定 anchor。');return;}
    if(action==='delete-furniture'&&entry.type==='furniture'){deleteSelectedFurniture(entry.id);return;}
    if(action==='move-object'&&(entry.type==='container'||entry.type==='source')){beginOperation({kind:'move-object',entityType:entry.type,entityId:entry.id},'移動物件：下一次點擊決定 target。');return;}
    if(action==='move-resident-exact'&&entry.type==='resident'){beginOperation({kind:'move-resident-exact',residentId:entry.id},'移動 Resident：只允許 unbound exact placement。');return;}
    if(action==='convert-resident-exact'&&entry.type==='resident'){beginOperation({kind:'convert-resident-exact',residentId:entry.id},'改為 exact（standing）：下一次點擊決定 target。');return;}
    if(action==='rebind-resident-slot'&&entry.type==='resident'){beginOperation({kind:'rebind-resident-slot',residentId:entry.id,slotId:'',postureKind:''},'請明確選擇 furnitureSlot 與 posture。');return;}
  });
  $('selectionActions').addEventListener('change',event=>{
    const field=event.target.closest('[data-operation-field]');
    if(!field||pendingOperation?.kind!=='rebind-resident-slot')return;
    pendingOperation={...pendingOperation,[field.dataset.operationField]:field.value};
    operationIssues=[];
    setMessage('請確認 slot 與 posture 後套用。');
    render();
  });
  $('layerPrev').addEventListener('click',()=>navigateLayer(-1));
  $('layerNext').addEventListener('click',()=>navigateLayer(1));
  $('layerSelect').addEventListener('change',event=>setCurrentLayer(Number(event.target.value)));
  $('addLayer').addEventListener('click',addLayer);
  $('deleteLayer').addEventListener('click',deleteCurrentLayer);
  $('importWorld').addEventListener('change',event=>importFile(event.target.files?.[0]));
  $('exportWorld').addEventListener('click',exportWorld);
  $('resetWorld').addEventListener('click',()=>{
    if(isDirty()&&!confirm('放棄尚未匯出的修改並載入預設世界？'))return;
    loadDocument(A.DEFAULT_WORLD_AUTHORING,{clean:true,message:'已重新載入預設 canonical world。'});
  });
  addEventListener('beforeunload',event=>{
    if(!isDirty())return;
    event.preventDefault();
    event.returnValue='';
  });

  window.SimWorldEditor={
    getDocument:()=>A.cloneAuthoring(authored),
    getSession:()=>({currentZ,selectedTool,selectedFurnitureId,selection:selection?{...selection}:null,selectedCell:selectionPosition()?{...selectionPosition()}:null,pendingOperation:cloneUi(pendingOperation),operationIssues:cloneUi(operationIssues),lastOperationMeta:cloneUi(lastOperationMeta),dirty:isDirty(),validation:report()}),
    loadDocument:next=>loadDocument(next,{clean:true,message:'Test/API document loaded.'}),
    semanticFingerprint:fingerprint,
    getDerivedTopology:(z=currentZ)=>derivedTopology(z),
    selectEntity:(type,id)=>selectSceneEntity(type,id)
  };

  render();
})();