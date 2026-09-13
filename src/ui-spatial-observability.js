(() => {
  const E=window.SimEngine,SP=window.SimSpatial;if(!E||!SP?.agentObservation)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pos=o=>o?`(${o.position.x}, ${o.position.y})`:'無';
  const meters=v=>Number.isFinite(v)?`${v.toFixed(2)} m`:'—';
  const nodeText=o=>o?`${o.spaceLabel}・${o.surfaceLabel} ${pos(o)}`:'無';
  const overheadText=o=>o?.covered?o.overhead.map(x=>`${x.name}下（淨空 ${meters(x.clearance)}）`).join('、'):(o?.surfaceId!=='floor'?'家具表面':'一般地板');
  let pending=false;

  function sectionHtml(type,id){
    const s=E.getState();
    if(type==='Agent'){
      const a=s.agents[id],o=SP.agentObservation(s,id);if(!a||!o)return'';
      const goal=o.spatialGoal?nodeText(o.spatialGoal):'無';
      const path=o.lastPath?.length?o.lastPath.slice(-8).map(nodeText).join(' → '):'無';
      return `<h3>Spatial Node</h3><div class="kv spatial-kv"><div class="k">Space</div><div>${esc(o.spaceLabel)} <small>${esc(o.spaceId)}</small></div><div class="k">Surface</div><div>${esc(o.surfaceLabel)} <small>${esc(o.surfaceId)}</small></div><div class="k">Local Position</div><div>${esc(pos(o))}</div><div class="k">Node Key</div><div class="spatial-mono">${esc(o.nodeKey)}</div><div class="k">局部幾何</div><div>${esc(overheadText(o))}</div><div class="k">所需淨空</div><div>${esc(meters(o.requiredClearance))}</div><div class="k">此 Node 可通行</div><div>${o.walkable?'是':'否'}</div><div class="k">Spatial Goal</div><div>${esc(goal)}</div><div class="k">最近路徑</div><div class="spatial-path">${esc(path)}</div></div>`;
    }
    if(type==='Container'||type==='Source'){
      const o=SP.objectObservation(s,id);if(!o)return'';
      const support=o.supportId?(s.furniture[o.supportId]?.name||o.supportId):'無';
      return `<h3>Spatial Node</h3><div class="kv spatial-kv"><div class="k">Space</div><div>${esc(o.spaceLabel)} <small>${esc(o.spaceId)}</small></div><div class="k">Surface</div><div>${esc(o.surfaceLabel)} <small>${esc(o.surfaceId)}</small></div><div class="k">Local Position</div><div>${esc(pos(o))}</div><div class="k">Node Key</div><div class="spatial-mono">${esc(o.nodeKey)}</div><div class="k">承載家具</div><div>${esc(support)}</div><div class="k">局部幾何</div><div>${esc(overheadText(o))}</div></div>`;
    }
    if(type==='Furniture'){
      const o=SP.furnitureObservation(s,id);if(!o||(!o.surfaceId&&!Number.isFinite(o.clearance)))return'';
      const cells=o.cells.length?o.cells.map(p=>`(${p.x}, ${p.y})`).join('、'):'無';
      return `<h3>Spatial Geometry</h3><div class="kv spatial-kv"><div class="k">Surface</div><div>${esc(o.surfaceLabel||'無')} ${o.surfaceId?`<small>${esc(o.surfaceId)}</small>`:''}</div><div class="k">可 Traversal</div><div>${o.traversable?'是':'否'}</div><div class="k">Surface Cells</div><div>${esc(cells)}</div><div class="k">允許類型</div><div>${esc(o.allowKinds.join('、')||'—')}</div><div class="k">桌下／家具下淨空</div><div>${esc(meters(o.clearance))}</div></div>`;
    }
    return'';
  }

  function syncInspector(){
    const host=document.getElementById('inspector');if(!host)return;
    const meta=host.querySelector('.inspect-title small')?.textContent?.trim();
    let section=host.querySelector('.spatial-observability-section');
    if(!meta||!meta.includes('・')){section?.remove();return;}
    const [type,id]=meta.split('・',2),html=sectionHtml(type,id);
    if(!html){section?.remove();return;}
    if(!section){section=document.createElement('div');section.className='inspect-section spatial-observability-section';const first=host.querySelector('.inspect-section');if(first)first.insertAdjacentElement('afterend',section);else host.append(section);}
    if(section.innerHTML!==html)section.innerHTML=html;
  }

  function markerFor(o){if(!o)return'';if(o.surfaceId!=='floor')return'上';if(o.covered)return'下';return'';}
  function syncMap(){
    const s=E.getState(),map=document.getElementById('map');if(!map)return;
    map.querySelectorAll('.map-entity[data-entity]').forEach(btn=>{
      const [type,id]=(btn.dataset.entity||'').split(':',2);let o=null;
      if(type==='agent')o=SP.agentObservation(s,id);else if(type==='container'||type==='source')o=SP.objectObservation(s,id);
      const mark=markerFor(o);btn.classList.toggle('spatial-on-surface',!!o&&o.surfaceId!=='floor');btn.classList.toggle('spatial-under-cover',!!o?.covered);
      let badge=btn.querySelector('.spatial-node-mark');
      if(mark){if(!badge){badge=document.createElement('span');badge.className='spatial-node-mark';btn.append(badge);}if(badge.textContent!==mark)badge.textContent=mark;}else badge?.remove();
      if(o){if(!btn.dataset.baseTitle)btn.dataset.baseTitle=btn.title||'';const extra=`${o.spaceLabel}・${o.surfaceLabel}${o.covered?`・${o.overhead[0]?.name||'家具'}下`:''}`;const title=`${btn.dataset.baseTitle}・${extra}`;if(btn.title!==title)btn.title=title;}
    });
  }

  function syncActions(){
    const s=E.getState(),host=document.getElementById('actions');if(!host)return;
    host.querySelectorAll('[data-entity^="agent:"]').forEach(card=>{
      const id=card.dataset.entity.slice(6),o=SP.agentObservation(s,id),loc=card.querySelector('.action-location');if(!loc)return;
      let tag=loc.querySelector('.spatial-inline');const text=o?(o.surfaceId!=='floor'?o.surfaceLabel:o.covered?`${o.overhead[0]?.name||'家具'}下`:''):'';
      if(text){if(!tag){tag=document.createElement('span');tag.className='spatial-inline';loc.append(tag);}tag.textContent=`・${text}`;}else tag?.remove();
    });
  }

  function sync(){pending=false;syncInspector();syncMap();syncActions();}
  function schedule(){if(pending)return;pending=true;queueMicrotask(sync);}
  for(const id of ['inspector','map','actions']){const el=document.getElementById(id);if(el)new MutationObserver(schedule).observe(el,{childList:true,subtree:true,characterData:true});}
  schedule();
})();
