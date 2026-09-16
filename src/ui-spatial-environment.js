(() => {
  const E=window.SimEngine,SP=window.SimSpatial;if(!E||!SP?.environmentAt)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function normalizedType(type){return ({agent:'Agent',container:'Container',source:'Source',furniture:'Furniture',tile:'Tile',room:'Room',event:'Event'})[type]||(type==='Resource Source'?'Source':type);}
  function nodeFor(type,id,s){
    type=normalizedType(type);
    if(type==='Agent')return SP.nodeForAgent(s,s.agents?.[id]);
    if(type==='Container'||type==='Source')return SP.objectNode(s,id);
    return null;
  }
  function contentsText(contents){const entries=Object.entries(contents||{}).filter(([,v])=>v>.05);return entries.length?entries.map(([r,v])=>`${E.resourceIcon(r)} ${E.resourceName(r)} ${Math.round(v*10)/10}`).join('・'):'空';}
  function sectionHtml(type,id){
    const s=E.getState();type=normalizedType(type);
    const node=nodeFor(type,id,s);
    if(node){
      const env=SP.environmentAt(s,node,{create:false});if(!env)return'';
      return `<h3>Spatial Environment</h3><div class="kv spatial-kv"><div class="k">Environment Node</div><div class="spatial-mono">${esc(SP.nodeKey(s,node))}</div><div class="k">Surface 內容</div><div>${esc(contentsText(env.contents))}</div><div class="k">液體總量</div><div>${SP.environmentLiquidAmount(s,node).toFixed(1)}</div></div>`;
    }
    if(type==='Furniture'){
      const f=s.furniture?.[id],surface=f?.spatial?.surface;if(!surface?.cells?.length)return'';
      const rows=surface.cells.map(cell=>{const n=SP.normalizeNode(s,{x:cell.x,y:cell.y},surface.id),env=SP.environmentAt(s,n,{create:false});return `<div class="content-item"><div class="content-head"><span>(${cell.x}, ${cell.y})</span><b>${esc(contentsText(env?.contents||{}))}</b></div></div>`;}).join('');
      return `<h3>Surface Environment</h3><div class="content-list">${rows}</div>`;
    }
    return'';
  }
  function decorateInspector({host,selected}){
    if(!host)return;
    let section=host.querySelector('.spatial-environment-section');
    if(!selected){section?.remove();return;}
    const type=selected.type,id=selected.id,html=sectionHtml(type,id);if(!html){section?.remove();return;}
    if(!section){section=document.createElement('div');section.className='inspect-section spatial-environment-section';const spatial=host.querySelector('.spatial-observability-section'),first=host.querySelector('.inspect-section');if(spatial)spatial.insertAdjacentElement('afterend',section);else if(first)first.insertAdjacentElement('afterend',section);else host.append(section);}
    if(section.innerHTML!==html)section.innerHTML=html;
  }
  const UI=window.SimUI;
  if(!UI?.registerInspectorDecorator)throw new Error('spatial.environment requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('spatial.environment',decorateInspector,200);
})();
