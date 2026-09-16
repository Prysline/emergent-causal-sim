(() => {
  const E=window.SimEngine,SP=window.SimSpatial,W=window.SimWorld,UI=window.SimUI;
  if(!E||!SP||!W||typeof document==='undefined')return;
  if(!UI?.registerInspectorDecorator)throw new Error('Entity Readable View requires inspector decorator lifecycle');

  const VERSION=W.PRESENTATION_SCHEMA_VERSION;
  if(!VERSION)throw new Error('Entity Readable View requires presentation schema version');
  const host=document.getElementById('inspector');if(!host)return;
  const SUPPORTED=new Set(['container','source','furniture','tile','room','event']);
  let currentKey=null,mode='readable';

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sum=o=>Object.values(o||{}).reduce((a,b)=>a+(Number(b)||0),0);
  const resourceName=id=>W.RESOURCE_TYPES?.[id]?.name||E.resourceName?.(id)||id||'資源';
  const roomName=(st,id)=>st?.map?.rooms?.[id]?.name||id||'未命名區域';
  const amount=v=>Math.round((Number(v)||0)*10)/10;

  function contentsEntries(contents){return Object.entries(contents||{}).filter(([,v])=>(Number(v)||0)>.05);}
  function contentsText(contents,empty='目前是空的。'){
    const entries=contentsEntries(contents);
    if(!entries.length)return empty;
    return entries.map(([r,v])=>`${resourceName(r)} ${amount(v)}`).join('、');
  }
  function publicRecentEvents(st,type,id,limit=5){
    const ref=`${type}:${id}`;
    return (st.events||[]).filter(e=>e?.type!=='system'&&e?.data?.visibility!=='private'&&e?.data?.entities?.includes(ref)).slice(0,limit);
  }
  function recentCard(st,type,id){
    const events=publicRecentEvents(st,type,id);
    if(!events.length)return '';
    return `<section class="resident-card"><h3>最近發生的事</h3><div class="resident-life-list">${events.map(e=>`<button class="resident-life-event" data-entity="event:${esc(e.id)}"><time>${esc(e.time||'')}</time><span>${esc(e.text||'')}</span></button>`).join('')}</div></section>`;
  }
  function hero(icon,name,meta=''){
    return `<section class="resident-hero"><div class="resident-avatar">${esc(icon||'◻')}</div><div><h2>${esc(name)}</h2>${meta?`<p>${esc(meta)}</p>`:''}</div></section>`;
  }
  function fact(label,value){return `<div class="resident-need-head"><b>${esc(label)}</b><span>${esc(value)}</span></div>`;}
  function factCard(title,rows){
    const body=rows.filter(Boolean).join('');
    return body?`<section class="resident-card"><h3>${esc(title)}</h3><div class="resident-needs">${body}</div></section>`:'';
  }
  function entityChip(type,id,label,icon=''){
    return `<button class="entity-chip" data-entity="${esc(type)}:${esc(id)}">${esc(icon)}${icon?' ':''}${esc(label)}</button>`;
  }
  function chipsCard(title,chips,empty='目前沒有。'){
    return `<section class="resident-card"><h3>${esc(title)}</h3>${chips.length?`<div class="tags">${chips.join('')}</div>`:`<div class="resident-empty">${esc(empty)}</div>`}</section>`;
  }
  function placeText(st,p){return p?SP.describePlace(st,p):'位置不明';}
  function surfaceContents(st,f){
    const cells=f?.spatial?.surface?.cells||[];
    const totals={};
    for(const cell of cells){
      const node=SP.normalizeNode?.(st,{x:cell.x,y:cell.y},f.spatial.surface.id);
      const env=node&&SP.environmentAt?.(st,node,{create:false});
      for(const [r,v] of Object.entries(env?.contents||{}))totals[r]=(totals[r]||0)+(Number(v)||0);
    }
    return totals;
  }
  function capabilityLabels(f){
    const labels=[];
    for(const slot of f?.slots||[]){
      if(slot.canRest)labels.push('可以休息');
      if(slot.mealSeat)labels.push('可以坐著用餐');
      if(slot.canSleep)labels.push('可以睡覺');
      if(slot.canExit)labels.push('可以通往門外');
    }
    return [...new Set(labels)];
  }
  function containerView(st,id){
    const c=st.containers?.[id];if(!c)return '';
    const p=SP.objectPosition(st,id),holder=SP.holderOf(st,id),support=c.supportId&&st.furniture?.[c.supportId];
    const used=sum(c.contents),capacity=Number(c.capacity)||0,where=holder?`${holder.name}正拿著`:support?`放在${support.name}上`:placeText(st,p);
    const abilities=[];
    abilities.push(c.portable?'可以拿起來':'固定在原處');
    if(c.canDrinkFrom)abilities.push('可以直接飲用');
    if(c.transportResources?.length)abilities.push(`可以搬運${c.transportResources.map(resourceName).join('、')}`);
    return `${hero(c.icon||'◻',c.name,where)}${factCard('內容與容量',[
      fact('內容物',contentsText(c.contents)),
      capacity>0?fact('目前容量',`${amount(used)} / ${amount(capacity)}`):'',
      holder?fact('持有人',holder.name):'',
      support?fact('放置於',support.name):''
    ])}${chipsCard('可以怎麼使用',abilities.map(x=>`<span class="tag">${esc(x)}</span>`),'目前沒有額外用途。')}${recentCard(st,'container',id)}`;
  }
  function sourceView(st,id){
    const o=st.sources?.[id];if(!o)return '';
    const p=SP.objectPosition(st,id),supply=o.infinite?'可以持續取用':`目前約剩 ${amount(o.amount)}`;
    return `${hero(o.icon||'◉',o.name,placeText(st,p))}${factCard('提供的資源',[
      fact('可以取得',resourceName(o.resource)),
      fact('供應狀態',supply)
    ])}${recentCard(st,'source',id)}`;
  }
  function furnitureView(st,id){
    const f=st.furniture?.[id];if(!f)return '';
    const p=f.displayAt||(f.footprint||[])[0]||null;
    const capabilities=capabilityLabels(f);
    const users=[];
    for(const slot of f.slots||[]){const occ=SP.slotOccupant(st,slot.id);if(occ&&!users.some(x=>x.id===occ.id))users.push(occ);}
    const supported=Object.values(st.containers||{}).filter(c=>c.supportId===id);
    const surface=surfaceContents(st,f);
    return `${hero(f.icon||'▰',f.name,p?placeText(st,p):'位置不明')}${chipsCard('用途',capabilities.map(x=>`<span class="tag">${esc(x)}</span>`),'目前沒有特別標示的用途。')}${chipsCard('正在使用',users.map(a=>entityChip('agent',a.id,a.name,a.kind==='cat'?'🐈':'👤')),'目前沒有人正在使用。')}${supported.length?chipsCard('上面放著',supported.map(c=>entityChip('container',c.id,c.name,c.icon||'◻'))):''}${contentsEntries(surface).length?factCard('表面狀況',[fact('表面有',contentsText(surface))]):''}${recentCard(st,'furniture',id)}`;
  }
  function tileView(st,id){
    const t=st.map?.tiles?.[id];if(!t)return '';
    const terrain={floor:'地面',wall:'牆面',doorway:'門口'}[t.terrain]||'地面';
    const occupants=SP.occupantsAt(st,t)||[],furniture=SP.furnitureAt(st,t)||[],surface=t.surface?.contents||{};
    return `${hero(t.terrain==='wall'?'🧱':t.terrain==='doorway'?'🚪':'▫️',terrain,roomName(st,t.roomId))}${factCard('目前狀況',[
      fact('通行',SP.walkable(st,t)?'可以通行':'無法通行'),
      contentsEntries(surface).length?fact('地面／表面',contentsText(surface)):''
    ])}${occupants.length?chipsCard('這裡的人',occupants.map(a=>entityChip('agent',a.id,a.name,a.kind==='cat'?'🐈':'👤'))):''}${furniture.length?chipsCard('這裡的家具',furniture.map(f=>entityChip('furniture',f.id,f.name,f.icon||'▰'))):''}`;
  }
  function roomView(st,id){
    const r=st.map?.rooms?.[id];if(!r)return '';
    const agents=Object.values(st.agents||{}).filter(a=>!a.offMap&&SP.roomAt(st,a.position)===id);
    const furniture=Object.values(st.furniture||{}).filter(f=>(f.footprint||[]).some(p=>SP.roomAt(st,p)===id));
    return `${hero('🏠',r.name||id,'空間')}${factCard('目前狀況',[
      fact('居民',agents.length?`${agents.length} 位`:'目前沒有人'),
      fact('家具',furniture.length?`${furniture.length} 件`:'目前沒有家具')
    ])}${agents.length?chipsCard('目前在這裡',agents.map(a=>entityChip('agent',a.id,a.name,a.kind==='cat'?'🐈':'👤'))):''}${furniture.length?chipsCard('家具',furniture.map(f=>entityChip('furniture',f.id,f.name,f.icon||'▰'))):''}`;
  }
  function entityFromRef(st,ref){
    if(typeof ref!=='string')return null;
    const i=ref.indexOf(':');if(i<1)return null;
    const type=ref.slice(0,i),id=ref.slice(i+1);
    if(type==='agent'&&st.agents?.[id])return {type,id,label:st.agents[id].name,icon:st.agents[id].kind==='cat'?'🐈':'👤'};
    if(type==='container'&&st.containers?.[id])return {type,id,label:st.containers[id].name,icon:st.containers[id].icon||'◻'};
    if(type==='source'&&st.sources?.[id])return {type,id,label:st.sources[id].name,icon:st.sources[id].icon||'◉'};
    if(type==='furniture'&&st.furniture?.[id])return {type,id,label:st.furniture[id].name,icon:st.furniture[id].icon||'▰'};
    if(type==='room'&&st.map?.rooms?.[id])return {type,id,label:st.map.rooms[id].name||id,icon:'🏠'};
    return null;
  }
  function eventView(st,id){
    const e=st.causes?.[id];if(!e)return '';
    const related=(e.data?.entities||[]).map(ref=>entityFromRef(st,ref)).filter(Boolean);
    const unique=related.filter((x,i,arr)=>arr.findIndex(y=>y.type===x.type&&y.id===x.id)===i);
    return `${hero('⚡','發生的事',e.time||'')}<section class="resident-card resident-now"><h3>內容</h3><strong>${esc(e.text||'')}</strong></section>${unique.length?chipsCard('相關對象',unique.map(x=>entityChip(x.type,x.id,x.label,x.icon))):''}`;
  }
  function readableBody(st,selected){
    if(selected.type==='container')return containerView(st,selected.id);
    if(selected.type==='source')return sourceView(st,selected.id);
    if(selected.type==='furniture')return furnitureView(st,selected.id);
    if(selected.type==='tile')return tileView(st,selected.id);
    if(selected.type==='room')return roomView(st,selected.id);
    if(selected.type==='event')return eventView(st,selected.id);
    return '';
  }
  function applyMode(shell){
    const readable=shell.querySelector('[data-v1141-entity-readable]'),debug=shell.querySelector('[data-v1141-entity-debug]');
    readable.hidden=mode!=='readable';debug.hidden=mode!=='debug';
    shell.querySelectorAll('[data-v1141-entity-mode]').forEach(b=>{const on=b.dataset.v1141EntityMode===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  }
  function buildShell(selected){
    const shell=document.createElement('div');shell.dataset.v1141EntityRoot='';shell.className='resident-inspector-shell';
    const modeBar=document.createElement('div');modeBar.className='resident-mode-toggle';modeBar.setAttribute('aria-label','實體檢視 / Debug Inspector');modeBar.innerHTML='<button data-v1141-entity-mode="readable">檢視</button><button data-v1141-entity-mode="debug">Debug</button>';
    const readable=document.createElement('div');readable.dataset.v1141EntityReadable='';readable.className='resident-view';readable.innerHTML=readableBody(E.getState(),selected);
    const debug=document.createElement('div');debug.dataset.v1141EntityDebug='';debug.className='debug-inspector-view';
    const existing=[...host.childNodes];for(const node of existing)debug.appendChild(node);
    shell.append(modeBar,readable,debug);host.append(shell);applyMode(shell);return shell;
  }
  function decorateInspector({host:renderHost,selected}){
    if(renderHost!==host)return;
    if(selected?.type==='agent'){
      currentKey=null;mode='readable';
      const agentToggle=host.querySelector('[data-v1140-mode="resident"]');if(agentToggle)agentToggle.textContent='檢視';
      return;
    }
    if(!selected||!SUPPORTED.has(selected.type)){currentKey=null;mode='readable';return;}
    const key=`${selected.type}:${selected.id}`;
    if(key!==currentKey){currentKey=key;mode='readable';}
    let shell=host.querySelector(':scope > [data-v1141-entity-root]');
    if(!shell)shell=buildShell(selected);
    else{const view=shell.querySelector('[data-v1141-entity-readable]');if(view)view.innerHTML=readableBody(E.getState(),selected);applyMode(shell);}
  }

  UI.registerInspectorDecorator('entityReadable.layer',decorateInspector,1050);
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-v1141-entity-mode]');if(!button)return;
    mode=button.dataset.v1141EntityMode==='debug'?'debug':'readable';
    const shell=host.querySelector(':scope > [data-v1141-entity-root]');if(shell)applyMode(shell);
  });

  E.UI_ENTITY_READABLE_VERSION=VERSION;
})();
