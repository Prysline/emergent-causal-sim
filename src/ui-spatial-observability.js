(() => {
  const E=window.SimEngine,SP=window.SimSpatial;if(!E||!SP?.agentObservation)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pos=o=>{if(!o)return'無';const z=SP.zOf?.(o.position)??o.position?.z??0;return `(${o.position.x}, ${o.position.y}, Z ${z})`;};
  const meters=v=>Number.isFinite(v)?`${v.toFixed(2)} m`:'—';
  const nodeText=o=>o?`${o.spaceLabel}・${o.surfaceLabel} ${pos(o)}`:'無';
  const overheadText=o=>o?.covered?o.overhead.map(x=>`${x.name}下（淨空 ${meters(x.clearance)}）`).join('、'):(o?.surfaceId!=='floor'?'家具表面':'一般地板');
  let pending=false;

  function normalizedInspectorType(type){return ({agent:'Agent',container:'Container',source:'Source',furniture:'Furniture',tile:'Tile',room:'Room',event:'Event'})[type]||(type==='Resource Source'?'Source':type);}
  function sectionHtml(type,id){
    const s=E.getState();type=normalizedInspectorType(type);
    if(type==='Agent'){
      const a=s.agents[id],o=SP.agentObservation(s,id);if(!a||!o)return'';
      const goal=o.spatialGoal?nodeText(o.spatialGoal):'無';
      const path=o.lastPath?.length?o.lastPath.slice(-8).map(nodeText).join(' → '):'無';
      const modes=o.routePlan?.steps?.length?[...new Set(o.routePlan.steps.map(step=>step.mode))].join(' → '):'—';
      const route=o.routePlan&&Number.isFinite(o.routePlan.traversalCost)?`distance ${o.routePlan.pathDistance}・cost ${Math.round(o.routePlan.traversalCost*100)/100}・time ${o.routePlan.travelTime} tick・modes ${modes}`:'無';
      const cg=o.nextCongestion,crowding=cg?`pressure ${cg.congestionPressure}・cost +${cg.congestionCost}・delay +${cg.delayTicks} tick・speed ×${cg.speedMultiplier}・occupants ${cg.occupantCount}${cg.widthKnown?`・passage ${cg.passageWidth}m`:'・width unknown'}`:'無';
      return `<h3>Spatial Node</h3><div class="kv spatial-kv"><div class="k">Space</div><div>${esc(o.spaceLabel)} <small>${esc(o.spaceId)}</small></div><div class="k">Surface</div><div>${esc(o.surfaceLabel)} <small>${esc(o.surfaceId)}</small></div><div class="k">Local Position</div><div>${esc(pos(o))}</div><div class="k">Node Key</div><div class="spatial-mono">${esc(o.nodeKey)}</div><div class="k">局部幾何</div><div>${esc(overheadText(o))}</div><div class="k">Current Mode</div><div>${esc(o.movementMode||'walk')}</div><div class="k">所需淨空</div><div>${esc(meters(o.requiredClearance))}</div><div class="k">Walk Node 可通行</div><div>${o.walkable?'是':'否'}</div><div class="k">Spatial Goal</div><div>${esc(goal)}</div><div class="k">Route Metrics</div><div>${esc(route)}</div><div class="k">Dynamic Congestion</div><div>${esc(crowding)}</div><div class="k">最近路徑</div><div class="spatial-path">${esc(path)}</div></div>`;
    }
    if(type==='Container'||type==='Source'){
      const o=SP.objectObservation(s,id);if(!o)return'';
      const support=o.supportId?(s.furniture[o.supportId]?.name||o.supportId):'無';
      return `<h3>Spatial Node</h3><div class="kv spatial-kv"><div class="k">Space</div><div>${esc(o.spaceLabel)} <small>${esc(o.spaceId)}</small></div><div class="k">Surface</div><div>${esc(o.surfaceLabel)} <small>${esc(o.surfaceId)}</small></div><div class="k">Local Position</div><div>${esc(pos(o))}</div><div class="k">Node Key</div><div class="spatial-mono">${esc(o.nodeKey)}</div><div class="k">承載家具</div><div>${esc(support)}</div><div class="k">局部幾何</div><div>${esc(overheadText(o))}</div></div>`;
    }
    if(type==='Furniture'){
      const o=SP.furnitureObservation(s,id);if(!o||(!o.surfaceId&&!Number.isFinite(o.clearance)))return'';
      const cells=o.cells.length?o.cells.map(p=>`(${p.x}, ${p.y}, Z ${SP.zOf?.(p)??p.z??0})`).join('、'):'無';
      return `<h3>Spatial Geometry</h3><div class="kv spatial-kv"><div class="k">Surface</div><div>${esc(o.surfaceLabel||'無')} ${o.surfaceId?`<small>${esc(o.surfaceId)}</small>`:''}</div><div class="k">可 Traversal</div><div>${o.traversable?'是':'否'}</div><div class="k">Surface Cells</div><div>${esc(cells)}</div><div class="k">允許類型</div><div>${esc(o.allowKinds.join('、')||'—')}</div><div class="k">桌下／家具下淨空</div><div>${esc(meters(o.clearance))}</div></div>`;
    }
    return'';
  }

  function syncBaseObjectLocation(host,type,id){
    type=normalizedInspectorType(type);if(type!=='Container'&&type!=='Source')return;
    const s=E.getState(),o=SP.objectObservation(s,id);if(!o)return;
    const first=host.querySelector('.inspect-section .kv');if(!first)return;
    const key=[...first.querySelectorAll('.k')].find(x=>x.textContent.trim()==='位置'),value=key?.nextElementSibling;if(!value)return;
    const wanted=SP.describePlace(s,o.node);if(value.textContent!==wanted)value.textContent=wanted;
  }
  function decorateInspector({host,selected}){
    if(!host)return;
    let section=host.querySelector('.spatial-observability-section');
    if(!selected){section?.remove();return;}
    const type=selected.type,id=selected.id,html=sectionHtml(type,id);
    syncBaseObjectLocation(host,type,id);
    if(!html){section?.remove();return;}
    if(!section){section=document.createElement('div');section.className='inspect-section spatial-observability-section';const first=host.querySelector('.inspect-section');if(first)first.insertAdjacentElement('afterend',section);else host.append(section);}
    if(section.innerHTML!==html)section.innerHTML=html;
  }

  function markerFor(type,o){if(type==='agent'&&o?.covered)return'↓';return'';}
  function syncFurnitureHandles(s,map){
    for(const f of Object.values(s.furniture||{})){
      const spatial=SP.furnitureObservation?.(s,f.id);
      map.querySelectorAll(`.furniture-footprint[data-entity="furniture:${f.id}"]`).forEach(seg=>seg.classList.toggle('spatial-traversable-surface',!!spatial?.surfaceId&&!!spatial?.traversable));
      if(!f.displayAt)continue;
      const tile=map.querySelector(`.sim-tile[data-tile="${SP.key(f.displayAt)}"]`);if(!tile||!tile.querySelector('.tile-entities .map-entity'))continue;
      let handle=tile.querySelector(`.spatial-furniture-handle[data-furniture-id="${f.id}"]`);
      if(!handle){handle=document.createElement('button');handle.className='spatial-furniture-handle';handle.dataset.entity=`furniture:${f.id}`;handle.dataset.furnitureId=f.id;handle.title=`檢視${f.name}空間`;handle.setAttribute('aria-label',`檢視${f.name}空間`);handle.textContent=f.icon||'▰';tile.append(handle);}
      const footprint=tile.querySelector(`.furniture-footprint[data-entity="furniture:${f.id}"]`);handle.classList.toggle('selected',!!footprint?.classList.contains('selected'));
    }
  }
  function syncMap(){
    const s=E.getState(),map=document.getElementById('map');if(!map)return;
    map.querySelectorAll('.map-entity[data-entity]').forEach(btn=>{
      const [type,id]=(btn.dataset.entity||'').split(':',2);let o=null;
      if(type==='agent')o=SP.agentObservation(s,id);else if(type==='container'||type==='source')o=SP.objectObservation(s,id);
      const mark=markerFor(type,o),onSurface=!!o&&o.surfaceId!=='floor',underCover=type==='agent'&&!!o?.covered;
      if(btn.classList.contains('spatial-on-surface')!==onSurface)btn.classList.toggle('spatial-on-surface',onSurface);
      if(btn.classList.contains('spatial-under-cover')!==underCover)btn.classList.toggle('spatial-under-cover',underCover);
      let badge=btn.querySelector('.spatial-node-mark');
      if(mark){if(!badge){badge=document.createElement('span');badge.className='spatial-node-mark';btn.append(badge);}if(badge.textContent!==mark)badge.textContent=mark;}else badge?.remove();
      if(o){if(!Object.prototype.hasOwnProperty.call(btn.dataset,'baseTitle'))btn.dataset.baseTitle=btn.title||'';const extra=`${o.spaceLabel}・${o.surfaceLabel}${o.covered?`・${o.overhead[0]?.name||'家具'}下`:''}`;const title=`${btn.dataset.baseTitle}・${extra}`;if(btn.title!==title)btn.title=title;}
    });
    syncFurnitureHandles(s,map);
  }

  function syncActions(){
    const s=E.getState(),host=document.getElementById('actions');if(!host)return;
    host.querySelectorAll('[data-entity^="agent:"]').forEach(card=>{
      const id=card.dataset.entity.slice(6),o=SP.agentObservation(s,id),loc=card.querySelector('.action-location');if(!loc)return;
      let tag=loc.querySelector('.spatial-inline');const text=o?(o.surfaceId!=='floor'?o.surfaceLabel:o.covered?`${o.overhead[0]?.name||'家具'}下`:''):'';
      const baseText=[...loc.childNodes].filter(n=>n!==tag).map(n=>n.textContent||'').join('');
      if(text&&!baseText.includes(text)){if(!tag){tag=document.createElement('span');tag.className='spatial-inline';loc.append(tag);}const wanted=`・${text}`;if(tag.textContent!==wanted)tag.textContent=wanted;}else tag?.remove();
    });
  }

  function syncMapAndActions(){pending=false;syncMap();syncActions();}
  function schedule(){if(pending)return;pending=true;queueMicrotask(syncMapAndActions);}
  const UI=window.SimUI;
  if(!UI?.registerInspectorDecorator)throw new Error('spatial.observability requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('spatial.observability',decorateInspector,100);
  for(const id of ['map','actions']){const el=document.getElementById(id);if(el)new MutationObserver(schedule).observe(el,{childList:true,subtree:true,characterData:true});}
  schedule();
})();
