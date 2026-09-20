(() => {
  const E=window.SimEngine,SP=window.SimSpatial,W=window.SimWorld,UI=window.SimUI;
  if(!E||!SP||!W||typeof document==='undefined')return;
  if(!UI?.registerInspectorDecorator)throw new Error('Resident View requires inspector decorator lifecycle');

  const VERSION=W.PRESENTATION_SCHEMA_VERSION;
  if(!VERSION)throw new Error('Resident View requires presentation schema version');
  const NEEDS=[['hunger','飢餓'],['thirst','口渴'],['fatigue','疲勞'],['sleepNeed','睡意'],['social','社交']];
  const INTENT_LABELS={
    satisfyHunger:'填飽肚子',drinkWater:'補充水分',drinkAlcohol:'解渴／喝點酒',recoverFatigue:'緩解活動疲勞',sleep:'補足睡眠',
    socialize:'找人聊聊',interactWithAnimal:'和動物互動',seekSocialContact:'找人親近',awaitResponse:'等待對方回應',
    respondSocialBid:'回應對方的互動',explore:'探索附近',removeHazard:'處理濕滑地面',groom:'整理毛髮與身體',
    restockResource:'補充室內資源',replenishSupply:'補足家中庫存'
  };
  const REQUIRED_INTENT_LABELS=[...new Set([...Object.values(E.INTENT_BY_ACTION||{}),'awaitResponse','respondSocialBid'])];
  const MISSING_INTENT_LABELS=REQUIRED_INTENT_LABELS.filter(kind=>!INTENT_LABELS[kind]);
  if(MISSING_INTENT_LABELS.length)throw new Error(`Resident View missing canonical Intent labels: ${MISSING_INTENT_LABELS.join(', ')}`);
  const ACTION_LABELS={
    talk:'聊天',talkOffer:'聊天邀請',acceptTalk:'接受聊天',briefTalkReply:'簡短回應聊天',declineTalk:'沒有繼續聊天',
    petAnimal:'撫摸動物',acceptPet:'接受撫摸',toleratePet:'容忍撫摸',avoidPet:'避開撫摸',drinkWater:'喝水',drinkAlcohol:'喝酒',
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
  const resourceName=id=>W.RESOURCE_TYPES?.[id]?.name||id||'資源';
  const containerName=(st,id,fallback='容器')=>st?.containers?.[id]?.name||E.endpointName?.(id)||fallback;

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
    if(!kind)return '目前沒有明確的短期目的';
    return INTENT_LABELS[kind]||E.intentLabel?.(kind)||'目前沒有可顯示的短期目的';
  }
  function restockActionText(st,p){
    const dest=containerName(st,p?.destinationId,'室內容器'),resource=resourceName(p?.resource),carrier=containerName(st,p?.carrierId,'搬運容器');
    switch(p?.phase){
      case 'toContainer': return `前往${dest}，準備補充${resource}`;
      case 'takeContainer': return `拿起${dest}，準備補充${resource}`;
      case 'toCarrier': return `前往${carrier}，準備搬運${resource}`;
      case 'takeCarrier': return `拿起${carrier}，準備搬運${resource}`;
      case 'toSource': return `前往資源來源，準備取得${resource}`;
      case 'loadCarrier': return `把${resource}裝進${carrier}`;
      case 'toDestination': return `把${resource}帶回${dest}`;
      case 'deposit': return `把${resource}補進${dest}`;
      case 'fill': return `替${dest}補充${resource}`;
      default: return `補充${dest}的${resource}`;
    }
  }
  function externalSupplyActionText(st,p){
    const dest=containerName(st,p?.destinationId,'家中庫存'),resource=resourceName(p?.resource),carrier=containerName(st,p?.carrierId,'搬運容器');
    switch(p?.phase){
      case 'toCarrier': return `前往${carrier}，準備外出補給`;
      case 'takeCarrier': return `拿起${carrier}，準備外出補給`;
      case 'toExit': return `帶著${carrier}前往出口`;
      case 'exit': return `準備離開家門補給${resource}`;
      case 'work': return `正在外出補給${resource}`;
      case 'toDestination': return `帶著補給回到${dest}`;
      case 'deposit': return `把補給的${resource}放進${dest}`;
      default: return `外出補給${resource}`;
    }
  }
  function residentActionText(st,a){
    const p=a?.action;
    if(!p)return '目前沒有進行中的行動';
    if(p.kind==='wander')return a?.kind==='cat'?'四處探索':'四處走走';
    if(p.kind==='restockContainer')return restockActionText(st,p);
    if(p.kind==='externalSupply')return externalSupplyActionText(st,p);
    return String(E.actionLabel(a)||'').replace(/・目標 \(-?\d+,-?\d+\)/g,'');
  }
  function playerActionExplanation(st,a){
    const thought=st?.thoughts?.[a?.id],action=a?.action,pick=thought?.pick;
    if(!thought||!action||!pick)return '';
    if(thought.tick!==action.started||pick.id!==action.kind)return '';
    if(a?.activeIntent?.kind==='respondSocialBid')return '';
    switch(pick.id){
      case 'eat': return '因為肚子餓了。';
      case 'drinkWater': return '因為口渴。';
      case 'drinkAlcohol': return '因為口渴，而且現在想喝點酒。';
      case 'rest': return '因為累了。';
      case 'sleep': return '因為想睡了。';
      case 'talk': return '因為想找人說說話。';
      case 'petAnimal': return '因為想找點陪伴，也對動物有親近感。';
      case 'seekHuman': return '因為想找點陪伴。';
      case 'cleanFloor': return '因為附近有濕滑的地面需要處理。';
      case 'groom': {
        const residue=Object.values(a?.contacts?.paws||{}).reduce((sum,value)=>sum+(Number(value)||0),0);
        return residue>.05?'因為腳掌或毛上沾了需要清理的東西。':'因為身上有點需要整理了。';
      }
      case 'restockContainer': {
        const dest=containerName(st,action.destinationId,'室內容器'),resource=resourceName(action.resource);
        return `因為${dest}裡的${resource}已經不多了。`;
      }
      case 'externalSupply': return `因為家裡的${resourceName(action.resource)}快不夠了。`;
      case 'wander': return '因為現在沒有更急著要做的事。';
      default: return '';
    }
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
      case 'petAnimal': return actor&&target?`${actor}曾摸過${target}。`:'記得一次撫摸互動。';
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
    const where=a.offMap?'門外':SP.describePlace(st,a),held=heldText(st,a),action=residentActionText(st,a),affect=affectLabel(a.affect),explanation=playerActionExplanation(st,a);
    return `<section class="resident-hero"><div class="resident-avatar">${a.kind==='cat'?'🐈':'👤'}</div><div><h2>${esc(a.name)}</h2><p>📍 ${esc(where)}・${esc(postureText(st,a))}${held?`・拿著 ${esc(held)}`:''}</p></div></section><section class="resident-card resident-now"><h3>現在</h3><strong>${esc(action)}</strong><p>${esc(intentText(a))}</p>${explanation?`<p class="resident-footnote" data-v1140-player-explanation><b>原因</b> ${esc(explanation)}</p>`:''}</section><section class="resident-card"><h3>狀態</h3><div class="resident-needs">${needCards(a)}</div></section><section class="resident-card resident-mood"><h3>心情</h3><strong>${esc(affect)}</strong><p>這是由目前的短期 Affect 轉成保守描述，不代表長期性格或關係。</p></section>`;
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
    if(!UI.isStarted?.()||scheduled)return;scheduled=true;
    queueMicrotask(()=>requestAnimationFrame(refreshResidentView));
  }
  function resetResidentView(){currentAgentId=null;mode='resident';residentTab='overview';schedule();}

  UI.registerInspectorDecorator('residentView.layer',layerInspector,1000);
  if(!UI.registerStartupExtension)throw new Error('Resident View requires UI startup lifecycle');
  UI.registerStartupExtension('residentView.controls',()=>{
    document.addEventListener('click',event=>{
      const modeButton=event.target.closest?.('[data-v1140-mode]');
      if(modeButton){mode=modeButton.dataset.v1140Mode==='debug'?'debug':'resident';const shell=host.querySelector(':scope > [data-v1140-resident-root]');if(shell)applyMode(shell);return;}
      const tabButton=event.target.closest?.('[data-v1140-tab]');
      if(tabButton){residentTab=tabButton.dataset.v1140Tab||'overview';const shell=host.querySelector(':scope > [data-v1140-resident-root]');if(shell&&currentAgentId)renderResident(shell,currentAgentId);return;}
    });
    schedule();
  },300);

  if(!E.registerRuntimeHook)throw new Error('ui-resident-view-v1140.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('afterTick','residentView.schedule',schedule,1100);
  E.registerRuntimeHook('afterReset','residentView.reset',resetResidentView,700);

  E.UI_RESIDENT_VIEW_VERSION=VERSION;
  E.residentAffectLabel=affectLabel;
  E.residentNeedLabel=needText;
  E.residentIntentLabel=intentText;
  E.residentActionText=residentActionText;
  E.residentActionExplanation=playerActionExplanation;
})();
