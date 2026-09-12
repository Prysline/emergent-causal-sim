(() => {
  const S=window.SimEngine,SP=window.SimSpatial;
  if(!S||!SP)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const posKey=p=>p?`${p.x},${p.y}`:'';

  function tileEntities(tile){
    const state=S.getState(),arr=[];
    for(const a of Object.values(state.agents))if(posKey(a.position)===tile.id)arr.push({kind:'agent',id:a.id,icon:a.kind==='cat'?'🐈':'👤',name:a.name,held:false});
    for(const c of Object.values(state.containers)){
      const p=c.heldBy?state.agents[c.heldBy]?.position:c.position;
      if(posKey(p)===tile.id)arr.push({kind:'container',id:c.id,icon:c.icon||'◻',name:c.name,held:!!c.heldBy});
    }
    for(const s of Object.values(state.sources))if(posKey(s.position)===tile.id)arr.push({kind:'source',id:s.id,icon:s.icon||'◻',name:s.name,held:false});
    return arr;
  }
  function tileClasses(tile,selected){
    const wet=tile.liquid>.1;
    return ['sim-tile',`zone-${tile.zone}`,tile.walkable?'':'blocked',wet?'wet':'',selected?.type==='tile'&&selected.id===tile.id?'selected':''].filter(Boolean).join(' ');
  }
  function renderMap(host,selected=null){
    const state=S.getState(),sp=state.spatial;if(!host||!sp)return false;
    const labels={'0,0':'pantry','4,0':'table','8,0':'rest','0,4':'doorway','4,4':'sink','8,4':'hearth'};
    const tiles=[];
    for(let y=0;y<sp.height;y++)for(let x=0;x<sp.width;x++){
      const info=S.tileInfo(`${x},${y}`);if(!info)continue;
      const entities=tileEntities(info),label=labels[info.id]?state.zones[labels[info.id]]?.name||labels[info.id]:'';
      const contents=Object.entries(info.contents||{}).filter(([,v])=>v>.1).map(([r,v])=>`<span class="tile-liquid" title="${esc(S.resourceName(r))} ${v.toFixed(1)}">${S.resourceIcon(r)}</span>`).join('');
      tiles.push(`<button class="${tileClasses(info,selected)}" data-tile="${info.id}" data-zone="${info.zone}" data-entity="tile:${info.id}" aria-label="${esc(S.zoneName(info.zone))} (${x},${y})">
        ${label?`<span class="tile-zone-label">${esc(label)}</span>`:''}
        <span class="tile-coord">${x},${y}</span>
        <span class="tile-contents">${contents}</span>
        <span class="tile-entities">${entities.map(e=>`<span class="spatial-entity ${e.kind} ${e.held?'held':''}" data-entity="${e.kind}:${e.id}" title="${esc(e.name)}">${e.icon}</span>`).join('')}</span>
      </button>`);
    }
    host.classList.add('spatial-active');
    host.innerHTML=`<div class="spatial-board" style="--grid-w:${sp.width};--grid-h:${sp.height}">${tiles.join('')}</div>`;
    return true;
  }

  window.SimSpatialUI={renderMap};
})();
