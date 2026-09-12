(() => {
  const S=window.SimEngine,SP=window.SimSpatial;
  if(!S||!SP)return;
  const map=document.getElementById('map'),ins=document.getElementById('inspector');
  if(!map||!ins)return;
  let rendering=false,selectedTile=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const st=()=>S.getState();
  const posKey=p=>p?`${p.x},${p.y}`:'';

  function tileEntities(tile){
    const state=st(),arr=[];
    for(const a of Object.values(state.agents))if(posKey(a.position)===tile.id)arr.push({kind:'agent',id:a.id,icon:a.kind==='cat'?'🐈':'👤',name:a.name,held:false});
    for(const c of Object.values(state.containers)){
      const p=c.heldBy?state.agents[c.heldBy]?.position:c.position;if(posKey(p)===tile.id)arr.push({kind:'container',id:c.id,icon:c.icon||'◻',name:c.name,held:!!c.heldBy});
    }
    for(const s of Object.values(state.sources))if(posKey(s.position)===tile.id)arr.push({kind:'source',id:s.id,icon:s.icon||'◻',name:s.name,held:false});
    return arr;
  }
  function tileClasses(tile){
    const wet=tile.liquid>.1;return ['sim-tile',`zone-${tile.zone}`,tile.walkable?'':'blocked',wet?'wet':''].filter(Boolean).join(' ');
  }
  function renderSpatialMap(){
    if(rendering)return;rendering=true;
    const state=st(),sp=state.spatial;if(!sp){rendering=false;return;}
    const labels={'0,0':'pantry','4,0':'table','8,0':'rest','0,4':'doorway','4,4':'sink','8,4':'hearth'};
    const tiles=[];
    for(let y=0;y<sp.height;y++)for(let x=0;x<sp.width;x++){
      const info=S.tileInfo(`${x},${y}`);if(!info)continue;
      const entities=tileEntities(info),label=labels[info.id]?state.zones[labels[info.id]]?.name||labels[info.id]:'';
      const contents=Object.entries(info.contents||{}).filter(([,v])=>v>.1).map(([r,v])=>`<span class="tile-liquid" title="${esc(S.resourceName(r))} ${v.toFixed(1)}">${S.resourceIcon(r)}</span>`).join('');
      tiles.push(`<button class="${tileClasses(info)}" data-tile="${info.id}" data-zone="${info.zone}" aria-label="${esc(S.zoneName(info.zone))} (${x},${y})">
        ${label?`<span class="tile-zone-label">${esc(label)}</span>`:''}
        <span class="tile-coord">${x},${y}</span>
        <span class="tile-contents">${contents}</span>
        <span class="tile-entities">${entities.map(e=>`<span class="spatial-entity ${e.kind} ${e.held?'held':''}" data-entity="${e.kind}:${e.id}" title="${esc(e.name)}">${e.icon}</span>`).join('')}</span>
      </button>`);
    }
    map.classList.add('spatial-active');
    map.innerHTML=`<div class="spatial-board" style="--grid-w:${sp.width};--grid-h:${sp.height}">${tiles.join('')}</div>`;
    patchBadges();patchInspectorCoordinates();
    rendering=false;
  }
  function patchBadges(){
    const badges=document.getElementById('worldBadges');if(!badges)return;
    if(!badges.querySelector('[data-spatial-badge]'))badges.insertAdjacentHTML('beforeend',`<span class="mini-badge" data-spatial-badge>格狀 ${SP.WIDTH}×${SP.HEIGHT}</span>`);
  }
  function cleanupCoordinateRows(first){
    const labels=[...first.children].filter(el=>el.classList?.contains('k')&&el.textContent.trim()==='Tile 座標');
    if(!labels.length)return null;
    const keep=labels[0],value=keep.nextElementSibling;
    for(const extra of labels.slice(1)){
      const extraValue=extra.nextElementSibling;
      extra.remove();
      if(extraValue)extraValue.remove();
    }
    keep.dataset.spatialCoordinate='label';
    if(value)value.dataset.spatialCoordinate='value';
    return {label:keep,value};
  }
  function patchInspectorCoordinates(){
    if(selectedTile){
      const small=ins.querySelector('.inspect-title small');
      if(small?.textContent===`Tile・${selectedTile}`)return;
      renderTileInspector(selectedTile);return;
    }
    const small=ins.querySelector('.inspect-title small');if(!small)return;
    const [type,id]=small.textContent.split('・');let pos=null;
    if(type==='Agent')pos=st().agents[id]?.position;
    else if(type==='Container')pos=SP.objectPosition(id);
    else if(type==='Resource Source')pos=SP.objectPosition(id);
    if(!pos)return;
    const first=ins.querySelector('.inspect-section .kv');if(!first)return;
    const existing=cleanupCoordinateRows(first),text=`(${pos.x}, ${pos.y})`;
    if(existing?.value){if(existing.value.textContent!==text)existing.value.textContent=text;return;}
    const label=document.createElement('div');label.className='k';label.dataset.spatialCoordinate='label';label.textContent='Tile 座標';
    const value=document.createElement('div');value.dataset.spatialCoordinate='value';value.textContent=text;
    first.append(label,value);
  }
  function renderTileInspector(id){
    const t=S.tileInfo(id);if(!t)return;selectedTile=id;
    const contents=Object.entries(t.contents||{}).filter(([,v])=>v>.05);
    const occ=t.occupants.map(aid=>st().agents[aid]?.name).filter(Boolean);
    const blocked=t.staticBlockedBy?(st().containers[t.staticBlockedBy]||st().sources[t.staticBlockedBy])?.name:null;
    ins.innerHTML=`<div class="inspect-title"><div class="inspect-icon">▦</div><div><h2>Tile (${t.x}, ${t.y})</h2><small>Tile・${t.id}</small></div></div>
      <div class="inspect-section"><h3>空間</h3><div class="kv"><div class="k">Zone</div><div>${esc(S.zoneName(t.zone))}</div><div class="k">可通行</div><div>${t.walkable?'是':'否'}</div><div class="k">固定阻擋</div><div>${esc(blocked||'無')}</div><div class="k">目前角色</div><div>${esc(occ.join('、')||'無')}</div></div></div>
      <div class="inspect-section"><h3>表面內容物</h3>${contents.length?`<div class="content-list">${contents.map(([r,v])=>`<div class="content-item"><div class="content-head"><span>${S.resourceIcon(r)} ${esc(S.resourceName(r))}</span><b>${v.toFixed(1)}</b></div></div>`).join('')}</div>`:'<div class="timeline-empty">乾燥／無內容物</div>'}</div>
      <div class="inspect-section"><h3>說明</h3><div class="timeline-empty">Zone 用於語意判斷；Tile 用於實際位置、可通行性與尋路。v10 先保留既有 Zone 地面規則，同步投影到單格表面供觀測與後續局部接觸系統使用。</div></div>`;
    if(matchMedia('(max-width:720px)').matches&&window.simUI?.setMobileView)window.simUI.setMobileView('inspector');
  }

  document.addEventListener('click',e=>{
    const entity=e.target.closest('.spatial-entity[data-entity]');if(entity){selectedTile=null;return;}
    const tile=e.target.closest('.sim-tile[data-tile]');if(!tile)return;
    e.preventDefault();e.stopImmediatePropagation();renderTileInspector(tile.dataset.tile);
  },true);
  document.addEventListener('click',e=>{if(e.target.closest('[data-entity]')&&!e.target.closest('.sim-tile'))selectedTile=null;},true);

  const observer=new MutationObserver(()=>{
    if(rendering)return;
    requestAnimationFrame(()=>{
      if(!map.querySelector(':scope > .spatial-board'))renderSpatialMap();else{patchBadges();patchInspectorCoordinates();}
    });
  });
  observer.observe(document.body,{childList:true,subtree:true});
  renderSpatialMap();
})();
