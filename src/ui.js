(() => {
  const S=window.SimEngine;
  let selected=null, timer=null, mobileView='map', logMode='summary';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const entityKey=(type,id)=>`${type}:${id}`;
  const parseEntity=s=>{const i=s.indexOf(':');return {type:s.slice(0,i),id:s.slice(i+1)}};
  const state=()=>S.getState();
  const isMobile=()=>matchMedia('(max-width:720px)').matches;

  function setMobileView(view){
    mobileView=view;
    document.querySelectorAll('.view-panel[data-view]').forEach(p=>p.classList.toggle('mobile-active',p.dataset.view===view));
    document.querySelectorAll('.mobile-nav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===view));
    if(isMobile()) scrollTo({top:0,behavior:'auto'});
  }
  function select(type,id,open=true){selected={type,id};if(open&&isMobile())setMobileView('inspector');renderInspector();renderMapSelection();}

  function needClass(v){return v>=78?'critical':v>=58?'high':''}
  function wellbeingTagClass(v){return v<=30?'bad':v<=50?'warn':'good'}
  const VALUE_ZH={resource_to_floor:'資源 → 地面',container_to_floor:'容器 → 地面',floor_to_contact:'地面 → 身體接觸',contact_to_internal:'身體接觸 → 體內',cat_request:'回應橘子',proactive:'主動找橘子',coordination:'動作協調',floor_hazard:'地面濕滑'};
  function contentSummary(contents){return S.contentSummary(contents)}
  function entityChip(type,id,icon,name,extra=''){
    const cls=type==='agent'?(id==='orange'?'entity-chip cat':'entity-chip agent'):'entity-chip';
    return `<button class="${cls}" data-entity="${entityKey(type,id)}">${icon} ${esc(name)}${extra?` <span class="held-dot">${esc(extra)}</span>`:''}</button>`;
  }
  function renderMapSelection(){
    document.querySelectorAll('.zone-card').forEach(el=>el.classList.toggle('selected',selected?.type==='zone'&&selected.id===el.dataset.zone));
  }
  function renderMap(){
    const st=state();
    const html=Object.values(st.zones).map(z=>{
      const agents=S.occupants(z.id);
      const objects=[...Object.values(st.containers),...Object.values(st.sources)].filter(o=>S.objectLocation(o.id)===z.id);
      const floor=st.surfaces[S.surfaceId(z.id)],risk=S.floorSlipRisk(z.id),noise=S.zoneNoise(z.id);
      const floorWet=S.floorLiquidAmount(z.id)>.1;
      return `<article class="zone-card" data-zone="${z.id}" data-entity="${entityKey('zone',z.id)}">
        <div class="zone-title"><span>${z.icon}</span><b>${z.name}</b></div>
        <div class="zone-metrics"><span>噪音 ${Math.round(noise)}</span><span>休息 ${z.restQuality}</span><span class="${risk>3?'danger':risk>.5?'warning':''}">滑倒 ${risk.toFixed(1)}%</span></div>
        <div class="entity-row"><div class="row-label">角色</div>${agents.length?agents.map(a=>entityChip('agent',a.id,a.kind==='cat'?'🐈':'👤',a.name,a.plan?S.phaseLabel(a.plan.phase):'')).join(''):'<span class="zone-empty">無</span>'}</div>
        <div class="entity-row"><div class="row-label">物件</div>${objects.length?objects.map(o=>entityChip(st.sources[o.id]?'source':'container',o.id,o.icon||'◻',o.name,o.heldBy?`${st.agents[o.heldBy]?.name}持有`:'' )).join(''):'<span class="zone-empty">無</span>'}</div>
        <div class="entity-row"><div class="row-label">地面</div><button class="entity-chip ${floorWet?'floor-wet':''}" data-entity="${entityKey('surface',floor.id)}">🟫 ${floorWet?contentSummary(floor.contents):'乾燥'}</button></div>
        <div class="neighbors">鄰接：${z.neighbors.map(S.zoneName).join('・')}</div>
      </article>`;
    }).join('');
    $('map').innerHTML=html;renderMapSelection();
  }

  function renderActions(){
    const st=state();
    $('actions').innerHTML=Object.values(st.agents).map(a=>{
      const n=a.needs;
      return `<article class="action-card" data-entity="${entityKey('agent',a.id)}">
        <div class="action-top"><div class="avatar">${a.kind==='cat'?'🐈':'👤'}</div><div><div class="action-name">${a.name}</div><div class="action-location">📍 ${S.zoneName(a.location)}${a.held?`・拿著 ${S.endpointName(a.held)}`:''}${a.carrying?`・搬運 ${S.resourceName(a.carrying.resource)} ${Math.round(a.carrying.amount*10)/10}`:''}</div></div></div>
        <div class="action-now">▶ ${esc(S.planLabel(a))}<span class="effort-inline">今日負荷 ${Math.round((a.metrics?.exertionToday||0)*10)/10}</span></div>
        <div class="need-strip">${['hunger','thirst','fatigue','social'].map(k=>`<div class="need-pill ${needClass(n[k])}">${S.ZH[k]} ${Math.round(n[k])}</div>`).join('')}</div>
      </article>`;
    }).join('');
  }

  function isSummaryEvent(e){
    if(e.type==='bad'||e.type==='warn'||e.type==='good')return true;
    return /(等待|改去|詢問|聊天|摸|蹭|撒嬌|攝入|滑倒|灑|打翻|繞路|拿起|喝下|吃完|休息|太吵|清理|補充|裝進|舔毛)/.test(e.text);
  }
  function renderTimeline(){
    const events=state().events.filter(e=>logMode==='full'||isSummaryEvent(e)).slice(0,logMode==='full'?140:70);
    $('timeline').innerHTML=events.length?events.map(e=>`<div class="timeline-entry ${e.type}" data-entity="${entityKey('event',e.id)}"><span class="time">${e.time}</span><span class="text">${esc(e.text)}</span></div>`).join(''):'<div class="timeline-empty">目前沒有符合摘要條件的事件。切換「完整」可查看全部階段紀錄。</div>';
  }

  function worldOverview(){
    const st=state();
    const wet=Object.keys(st.zones).filter(z=>S.floorLiquidAmount(z)>.1).length;
    return `<div class="empty-inspector"><div><span>🔎</span><b>點選任何東西</b><br>角色、杯子、酒瓶、水龍頭、地面與區域都可以檢查。<br><br>目前 ${Object.keys(st.agents).length} 名 Agent・${Object.keys(st.containers).length} 個容器・${wet} 個區域有液體殘留。<br>Seed：${st.seed}</div></div>`;
  }
  function recentEvents(type,id,limit=8){
    const st=state(),obj=S.getEntity(type,id),name=obj?.name||'';
    const zoneId=type==='zone'?id:type==='surface'?obj?.zone:null;
    return st.events.filter(e=>{
      const vals=Object.values(e.data||{}).map(String);
      if(vals.includes(id))return true;
      if(type==='agent'&&e.text.includes(obj.name))return true;
      if(type==='container'&&e.text.includes(obj.name))return true;
      if(type==='source'&&e.text.includes(obj.name))return true;
      if(zoneId&&(e.data?.location===zoneId||e.text.includes(S.zoneName(zoneId))))return true;
      return name&&e.text.includes(name);
    }).slice(0,limit);
  }
  function recentBlock(type,id){
    const ev=recentEvents(type,id);if(!ev.length)return '<div class="timeline-empty">尚無直接相關紀錄。</div>';
    return `<div class="recent-list">${ev.map(e=>`<div class="recent-event" data-entity="${entityKey('event',e.id)}"><b>${e.time}</b>${esc(e.text)}</div>`).join('')}</div>`;
  }
  function contentsBlock(obj){
    const entries=Object.entries(obj.contents||{}).filter(([,v])=>v>.05);
    if(!entries.length)return '<div class="content-item">空</div>';
    return `<div class="content-list">${entries.map(([r,v])=>{const pct=obj.capacity?Math.min(100,v/obj.capacity*100):Math.min(100,v);return `<div class="content-item"><div class="content-head"><span>${S.resourceIcon(r)} ${S.resourceName(r)}</span><b>${Math.round(v*10)/10}</b></div><div class="content-bar"><i style="width:${pct}%"></i></div></div>`}).join('')}</div>`;
  }
  function propTag(label,cls=''){return `<span class="tag ${cls}">${label}</span>`}
  function displayValue(k,v){if(typeof v==='number')return Math.round(v*100)/100;if(k==='transfer'||k==='reason')return VALUE_ZH[v]||S.ZH[v]||v;if(k==='resource')return S.resourceName(v);if(k==='location'||(k==='target'&&state().zones[v]))return S.zoneName(v);if(['from','to','container','source'].includes(k)){if(v==='internal')return'體內';if(state().zones[v])return S.zoneName(v);return S.endpointName(v)}return S.ZH[v]||VALUE_ZH[v]||v}

  function inspectContainer(id){
    const st=state(),c=st.containers[id],loc=S.objectLocation(id),held=c.heldBy?st.agents[c.heldBy]?.name:'無';
    const props=[c.portable?propTag('可攜帶','good'):propTag('固定物件'),c.canDrinkFrom?propTag('可直接飲用','info'):'',c.canDrinkFrom&&c.drinkPreference!=null?propTag(`飲用偏好 ${Math.round(c.drinkPreference*100)}%`):'',c.refillFrom?propTag(`可補充：${S.endpointName(c.refillFrom)}`,'info'):''].filter(Boolean).join('');
    return `<div class="inspect-title"><div class="inspect-icon">${c.icon||'◻'}</div><div><h2>${c.name}</h2><small>Container・${id}</small></div></div>
      <div class="inspect-section"><h3>位置與持有</h3><div class="kv"><div class="k">位置</div><div>${S.zoneName(loc)}</div><div class="k">持有人</div><div>${held}</div><div class="k">容量</div><div>${Math.round(Object.values(c.contents||{}).reduce((a,b)=>a+b,0)*10)/10} / ${c.capacity}</div></div></div>
      <div class="inspect-section"><h3>內容物</h3>${contentsBlock(c)}</div>
      <div class="inspect-section"><h3>屬性</h3><div class="tags">${props||propTag('無特殊屬性')}</div></div>
      <div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('container',id)}</div>`;
  }
  function inspectSource(id){const s=state().sources[id];return `<div class="inspect-title"><div class="inspect-icon">${s.icon||'◻'}</div><div><h2>${s.name}</h2><small>Resource Source・${id}</small></div></div><div class="inspect-section"><h3>屬性</h3><div class="kv"><div class="k">位置</div><div>${S.zoneName(s.location)}</div><div class="k">提供</div><div>${S.resourceIcon(s.resource)} ${S.resourceName(s.resource)}</div><div class="k">供應</div><div>${s.infinite?'無限（MVP 規則）':s.amount??0}</div></div></div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('source',id)}</div>`}
  function inspectSurface(id){const f=state().surfaces[id],risk=S.floorSlipRisk(f.zone);return `<div class="inspect-title"><div class="inspect-icon">🟫</div><div><h2>${f.name}</h2><small>Surface・${id}</small></div></div><div class="inspect-section"><h3>環境</h3><div class="kv"><div class="k">區域</div><div>${S.zoneName(f.zone)}</div><div class="k">液體總量</div><div>${Math.round(S.floorLiquidAmount(f.zone)*10)/10}</div><div class="k">滑倒風險</div><div>${risk.toFixed(1)}%</div></div></div><div class="inspect-section"><h3>表面內容物</h3>${contentsBlock(f)}</div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('surface',id)}</div>`}
  function inspectZone(id){const st=state(),z=st.zones[id],agents=S.occupants(id),objs=[...Object.values(st.containers),...Object.values(st.sources)].filter(o=>S.objectLocation(o.id)===id);return `<div class="inspect-title"><div class="inspect-icon">${z.icon}</div><div><h2>${z.name}</h2><small>Zone・${id}</small></div></div><div class="inspect-section"><h3>環境</h3><div class="kv"><div class="k">噪音</div><div>${Math.round(S.zoneNoise(id))}</div><div class="k">休息品質</div><div>${z.restQuality}</div><div class="k">滑倒風險</div><div>${S.floorSlipRisk(id).toFixed(1)}%</div><div class="k">鄰接</div><div>${z.neighbors.map(S.zoneName).join('、')}</div></div></div><div class="inspect-section"><h3>目前角色</h3><div class="tags">${agents.length?agents.map(a=>entityChip('agent',a.id,a.kind==='cat'?'🐈':'👤',a.name)).join(''):propTag('無')}</div></div><div class="inspect-section"><h3>目前物件</h3><div class="tags">${objs.length?objs.map(o=>entityChip(st.sources[o.id]?'source':'container',o.id,o.icon||'◻',o.name)).join(''):propTag('無')}</div></div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('zone',id)}</div>`}
  function inspectAgent(id){
    const st=state(),a=st.agents[id],th=st.thoughts[id],contacts=Object.entries(a.contacts).flatMap(([part,c])=>Object.entries(c).filter(([,v])=>v>.1).map(([r,v])=>`${part==='paws'?'腳掌':part==='hands'?'雙手':'腳'}：${S.resourceName(r)} ${Math.round(v)}`));
    const carrying=a.carrying?`${S.resourceName(a.carrying.resource)} ${Math.round(a.carrying.amount*10)/10}`:'無';
    const pending=a.pendingInteraction?.type==='catAttention'?`橘子正在等待回應（剩 ${a.pendingInteraction.ttl} tick）`:'無';
    let decision='';if($('showThoughts').checked&&th){decision=`<div class="decision">${th.options.slice(0,7).map(o=>`<div class="decision-row"><span>${S.ZH[o.id]||o.id}${o.id===th.pick.id?' ← 選擇':''}</span><b>${Math.round(o.score)}</b></div>`).join('')}<div class="decision-reason"><b>${S.ZH[th.pick.id]||th.pick.id}</b><br>${th.pick.why.map(x=>'＋ '+esc(x)).join('<br>')}</div></div>`}else decision='<div class="timeline-empty">尚未產生決策資料，或已關閉決策原因。</div>';
    return `<div class="inspect-title"><div class="inspect-icon">${a.kind==='cat'?'🐈':'👤'}</div><div><h2>${a.name}</h2><small>Agent・${id}</small></div></div><div class="inspect-section"><h3>現在</h3><div class="kv"><div class="k">位置</div><div>${S.zoneName(a.location)}</div><div class="k">行動</div><div>${esc(S.planLabel(a))}</div><div class="k">醉酒</div><div>${Math.round(a.status.intoxication)}</div><div class="k">動作協調</div><div>${Math.round(S.coordination(a))}</div><div class="k">持有容器</div><div>${a.held?S.endpointName(a.held):'無'}</div><div class="k">搬運資源</div><div>${carrying}</div><div class="k">待回應互動</div><div>${pending}</div><div class="k">今日活動負荷</div><div>${Math.round((a.metrics?.exertionToday||0)*10)/10}</div><div class="k">最近負荷</div><div>${a.metrics?.lastExertion?`${esc(a.metrics.lastExertion.reason)} +${Math.round(a.metrics.lastExertion.amount*10)/10}`:'無'}</div></div></div><div class="inspect-section"><h3>需求｜高＝更迫切</h3><div class="tags">${Object.entries(a.needs).map(([k,v])=>propTag(`${S.ZH[k]||k} ${Math.round(v)}`,v>=75?'bad':v>=55?'warn':'' )).join('')}</div></div><div class="inspect-section"><h3>狀態｜高＝較好</h3><div class="tags">${Object.entries(a.wellbeing||{}).map(([k,v])=>propTag(`${S.ZH[k]||k} ${Math.round(v)}`,wellbeingTagClass(v))).join('')}</div></div>${contacts.length?`<div class="inspect-section"><h3>附著物</h3><div class="tags">${contacts.map(x=>propTag(x,'warn')).join('')}</div></div>`:''}<div class="inspect-section"><h3>最近決策</h3>${decision}</div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('agent',id)}</div>`}
  function inspectEvent(id){const e=state().causes[id];if(!e)return '<div class="empty-inspector">事件不存在。</div>';const rows=Object.entries(e.data||{}).map(([k,v])=>`<div class="k">${S.DATA_ZH[k]||S.ZH[k]||k}</div><div>${esc(displayValue(k,v))}</div>`).join('');return `<div class="inspect-title"><div class="inspect-icon">⚡</div><div><h2>${e.time}・事件</h2><small>${e.type}</small></div></div><div class="inspect-section"><h3>內容</h3><div class="content-item">${esc(e.text)}</div></div>${rows?`<div class="inspect-section"><h3>詳細資料</h3><div class="kv">${rows}</div></div>`:''}<div class="inspect-section"><h3>因果鏈</h3><div class="cause">${esc(S.causeTree(id))}</div></div>`}
  function renderInspector(){if(!selected){$('inspector').innerHTML=worldOverview();return}const {type,id}=selected;let html='';if(type==='container')html=inspectContainer(id);else if(type==='source')html=inspectSource(id);else if(type==='surface')html=inspectSurface(id);else if(type==='zone')html=inspectZone(id);else if(type==='agent')html=inspectAgent(id);else if(type==='event')html=inspectEvent(id);$('inspector').innerHTML=html||worldOverview();}

  function renderWorldBadges(){const st=state(),wet=Object.keys(st.zones).filter(z=>S.floorLiquidAmount(z)>.1).length,held=Object.values(st.containers).filter(c=>c.heldBy).length;const intox=Object.values(st.agents).filter(a=>a.status.intoxication>=8).length;$('worldBadges').innerHTML=`<span class="mini-badge">濕地 ${wet}</span><span class="mini-badge">持有物 ${held}</span><span class="mini-badge">醉酒 ${intox}</span>`}
  function render(){const st=state();$('clock').textContent=`第 ${st.day} 天 ${S.timeStr()}`;$('tickLabel').textContent=`Tick ${st.tick}・Seed ${st.seed}`;if(document.activeElement!==$('seedInput'))$('seedInput').value=st.seed;renderWorldBadges();renderMap();renderActions();renderTimeline();renderInspector()}

  document.addEventListener('click',e=>{const target=e.target.closest('[data-entity]');if(!target)return;e.stopPropagation();const x=parseEntity(target.dataset.entity);select(x.type,x.id,true)});
  document.querySelectorAll('[data-logmode]').forEach(b=>b.onclick=()=>{logMode=b.dataset.logmode;document.querySelectorAll('[data-logmode]').forEach(x=>x.classList.toggle('active',x===b));renderTimeline()});
  document.querySelectorAll('.mobile-nav [data-tab]').forEach(b=>b.onclick=()=>setMobileView(b.dataset.tab));
  $('showThoughts').onchange=renderInspector;
  $('step').onclick=()=>{S.tick();render()};
  $('step10').onclick=()=>{for(let i=0;i<10;i++)S.tick();render()};
  $('reset').onclick=()=>{if(timer){clearInterval(timer);timer=null;$('play').textContent='▶ 開始'}const seed=Number($('seedInput').value)||S.getSeed();S.reset(seed);selected=null;render()};
  $('play').onclick=()=>{if(timer){clearInterval(timer);timer=null;$('play').textContent='▶ 開始'}else{timer=setInterval(()=>{S.tick();render()},700);$('play').textContent='⏸ 暫停'}};
  addEventListener('resize',()=>{if(isMobile())setMobileView(mobileView);else document.querySelectorAll('.view-panel').forEach(p=>p.classList.add('mobile-active'))});
  window.simUI={render,select,setMobileView};
  render();setMobileView('map');
})();
