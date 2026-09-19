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
  let selectedCell=null;
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
      if(resident.initial?.placement?.mode==='exact')push(resident.initial.placement.node,`resident:${id}`);
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
    selectedCell={x,y,z:currentZ};
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
    selectedCell={x:target.x,y:target.y,z:target.z};
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
    selectedCell=null;
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
    selectedCell=null;
    setMessage(`已刪除空層 Z ${oldZ}。`);
    render();
  }

  function navigateLayer(delta){
    const list=layers(),index=list.findIndex(layer=>layer.z===currentZ),target=list[index+delta];
    if(!target)return;
    currentZ=target.z;
    selectedCell=null;
    setMessage('');
    render();
  }

  function setCurrentLayer(z){
    if(!layerAt(z))return;
    currentZ=z;
    selectedCell=null;
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
    selectedCell=null;
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

  function entityCountAt(x,y,z){
    return allAuthoredPositions().filter(({position,label})=>position.x===x&&position.y===y&&position.z===z&&!label.startsWith('furniture')&&!label.startsWith('slot:')).length;
  }

  function renderMap(){
    const host=$('editorMap'),layer=layerAt(currentZ),width=authored.map.width,height=authored.map.height;
    host.style.setProperty('--grid-w',width);
    host.style.setProperty('--grid-h',height);
    let html='';
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const cell=cellAt(layer,x,y),terrain=cell?.terrain||'void',furniture=furnitureAtCell(x,y,currentZ),entities=entityCountAt(x,y,currentZ);
      const selected=selectedCell?.x===x&&selectedCell?.y===y&&selectedCell?.z===currentZ;
      const furnitureName=furniture.map(([id,f])=>f.name||id).join('、');
      html+=`<button class="author-cell terrain-${esc(terrain)} ${selected?'selected-cell':''}" type="button" data-cell="${x},${y}" aria-label="(${x},${y},${currentZ}) ${esc(terrain)}" title="(${x}, ${y}, ${currentZ})・${esc(terrain)}${furnitureName?'・'+esc(furnitureName):''}"><span class="cell-coord">${x},${y}</span>${furniture.length?`<span class="furniture-mark ${furniture.some(([id])=>id===selectedFurnitureId)?'selected':''} ${furniture.length>1?'multi':''}">${furniture.length>1?furniture.length:esc(furniture[0][1].icon||'▰')}</span>`:''}${entities?'<span class="entity-dot"></span>':''}</button>`;
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
    const select=$('furnitureSelect'),entries=Object.entries(authored.furniture||{});
    select.innerHTML=entries.length?entries.map(([id,furniture])=>`<option value="${esc(id)}" ${id===selectedFurnitureId?'selected':''}>${esc(furniture.name||id)} · ${esc(id)}</option>`).join(''):'<option value="">沒有 furniture</option>';
    select.disabled=!entries.length;
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

    if(selectedCell){
      const layer=layerAt(selectedCell.z),cell=cellAt(layer,selectedCell.x,selectedCell.y),furniture=furnitureAtCell(selectedCell.x,selectedCell.y,selectedCell.z);
      const derived=topology?.cells?.[cellId(selectedCell.x,selectedCell.y)];
      const derivedText=derived?`<br>derived: <code>${derived.structuralOpen?'structural-open':'structural-closed'}</code> · <code>${derived.open?'connected-open':'blocked'}</code>${derived.componentId?` · ${esc(derived.componentId)}`:''}${derived.blockedBy.length?`<br>blocked by: ${derived.blockedBy.map(esc).join('、')}`:''}${derived.under.length?`<br>under clearance: ${derived.under.map(item=>`${esc(item.furnitureId)} ${item.clearanceHeight??'—'}m`).join('、')}`:''}`:'';
      $('selectionSummary').innerHTML=`<b>Cell (${selectedCell.x}, ${selectedCell.y}, ${selectedCell.z})</b><br>terrain: <code>${esc(cell?.terrain||'void')}</code>${cell?.material?`<br>material: <code>${esc(cell.material)}</code>`:''}${furniture.length?`<br>furniture: ${furniture.map(([id,f])=>esc(f.name||id)).join('、')}`:''}${derivedText}${transientMessage?`<br><br><span>${esc(transientMessage)}</span>`:''}`;
    }else $('selectionSummary').textContent=transientMessage||'尚未選取。';
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
    renderMap();
    renderSummary(validation,topology);
    renderValidation(validation);
  }

  $('editorMap').addEventListener('click',event=>{
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
  $('furnitureSelect').addEventListener('change',event=>{
    selectedFurnitureId=event.target.value||null;
    selectedTool='furniture';
    setMessage('');
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
    getSession:()=>({currentZ,selectedTool,selectedFurnitureId,selectedCell:selectedCell?{...selectedCell}:null,dirty:isDirty(),validation:report()}),
    loadDocument:next=>loadDocument(next,{clean:true,message:'Test/API document loaded.'}),
    semanticFingerprint:fingerprint,
    getDerivedTopology:(z=currentZ)=>derivedTopology(z)
  };

  render();
})();