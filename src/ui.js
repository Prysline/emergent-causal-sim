(() => {
  const S=window.SimEngine,SP=window.SimSpatial,F=window.SimFurniture;
  let selected=null,timer=null,mobileView='map',logMode='summary';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const entityKey=(type,id)=>`${type}:${id}`;
  const parseEntity=s=>{const i=s.indexOf(':');return {type:s.slice(0,i),id:s.slice(i+1)}};
  const state=()=>S.getState();
  const isMobile=()=>matchMedia('(max-width:720px)').matches;
  const posText=p=>p?`(${p.x}, ${p.y})`:'無';

  function setMobileView(view){
    mobileView=view;
    document.querySelectorAll('.view-panel[data-view]').forEach(p=>p.classList.toggle('mobile-active',p.dataset.view===view));
    document.querySelectorAll('.mobile-nav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===view));
    if(isMobile())scrollTo({top:0,behavior:'auto'});
  }
  function select(type,id,open=true){selected={type,id};if(open&&isMobile())setMobileView('inspector');renderMap();renderInspector();}
  function clearSelection(){selected=null;renderMap();renderInspector();}

  function needClass(v){return v>=78?'critical':v>=58?'high':''}
  function wellbeingTagClass(v){return v<=30?'bad':v<=50?'warn':'good'}
  const VALUE_ZH={resource_to_floor:'資源 → 地面',container_to_floor:'容器 → 地面',floor_to_contact:'地面 → 身體接觸',contact_to_internal:'身體接觸 → 體內',cat_request:'回應橘子',proactive:'主動找橘子',coordination:'動作協調',floor_hazard:'地面濕滑'};
  function contentSummary(contents){return S.contentSummary(contents)}
  function entityChip(type,id,icon,name,extra=''){
    const cls=type==='agent'?(id==='orange'?'entity-chip cat':'entity-chip agent'):'entity-chip';
    return `<button class="${cls}" data-entity="${entityKey(type,id)}">${icon} ${esc(name)}${extra?` <span class="held-dot">${esc(extra)}</span>`:''}</button>`;
  }

  function renderFallbackMap(){
    const st=state();
    $('map').classList.remove('spatial-active');
    $('map').innerHTML=Object.values(st.zones).map(z=>{
      const agents=S.occupants(z.id),objects=[...Object.values(st.containers),...Object.values(st.sources)].filter(o=>S.objectLocation(o.id)===z.id);
      const floor=st.surfaces[S.surfaceId(z.id)],risk=S.floorSlipRisk(z.id),noise=S.zoneNoise(z.id),floorWet=S.floorLiquidAmount(z.id)>.1;
      return `<article class="zone-card ${selected?.type==='zone'&&selected.id===z.id?'selected':''}" data-zone="${z.id}" data-entity="zone:${z.id}">
        <div class="zone-title"><span>${z.icon}</span><b>${z.name}</b></div>
        <div class="zone-metrics"><span>噪音 ${Math.round(noise)}</span><span>休息 ${z.restQuality}</span><span class="${risk>3?'danger':risk>.5?'warning':''}">滑倒 ${risk.toFixed(1)}%</span></div>
        <div class="entity-row"><div class="row-label">角色</div>${agents.length?agents.map(a=>entityChip('agent',a.id,a.kind==='cat'?'🐈':'👤',a.name,a.plan?S.phaseLabel(a.plan.phase):'')).join(''):'<span class="zone-empty">無</span>'}</div>
        <div class="entity-row"><div class="row-label">物件</div>${objects.length?objects.map(o=>entityChip(st.sources[o.id]?'source':'container',o.id,o.icon||'◻',o.name,o.heldBy?`${st.agents[o.heldBy]?.name}持有`:'' )).join(''):'<span class="zone-empty">無</span>'}</div>
        <div class="entity-row"><div class="row-label">地面</div><button class="entity-chip ${floorWet?'floor-wet':''}" data-entity="surface:${floor.id}">🟫 ${floorWet?contentSummary(floor.contents):'乾燥'}</button></div>
      </article>`;
    }).join('');
  }
  function renderMap(){
    const host=$('map');
    if(window.SimSpatialUI?.renderMap?.(host,selected)){window.SimFurnitureUI?.decorateMap?.(host,selected);return;}
    renderFallbackMap();
  }

  function renderActions(){
    const st=state();
    $('actions').innerHTML=Object.values(st.agents).map(a=>{
      const n=a.needs,posture=a.posture?.kind==='sitting'?'・坐著':a.posture?.kind==='lying'?'・躺著':'';
      return `<article class="action-card" data-entity="agent:${a.id}">
        <div class="action-top"><div class="avatar">${a.kind==='cat'?'🐈':'👤'}</div><div><div class="action-name">${a.name}</div><div class="action-location">📍 ${S.zoneName(a.location)}${posture}${a.held?`・拿著 ${S.endpointName(a.held)}`:''}${a.carrying?`・搬運 ${S.resourceName(a.carrying.resource)} ${Math.round(a.carrying.amount*10)/10}`:''}</div></div></div>
        <div class="action-now">▶ ${esc(S.planLabel(a))}<span class="effort-inline">今日活動量 ${Math.round((a.metrics?.exertionToday||0)*10)/10}</span></div>
        <div class="need-strip">${['hunger','thirst','fatigue','social'].map(k=>`<div class="need-pill ${needClass(n[k])}">${S.ZH[k]} ${Math.round(n[k])}</div>`).join('')}</div>
      </article>`;
    }).join('');
  }
  function isSummaryEvent(e){if(e.type==='bad'||e.type==='warn'||e.type==='good')return true;return /(等待|改去|詢問|聊天|摸|蹭|撒嬌|攝入|滑倒|灑|打翻|繞路|拿起|喝下|吃完|休息|太吵|清理|補充|裝進|舔毛|座位)/.test(e.text)}
  function renderTimeline(){
    const events=state().events.filter(e=>logMode==='full'||isSummaryEvent(e)).slice(0,logMode==='full'?140:70);
    $('timeline').innerHTML=events.length?events.map(e=>`<div class="timeline-entry ${e.type}" data-entity="event:${e.id}"><span class="time">${e.time}</span><span class="text">${esc(e.text)}</span></div>`).join(''):'<div class="timeline-empty">目前沒有符合摘要條件的事件。切換「完整」可查看全部階段紀錄。</div>';
  }

  function propTag(label,cls=''){return `<span class="tag ${cls}">${label}</span>`}
  function worldOverview(){
    const st=state(),wet=Object.keys(st.zones).filter(z=>S.floorLiquidAmount(z)>.1).length,val=S.validationStatus?.();
    const warning=val?.issueCount?`<br><br><b>⚠ 狀態檢查：${val.issueCount} 個問題</b><br>${val.issues.slice(0,3).map(x=>esc(x.message)).join('<br>')}`:'';
    return `<div class="empty-inspector"><div><span>🔎</span><b>點選任何東西</b><br>角色、物件、家具、Zone、事件與單一 Tile 都可以檢查。<br><br>目前 ${Object.keys(st.agents).length} 名 Agent・${Object.keys(st.containers).length} 個容器・${wet} 個區域有液體殘留。<br>Seed：${st.seed}${warning}</div></div>`;
  }
  function recentEvents(type,id,limit=8){
    const st=state();let obj=null,name='',zoneId=null;
    if(type==='furniture'){obj=st.furniture?.[id];name=obj?.name||'';zoneId=obj?.zone||null;}
    else if(type==='tile'){const t=S.tileInfo?.(id);zoneId=t?.zone||null;}
    else{obj=S.getEntity(type,id);name=obj?.name||'';zoneId=type==='zone'?id:type==='surface'?obj?.zone:null;}
    return st.events.filter(e=>{
      const vals=Object.values(e.data||{}).map(String);
      if(vals.includes(id))return true;
      if(name&&e.text.includes(name))return true;
      if(type==='agent'&&obj?.name&&e.text.includes(obj.name))return true;
      if(zoneId&&(e.data?.location===zoneId||e.text.includes(S.zoneName(zoneId))))return true;
      return false;
    }).slice(0,limit);
  }
  function recentBlock(type,id){const ev=recentEvents(type,id);return ev.length?`<div class="recent-list">${ev.map(e=>`<div class="recent-event" data-entity="event:${e.id}"><b>${e.time}</b>${esc(e.text)}</div>`).join('')}</div>`:'<div class="timeline-empty">尚無直接相關紀錄。</div>'}
  function contentsBlock(obj){
    const entries=Object.entries(obj?.contents||{}).filter(([,v])=>v>.05);if(!entries.length)return '<div class="content-item">空</div>';
    return `<div class="content-list">${entries.map(([r,v])=>{const pct=obj.capacity?Math.min(100,v/obj.capacity*100):Math.min(100,v);return `<div class="content-item"><div class="content-head"><span>${S.resourceIcon(r)} ${S.resourceName(r)}</span><b>${Math.round(v*10)/10}</b></div><div class="content-bar"><i style="width:${pct}%"></i></div></div>`}).join('')}</div>`;
  }
  function displayValue(k,v){if(typeof v==='number')return Math.round(v*100)/100;if(k==='transfer'||k==='reason')return VALUE_ZH[v]||S.ZH[v]||v;if(k==='resource')return S.resourceName(v);if(k==='location'||(k==='target'&&state().zones[v]))return S.zoneName(v);if(['from','to','container','source'].includes(k)){if(v==='internal')return'體內';if(state().zones[v])return S.zoneName(v);return S.endpointName(v)}return S.ZH[v]||VALUE_ZH[v]||v}

  function supplySection(id){
    if(!S.supplyStatus||!['foodPantry','mealTray'].includes(id))return '';
    const s=S.supplyStatus();return `<div class="inspect-section"><h3>補給閉環</h3><div class="kv"><div class="k">食物總庫存</div><div>${Math.round(s.stock*10)/10}</div><div class="k">觸發門檻</div><div>${s.trigger}</div><div class="k">補給中</div><div>${esc(s.workerName||'無')}</div><div class="k">已完成趟數</div><div>${s.trips}</div><div class="k">累積帶回</div><div>${Math.round(s.totalProduced*10)/10}</div></div></div>`;
  }
  function inspectContainer(id){
    const st=state(),c=st.containers[id];if(!c)return '';
    const loc=S.objectLocation(id),held=c.heldBy?st.agents[c.heldBy]?.name:'無',p=SP?.objectPosition?.(id);
    const props=[c.portable?propTag('可攜帶','good'):propTag('固定物件'),c.canDrinkFrom?propTag('可直接飲用','info'):'',c.canDrinkFrom&&c.drinkPreference!=null?propTag(`飲用偏好 ${Math.round(c.drinkPreference*100)}%`):'',c.supportId?propTag(`承載於：${F?.get?.(c.supportId)?.name||c.supportId}`,'info'):''].filter(Boolean).join('');
    return `<div class="inspect-title"><div class="inspect-icon">${c.icon||'◻'}</div><div><h2>${c.name}</h2><small>Container・${id}</small></div></div>
      <div class="inspect-section"><h3>位置與持有</h3><div class="kv"><div class="k">位置</div><div>${S.zoneName(loc)}</div><div class="k">Tile 座標</div><div>${posText(p)}</div><div class="k">持有人</div><div>${esc(held)}</div><div class="k">容量</div><div>${Math.round(Object.values(c.contents||{}).reduce((a,b)=>a+b,0)*10)/10} / ${c.capacity}</div></div></div>
      <div class="inspect-section"><h3>內容物</h3>${contentsBlock(c)}</div><div class="inspect-section"><h3>屬性</h3><div class="tags">${props||propTag('無特殊屬性')}</div></div>${supplySection(id)}<div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('container',id)}</div>`;
  }
  function inspectSource(id){const s=state().sources[id];if(!s)return '';const p=SP?.objectPosition?.(id);return `<div class="inspect-title"><div class="inspect-icon">${s.icon||'◻'}</div><div><h2>${s.name}</h2><small>Resource Source・${id}</small></div></div><div class="inspect-section"><h3>屬性</h3><div class="kv"><div class="k">位置</div><div>${S.zoneName(s.location)}</div><div class="k">Tile 座標</div><div>${posText(p)}</div><div class="k">提供</div><div>${S.resourceIcon(s.resource)} ${S.resourceName(s.resource)}</div><div class="k">供應</div><div>${s.infinite?'無限（MVP 規則）':s.amount??0}</div></div></div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('source',id)}</div>`}
  function inspectSurface(id){const f=state().surfaces[id];if(!f)return '';const risk=S.floorSlipRisk(f.zone);return `<div class="inspect-title"><div class="inspect-icon">🟫</div><div><h2>${f.name}</h2><small>Surface・${id}</small></div></div><div class="inspect-section"><h3>環境</h3><div class="kv"><div class="k">區域</div><div>${S.zoneName(f.zone)}</div><div class="k">液體總量</div><div>${Math.round(S.floorLiquidAmount(f.zone)*10)/10}</div><div class="k">滑倒風險</div><div>${risk.toFixed(1)}%</div></div></div><div class="inspect-section"><h3>表面內容物</h3>${contentsBlock(f)}</div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('surface',id)}</div>`}
  function inspectZone(id){const st=state(),z=st.zones[id];if(!z)return '';const agents=S.occupants(id),objs=[...Object.values(st.containers),...Object.values(st.sources)].filter(o=>S.objectLocation(o.id)===id);return `<div class="inspect-title"><div class="inspect-icon">${z.icon}</div><div><h2>${z.name}</h2><small>Zone・${id}</small></div></div><div class="inspect-section"><h3>環境</h3><div class="kv"><div class="k">噪音</div><div>${Math.round(S.zoneNoise(id))}</div><div class="k">休息品質</div><div>${z.restQuality}</div><div class="k">滑倒風險</div><div>${S.floorSlipRisk(id).toFixed(1)}%</div><div class="k">鄰接</div><div>${z.neighbors.map(S.zoneName).join('、')}</div></div></div><div class="inspect-section"><h3>目前角色</h3><div class="tags">${agents.length?agents.map(a=>entityChip('agent',a.id,a.kind==='cat'?'🐈':'👤',a.name)).join(''):propTag('無')}</div></div><div class="inspect-section"><h3>目前物件</h3><div class="tags">${objs.length?objs.map(o=>entityChip(st.sources[o.id]?'source':'container',o.id,o.icon||'◻',o.name)).join(''):propTag('無')}</div></div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('zone',id)}</div>`}
  function inspectAgent(id){
    const st=state(),a=st.agents[id];if(!a)return '';const th=st.thoughts[id],contacts=Object.entries(a.contacts).flatMap(([part,c])=>Object.entries(c).filter(([,v])=>v>.1).map(([r,v])=>`${part==='paws'?'腳掌':part==='hands'?'雙手':'腳'}：${S.resourceName(r)} ${Math.round(v)}`));
    const carrying=a.carrying?`${S.resourceName(a.carrying.resource)} ${Math.round(a.carrying.amount*10)/10}`:'無',pending=a.pendingInteraction?.type==='catAttention'?`橘子正在等待回應（剩 ${a.pendingInteraction.ttl} tick）`:'無';
    const p=SP?.agentPosition?.(id),seat=a.seatedOn?F?.get?.(a.seatedOn):null,posture=a.posture?.kind==='sitting'?`坐著${seat?`・${seat.name}`:''}`:a.posture?.kind==='lying'?'躺著':'站立';
    const last=a.metrics?.lastExertion,lastText=last?`${esc(last.reason)} +${last.amount.toFixed(1)}${last.fatigueCost!=null?`（疲勞 +${last.fatigueCost.toFixed(1)}）`:''}`:'無';
    let decision='';if($('showThoughts').checked&&th){decision=`<div class="decision">${th.options.slice(0,7).map(o=>`<div class="decision-row"><span>${S.ZH[o.id]||o.id}${o.id===th.pick.id?' ← 選擇':''}</span><b>${Math.round(o.score)}</b></div>`).join('')}<div class="decision-reason"><b>${S.ZH[th.pick.id]||th.pick.id}</b><br>${th.pick.why.map(x=>'＋ '+esc(x)).join('<br>')}</div></div>`}else decision='<div class="timeline-empty">尚未產生決策資料，或已關閉決策原因。</div>';
    const recovery=S.restRecoveryInfo?.(a,a.location),supply=a.supplyTask?`<div class="k">補給工作</div><div>${esc(S.planLabel(a))}</div>`:'';
    const recoverySec=recovery?`<div class="inspect-section"><h3>體力特質</h3><div class="kv"><div class="k">活動疲勞敏感度</div><div>${Math.round((a.traits.exertionSensitivity??1)*100)}%</div><div class="k">休息恢復倍率</div><div>${Math.round((a.traits.recoveryRate??1)*100)}%</div><div class="k">若在此休息</div><div>${Math.round(recovery.restEfficiency*100)}%</div></div></div>`:'';
    return `<div class="inspect-title"><div class="inspect-icon">${a.kind==='cat'?'🐈':'👤'}</div><div><h2>${a.name}</h2><small>Agent・${id}</small></div></div><div class="inspect-section"><h3>現在</h3><div class="kv"><div class="k">位置</div><div>${S.zoneName(a.location)}</div><div class="k">Tile 座標</div><div>${posText(p)}</div><div class="k">姿勢</div><div>${esc(posture)}</div><div class="k">行動</div><div>${esc(S.planLabel(a))}</div>${supply}<div class="k">醉酒</div><div>${Math.round(a.status.intoxication)}</div><div class="k">動作協調</div><div>${Math.round(S.coordination(a))}</div><div class="k">持有容器</div><div>${a.held?S.endpointName(a.held):'無'}</div><div class="k">搬運資源</div><div>${carrying}</div><div class="k">待回應互動</div><div>${pending}</div><div class="k">今日活動量</div><div>${Math.round((a.metrics?.exertionToday||0)*10)/10}</div><div class="k">最近活動</div><div>${lastText}</div></div></div><div class="inspect-section"><h3>需求｜高＝更迫切</h3><div class="tags">${Object.entries(a.needs).map(([k,v])=>propTag(`${S.ZH[k]||k} ${Math.round(v)}`,v>=75?'bad':v>=55?'warn':'' )).join('')}</div></div><div class="inspect-section"><h3>狀態｜高＝較好</h3><div class="tags">${Object.entries(a.wellbeing||{}).map(([k,v])=>propTag(`${S.ZH[k]||k} ${Math.round(v)}`,wellbeingTagClass(v))).join('')}</div></div>${contacts.length?`<div class="inspect-section"><h3>附著物</h3><div class="tags">${contacts.map(x=>propTag(x,'warn')).join('')}</div></div>`:''}${recoverySec}<div class="inspect-section"><h3>最近決策</h3>${decision}</div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('agent',id)}</div>`;
  }
  function inspectEvent(id){const e=state().causes[id];if(!e)return '<div class="empty-inspector">事件不存在。</div>';const rows=Object.entries(e.data||{}).map(([k,v])=>`<div class="k">${S.DATA_ZH[k]||S.ZH[k]||k}</div><div>${esc(displayValue(k,v))}</div>`).join('');return `<div class="inspect-title"><div class="inspect-icon">⚡</div><div><h2>${e.time}・事件</h2><small>${e.type}</small></div></div><div class="inspect-section"><h3>內容</h3><div class="content-item">${esc(e.text)}</div></div>${rows?`<div class="inspect-section"><h3>詳細資料</h3><div class="kv">${rows}</div></div>`:''}<div class="inspect-section"><h3>因果鏈</h3><div class="cause">${esc(S.causeTree(id))}</div></div>`}
  function inspectTile(id){
    const t=S.tileInfo?.(id);if(!t)return '';
    const contents=Object.entries(t.contents||{}).filter(([,v])=>v>.05),occ=t.occupants.map(aid=>state().agents[aid]?.name).filter(Boolean);
    let blocked='無';if(t.staticBlockedBy){if(String(t.staticBlockedBy).startsWith('furniture:'))blocked=F?.get?.(String(t.staticBlockedBy).slice(10))?.name||t.staticBlockedBy;else blocked=(state().containers[t.staticBlockedBy]||state().sources[t.staticBlockedBy])?.name||t.staticBlockedBy;}
    return `<div class="inspect-title"><div class="inspect-icon">▦</div><div><h2>Tile (${t.x}, ${t.y})</h2><small>Tile・${t.id}</small></div></div><div class="inspect-section"><h3>空間</h3><div class="kv"><div class="k">Zone</div><div>${S.zoneName(t.zone)}</div><div class="k">可通行</div><div>${t.walkable?'是':'否'}</div><div class="k">固定阻擋</div><div>${esc(blocked)}</div><div class="k">目前角色</div><div>${esc(occ.join('、')||'無')}</div></div></div><div class="inspect-section"><h3>表面內容物</h3>${contents.length?`<div class="content-list">${contents.map(([r,v])=>`<div class="content-item"><div class="content-head"><span>${S.resourceIcon(r)} ${esc(S.resourceName(r))}</span><b>${v.toFixed(1)}</b></div></div>`).join('')}</div>`:'<div class="timeline-empty">乾燥／無內容物</div>'}</div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('tile',id)}</div>`;
  }
  function inspectFurniture(id){
    const f=F?.get?.(id);if(!f)return '';const st=state(),footprint=(f.footprint||[]).map(posText).join('、'),occupants=Object.values(st.agents).filter(a=>(f.footprint||[]).some(p=>a.position?.x===p.x&&a.position?.y===p.y)).map(a=>a.name),supported=Object.values(st.containers).filter(c=>c.supportId===f.id&&!c.heldBy).map(c=>c.name);
    const props=[];if(f.blocksMovement)props.push('阻擋通行');if(f.occupiable)props.push('可占用座位');if(f.mealSeat)props.push('用餐優先座位');if(f.canRest)props.push('可短休');if(f.canSleep)props.push('可睡眠 affordance（睡眠尚未實作）');if(f.canExit)props.push('可作為出入口');if(f.supportsObjects)props.push('可承載物件');
    return `<div class="inspect-title"><div class="inspect-icon">${esc(f.icon||'▰')}</div><div><h2>${esc(f.name)}</h2><small>Furniture・${esc(f.id)}</small></div></div><div class="inspect-section"><h3>空間</h3><div class="kv"><div class="k">Zone</div><div>${esc(S.zoneName(f.zone))}</div><div class="k">Footprint</div><div>${esc(footprint)}</div><div class="k">占用者</div><div>${esc(occupants.join('、')||'無')}</div><div class="k">類型</div><div>${esc(f.kind||'家具')}</div></div></div>${f.supportsObjects?`<div class="inspect-section"><h3>承載物件</h3><div class="tags">${supported.length?supported.map(x=>propTag(esc(x))).join(''):propTag('目前沒有')}</div></div>`:''}<div class="inspect-section"><h3>屬性</h3><div class="tags">${props.length?props.map(x=>propTag(esc(x))).join(''):propTag('無特殊屬性')}</div></div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('furniture',id)}</div>`;
  }

  function renderInspector(){
    if(!selected){$('inspector').innerHTML=worldOverview();return;}
    const {type,id}=selected;let html='';
    if(type==='container')html=inspectContainer(id);else if(type==='source')html=inspectSource(id);else if(type==='surface')html=inspectSurface(id);else if(type==='zone')html=inspectZone(id);else if(type==='agent')html=inspectAgent(id);else if(type==='event')html=inspectEvent(id);else if(type==='tile')html=inspectTile(id);else if(type==='furniture')html=inspectFurniture(id);
    $('inspector').innerHTML=html||worldOverview();
  }

  function renderWorldBadges(){
    const st=state(),wet=Object.keys(st.zones).filter(z=>S.floorLiquidAmount(z)>.1).length,held=Object.values(st.containers).filter(c=>c.heldBy).length,intox=Object.values(st.agents).filter(a=>a.status.intoxication>=8).length,val=S.validationStatus?.(),supply=S.supplyStatus?.();
    const badges=[`濕地 ${wet}`,`持有物 ${held}`,`醉酒 ${intox}`];
    if(supply)badges.push(`食物 ${Math.round(supply.stock)}`);if(supply?.workerName)badges.push(`補給：${supply.workerName}`);if(st.spatial)badges.push(`格狀 ${st.spatial.width}×${st.spatial.height}`);
    if(val?.issueCount)badges.push(`⚠ 狀態 ${val.issueCount}`);else if(val)badges.push('狀態 ✓');
    $('worldBadges').innerHTML=badges.map(x=>`<span class="mini-badge ${x.startsWith('⚠')?'validation-warn':''}">${esc(x)}</span>`).join('');
  }
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
  window.simUI={render,select,clearSelection,setMobileView,getSelection:()=>selected};
  render();setMobileView('map');
})();
