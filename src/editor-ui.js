(() => {
  const A=window.SimWorldAuthoring;
  if(!A?.DEFAULT_WORLD_AUTHORING||!A?.validateAuthoring||!A?.serializeAuthoring){
    throw new Error('World authoring helpers must load before editor-ui.js.');
  }

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let authored=A.canonicalizeAuthoring(A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING));
  let baselineFingerprint=A.semanticFingerprint(authored);
  let currentZ=authored.map.layers.some(layer=>layer.z===0)?0:authored.map.layers[0].z;
  let selectedTool='floor';
  let selectedFurnitureId=Object.keys(authored.furniture||{})[0]||null;
  let selection=null;
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

  function sceneEntries(){
    const out=[];
    const push=(type,id,entity,position,icon,label)=>out.push({type,id,entity,position:position||null,icon:icon||'•',label});
    for(const [id,furniture] of Object.entries(authored.furniture||{}))push('furniture',id,furniture,furnitureAnchor(furniture),furniture.icon||'▰','Furniture');
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

  function translatePosition(position,dx,dy,dz){
    if(!position)return position;
    return {...position,x:position.x+dx,y:position.y+dy,z:(position.z??0)+dz};
  }

  function furnitureAnchor(furniture){
    return furniture?.displayAt||furniture?.footprint?.[0]||furniture?.slots?.[0]?.position||null;
  }

  function moveFurniture(id,target){
    const furniture=authored.furniture?.[id];
    const anchor=furnitureAnchor(furniture);
    if(!furniture||!anchor){setMessage('此 furniture 沒有可用 placement anchor。');render();return;}
    const dx=target.x-anchor.x,dy=target.y-anchor.y,dz=target.z-(anchor.z??0);
    const candidates=[
      ...(furniture.footprint||[]).map(p=>translatePosition(p,dx,dy,dz)),
      ...(furniture.displayAt?[translatePosition(furniture.displayAt,dx,dy,dz)]:[]),
      ...(furniture.slots||[]).map(slot=>translatePosition(slot.position,dx,dy,dz))
    ].filter(Boolean);
    const validLayers=new Set(layers().map(layer=>layer.z));
    const width=authored.map.width,height=authored.map.height;
    const invalid=candidates.find(p=>p.x<0||p.y<0||p.x>=width||p.y>=height||!validLayers.has(p.z));
    if(invalid){
      setMessage(`無法移動：geometry 會落到不存在／超出邊界的位置 (${invalid.x},${invalid.y},${invalid.z})。`);
      render();
      return;
    }
    furniture.footprint=(furniture.footprint||[]).map(p=>translatePosition(p,dx,dy,dz));
    if(furniture.displayAt)furniture.displayAt=translatePosition(furniture.displayAt,dx,dy,dz);
    for(const slot of furniture.slots||[])slot.position=translatePosition(slot.position,dx,dy,dz);
    selectedFurnitureId=id;
    selection={kind:'entity',type:'furniture',id};
    setMessage(`已移動 ${furniture.name||id}；其他獨立 authored entity 不會自動跟隨。`);
    render();
  }

  function handleCellClick(x,y){
    if(selectedTool==='furniture'){
      if(!selectedFurnitureId){setMessage('請先選擇 furniture instance。');render();return;}
      moveFurniture(selectedFurnitureId,{x,y,z:currentZ});
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
        return `<span class="furniture-mark ${isSelected?'selected':''} ${furniture.length>1?'multi':''}" data-entity-type="furniture" data-entity-id="${esc(id)}" title="Furniture：${esc(item.name||id)}">${esc(item.icon||'▰')}</span>`;
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
      const position=entry.position?`(${entry.position.x}, ${entry.position.y}, ${entry.position.z??0})`:'position unresolved';
      return `<button class="scene-item ${selected?'selected':''}" type="button" data-scene-type="${esc(entry.type)}" data-scene-id="${esc(entry.id)}"><span class="scene-icon">${esc(entry.icon)}</span><span class="scene-copy"><b>${esc(entry.entity.name||entry.id)}</b><small>${esc(entry.label)} · ${esc(position)}</small></span></button>`;
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
    renderValidation(validation);
  }

  $('editorMap').addEventListener('click',event=>{
    const entity=event.target.closest('[data-entity-type][data-entity-id]');
    if(entity){
      selectSceneEntity(entity.dataset.entityType,entity.dataset.entityId);
      return;
    }
    const cell=event.target.closest('[data-cell]');
    if(!cell)return;
    const [x,y]=cell.dataset.cell.split(',').map(Number);
    handleCellClick(x,y);
  });
  document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>{
    selectedTool=button.dataset.tool;
    setMessage('');
    renderTools();
  }));
  $('sceneList').addEventListener('click',event=>{
    const item=event.target.closest('[data-scene-type][data-scene-id]');
    if(!item)return;
    selectSceneEntity(item.dataset.sceneType,item.dataset.sceneId);
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
    getSession:()=>({currentZ,selectedTool,selectedFurnitureId,selection:selection?{...selection}:null,selectedCell:selectionPosition()?{...selectionPosition()}:null,dirty:isDirty(),validation:report()}),
    loadDocument:next=>loadDocument(next,{clean:true,message:'Test/API document loaded.'}),
    semanticFingerprint:fingerprint,
    getDerivedTopology:(z=currentZ)=>derivedTopology(z),
    selectEntity:(type,id)=>selectSceneEntity(type,id)
  };

  render();
})();