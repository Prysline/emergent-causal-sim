(() => {
  const E=window.SimEngine,SP=window.SimSpatial,V=window.SimValidator;if(!E||!SP||!V)return;
  const UI=window.SimUI=window.SimUI||{};
  const inspectorDecorators=new Map(),startupExtensions=new Map();
  let selected=null,autoplay=null,autoplayGeneration=0,manualBatch=null,batchGeneration=0,mobileView='map',logMode='summary',currentZ=0,started=false;
  const AUTOPLAY_INTERVAL_MS=700;
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const st=()=>E.getState(),zOf=p=>SP.zOf?.(p)??p?.z??0,posText=p=>p?`(${p.x}, ${p.y}, Z ${zOf(p)})`:'無',fmtLoad=v=>Math.round((v||0)*100)/100,isMobile=()=>matchMedia('(max-width:720px)').matches;
  const sum=o=>Object.values(o||{}).reduce((a,b)=>a+b,0),NEED_SHORT_ZH={hunger:'飢餓',thirst:'口渴',fatigue:'疲勞',sleepNeed:'睡意',social:'社交'};
  const POSTURE_ZH={standing:'站立',sitting:'坐著',lying:'躺臥',kneeling:'跪姿',prone:'俯臥'};
  function postureText(s,a,{detail=false}={}){const kind=a?.posture?.kind||'standing';if(detail&&kind==='sitting')return `${POSTURE_ZH[kind]}・${s.furniture[a.posture.furnitureId]?.name||'座位'}`;if(kind==='lying'&&a?.kind==='cat')return'蜷臥';return POSTURE_ZH[kind]||kind;}

  function sortedInspectorDecorators(){
    return [...inspectorDecorators.values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  }
  function sortedStartupExtensions(){
    return [...startupExtensions.values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  }
  function registerStartupExtension(id,handler,order=0){
    if(typeof id!=='string'||!id||typeof handler!=='function')throw new Error('invalid UI startup extension');
    if(startupExtensions.has(id))throw new Error(`duplicate UI startup extension: ${id}`);
    if(started)throw new Error(`UI startup is already complete; cannot register ${id}`);
    startupExtensions.set(id,{id,handler,order:Number(order)||0});
    return handler;
  }
  function listStartupExtensions(){return sortedStartupExtensions().map(({id,order})=>({id,order}));}
  function runStartupExtensions(){
    const context={state:E.getState(),ui:UI};
    for(const entry of sortedStartupExtensions())entry.handler(context);
  }
  function currentInspectorSelection(){return selected?{...selected}:null;}
  function runInspectorDecorators(){
    const host=$('inspector');if(!host)return;
    const context={host,selected:currentInspectorSelection(),state:st()};
    for(const entry of sortedInspectorDecorators())entry.handler(context);
  }
  function registerInspectorDecorator(id,handler,order=0){
    if(typeof id!=='string'||!id||typeof handler!=='function')throw new Error('invalid inspector decorator');
    if(inspectorDecorators.has(id))throw new Error(`duplicate inspector decorator: ${id}`);
    inspectorDecorators.set(id,{id,handler,order:Number(order)||0});
    return handler;
  }
  function listInspectorDecorators(){return sortedInspectorDecorators().map(({id,order})=>({id,order}));}
  UI.registerInspectorDecorator=registerInspectorDecorator;
  UI.listInspectorDecorators=listInspectorDecorators;
  UI.registerStartupExtension=registerStartupExtension;
  UI.listStartupExtensions=listStartupExtensions;
  UI.runInspectorDecorators=runInspectorDecorators;
  UI.getInspectorSelection=currentInspectorSelection;
  UI.isManualBatchActive=()=>!!manualBatch;
  UI.isManualBatchIntermediate=()=>!!manualBatch?.intermediate;
  function runtimeZLevels(){const levels=st().map?.zLevels;return Array.isArray(levels)&&levels.length?[...levels].sort((a,b)=>a-b):[...new Set(Object.values(st().map?.tiles||{}).map(zOf))].sort((a,b)=>a-b);}
  function normalizeCurrentZ(){const levels=runtimeZLevels();if(!levels.includes(currentZ))currentZ=levels.includes(0)?0:(levels[0]??0);return currentZ;}
  function renderLayerControl(){const select=$('runtimeLayerSelect');if(!select)return;normalizeCurrentZ();const levels=runtimeZLevels();select.innerHTML=levels.map(z=>`<option value="${z}" ${z===currentZ?'selected':''}>Z ${z>=0?'+':''}${z}</option>`).join('');select.disabled=!!manualBatch||levels.length<=1;}
  UI.getCurrentZ=()=>currentZ;
  UI.setCurrentZ=z=>{if(manualBatch)return false;const n=Number(z);if(!runtimeZLevels().includes(n))return false;currentZ=n;render();return true;};

  function setMobileView(view){mobileView=view;document.querySelectorAll('.view-panel[data-view]').forEach(p=>p.classList.toggle('mobile-active',p.dataset.view===view));document.querySelectorAll('.mobile-nav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===view));if(isMobile())scrollTo({top:0,behavior:'auto'});}
  function select(type,id,open=true){if(manualBatch)return false;selected={type,id};if(open&&isMobile())setMobileView('inspector');renderMap();renderInspector();return true;}
  function needClass(v){return v>=78?'critical':v>=58?'high':'';}
  function wellbeingClass(v){return v<=30?'bad':v<=50?'warn':'good';}
  function propTag(label,cls=''){return `<span class="tag ${cls}">${esc(label)}</span>`;}
  function roomName(id){return st().map.rooms?.[id]?.name||id||'無';}
  function holderName(containerId){return SP.holderOf(st(),containerId)?.name||'無';}
  function heldText(s,a){if(!a.held)return'無';const c=s.containers[a.held],contents=c&&sum(c.contents)>.05?`（${E.contentSummary(c.contents)}）`:'';return `${E.endpointName(a.held)}${contents}`;}

  function furnitureSegment(f,p){const set=new Set((f.footprint||[]).map(SP.key)),cls=['furniture-footprint',`furniture-${f.kind||'generic'}`],z=zOf(p);if(set.has(SP.key({x:p.x-1,y:p.y,z})))cls.push('join-left');if(set.has(SP.key({x:p.x+1,y:p.y,z})))cls.push('join-right');if(set.has(SP.key({x:p.x,y:p.y-1,z})))cls.push('join-up');if(set.has(SP.key({x:p.x,y:p.y+1,z})))cls.push('join-down');if(selected?.type==='furniture'&&selected.id===f.id)cls.push('selected');const display=f.displayAt&&SP.same(f.displayAt,p);return `<button class="${cls.join(' ')}" data-entity="furniture:${f.id}" title="${esc(f.name)}">${display?`<span class="furniture-symbol">${esc(f.icon||'▰')}</span>`:''}</button>`;}
  const RUNTIME_BOUNDARY_EDGES=['north','east','south','west'];
  function runtimeBoundaryIdForCellEdge(x,y,edge){
    if(edge==='north')return 'h:'+x+','+y;
    if(edge==='south')return 'h:'+x+','+(y+1);
    if(edge==='west')return 'v:'+x+','+y;
    if(edge==='east')return 'v:'+(x+1)+','+y;
    return null;
  }
  function runtimeBoundaryMarkup(s,t,doorsByBoundary){
    return RUNTIME_BOUNDARY_EDGES.map(edge=>{
      const boundaryId=runtimeBoundaryIdForCellEdge(t.x,t.y,edge),boundaryKey=`${currentZ}|${boundaryId}`,boundary=s.map.boundaries?.[boundaryKey]||null;
      if(!boundary)return '';
      const door=doorsByBoundary.get(boundaryKey)||null;
      if(door){
        const state=door.state==='closed'?'closed':'open',label=state==='closed'?'關閉':'開啟';
        return `<i class="runtime-boundary-edge edge-${edge} runtime-boundary-door runtime-boundary-door-${state}" aria-hidden="true" data-boundary-key="${esc(boundaryKey)}" data-boundary-id="${esc(boundaryId)}" data-boundary-kind="${esc(boundary.kind||'opening')}" data-door-id="${esc(door.id)}" data-door-state="${state}" title="${esc(door.name||door.id)}・${label}"></i>`;
      }
      if(boundary.kind!=='wall')return '';
      return `<i class="runtime-boundary-edge edge-${edge} runtime-boundary-wall" aria-hidden="true" data-boundary-key="${esc(boundaryKey)}" data-boundary-id="${esc(boundaryId)}" data-boundary-kind="wall" title="${esc(boundaryId)}・牆壁"></i>`;
    }).join('');
  }

  function renderMap(){const s=st(),host=$('map');normalizeCurrentZ();host.className='spatial-map';host.dataset.z=String(currentZ);host.style.setProperty('--grid-w',s.map.width);host.style.setProperty('--grid-h',s.map.height);const objects=[...Object.values(s.containers),...Object.values(s.sources)],doorsByBoundary=new Map(Object.values(s.doors||{}).filter(door=>door?.boundary?.id&&Number(door.boundary.z??0)===currentZ).map(door=>[`${currentZ}|${door.boundary.id}`,door]));host.innerHTML=Object.values(s.map.tiles).filter(t=>zOf(t)===currentZ).sort((a,b)=>a.y-b.y||a.x-b.x).map(t=>{const p=SP.clonePos(t),agents=Object.values(s.agents).filter(a=>!a.offMap&&SP.same(a.position,p)),objs=objects.filter(o=>SP.same(SP.objectPosition(s,o.id),p)),fs=SP.furnitureAt(s,p),wet=SP.tileLiquidAmount(t),sel=selected?.type==='tile'&&selected.id===t.id,room=t.roomId?`room-${t.roomId}`:'';return `<div class="sim-tile terrain-${t.terrain} ${wet>.1?'wet':''} ${sel?'selected':''} ${room}" data-tile="${t.id}" data-z="${currentZ}" style="--x:${t.x};--y:${t.y}" title="Tile ${t.id}${t.roomId?`・${roomName(t.roomId)}`:''}">${runtimeBoundaryMarkup(s,t,doorsByBoundary)}${fs.map(f=>furnitureSegment(f,p)).join('')}<div class="tile-entities">${objs.map(o=>{const type=s.sources[o.id]?'source':'container',held=type==='container'&&SP.holderOf(s,o.id);return `<button class="map-entity object ${held?'held-object':''} ${selected?.type===type&&selected.id===o.id?'selected':''}" data-entity="${type}:${o.id}" title="${esc(o.name)}">${o.icon||'◻'}</button>`;}).join('')}${agents.map(a=>`<button class="map-entity agent agent-${a.id} ${selected?.type==='agent'&&selected.id===a.id?'selected':''}" data-entity="agent:${a.id}" title="${a.name}">${a.kind==='cat'?'🐈':'👤'}</button>`).join('')}${wet>.1?`<span class="wet-mark" title="${esc(E.contentSummary(t.surface.contents))}">💧</span>`:''}</div></div>`;}).join('');}

  function renderActions(){$('actions').innerHTML=Object.values(st().agents).map(a=>{const s=st(),posture=postureText(s,a),where=a.offMap?'門外':SP.describePlace(s,a),n=a.needs,load=E.effectiveCarryLoad(a);return `<article class="action-card agent-${a.id}" data-entity="agent:${a.id}"><div class="action-top"><div class="avatar">${a.kind==='cat'?'🐈':'👤'}</div><div><div class="action-name">${a.name}</div><div class="action-location">📍 ${esc(where)}・${esc(posture)}${a.held?`・拿著 ${esc(heldText(s,a))}`:''}${load>.01?`・負重 ${fmtLoad(load)}`:''}</div></div></div><div class="action-now">▶ ${esc(E.actionLabel(a))}<span class="effort-inline">今日活動量 ${Math.round((a.metrics?.exertionToday||0)*10)/10}</span></div><div class="need-strip">${['hunger','thirst','fatigue','sleepNeed','social'].map(k=>`<div class="need-pill ${needClass(n[k])}" title="${esc(E.ZH[k]||k)}">${NEED_SHORT_ZH[k]||E.ZH[k]||k} ${Math.round(n[k])}</div>`).join('')}</div></article>`;}).join('');}
  function isSummaryEvent(e){if(['bad','warn','good'].includes(e.type))return true;return /(等待|改|聊天|摸|蹭|撒嬌|攝入|滑|灑|拿起|喝|吃|休息|睡|醒|太吵|清理|補|舔毛|外出|回到|放進)/.test(e.text);}
  function renderTimeline(){const events=st().events.filter(e=>logMode==='full'||isSummaryEvent(e)).slice(0,logMode==='full'?160:80);$('timeline').innerHTML=events.length?events.map(e=>`<button class="timeline-entry ${e.type}" data-entity="event:${e.id}"><span class="time">${e.time}</span><span class="text">${esc(e.text)}</span></button>`).join(''):'<div class="timeline-empty">目前沒有符合摘要條件的事件。</div>';}

  function validation(){return V.validateState(st());}
  function worldOverview(validationSnapshot=null){const s=st(),v=validationSnapshot??validation(),wet=Object.values(s.map.tiles).filter(t=>SP.tileLiquidAmount(t)>.1).length;return `<div class="empty-inspector"><div><span>🔎</span><b>點選任何東西</b><br>角色、物件、家具、Room、事件與 Tile 都可以檢查。<br><br>目前 ${Object.keys(s.agents).length} 名 Agent・${Object.keys(s.map.rooms).length} 個 Room・${wet} 格濕地。<br>Seed：${s.seed}<br>Core：${esc(s.version)}${v.issueCount?`<br><br><b>⚠ 狀態檢查：${v.issueCount}</b><br>${v.issues.slice(0,3).map(x=>esc(x.message)).join('<br>')}`:''}</div></div>`;}
  function recentEvents(type,id,limit=8){const ref=`${type}:${id}`;return st().events.filter(e=>e.data?.entities?.includes(ref)).slice(0,limit);}
  function recentBlock(type,id){const ev=recentEvents(type,id);return ev.length?`<div class="recent-list">${ev.map(e=>`<button class="recent-event" data-entity="event:${e.id}"><b>${e.time}</b>${esc(e.text)}</button>`).join('')}</div>`:'<div class="timeline-empty">尚無直接相關紀錄。</div>';}
  function contentsBlock(obj){const entries=Object.entries(obj?.contents||{}).filter(([,v])=>v>.05);if(!entries.length)return'<div class="content-item">空</div>';return `<div class="content-list">${entries.map(([r,v])=>`<div class="content-item"><div class="content-head"><span>${E.resourceIcon(r)} ${E.resourceName(r)}</span><b>${Math.round(v*10)/10}</b></div></div>`).join('')}</div>`;}

  function inspectAgent(id){const s=st(),a=s.agents[id];if(!a)return'';const th=s.thoughts[id],room=SP.roomAt(s,a.position),info=E.restRecoveryInfo(a),sleepProfile=E.sleepProfile(a),circadianBias=E.circadianSleepBias(a),sleepPropensity=E.sleepPropensity(a),posture=postureText(s,a,{detail:true}),contacts=Object.entries(a.contacts||{}).flatMap(([part,c])=>Object.entries(c||{}).filter(([,v])=>v>.05).map(([r,v])=>`${part}：${E.resourceName(r)} ${v.toFixed(1)}`)),load=E.effectiveCarryLoad(a),last=a.metrics.lastExertion,lastText=last?`${last.reason} +${last.amount.toFixed(1)}（疲勞 +${last.fatigueCost.toFixed(1)}）${last.load>.01?`・負重 ${fmtLoad(last.load)}`:''}`:'無',decision=$('showThoughts').checked&&th?`<div class="decision">${th.options.slice(0,7).map(o=>`<div class="decision-row"><span>${E.ZH[o.id]||o.id}${o.id===th.pick.id?' ← 選擇':''}</span><b>${Math.round(o.score)}</b></div>`).join('')}<div class="decision-reason"><b>${E.ZH[th.pick.id]||th.pick.id}</b><br>${th.pick.why.map(x=>'＋ '+esc(x)).join('<br>')}</div></div>`:'<div class="timeline-empty">尚未產生決策資料，或已關閉決策原因。</div>';return `<div class="inspect-title"><div class="inspect-icon">${a.kind==='cat'?'🐈':'👤'}</div><div><h2>${a.name}</h2><small>Agent・${id}</small></div></div><div class="inspect-section"><h3>現在</h3><div class="kv"><div class="k">位置</div><div>${esc(a.offMap?'門外':SP.describePlace(s,a))}</div><div class="k">Tile</div><div>${posText(a.position)}</div><div class="k">Room</div><div>${roomName(room)}</div><div class="k">姿勢</div><div>${posture}</div><div class="k">行動</div><div>${esc(E.actionLabel(a))}</div><div class="k">醉酒</div><div>${Math.round(a.status.intoxication)}</div><div class="k">動作協調</div><div>${Math.round(E.coordination(a))}</div><div class="k">持有容器</div><div>${esc(heldText(s,a))}</div><div class="k">目前負重</div><div>${fmtLoad(load)}</div><div class="k">今日活動量</div><div>${Math.round(a.metrics.exertionToday*10)/10}</div><div class="k">最近活動</div><div>${esc(lastText)}</div></div></div><div class="inspect-section"><h3>需求｜高＝更迫切</h3><div class="tags">${Object.entries(a.needs).map(([k,v])=>propTag(`${E.ZH[k]||k} ${Math.round(v)}`,v>=75?'bad':v>=55?'warn':'' )).join('')}</div></div><div class="inspect-section"><h3>狀態｜高＝較好</h3><div class="tags">${Object.entries(a.wellbeing).map(([k,v])=>propTag(`${E.ZH[k]||k} ${Math.round(v)}`,wellbeingClass(v))).join('')}</div></div>${contacts.length?`<div class="inspect-section"><h3>附著物</h3><div class="tags">${contacts.map(x=>propTag(x,'warn')).join('')}</div></div>`:''}<div class="inspect-section"><h3>局部環境／體力／睡眠</h3><div class="kv"><div class="k">此處噪音</div><div>${SP.noiseAt(s,a.position).toFixed(1)}</div><div class="k">此處舒適</div><div>${Math.round(SP.comfortAt(s,a.position))}</div><div class="k">活動疲勞敏感度</div><div>${Math.round((a.traits.exertionSensitivity??1)*100)}%</div><div class="k">休息恢復倍率</div><div>${Math.round((a.traits.recoveryRate??1)*100)}%</div><div class="k">若在此休息</div><div>${Math.round(info.restEfficiency*100)}%</div><div class="k">日夜節律</div><div>${esc(E.circadianPatternName(sleepProfile.circadianPattern))}</div><div class="k">個體相位偏移</div><div>${sleepProfile.phaseOffsetMinutes>=0?'+':''}${Math.round(sleepProfile.phaseOffsetMinutes)} 分</div><div class="k">時段睡眠偏向</div><div>${circadianBias>=0?'+':''}${circadianBias.toFixed(1)}</div><div class="k">目前睡眠傾向</div><div>${sleepPropensity.toFixed(1)}</div></div></div><div class="inspect-section"><h3>最近決策</h3>${decision}</div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('agent',id)}</div>`;}
  function inspectContainer(id){const s=st(),c=s.containers[id];if(!c)return'';const p=SP.objectPosition(s,id),holder=holderName(id),room=SP.roomAt(s,p),props=[...(c.roles||[]),c.portable?'可攜帶':'固定物件',c.canDrinkFrom?'可直接飲用':'',c.transportResources?.length?`可搬：${c.transportResources.map(E.resourceName).join('、')}`:'',c.supportId?`承載於：${s.furniture[c.supportId]?.name||c.supportId}`:'',c.restock?`補充策略：${c.restock.strategy}`:''].filter(Boolean);return `<div class="inspect-title"><div class="inspect-icon">${c.icon||'◻'}</div><div><h2>${c.name}</h2><small>Container・${id}</small></div></div><div class="inspect-section"><h3>位置與持有</h3><div class="kv"><div class="k">位置</div><div>${esc(SP.describePlace(s,p))}</div><div class="k">Tile</div><div>${posText(p)}</div><div class="k">Room</div><div>${roomName(room)}</div><div class="k">持有人</div><div>${holder}</div><div class="k">容量</div><div>${Math.round(sum(c.contents)*10)/10} / ${c.capacity}</div><div class="k">空重</div><div>${fmtLoad(c.emptyLoad||0)}</div><div class="k">目前負重</div><div>${fmtLoad(E.containerLoad(id))}</div></div></div><div class="inspect-section"><h3>內容物</h3>${contentsBlock(c)}</div><div class="inspect-section"><h3>能力／角色</h3><div class="tags">${props.map(x=>propTag(x)).join('')}</div></div>${SP.hasRole(c,'foodReserve')||SP.hasRole(c,'readyFood')?supplyBlock():''}<div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('container',id)}</div>`;}
  function supplyBlock(){const x=E.supplyStatus();return `<div class="inspect-section"><h3>補給閉環</h3><div class="kv"><div class="k">食物總庫存</div><div>${Math.round(x.stock*10)/10}</div><div class="k">觸發門檻</div><div>${x.trigger}</div><div class="k">補給中</div><div>${esc(x.workerName||'無')}</div><div class="k">已完成趟數</div><div>${x.trips}</div><div class="k">累積帶回</div><div>${Math.round(x.totalProduced*10)/10}</div></div></div>`;}
  function inspectSource(id){const s=st(),o=s.sources[id],p=SP.objectPosition(s,id);if(!o)return'';return `<div class="inspect-title"><div class="inspect-icon">${o.icon}</div><div><h2>${o.name}</h2><small>Resource Source・${id}</small></div></div><div class="inspect-section"><h3>屬性</h3><div class="kv"><div class="k">位置</div><div>${esc(SP.describePlace(s,p))}</div><div class="k">Tile</div><div>${posText(p)}</div><div class="k">Room</div><div>${roomName(SP.roomAt(s,p))}</div><div class="k">提供</div><div>${E.resourceIcon(o.resource)} ${E.resourceName(o.resource)}</div><div class="k">供應</div><div>${o.infinite?'無限（MVP）':o.amount??0}</div><div class="k">角色</div><div>${esc((o.roles||[]).join('、')||'無')}</div><div class="k">操作 Port</div><div>${esc((o.interactionPorts||[]).map(x=>x.label||x.id).join('、')||'無')}</div></div></div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('source',id)}</div>`;}
  function inspectFurniture(id){const s=st(),f=s.furniture[id];if(!f)return'';const slots=(f.slots||[]).map(slot=>{const occ=SP.slotOccupant(s,slot.id),res=SP.slotReservedBy(s,slot.id);return `<div class="slot-row"><b>${esc(slot.label||slot.id)}</b><span>${posText(slot.position)}</span><span>${occ?`使用：${occ.name}`:res?`預約：${res.name}`:'空'}</span><span>${slot.canRest?'休息 ':''}${slot.mealSeat?'用餐 ':''}${slot.canSleep?'睡眠 ':''}${slot.canExit?'出口 ':''}</span></div>`;}).join('')||'<div class="timeline-empty">沒有使用 slot。</div>',supported=Object.values(s.containers).filter(c=>c.supportId===id);return `<div class="inspect-title"><div class="inspect-icon">${f.icon||'▰'}</div><div><h2>${f.name}</h2><small>Furniture・${id}</small></div></div><div class="inspect-section"><h3>物理</h3><div class="kv"><div class="k">Footprint</div><div>${(f.footprint||[]).map(posText).join(' / ')}</div><div class="k">阻擋通行</div><div>${f.blocksMovement?'是':'否'}</div><div class="k">價值</div><div>${f.value||0}</div></div></div><div class="inspect-section"><h3>使用位置</h3><div class="slot-list">${slots}</div></div><div class="inspect-section"><h3>承載物件</h3>${supported.length?supported.map(o=>`<button class="entity-chip" data-entity="container:${o.id}">${o.icon} ${o.name}</button>`).join(''):'無'}</div><div class="inspect-section"><h3>最近相關事件</h3>${recentBlock('furniture',id)}</div>`;}
  function inspectTile(id){const s=st(),t=s.map.tiles[id];if(!t)return'';const occ=SP.occupantsAt(s,t).map(a=>a.name),fs=SP.furnitureAt(s,t),wet=SP.tileLiquidAmount(t),blocker=SP.blockerAt(s,t);return `<div class="inspect-title"><div class="inspect-icon">${t.terrain==='wall'?'🧱':t.terrain==='doorway'?'🚪':'▫️'}</div><div><h2>Tile ${id}</h2><small>${t.terrain}</small></div></div><div class="inspect-section"><h3>空間</h3><div class="kv"><div class="k">Room</div><div>${roomName(t.roomId)}</div><div class="k">可通行</div><div>${SP.walkable(s,t)?'是':'否'}</div><div class="k">阻擋來源</div><div>${esc(blocker||'無')}</div><div class="k">角色</div><div>${occ.join('、')||'無'}</div><div class="k">家具</div><div>${fs.map(f=>f.name).join('、')||'無'}</div><div class="k">局部噪音</div><div>${SP.noiseAt(s,t).toFixed(1)}</div><div class="k">局部舒適</div><div>${Math.round(SP.comfortAt(s,t))}</div><div class="k">液體</div><div>${wet.toFixed(1)}</div></div></div><div class="inspect-section"><h3>地面內容</h3>${contentsBlock(t.surface)}</div>`;}
  function inspectRoom(id){const r=SP.roomMetrics(st(),id);if(!r)return'';return `<div class="inspect-title"><div class="inspect-icon">🏠</div><div><h2>${r.name}</h2><small>Derived Room・${id}</small></div></div><div class="inspect-section"><h3>自動推導</h3><div class="kv"><div class="k">地板格</div><div>${r.area}</div><div class="k">邊界牆／開口</div><div>${r.wallBoundaries.length}</div><div class="k">家具數</div><div>${r.furnitureIds.length}</div><div class="k">房間價值</div><div>${r.value}</div><div class="k">平均噪音</div><div>${r.avgNoise.toFixed(1)}</div><div class="k">平均局部舒適</div><div>${Math.round(r.avgComfort)}</div></div><p class="hint">Room 由地形拓撲推導；它不是用途 Zone，也不直接賦予休息加成。</p></div>`;}
  function inspectEvent(id){const e=st().causes[id];if(!e)return'<div class="empty-inspector">事件不存在。</div>';return `<div class="inspect-title"><div class="inspect-icon">⚡</div><div><h2>${e.time}・事件</h2><small>${e.type}</small></div></div><div class="inspect-section"><h3>內容</h3><div class="content-item">${esc(e.text)}</div></div><div class="inspect-section"><h3>詳細資料</h3><div class="kv">${Object.entries(e.data||{}).map(([k,v])=>`<div class="k">${E.DATA_ZH[k]||E.ZH[k]||k}</div><div>${esc(typeof v==='object'?JSON.stringify(v):v)}</div>`).join('')}</div></div><div class="inspect-section"><h3>因果鏈</h3><pre class="cause">${esc(E.causeTree(id))}</pre></div>`;}
  function renderInspector(validationSnapshot){const host=$('inspector');if(!selected){host.innerHTML=worldOverview(validationSnapshot);runInspectorDecorators();return;}const {type,id}=selected;host.innerHTML=type==='agent'?inspectAgent(id):type==='container'?inspectContainer(id):type==='source'?inspectSource(id):type==='furniture'?inspectFurniture(id):type==='tile'?inspectTile(id):type==='room'?inspectRoom(id):type==='event'?inspectEvent(id):worldOverview(validationSnapshot);runInspectorDecorators();}

  function renderBadges(validationSnapshot){const s=st(),wet=Object.values(s.map.tiles).filter(t=>zOf(t)===currentZ&&SP.tileLiquidAmount(t)>.1).length,held=Object.values(s.agents).filter(a=>a.held).length,intox=Math.max(...Object.values(s.agents).map(a=>a.status.intoxication||0)),val=validationSnapshot;$('worldBadges').innerHTML=`<span>Z ${currentZ>=0?'+':''}${currentZ}</span><span>濕地 ${wet}</span><span>持有物 ${held}</span><span>醉酒 ${Math.round(intox)}</span><span>食物 ${Math.round(E.foodStock())}</span>${Object.values(s.map.rooms).filter(r=>(r.z??0)===currentZ).map(r=>`<button data-entity="room:${r.id}">🏠 ${r.name}</button>`).join('')}<span>格狀 ${s.map.width}×${s.map.height}</span><span class="${val.issueCount?'badge-bad':'badge-good'}">狀態${val.issueCount?'⚠':'✓'}</span>`;}
  function render(){const s=st(),validationSnapshot=validation();normalizeCurrentZ();$('clock').textContent=`第 ${s.day} 天 ${E.timeStr()}`;$('tickLabel').textContent=`Tick ${s.tick}・Seed ${s.seed}`;renderLayerControl();renderBadges(validationSnapshot);renderMap();renderActions();renderTimeline();renderInspector(validationSnapshot);}
  function stepOne(){E.tick();render();}
  function setDisabled(id,disabled){const control=$(id);if(control)control.disabled=!!disabled;}
  function updateBatchProgress(){
    const button=$('step10');if(!button)return;
    button.textContent=manualBatch?`執行中 ${manualBatch.completed}/${manualBatch.total}`:'10 步';
  }
  function syncControlState(){
    const batch=!!manualBatch,playing=!!autoplay,workspace=document.querySelector('.workspace');
    setDisabled('step',batch||playing);setDisabled('step10',batch||playing);setDisabled('play',batch);setDisabled('reset',false);
    setDisabled('runtimeLayerSelect',batch||runtimeZLevels().length<=1);setDisabled('showThoughts',batch);
    setDisabled('loadSocialScenario',batch);setDisabled('socialScenario',batch);
    if(workspace){workspace.inert=batch;if(batch)workspace.setAttribute('aria-busy','true');else workspace.removeAttribute('aria-busy');}
    updateBatchProgress();
  }
  function manualStep(){if(manualBatch||autoplay)return false;stepOne();return true;}
  function yieldToBrowser(){return new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));}
  async function runManualBatch(total=10){
    if(manualBatch||autoplay||!Number.isInteger(total)||total<1)return false;
    const context={token:++batchGeneration,total,completed:0,intermediate:true};
    manualBatch=context;syncControlState();
    try{
      await yieldToBrowser();
      if(manualBatch!==context||context.token!==batchGeneration)return false;
      for(let i=0;i<total;i++){
        context.intermediate=i<total-1;
        E.tick();
        context.completed=i+1;updateBatchProgress();
        if(i<total-1){
          await yieldToBrowser();
          if(manualBatch!==context||context.token!==batchGeneration)return false;
        }
      }
      if(manualBatch!==context||context.token!==batchGeneration)return false;
      manualBatch=null;syncControlState();render();return true;
    }finally{
      if(manualBatch===context){manualBatch=null;syncControlState();}
    }
  }
  function invalidateManualBatch(){batchGeneration++;manualBatch=null;}
  function stopAutoplay(){
    const context=autoplay;if(!context)return false;
    autoplayGeneration++;
    if(context.timeoutId!==null)clearTimeout(context.timeoutId);
    if(context.frameId!==null)cancelAnimationFrame(context.frameId);
    autoplay=null;$('play').textContent='▶ 開始';syncControlState();return true;
  }
  function scheduleAutoplay(context,delayMs){
    if(autoplay!==context||context.token!==autoplayGeneration)return false;
    context.timeoutId=setTimeout(()=>{
      if(autoplay!==context||context.token!==autoplayGeneration)return;
      context.timeoutId=null;
      const startedAt=performance.now();
      stepOne();
      if(autoplay!==context||context.token!==autoplayGeneration)return;
      context.frameId=requestAnimationFrame(()=>{
        if(autoplay!==context||context.token!==autoplayGeneration)return;
        context.frameId=requestAnimationFrame(()=>{
          context.frameId=null;
          if(autoplay!==context||context.token!==autoplayGeneration)return;
          const elapsed=performance.now()-startedAt,remaining=Math.max(0,AUTOPLAY_INTERVAL_MS-elapsed);
          scheduleAutoplay(context,remaining);
        });
      });
    },Math.max(0,Number(delayMs)||0));
    return true;
  }
  function togglePlay(){
    if(manualBatch)return false;
    if(autoplay){stopAutoplay();return false;}
    const context={token:++autoplayGeneration,timeoutId:null,frameId:null};
    autoplay=context;$('play').textContent='⏸ 暫停';syncControlState();scheduleAutoplay(context,AUTOPLAY_INTERVAL_MS);return true;
  }
  function reset(){
    invalidateManualBatch();
    stopAutoplay();
    selected=null;E.reset(Number($('seedInput').value)||20260911);normalizeCurrentZ();syncControlState();render();
  }
  function bindEvents(){
    document.addEventListener('click',e=>{const ent=e.target.closest('[data-entity]');if(ent){e.stopPropagation();const raw=ent.dataset.entity,i=raw.indexOf(':');select(raw.slice(0,i),raw.slice(i+1));return;}const tile=e.target.closest('.sim-tile[data-tile]');if(tile){select('tile',tile.dataset.tile);return;}const log=e.target.closest('[data-logmode]');if(log){logMode=log.dataset.logmode;document.querySelectorAll('[data-logmode]').forEach(b=>b.classList.toggle('active',b===log));renderTimeline();}});
    $('runtimeLayerSelect')?.addEventListener('change',event=>{if(manualBatch)return;currentZ=Number(event.target.value);render();});
    $('play').addEventListener('click',togglePlay);$('step').addEventListener('click',manualStep);$('step10').addEventListener('click',()=>{void runManualBatch(10).catch(error=>console.error(error));});$('reset').addEventListener('click',reset);$('showThoughts').addEventListener('change',()=>{if(!manualBatch)renderInspector();});document.querySelectorAll('.mobile-nav [data-tab]').forEach(b=>b.addEventListener('click',()=>setMobileView(b.dataset.tab)));
  }
  function start(){
    if(started)return false;
    if(!E.getState())throw new Error('SimUI.start requires an initialized runtime state.');
    bindEvents();
    started=true;
    try{
      runStartupExtensions();
      syncControlState();
      render();
      return true;
    }catch(error){
      started=false;
      throw error;
    }
  }
  Object.assign(UI,{start,isStarted:()=>started});
})();