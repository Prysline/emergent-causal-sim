(() => {
  const E=window.SimEngine,F=window.SimFurniture;
  if(!E||!F)return;
  const map=document.getElementById('map'),ins=document.getElementById('inspector');
  if(!map||!ins)return;
  let scheduled=false,renderingInspector=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function cls(kind){return `furniture-${kind||'generic'}`;}
  function decorateMap(){
    scheduled=false;
    for(const tile of map.querySelectorAll('.sim-tile[data-tile]')){
      if(tile.dataset.furnitureV101==='1')continue;
      tile.dataset.furnitureV101='1';
      const fs=F.furnitureAtTile(tile.dataset.tile);
      if(!fs.length)continue;
      tile.classList.add('has-furniture');
      for(const f of fs)tile.classList.add(cls(f.kind));
      for(const f of fs){
        const display=f.displayAt&&`${f.displayAt.x},${f.displayAt.y}`===tile.dataset.tile;
        if(!display)continue;
        const marker=document.createElement('span');
        marker.className='furniture-marker';
        marker.dataset.furniture=f.id;
        marker.setAttribute('role','button');
        marker.setAttribute('tabindex','0');
        marker.title=f.name;
        marker.textContent=f.icon||'▰';
        tile.appendChild(marker);
      }
      if(fs.some(f=>f.kind==='table')&&!tile.querySelector('.tile-furniture-name')){
        const label=document.createElement('span');label.className='tile-furniture-name';label.textContent='桌面';tile.appendChild(label);
      }
    }
    patchTileInspector();
  }

  function scheduleDecorate(){
    if(scheduled)return;scheduled=true;requestAnimationFrame(decorateMap);
  }

  function props(f){
    const out=[];
    if(f.blocksMovement)out.push('阻擋通行');
    if(f.occupiable)out.push('可占用座位');
    if(f.canRest)out.push('可短休');
    if(f.canSleep)out.push('可睡眠 affordance（睡眠系統尚未實作）');
    if(f.canExit)out.push('可作為出入口');
    if(f.supportsObjects)out.push('可承載物件');
    return out;
  }

  function renderFurnitureInspector(id){
    const f=F.get(id);if(!f)return;
    renderingInspector=true;
    const footprint=(f.footprint||[]).map(p=>`(${p.x}, ${p.y})`).join('、');
    const p=props(f);
    ins.innerHTML=`<div class="inspect-title"><div class="inspect-icon">${esc(f.icon||'▰')}</div><div><h2>${esc(f.name)}</h2><small>Furniture・${esc(f.id)}</small></div></div>
      <div class="inspect-section"><h3>空間</h3><div class="kv"><div class="k">Zone</div><div>${esc(E.zoneName(f.zone))}</div><div class="k">Footprint</div><div>${esc(footprint)}</div><div class="k">類型</div><div>${esc(f.kind||'家具')}</div></div></div>
      <div class="inspect-section"><h3>屬性</h3><div class="tags">${p.length?p.map(x=>`<span class="tag">${esc(x)}</span>`).join(''):'<span class="tag">無特殊屬性</span>'}</div></div>
      <div class="inspect-section"><h3>說明</h3><div class="timeline-empty">家具 footprint 會參與 Spatial Grid。桌子與大門可阻擋通行；餐椅與沙發是可占用座位 Tile。</div></div>`;
    renderingInspector=false;
  }

  function patchTileInspector(){
    if(renderingInspector)return;
    const small=ins.querySelector('.inspect-title small');
    if(!small?.textContent.startsWith('Tile・'))return;
    const id=small.textContent.slice('Tile・'.length),t=E.tileInfo?.(id);if(!t?.staticBlockedBy)return;
    const fid=String(t.staticBlockedBy).startsWith('furniture:')?String(t.staticBlockedBy).slice('furniture:'.length):null;
    const f=fid&&F.get(fid);if(!f)return;
    const labels=[...ins.querySelectorAll('.kv .k')];
    const label=labels.find(el=>el.textContent.trim()==='固定阻擋');
    if(label?.nextElementSibling&&label.nextElementSibling.textContent!==f.name)label.nextElementSibling.textContent=f.name;
  }

  function furnitureEventTarget(e){return e.target.closest?.('[data-furniture]')||null;}
  document.addEventListener('click',e=>{
    const marker=furnitureEventTarget(e);if(!marker)return;
    e.preventDefault();e.stopImmediatePropagation();renderFurnitureInspector(marker.dataset.furniture);
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const marker=furnitureEventTarget(e);if(!marker)return;
    e.preventDefault();renderFurnitureInspector(marker.dataset.furniture);
  },true);

  const observer=new MutationObserver(()=>scheduleDecorate());
  observer.observe(map,{childList:true,subtree:true});
  observer.observe(ins,{childList:true,subtree:true});
  scheduleDecorate();
})();
