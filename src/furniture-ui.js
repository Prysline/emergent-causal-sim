(() => {
  const E=window.SimEngine,F=window.SimFurniture;
  if(!E||!F)return;
  const map=document.getElementById('map'),ins=document.getElementById('inspector');
  if(!map||!ins)return;
  let scheduled=false,renderingInspector=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const key=p=>`${p.x},${p.y}`;

  function cls(kind){return `furniture-${kind||'generic'}`;}
  function footprintClasses(f,p){
    const set=new Set((f.footprint||[]).map(key)),out=['furniture-footprint',cls(f.kind)];
    if(set.has(`${p.x-1},${p.y}`))out.push('join-left');
    if(set.has(`${p.x+1},${p.y}`))out.push('join-right');
    if(set.has(`${p.x},${p.y-1}`))out.push('join-up');
    if(set.has(`${p.x},${p.y+1}`))out.push('join-down');
    return out.join(' ');
  }

  function decorateMap(){
    scheduled=false;
    for(const tile of map.querySelectorAll('.sim-tile[data-tile]')){
      if(tile.dataset.furnitureV102==='1')continue;
      tile.dataset.furnitureV102='1';
      const fs=F.furnitureAtTile(tile.dataset.tile);
      if(!fs.length)continue;
      tile.classList.add('has-furniture');
      for(const f of fs){
        tile.classList.add(cls(f.kind));
        const p=(f.footprint||[]).find(x=>key(x)===tile.dataset.tile);if(!p)continue;
        const display=f.displayAt&&key(f.displayAt)===tile.dataset.tile;
        const segment=document.createElement('span');
        segment.className=footprintClasses(f,p);
        segment.dataset.furniture=f.id;
        segment.setAttribute('role','button');
        segment.setAttribute('tabindex','0');
        segment.setAttribute('aria-label',`${f.name}・${tile.dataset.tile}`);
        segment.title=`${f.name}｜${(f.footprint||[]).map(key).join(' / ')}`;
        if(display){const icon=document.createElement('span');icon.className='furniture-symbol';icon.textContent=f.icon||'▰';segment.appendChild(icon);}
        tile.appendChild(segment);
      }
    }
    patchTileInspector();patchAgentSeatInspector();
  }

  function scheduleDecorate(){if(scheduled)return;scheduled=true;requestAnimationFrame(decorateMap);}

  function props(f){
    const out=[];
    if(f.blocksMovement)out.push('阻擋通行');
    if(f.occupiable)out.push('可占用座位');
    if(f.mealSeat)out.push('用餐優先座位');
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
    const p=props(f),state=E.getState();
    const occupants=Object.values(state.agents).filter(a=>(f.footprint||[]).some(pos=>a.position?.x===pos.x&&a.position?.y===pos.y)).map(a=>a.name);
    const supported=Object.values(state.containers||{}).filter(c=>c.supportId===f.id&&!c.heldBy).map(c=>c.name);
    ins.innerHTML=`<div class="inspect-title"><div class="inspect-icon">${esc(f.icon||'▰')}</div><div><h2>${esc(f.name)}</h2><small>Furniture・${esc(f.id)}</small></div></div>
      <div class="inspect-section"><h3>空間</h3><div class="kv"><div class="k">Zone</div><div>${esc(E.zoneName(f.zone))}</div><div class="k">Footprint</div><div>${esc(footprint)}</div><div class="k">占用者</div><div>${esc(occupants.join('、')||'無')}</div><div class="k">類型</div><div>${esc(f.kind||'家具')}</div></div></div>
      ${f.supportsObjects?`<div class="inspect-section"><h3>承載物件</h3><div class="tags">${supported.length?supported.map(x=>`<span class="tag">${esc(x)}</span>`).join(''):'<span class="tag">目前沒有</span>'}</div></div>`:''}
      <div class="inspect-section"><h3>屬性</h3><div class="tags">${p.length?p.map(x=>`<span class="tag">${esc(x)}</span>`).join(''):'<span class="tag">無特殊屬性</span>'}</div></div>
      <div class="inspect-section"><h3>說明</h3><div class="timeline-empty">家具 footprint 直接參與 Spatial Grid。深色連續底帶代表同一件家具跨越的格子；點 footprint 任一格都會開啟這個 Inspector。</div></div>`;
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

  function patchAgentSeatInspector(){
    if(renderingInspector)return;
    const small=ins.querySelector('.inspect-title small');if(!small?.textContent.startsWith('Agent・'))return;
    const id=small.textContent.slice('Agent・'.length),a=E.getState().agents[id];if(!a)return;
    const kv=ins.querySelector('.inspect-section .kv');if(!kv)return;
    const old=kv.querySelector('[data-seat-label]');
    if(!a.seatedOn){if(old){old.nextElementSibling?.remove();old.remove();}return;}
    const seat=F.get(a.seatedOn);if(!seat)return;
    if(old){if(old.nextElementSibling)old.nextElementSibling.textContent=seat.name;return;}
    const label=document.createElement('div');label.className='k';label.dataset.seatLabel='1';label.textContent='坐在';
    const value=document.createElement('div');value.textContent=seat.name;kv.append(label,value);
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