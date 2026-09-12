(() => {
  const F=window.SimFurniture;
  if(!F)return;
  const key=p=>`${p.x},${p.y}`;
  const cls=kind=>`furniture-${kind||'generic'}`;

  function footprintClasses(f,p,selected){
    const set=new Set((f.footprint||[]).map(key)),out=['furniture-footprint',cls(f.kind)];
    if(set.has(`${p.x-1},${p.y}`))out.push('join-left');
    if(set.has(`${p.x+1},${p.y}`))out.push('join-right');
    if(set.has(`${p.x},${p.y-1}`))out.push('join-up');
    if(set.has(`${p.x},${p.y+1}`))out.push('join-down');
    if(selected?.type==='furniture'&&selected.id===f.id)out.push('selected');
    return out.join(' ');
  }

  function decorateMap(host,selected=null){
    if(!host)return;
    for(const tile of host.querySelectorAll('.sim-tile[data-tile]')){
      const fs=F.furnitureAtTile(tile.dataset.tile);if(!fs.length)continue;
      tile.classList.add('has-furniture');
      for(const f of fs){
        tile.classList.add(cls(f.kind));
        const p=(f.footprint||[]).find(x=>key(x)===tile.dataset.tile);if(!p)continue;
        const display=f.displayAt&&key(f.displayAt)===tile.dataset.tile;
        const segment=document.createElement('span');
        segment.className=footprintClasses(f,p,selected);
        segment.dataset.entity=`furniture:${f.id}`;
        segment.dataset.furniture=f.id;
        segment.setAttribute('role','button');
        segment.setAttribute('tabindex','0');
        segment.setAttribute('aria-label',`${f.name}・${tile.dataset.tile}`);
        segment.title=`${f.name}｜${(f.footprint||[]).map(key).join(' / ')}`;
        if(display){const icon=document.createElement('span');icon.className='furniture-symbol';icon.textContent=f.icon||'▰';segment.appendChild(icon);}
        tile.appendChild(segment);
      }
    }
  }

  window.SimFurnitureUI={decorateMap};
})();
