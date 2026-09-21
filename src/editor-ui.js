(() => {
  const A=window.SimWorldAuthoring;
  const C=window.SimEmbodimentCapabilities;
  const M=window.SimEditorAuthoringMutations;
  const P=window.SimEditorPreviewBridge;
  if(!A?.DEFAULT_WORLD_AUTHORING||!A?.validateAuthoring||!A?.serializeAuthoring||!C?.postureLabel||!M?.setCellMaterial||!M?.moveFurniture||!M?.moveObject||!P?.storePreview){
    throw new Error('World authoring helpers, embodiment capabilities, preview bridge, and editor mutation owner must load before editor-ui.js.');
  }

  const $=id=>document.getElementById(id);
  const cloneUi=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const terrainLabel=value=>({floor:'地板',wall:'牆壁',doorway:'開口／門洞',void:'空白'}[value]||value||'空白');
  const materialDisplay=value=>{const labels={wood:'木材',stone:'石材'};return value?(labels[value]?`${labels[value]}（${value}）`:String(value)):'未設定';};
  let authored=A.canonicalizeAuthoring(A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING));
  let baselineFingerprint=A.semanticFingerprint(authored);
  let currentZ=authored.map.layers.some(layer=>layer.z===0)?0:authored.map.layers[0].z;
  let selectedTool='select';
  let selectedFurnitureId=Object.keys(authored.furniture||{})[0]||null;
  let selection=null;
  let pendingOperation=null;
  let operationIssues=[];
  let lastOperationMeta=null;
  let transientMessage='';
  let previewIssues=[];
  let previewIssuesFingerprint=null;
  let allowPreviewNavigation=false;
  const DRAG_THRESHOLD_PX=6;
  let dragState=null;
  let suppressMapClick=false;

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

  function clearDragPreviewDom(){
    const host=$('editorMap');
    if(!host)return;
    host.classList.remove('drag-active','drag-valid','drag-invalid');
    delete host.dataset.dragFurnitureId;
    delete host.dataset.dragState;
    for(const cell of host.querySelectorAll('.drag-ghost-cell,.drag-follower-cell,.drag-drop-target')){
      cell.classList.remove('drag-ghost-cell','drag-follower-cell','drag-drop-target','drag-valid','drag-invalid');
    }
    for(const marker of host.querySelectorAll('.furniture-mark.drag-source'))marker.classList.remove('drag-source');
  }

  function dragCellAt(position){
    if(!position||(position.z??0)!==currentZ)return null;
    return $('editorMap')?.querySelector(`[data-cell="${position.x},${position.y}"]`)||null;
  }

  function applyDragPreviewDom(){
    clearDragPreviewDom();
    if(!dragState?.active)return;
    const host=$('editorMap');
    if(!host)return;
    const validity=dragState.valid?'drag-valid':'drag-invalid';
    host.classList.add('drag-active',validity);
    host.dataset.dragFurnitureId=dragState.furnitureId;
    host.dataset.dragState=dragState.valid?'valid':'invalid';
    const targetCell=dragCellAt(dragState.target);
    if(targetCell)targetCell.classList.add('drag-drop-target',validity);
    for(const position of dragState.preview?.footprint||[]){
      const cell=dragCellAt(position);
      if(cell)cell.classList.add('drag-ghost-cell',validity);
    }
    for(const follower of dragState.preview?.followerPositions||[]){
      const cell=dragCellAt(follower.position);
      if(cell)cell.classList.add('drag-follower-cell',validity);
    }
    for(const marker of host.querySelectorAll('.furniture-mark')){
      if(marker.dataset.entityId===dragState.furnitureId)marker.classList.add('drag-source');
    }
  }

  function dragTargetFromPoint(clientX,clientY){
    const hit=document.elementFromPoint(clientX,clientY);
    const cell=hit?.closest?.('[data-cell]');
    if(!cell||!$('editorMap')?.contains(cell))return null;
    const [x,y]=cell.dataset.cell.split(',').map(Number);
    return {x,y,z:currentZ};
  }

  function updateFurnitureDragPreview(event){
    if(!dragState?.active)return;
    const target=dragTargetFromPoint(event.clientX,event.clientY);
    dragState.target=target;
    if(!target){
      dragState.valid=false;
      dragState.preview=null;
      dragState.issues=[];
      dragState.meta=null;
      applyDragPreviewDom();
      return;
    }
    const result=M.moveFurniture(authored,{furnitureId:dragState.furnitureId,target});
    dragState.valid=!!result.ok;
    dragState.preview=cloneUi(result?.meta?.preview||null);
    dragState.issues=cloneUi(result?.issues||[]);
    dragState.meta=cloneUi(result?.meta||null);
    applyDragPreviewDom();
  }

  function beginFurnitureDrag(event){
    if(event.button!==0||event.pointerType!=='mouse'||pendingOperation)return;
    const marker=event.target.closest('.furniture-mark[data-entity-id]');
    if(!marker)return;
    dragState={
      pointerId:event.pointerId,
      furnitureId:marker.dataset.entityId,
      startX:event.clientX,
      startY:event.clientY,
      active:false,
      target:null,
      valid:null,
      preview:null,
      issues:[],
      meta:null
    };
    marker.setPointerCapture?.(event.pointerId);
  }

  function continueFurnitureDrag(event){
    if(!dragState||event.pointerId!==dragState.pointerId)return;
    if(!dragState.active){
      const distance=Math.hypot(event.clientX-dragState.startX,event.clientY-dragState.startY);
      if(distance<DRAG_THRESHOLD_PX)return;
      dragState.active=true;
      operationIssues=[];
      lastOperationMeta=null;
    }
    event.preventDefault();
    updateFurnitureDragPreview(event);
  }

  function finishFurnitureDrag(event){
    if(!dragState||event.pointerId!==dragState.pointerId)return;
    const completed=dragState;
    const wasActive=completed.active;
    if(wasActive)event.preventDefault();
    clearDragPreviewDom();
    dragState=null;
    if(!wasActive)return;
    suppressMapClick=true;
    setTimeout(()=>{suppressMapClick=false;},0);
    if(!completed.target){
      setMessage('拖曳取消：請在目前 Z-level 的 map cell 上放開。');
      render();
      return;
    }
    const furniture=resolvedFurniture(completed.furnitureId);
    const result=M.moveFurniture(authored,{furnitureId:completed.furnitureId,target:completed.target});
    commitMutation(result,{
      message:result.ok?`已拖曳 ${furniture?.name||completed.furnitureId}；drop 與 click placement 共用同一 mutation owner。`:'',
      select:result.ok?{type:'furniture',id:completed.furnitureId}:null
    });
  }

  function cancelFurnitureDrag(event){
    if(!dragState||(event&&event.pointerId!==dragState.pointerId))return;
    const wasActive=dragState.active;
    clearDragPreviewDom();
    dragState=null;
    if(wasActive){
      setMessage('家具拖曳已取消。');
      render();
    }
  }

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

  function resolvedFurniture(id){
    const instance=authored.furniture?.[id];
    return instance?A.resolveFurnitureInstance(instance):null;
  }

  function residentPosition(resident){
    const placement=resident?.initial?.placement;
    if(placement?.mode==='exact')return placement.node||null;
    if(placement?.mode==='anchor'&&placement.anchor?.kind==='furnitureSlot'){
      const matches=[];
      for(const id of Object.keys(authored.furniture||{})){
        const furniture=resolvedFurniture(id);
        for(const slot of furniture?.slots||[])if(slot.id===placement.anchor.id)matches.push(slot.position);
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
    for(const id of Object.keys(authored.furniture||{})){
      const furniture=resolvedFurniture(id);
      if(furniture)push('furniture',id,furniture,furniturePosition(furniture),furniture.icon||'▰','家具');
    }
    for(const [id,container] of Object.entries(authored.entities?.containers||{}))push('container',id,container,container.position,container.icon||'◈','物件 · 容器');
    for(const [id,source] of Object.entries(authored.entities?.sources||{}))push('source',id,source,source.position,source.icon||'◆','物件 · 資源源頭');
    for(const [id,resident] of Object.entries(authored.residents||{}))push('resident',id,resident,residentPosition(resident),resident.icon||(resident.kind==='cat'?'🐈':'👤'),'居民');
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
    for(const id of Object.keys(authored.furniture||{})){
      const furniture=resolvedFurniture(id);
      for(const p of furniture?.footprint||[])push(p,`furniture:${id}`);
      if(furniture?.displayAt)push(furniture.displayAt,`furniture-display:${id}`);
      for(const slot of furniture?.slots||[])push(slot.position,`slot:${slot.id}`);
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

  function furnitureKindLabel(furniture){
    const labels={chair:'餐椅',table:'餐桌',sofa:'沙發',bed:'床',door:'門'};
    return labels[furniture?.kind]||furniture?.kind||'Furniture';
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
    setMessage(tool==='erase'?`已清除格子 ${id}`:`格子 ${id} → ${terrainLabel(terrainForTool(tool))}`);
    render();
  }

  function handleFurniturePlacement(target){
    if(!selectedFurnitureId){setMessage('請先選擇家具實例。');render();return;}
    const furniture=resolvedFurniture(selectedFurnitureId);
    const result=M.moveFurniture(authored,{furnitureId:selectedFurnitureId,target});
    commitMutation(result,{message:result.ok?`已移動 ${furniture?.name||selectedFurnitureId}；明確綁定在此家具上的容器已同步平移。`:'',select:result.ok?{type:'furniture',id:selectedFurnitureId}:null});
  }

  function handlePendingCellClick(x,y){
    if(!pendingOperation)return false;
    const target={x,y,z:currentZ};
    const operation=cloneUi(pendingOperation);
    if(operation.kind==='create-furniture'){
      const result=M.createFurnitureFromDefinition(authored,{definitionId:operation.definitionId,target});
      const newId=result?.meta?.newId;
      commitMutation(result,{message:result.ok?`已建立家具實例 ${newId}。`:'',select:result.ok?{type:'furniture',id:newId}:null});
      return true;
    }
    if(operation.kind==='duplicate-furniture'){
      const result=M.duplicateFurniture(authored,{sourceId:operation.furnitureId,target});
      const newId=result?.meta?.newId;
      commitMutation(result,{message:result.ok?`已建立家具副本 ${newId}。`:'',select:result.ok?{type:'furniture',id:newId}:null});
      return true;
    }
    if(operation.kind==='move-object'){
      const result=M.moveObject(authored,{entityType:operation.entityType,entityId:operation.entityId,target});
      if(!result.ok&&result.issues?.some(item=>item.code==='support_choice_required')){
        pendingOperation={kind:'resolve-object-support',entityType:operation.entityType,entityId:operation.entityId,target:cloneUi(target),candidates:cloneUi(result.meta?.candidates||[])};
        operationIssues=cloneUi(result.issues||[]);
        lastOperationMeta=cloneUi(result.meta||null);
        setMessage('此位置同時可視為地面或家具承載面；請明確選擇承載關係。');
        render();
        return true;
      }
      commitMutation(result,{message:result.ok?'已移動物件。':'',select:result.ok?{type:operation.entityType,id:operation.entityId}:null});
      return true;
    }
    if(operation.kind==='move-resident'){
      const result=M.moveResidentToExact(authored,{residentId:operation.residentId,target,postureKind:operation.postureKind});
      const posture=C.postureLabel(operation.postureKind);
      commitMutation(result,{message:result.ok?`已移動居民到自由位置（${posture}）。`:'',select:result.ok?{type:'resident',id:operation.residentId}:null});
      return true;
    }
    return false;
  }

  function resolvePendingSupport(supportChoice){
    const operation=pendingOperation;
    if(operation?.kind!=='resolve-object-support')return;
    const result=M.moveObject(authored,{entityType:operation.entityType,entityId:operation.entityId,target:operation.target,supportChoice});
    commitMutation(result,{message:result.ok?(supportChoice.kind==='floor'?'已移到地面。':`已移到家具承載面 ${supportChoice.furnitureId}。`):'',select:result.ok?{type:operation.entityType,id:operation.entityId}:null});
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
    setMessage(`已刪除家具 ${furnitureId}。`);
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
    commitMutation(result,{message:result.ok?'已重新綁定居民的家具位置與姿勢。':'',select:result.ok?{type:'resident',id:operation.residentId}:null});
  }

  function handleCellClick(x,y){
    if(selectedTool==='select'){selection={kind:'cell',x,y,z:currentZ};setMessage('');render();return;}
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
    setMessage(`已刪除層 Z ${oldZ}。`);
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

  function loadDocument(next,{clean=true,message='已載入建構資料文件。'}={}){
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
    previewIssues=[];
    previewIssuesFingerprint=null;
    cancelFurnitureDrag();
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
      setMessage('已匯出正式建構資料 JSON。');
      render();
    }catch(error){
      setMessage(`無法匯出：${error.message}`);
      render();
    }
  }

  function furnitureAtCell(x,y,z){
    const out=[];
    for(const id of Object.keys(authored.furniture||{})){
      const furniture=resolvedFurniture(id);
      if((furniture?.footprint||[]).some(p=>p.x===x&&p.y===y&&(p.z??0)===z))out.push([id,furniture]);
    }
    return out;
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
        return `<span class="furniture-mark ${isSelected?'selected':''} ${isTarget?'placement-target':''} ${furniture.length>1?'multi':''}" data-entity-type="furniture" data-entity-id="${esc(id)}" title="家具：${esc(item.name||id)}${isTarget?' · 放置目標':''}">${esc(item.icon||'▰')}</span>`;
      }).join(''):'';
      const entityMarkup=entities.length?`<span class="entity-markers">${entities.slice(0,3).map(entry=>{
        const isSelected=selection?.kind==='entity'&&selection.type===entry.type&&selection.id===entry.id;
        return `<span class="entity-marker marker-${esc(entry.type)} ${isSelected?'selected':''}" data-entity-type="${esc(entry.type)}" data-entity-id="${esc(entry.id)}" title="${esc(entry.label)}：${esc(entry.entity.name||entry.id)}">${esc(entry.icon)}</span>`;
      }).join('')}${entities.length>3?`<span class="entity-overflow">+${entities.length-3}</span>`:''}</span>`:'';
      const terrainText=terrainLabel(terrain);
      html+=`<button class="author-cell terrain-${esc(terrain)} ${selected?'selected-cell':''}" type="button" data-cell="${x},${y}" aria-label="座標 ${x},${y},${currentZ}，${esc(terrainText)}" title="(${x}, ${y}, ${currentZ})・${esc(terrainText)}（${esc(terrain)}）${furnitureName?'・家具：'+esc(furnitureName):''}${entityName?'・物件：'+esc(entityName):''}"><span class="cell-coord">${x},${y}</span>${furnitureMarkup}${entityMarkup}</button>`;
    }
    host.innerHTML=html;
    applyDragPreviewDom();
  }

  function renderLayers(){
    const list=layers(),select=$('layerSelect');
    select.innerHTML=list.map(layer=>`<option value="${layer.z}" ${layer.z===currentZ?'selected':''}>${esc(zLabel(layer.z))}</option>`).join('');
    const index=list.findIndex(layer=>layer.z===currentZ);
    $('layerPrev').disabled=index<=0;
    $('layerNext').disabled=index<0||index>=list.length-1;
    $('layerTitle').textContent=`Z = ${currentZ}`;
    const layer=layerAt(currentZ),cellCount=Object.keys(layer?.cells||{}).length,refs=layerReferenceCount(currentZ);
    $('layerSummary').textContent=`${cellCount} 個已建構格・${refs} 個位置參照`;
    const proposed=Math.max(...list.map(layer=>layer.z))+1;
    if(document.activeElement!==$('newLayerZ'))$('newLayerZ').value=String(proposed);
  }

  function renderTools(){
    document.querySelectorAll('[data-tool]').forEach(button=>button.classList.toggle('active',button.dataset.tool===selectedTool));
  }

  function renderFurnitureCatalog(){
    const host=$('furnitureCatalog');
    if(!host)return;
    const definitions=A.listFurnitureDefinitions();
    host.innerHTML=`<div class="scene-group"><div class="scene-group-head"><span>家具定義</span><span>${definitions.length}</span></div><div class="scene-items">${definitions.map(definition=>`<button class="scene-item" type="button" data-furniture-definition-id="${esc(definition.id)}"><span class="scene-icon">${esc(definition.icon||'▰')}</span><span class="scene-copy"><b>${esc(definition.name||definition.id)}</b><small>${esc(furnitureKindLabel(definition))} · <code>${esc(definition.id)}</code></small></span></button>`).join('')}</div></div>`;
  }

  function renderSceneList(){
    const host=$('sceneList'),entries=sceneEntries();
    const groups=[
      ['家具',entries.filter(entry=>entry.type==='furniture')],
      ['物件',entries.filter(entry=>entry.type==='container'||entry.type==='source')],
      ['居民',entries.filter(entry=>entry.type==='resident')]
    ];
    host.innerHTML=groups.map(([label,items])=>`<div class="scene-group"><div class="scene-group-head"><span>${esc(label)}</span><span>${items.length}</span></div><div class="scene-items">${items.length?items.map(entry=>{
      const selected=selection?.kind==='entity'&&selection.type===entry.type&&selection.id===entry.id;
      const placementTarget=entry.type==='furniture'&&entry.id===selectedFurnitureId;
      const position=entry.position?`(${entry.position.x}, ${entry.position.y}, ${entry.position.z??0})`:'位置未解析';
      const typeLabel=entry.type==='furniture'?furnitureKindLabel(entry.entity):entry.label;
      return `<button class="scene-item ${selected?'selected':''} ${placementTarget?'placement-target':''}" type="button" data-scene-type="${esc(entry.type)}" data-scene-id="${esc(entry.id)}"><span class="scene-icon">${esc(entry.icon)}</span><span class="scene-copy"><b>${esc(entry.entity.name||entry.id)}</b><small>${esc(typeLabel)} · ${esc(position)}${placementTarget?' · 放置目標':''}</small></span></button>`;
    }).join(''):'<div class="scene-empty">目前沒有項目</div>'}</div></div>`).join('');
  }

  function renderSummary(validation,topology){
    const layerList=layers(),furnitureCount=Object.keys(authored.furniture||{}).length,residentCount=Object.keys(authored.residents||{}).length;
    $('documentSummary').innerHTML=[
      ['世界 ID',authored.id||'—'],
      ['建構資料版本',authored.authoringSchema],
      ['地圖尺寸',`${authored.map.width} × ${authored.map.height}`],
      ['Z 層',layerList.map(layer=>layer.z).join(', ')],
      ['家具',furnitureCount],
      ['居民',residentCount],
      ['水平連通區',topology?topology.components.length:'—'],
      ['驗證',validation.ok?'通過':`${validation.errors.length} 個錯誤`]
    ].map(([key,value])=>`<div class="key">${esc(key)}</div><div>${esc(value)}</div>`).join('');

    const position=selectionPosition();
    let heading='',details='';
    if(selection?.kind==='entity'){
      const entry=sceneEntry(selection.type,selection.id);
      if(entry){
        heading=`${esc(entry.icon)} ${esc(entry.entity.name||entry.id)}`;
        details=`<br>${esc(entry.label)} · ID：<code>${esc(entry.id)}</code>`;
        if(entry.type==='furniture')details+=`<br>占地：${(entry.entity.footprint||[]).length} 格`;
        if((entry.type==='container'||entry.type==='source')&&entry.entity.supportId)details+=`<br>承載家具：<code>${esc(entry.entity.supportId)}</code>`;
        if(entry.type==='resident'){
          const placement=entry.entity.initial?.placement;
          const placementLabel=placement?.mode==='exact'?'自由座標（exact）':placement?.mode==='anchor'?'家具位置綁定（anchor）':placement?.mode||'—';
          details+=`<br>位置模式：${esc(placementLabel)}`;
          if(placement?.mode==='anchor')details+=` · <code>${esc(placement.anchor?.id||'—')}</code>`;
        }
      }
    }else if(selection?.kind==='cell'){
      heading=`格 (${selection.x}, ${selection.y}, ${selection.z})`;
    }

    if(position){
      const z=position.z??0,layer=layerAt(z),cell=cellAt(layer,position.x,position.y),furniture=furnitureAtCell(position.x,position.y,z);
      const derived=z===currentZ?topology?.cells?.[cellId(position.x,position.y)]:null;
      const terrain=cell?.terrain||'void';
      details+=`<br>位置：<code>(${position.x}, ${position.y}, ${z})</code><br>地形：${esc(terrainLabel(terrain))} <code>${esc(terrain)}</code>`;
      details+=`<br>材質：${esc(materialDisplay(cell?.material))}`;
      if(furniture.length)details+=`<br>此格家具：${furniture.map(([id,item])=>esc(item.name||id)).join('、')}`;
      if(derived){
        details+=`<br>推導狀態：<code>${derived.structuralOpen?'structural-open':'structural-closed'}</code> · <code>${derived.open?'connected-open':'blocked'}</code>${derived.componentId?` · ${esc(derived.componentId)}`:''}`;
        if(derived.blockedBy.length)details+=`<br>阻擋來源：${derived.blockedBy.map(esc).join('、')}`;
        if(derived.under.length)details+=`<br>下方淨空：${derived.under.map(item=>`${esc(item.furnitureId)} ${item.clearanceHeight??'—'}m`).join('、')}`;
      }
    }
    if(heading)$('selectionSummary').innerHTML=`<b>${heading}</b>${details}${transientMessage?`<br><br><span>${esc(transientMessage)}</span>`:''}`;
    else $('selectionSummary').textContent=transientMessage||'尚未選取。';
  }

  function renderSelectionActions(){
    const host=$('selectionActions');
    if(!host)return;
    const entry=selection?.kind==='entity'?sceneEntry(selection.type,selection.id):null;
    const selectedCell=selection?.kind==='cell'?cellAt(layerAt(selection.z),selection.x,selection.y):null;
    const issueMarkup=operationIssues.length?`<div class="operation-issues">${operationIssues.map(item=>{
      const blockers=Array.isArray(item.blockers)?item.blockers:[];
      return `<div class="operation-issue"><b>${esc(item.code||'mutation_rejected')}</b><span>${esc(item.message||'操作被拒絕。')}</span>${blockers.map(blocker=>`<small>${esc(blocker.ownerType)} · ${esc(blocker.ownerName||blocker.ownerId)} (<code>${esc(blocker.ownerId)}</code>) → ${esc(blocker.referenceKind)} = <code>${esc(blocker.referenceValue)}</code></small>`).join('')}</div>`;
    }).join('')}</div>`:'';
    let pendingMarkup='';
    if(pendingOperation){
      const operation=pendingOperation;
      const labels={'create-furniture':'下一次點擊：建立家具','duplicate-furniture':'下一次點擊：放置家具副本','move-object':'下一次點擊：移動物件','resolve-object-support':'選擇物件承載關係','move-resident':'移動居民到自由位置','rebind-resident-slot':'重新綁定家具位置'};
      pendingMarkup+=`<div class="pending-operation"><b>${esc(labels[operation.kind]||operation.kind)}</b>`;
      if(operation.kind==='resolve-object-support'){
        pendingMarkup+=`<small>目標：<code>(${operation.target.x}, ${operation.target.y}, ${operation.target.z})</code></small><div class="action-row"><button type="button" data-editor-action="resolve-support" data-support-kind="floor">地面</button>${(operation.candidates||[]).map(candidate=>`<button type="button" data-editor-action="resolve-support" data-support-kind="furniture" data-support-id="${esc(candidate.id)}">家具承載：${esc(candidate.name||candidate.id)}</button>`).join('')}</div>`;
      }else if(operation.kind==='move-resident'){
        const postures=M.listResidentFreePostures(authored,operation.residentId);
        const binding=M.residentBinding(authored,operation.residentId);
        pendingMarkup+=`<label class="operation-field">自由姿勢<select data-operation-field="postureKind">${postures.map(item=>`<option value="${esc(item.kind)}" ${operation.postureKind===item.kind?'selected':''}>${esc(item.label)}（${esc(item.kind)}）</option>`).join('')}</select></label>`;
        if(binding?.bound)pendingMarkup+='<small><strong>注意：</strong>點擊新位置後會解除目前的家具／座位綁定。</small>';
        pendingMarkup+='<small>選好姿勢後點擊地圖格；移動與解除綁定會由同一次原子操作完成。</small>';
      }else if(operation.kind==='rebind-resident-slot'){
        const slots=M.listResidentSlots(authored,operation.residentId).filter(slot=>slot.compatible);
        const postures=operation.slotId?M.listResidentSlotPostures(authored,operation.residentId,operation.slotId):[];
        pendingMarkup+=`<label class="operation-field">家具位置（slot）<select data-operation-field="slotId"><option value="">請選擇…</option>${slots.map(slot=>`<option value="${esc(slot.id)}" ${operation.slotId===slot.id?'selected':''}>${esc(slot.furnitureName)} · ${esc(slot.label)} (${slot.position.x},${slot.position.y},${slot.position.z??0})</option>`).join('')}</select></label>`;
        pendingMarkup+=`<label class="operation-field">姿勢<select data-operation-field="postureKind" ${operation.slotId?'':'disabled'}><option value="">請選擇…</option>${postures.map(item=>`<option value="${esc(item.kind)}" ${operation.postureKind===item.kind?'selected':''}>${esc(item.label)}（${esc(item.kind)}）</option>`).join('')}</select></label><button type="button" data-editor-action="confirm-resident-rebind" ${!operation.slotId||!operation.postureKind?'disabled':''}>套用家具位置綁定</button>`;
      }else{
        pendingMarkup+='<small>點擊地圖格執行；失敗時正式建構資料不會改變。</small>';
      }
      pendingMarkup+='<button type="button" class="ghost-action" data-editor-action="cancel-operation">取消目前操作</button></div>';
    }
    let cellMarkup='';
    if(selection?.kind==='cell'){
      if(selectedCell){
        const currentMaterial=selectedCell.material||'';
        cellMarkup=`<div class="cell-editor"><div class="cell-editor-head"><b>格子材質</b><small>正式欄位 <code>material</code></small></div><label class="operation-field">材質識別字<input data-cell-material-input list="cellMaterialSuggestions" value="${esc(currentMaterial)}" placeholder="例如 wood"></label><datalist id="cellMaterialSuggestions"><option value="wood" label="木材"></option><option value="stone" label="石材"></option></datalist><div class="action-row"><button type="button" data-editor-action="apply-cell-material">套用材質</button><button type="button" class="ghost-action" data-editor-action="clear-cell-material" ${currentMaterial?'':'disabled'}>清除材質</button></div><small>常用值只是輸入提示，不是封閉 enum。清除只移除 <code>material</code>，不會刪除格子或改變 <code>terrain</code>。</small></div>`;
      }else{
        cellMarkup='<div class="cell-editor disabled"><b>格子材質</b><small>此座標目前是空白，尚未建立正式 Cell。請先使用地板、牆壁或開口／門洞工具建立格子。</small></div>';
      }
    }
    let entityMarkup='';
    if(entry?.type==='furniture'){
      const placementActive=selectedTool==='furniture'&&selectedFurnitureId===entry.id;
      entityMarkup=`<div class="action-row"><button type="button" data-editor-action="arm-furniture-placement">${placementActive?'停止家具放置':'啟用家具放置'}</button><button type="button" data-editor-action="duplicate-furniture">複製家具</button><button type="button" class="danger-action" data-editor-action="delete-furniture">刪除家具</button></div><small class="operation-note">類型：${esc(furnitureKindLabel(entry.entity))} · 實例 ID：<code>${esc(entry.id)}</code></small>`;
    }else if(entry?.type==='container'||entry?.type==='source'){
      entityMarkup=`<div class="action-row"><button type="button" data-editor-action="move-object">移動物件</button></div>`;
    }else if(entry?.type==='resident'){
      const binding=M.residentBinding(authored,entry.id);
      const bindingLabel=binding?.bound?'家具／座位綁定':binding?.placementMode==='exact'?'自由座標':'其他';
      entityMarkup=`<div class="action-row"><button type="button" data-editor-action="move-resident">移動居民</button><button type="button" data-editor-action="rebind-resident-slot">綁定到家具位置</button></div><small class="operation-note">位置模式：${esc(bindingLabel)} · 姿勢：${esc(C.postureLabel(binding?.postureKind))}${binding?.bound?' · 移到自由位置時會先明確解除目前綁定':''}</small>`;
    }
    const metaMarkup=lastOperationMeta?`<div class="operation-meta">最近操作：<code>${esc(lastOperationMeta.operation||lastOperationMeta.phase||'result')}</code></div>`:'';
    host.innerHTML=pendingMarkup+cellMarkup+entityMarkup+issueMarkup+metaMarkup;
  }

  function renderValidation(validation){
    const dirty=isDirty();
    const currentPreviewIssues=previewIssuesFingerprint===fingerprint()?previewIssues:[];
    $('dirtyStatus').textContent=dirty?'有未匯出修改':'未修改';
    $('dirtyStatus').className=`status-pill ${dirty?'dirty':'clean'}`;
    $('validationStatus').textContent=validation.ok?(currentPreviewIssues.length?`模擬器預覽無法啟動 · ${currentPreviewIssues.length}`:'建構資料有效'):`建構資料錯誤 · ${validation.errors.length}`;
    $('validationStatus').className=`status-pill ${validation.ok&&!currentPreviewIssues.length?'clean':'invalid'}`;
    $('exportWorld').disabled=!validation.ok;
    $('testWorld').disabled=!validation.ok;
    const schemaMarkup=validation.ok?'<div class="validation-ok">✓ 正式建構資料驗證通過</div>':validation.errors.slice(0,12).map(issue=>`<div class="validation-item"><b>${esc(issue.code)}</b><br><code>${esc(issue.path)}</code><br>${esc(issue.message)}</div>`).join('');
    const previewMarkup=currentPreviewIssues.length?`<div class="validation-item"><b>編輯器預覽相容性</b><br>${currentPreviewIssues.slice(0,12).map(issue=>`<code>${esc(issue.code||'runtime_authoring_incompatible')}</code> ${esc(issue.message||'執行期相容性檢查失敗。')}`).join('<br>')}</div>`:'';
    $('validationList').innerHTML=schemaMarkup+previewMarkup;
  }

  function testInSimulator(){
    previewIssues=[];
    previewIssuesFingerprint=null;
    const result=P.storePreview(authored);
    if(!result.ok){
      previewIssues=cloneUi(result.issues||[]);
      previewIssuesFingerprint=fingerprint();
      setMessage('無法啟動模擬器預覽；請先處理執行期相容性問題。');
      render();
      return;
    }
    allowPreviewNavigation=true;
    window.location.assign(P.previewUrl);
  }

  function render(){
    const validation=report(),topology=validation.ok?derivedTopology():null;
    renderLayers();
    renderTools();
    renderFurnitureCatalog();
    renderSceneList();
    renderMap();
    renderSummary(validation,topology);
    renderSelectionActions();
    renderValidation(validation);
  }

  $('editorMap').addEventListener('pointerdown',beginFurnitureDrag);
  $('editorMap').addEventListener('pointermove',continueFurnitureDrag);
  $('editorMap').addEventListener('pointerup',finishFurnitureDrag);
  $('editorMap').addEventListener('pointercancel',cancelFurnitureDrag);

  $('editorMap').addEventListener('click',event=>{
    if(suppressMapClick){event.preventDefault();return;}
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
  $('furnitureCatalog').addEventListener('click',event=>{
    const item=event.target.closest('[data-furniture-definition-id]');
    if(!item)return;
    selectedTool='select';
    beginOperation({kind:'create-furniture',definitionId:item.dataset.furnitureDefinitionId},'新增家具：下一次點擊決定新家具實例的原點。');
  });
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
    if((action==='apply-cell-material'||action==='clear-cell-material')&&selection?.kind==='cell'){
      const input=host.querySelector('[data-cell-material-input]');
      const material=action==='clear-cell-material'?'':(input?.value??'');
      const result=M.setCellMaterial(authored,{x:selection.x,y:selection.y,z:selection.z,material});
      const display=typeof material==='string'&&material.trim()?materialDisplay(material.trim()):'未設定';
      commitMutation(result,{message:result.ok?`材質已更新為：${display}。`:''});
      return;
    }
    if(!entry)return;
    if(action==='arm-furniture-placement'&&entry.type==='furniture'){const active=selectedTool==='furniture'&&selectedFurnitureId===entry.id;selectedFurnitureId=entry.id;selectedTool=active?'select':'furniture';clearOperationState();setMessage(active?'家具放置已停止。':'家具放置已啟用；點擊地圖決定新位置。');render();return;}
    if(action==='duplicate-furniture'&&entry.type==='furniture'){beginOperation({kind:'duplicate-furniture',furnitureId:entry.id},'複製家具：下一次點擊決定新副本位置。');return;}
    if(action==='delete-furniture'&&entry.type==='furniture'){deleteSelectedFurniture(entry.id);return;}
    if(action==='move-object'&&(entry.type==='container'||entry.type==='source')){beginOperation({kind:'move-object',entityType:entry.type,entityId:entry.id},'移動物件：下一次點擊決定新位置。');return;}
    if(action==='move-resident'&&entry.type==='resident'){
      const options=M.listResidentFreePostures(authored,entry.id);
      const current=entry.entity.initial?.posture?.kind;
      const postureKind=options.some(item=>item.kind===current)?current:(options[0]?.kind||'');
      const binding=M.residentBinding(authored,entry.id);
      beginOperation({kind:'move-resident',residentId:entry.id,postureKind},binding?.bound?'移動居民：請選擇自由姿勢；點擊新位置時會解除目前家具／座位綁定。':'移動居民：請選擇自由姿勢後點擊新位置。');
      return;
    }
    if(action==='rebind-resident-slot'&&entry.type==='resident'){beginOperation({kind:'rebind-resident-slot',residentId:entry.id,slotId:'',postureKind:''},'請明確選擇家具位置與姿勢。');return;}
  });
  $('selectionActions').addEventListener('change',event=>{
    const field=event.target.closest('[data-operation-field]');
    if(!field||!['move-resident','rebind-resident-slot'].includes(pendingOperation?.kind))return;
    if(pendingOperation.kind==='rebind-resident-slot'&&field.dataset.operationField==='slotId'){
      pendingOperation={...pendingOperation,slotId:field.value,postureKind:''};
      setMessage('請選擇此家具位置允許的姿勢後套用。');
    }else{
      pendingOperation={...pendingOperation,[field.dataset.operationField]:field.value};
      setMessage(pendingOperation.kind==='move-resident'?'請點擊地圖選擇新的自由位置。':'請確認家具位置與姿勢後套用。');
    }
    operationIssues=[];
    render();
  });
  $('layerPrev').addEventListener('click',()=>navigateLayer(-1));
  $('layerNext').addEventListener('click',()=>navigateLayer(1));
  $('layerSelect').addEventListener('change',event=>setCurrentLayer(Number(event.target.value)));
  $('addLayer').addEventListener('click',addLayer);
  $('deleteLayer').addEventListener('click',deleteCurrentLayer);
  $('importWorld').addEventListener('change',event=>importFile(event.target.files?.[0]));
  $('testWorld').addEventListener('click',testInSimulator);
  $('exportWorld').addEventListener('click',exportWorld);
  $('resetWorld').addEventListener('click',()=>{
    if(isDirty()&&!confirm('放棄尚未匯出的修改並載入預設世界？'))return;
    loadDocument(A.DEFAULT_WORLD_AUTHORING,{clean:true,message:'已重新載入預設世界。'});
  });
  addEventListener('beforeunload',event=>{
    if(allowPreviewNavigation||!isDirty())return;
    event.preventDefault();
    event.returnValue='';
  });

  window.SimWorldEditor={
    getDocument:()=>A.cloneAuthoring(authored),
    getSession:()=>({currentZ,selectedTool,selectedFurnitureId,selection:selection?{...selection}:null,selectedCell:selectionPosition()?{...selectionPosition()}:null,pendingOperation:cloneUi(pendingOperation),operationIssues:cloneUi(operationIssues),lastOperationMeta:cloneUi(lastOperationMeta),dragState:dragState?{furnitureId:dragState.furnitureId,active:dragState.active,target:cloneUi(dragState.target),valid:dragState.valid,preview:cloneUi(dragState.preview),issues:cloneUi(dragState.issues)}:null,dirty:isDirty(),validation:report()}),
    loadDocument:next=>loadDocument(next,{clean:true,message:'測試／API 文件已載入。'}),
    semanticFingerprint:fingerprint,
    getDerivedTopology:(z=currentZ)=>derivedTopology(z),
    selectEntity:(type,id)=>selectSceneEntity(type,id)
  };

  const restorePreview=P.getRestorePreview?.();
  if(restorePreview?.requested){
    if(restorePreview.ok&&restorePreview.authoring){
      loadDocument(restorePreview.authoring,{clean:false,message:'已從編輯器預覽恢復工作稿；這份快照仍視為未匯出修改。'});
    }else{
      const reason=(restorePreview.issues||[]).map(issue=>issue.message||issue.code).join('；')||'找不到可恢復的預覽快照。';
      setMessage(`無法恢復編輯器預覽：${reason}`);
      render();
    }
  }else render();
})();