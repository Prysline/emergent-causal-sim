(() => {
  const E=window.SimEngine,SP=window.SimSpatial,W=window.SimWorld,UI=window.SimUI;
  if(!E||!SP||!W||typeof document==='undefined')return;
  if(!UI?.registerInspectorDecorator)throw new Error('Resident View requires inspector decorator lifecycle');

  const VERSION='11.14.0-player-resident-view-debug-inspector';
  const NEEDS=[['hunger','飢餓'],['thirst','口渴'],['fatigue','疲勞'],['sleepNeed','睡意'],['social','社交']];
  const INTENT_LABELS={
    satisfyHunger:'想找東西吃',satisfyThirst:'想喝點東西',recoverFatigue:'想休息一下',sleep:'想睡覺',
    socialize:'想找人聊聊',interactWithCat:'想和貓互動',seekSocialContact:'想找人互動',awaitResponse:'正在等對方回應',
    respondSocialBid:'準備回應互動',explore:'想到處看看',cleanEnvironment:'想整理環境',groom:'想整理自己',
    restockFood:'想補充食物',restockWater:'想補充飲水'
  };
  const ACTION_LABELS={
    talk:'聊天',talkOffer:'聊天邀請',acceptTalk:'接受聊天',briefTalkReply:'簡短回應聊天',declineTalk:'沒有繼續聊天',
    petCat:'摸貓',acceptPet:'接受撫摸',toleratePet:'容忍撫摸',avoidPet:'避開撫摸',drinkWater:'喝水',drinkAlcohol:'喝酒',
    eat:'吃東西',sleep:'睡覺',rest:'休息',wander:'走動',cleanFloor:'清理地面',groom:'舔毛',spill:'打翻液體',
    restockContainer:'補充容器',externalSupply:'外出補給'
  };
  const host=document.getElementById('inspector');if(!host)return;
  let currentAgentId=null,mode='resident',residentTab='overview',scheduled=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const agentName=(st,id,fallback='對方')=>st?.agents?.[id]?.name||fallback;
  const actionName=action=>ACTION_LABELS[action]||E.ZH?.[action]||action||'一件事';
  const interactionName=kind=>W.interactionLabel?.(kind)||kind||'互動';

  function needText(value){
    const v=clamp(Number(value)||0,0,100);
    if(v>=80)return '很迫切';
    if(v>=60)return '明顯';
    if(v>=35)return '有一些';
    return '目前還好';
  }
  function affectLabel(affect){
    const v=clamp(Number(affect?.valence)||0,-1,1),a=clamp(Number(affect?.activation)||0,0,1),f=clamp(Number(affect?.frustration)||0,0,1);
    if(f>=.55)return '明顯煩躁';
    if(v<=-.45)return a>=.35?'心情偏低，也比較緊繃':'心情偏低';
    if(f>=.22)return '有些煩躁';
    if(v<=-.15)return '心情稍微偏低';
    if(v>=.45)return a>=.35?'心情很好，也比較活躍':'心情很好';
    if(v>=.15)return '心情不錯';
    if(a>=.55)return '比較亢奮';
    if(a>=.20)return '稍微活躍';
    return '平穩';
  }
  function postureText(st,a){
    if(a?.posture?.kind==='sitting')return `坐著${a.posture.furnitureId?`・${st.furniture?.[a.posture.furnitureId]?.name||''}`:''}`;
    if(a?.posture?.kind==='lying')return '躺著／蜷著';
    return '站立';
  }
  function intentText(a){
    const kind=a?.activeIntent?.kind;
    return INTENT_LABELS[kind]||E.ZH?.[kind]||'照自己的步調行動';
  }
  function heldText(st,a){
    if(!a?.held)return '';
    return st.containers?.[a.held]?.name||E.endpointName?.(a.held)||a.held;
  }
  function needCards(a){
    return NEEDS.map(([key,label])=>{
      const value=clamp(Number(a?.needs?.[key])||0,0,100);
      return `<div class="resident-need" data-need="${key}"><div class="resident-need-head"><b>${label}</b><span>${needText(value)}</span></div><div class="resident-meter" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(value)}"><span style="--resident-meter:${value}%"></span></div></div>`;
    }).join('');
  }
  function recentPlayerEvents(st,id,limit=6){
    const ref=`agent:${id}`;
    return (st.events||[]).filter(e=>{
      if(e?.type==='system'||!e?.data?.entities?.includes(ref))return false;
      return e.data.visibility!=='private'||e.data.owner===id;
    }).slice(0,limit);
  }
  function eventList(st,id){
    const events=recentPlayerEvents(st,id);
    if(!events.length)return '<div class="resident-empty">最近沒有特別值得記下來的事情。</div>';
    return `<div class="resident-life-list">${events.map(e=>{
      const privatePrefix=e.data?.visibility==='private'&&e.data?.owner===id?'自己的經驗・':'';
      return `<button class="resident-life-event" data-entity="event:${esc(e.id)}"><time>${esc(e.time||'')}</time><span>${esc(privatePrefix+(e.text||''))}</span></button>`;
    }).join('')}</div>`;
  }
  function observedMemoryText(st,m){
    const live=st.causes?.[m?.sourceEventId];
    if(live?.text)return live.text;
    const o=m?.observed||{},actor=agentName(st,o.actorId,''),target=agentName(st,o.targetId,'');
    switch(o.action){
      case 'talk': return actor&&target?`${actor}和${target}聊了一會兒。`:'記得一次聊天。';
      case 'talkOffer': return actor&&target?`${actor}曾找${target}聊天。`:'記得一次聊天邀請。';
      case 'briefTalkReply': return actor&&target?`${actor}曾簡短回應${target}的聊天邀請。`:'記得一次簡短的聊天回應。';
      case 'declineTalk': return actor&&target?`${actor}曾明確表示那次不繼續聊天。`:'記得一次沒有繼續的聊天。';
      case 'petCat': return actor&&target?`${actor}曾摸過${target}。`:'記得一次撫摸互動。';
      case 'avoidPet': return actor&&target?`${actor}曾避開${target}的撫摸。`:'記得一次避開撫摸的互動。';
      case 'spill': return '記得一次液體灑出的事。';
      default: return `記得一次「${actionName(o.action)}」相關的事。`;
    }
  }
  function privateOutcomeMemoryText(st,m){
    const x=m?.experienced||{},other=agentName(st,x.counterpartId),kind=x.interactionKind||null;
    if(kind==='talk'||x.bidKind==='talkOffer')return `曾找${other}聊天，但當時沒有得到回應。`;
    return `曾向${other}發起${interactionName(kind)}，但當時沒有得到回應。`;
  }
  function memoryText(st,m){return m?.episodeKind==='privateSocialOutcome'?privateOutcomeMemoryText(st,m):observedMemoryText(st,m);}
  function playerMemories(st,a,limit=5){
    return (a?.episodicMemories||[]).slice().sort((left,right)=>{
      const rs=E.memoryRetentionScore?.(st,a,right)??0,ls=E.memoryRetentionScore?.(st,a,left)??0;
      if(rs!==ls)return rs-ls;
      return (Number(right?.lastObservedTick)||Number(right?.observedTick)||0)-(Number(left?.lastObservedTick)||Number(left?.observedTick)||0);
    }).slice(0,limit);
  }
  function memoryList(st,a){
    const memories=playerMemories(st,a);
    if(!memories.length)return '<div class="resident-empty">目前還沒有留下明確的近期記憶。</div>';
    return `<div class="resident-memory-list">${memories.map(m=>`<div class="resident-memory-item"><span>◦</span><p>${esc(memoryText(st,m))}</p></div>`).join('')}</div><p class="resident-footnote">這裡只把角色已保存的 episodic memory 翻成較容易閱讀的文字；不額外推定好惡、動機或關係。</p>`;
  }
  function overview(st,a){
    const where=a.offMap?'門外':SP.describePlace(st,a),held=heldText(st,a),action=E.actionLabel(a),affect=affectLabel(a.affect);
    return `<section class="resident-hero"><div class="resident-avatar">${a.kind==='cat'?'🐈':'👤'}</div><div><h2>${esc(a.name)}</h2><p>📍 ${esc(where)}・${esc(postureText(st,a))}${held?`・拿著 ${esc(held)}`:''}</p></div></section><section class="resident-card resident-now"><h3>現在</h3><strong>${esc(action)}</strong><p>${esc(intentText(a))}</p></section><section class="resident-card"><h3>狀態</h3><div class="resident-needs">${needCards(a)}</div></section><section class="resident-card resident-mood"><h3>心情</h3><strong>${esc(affect)}</strong><p>這是由目前的短期 Affect 轉成保守描述，不代表長期性格或關係。</p></section>`;
  }
  function residentBody(st,a){
    if(residentTab==='recent')return `<section class="resident-card"><h3>最近發生的事</h3>${eventList(st,a.id)}</section>`;
    if(residentTab==='memory')return `<section class="resident-card"><h3>記得的事情</h3>${memoryList(st,a)}</section>`;
    return overview(st,a);
  }
  function renderResident(shell,id){
    const st=E.getState(),a=st?.agents?.[id],view=shell.querySelector('[data-v1140-resident-view]');if(!a||!view)return;
    view.innerHTML=`<div class="resident-tabs" role="tablist" aria-label="居民資訊"><button data-v1140-tab="overview" class="${residentTab==='overview'?'active':''}">概況</button><button data-v1140-tab="recent" class="${residentTab==='recent'?'active':''}">最近</button><button data-v1140-tab="memory" class="${residentTab==='memory'?'active':''}">記憶</button></div><div class="resident-tab-body">${residentBody(st,a)}</div>`;
  }
  function applyMode(shell){
    const resident=shell.querySelector('[data-v1140-resident-view]'),debug=shell.querySelector('[data-v1140-debug-view]');
    resident.hidden=mode!=='resident';debug.hidden=mode!=='debug';
    shell.querySelectorAll('[data-v1140-mode]').forEach(b=>{const on=b.dataset.v1140Mode===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  }
  function buildShell(id){
    const shell=document.createElement('div');shell.dataset.v1140ResidentRoot='';shell.className='resident-inspector-shell';
    const modeBar=document.createElement('div');modeBar.className='resident-mode-toggle';modeBar.innerHTML='<button data-v1140-mode="resident">居民</button><button data-v1140-mode="debug">Debug</button>';
    const resident=document.createElement('div');resident.dataset.v1140ResidentView='';resident.className='resident-view';
    const debug=document.createElement('div');debug.dataset.v1140DebugView='';debug.className='debug-inspector-view';
    const existing=[...host.childNodes];for(const node of existing)debug.appendChild(node);
    shell.append(modeBar,resident,debug);host.append(shell);renderResident(shell,id);applyMode(shell);return shell;
  }
  function layerInspector({host:renderHost,selected}){
    scheduled=false;
    if(renderHost!==host)return;
    if(selected?.type!=='agent'){currentAgentId=null;return;}
    const id=selected.id;
    if(id!==currentAgentId){currentAgentId=id;mode='resident';residentTab='overview';}
    let shell=host.querySelector(':scope > [data-v1140-resident-root]');
    if(!shell)shell=buildShell(id);
    else{renderResident(shell,id);applyMode(shell);}
  }
  function refreshResidentView(){
    scheduled=false;
    const selected=UI.getInspectorSelection?.(),shell=host.querySelector(':scope > [data-v1140-resident-root]');
    if(!shell||selected?.type!=='agent')return;
    if(selected.id!==currentAgentId){currentAgentId=selected.id;mode='resident';residentTab='overview';}
    renderResident(shell,selected.id);applyMode(shell);
  }
  function schedule(){
    if(scheduled)return;scheduled=true;
    queueMicrotask(()=>requestAnimationFrame(refreshResidentView));
  }
  function resetResidentView(){currentAgentId=null;mode='resident';residentTab='overview';schedule();}

  UI.registerInspectorDecorator('residentView.layer',layerInspector,1000);
  document.addEventListener('click',event=>{
    const modeButton=event.target.closest?.('[data-v1140-mode]');
    if(modeButton){mode=modeButton.dataset.v1140Mode==='debug'?'debug':'resident';const shell=host.querySelector(':scope > [data-v1140-resident-root]');if(shell)applyMode(shell);return;}
    const tabButton=event.target.closest?.('[data-v1140-tab]');
    if(tabButton){residentTab=tabButton.dataset.v1140Tab||'overview';const shell=host.querySelector(':scope > [data-v1140-resident-root]');if(shell&&currentAgentId)renderResident(shell,currentAgentId);return;}
  });

  if(!E.registerRuntimeHook)throw new Error('ui-resident-view-v1140.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('afterTick','residentView.schedule',schedule,1100);
  E.registerRuntimeHook('afterReset','residentView.reset',resetResidentView,700);

  E.UI_RESIDENT_VIEW_VERSION=VERSION;
  E.residentAffectLabel=affectLabel;
  E.residentNeedLabel=needText;
  schedule();
})();