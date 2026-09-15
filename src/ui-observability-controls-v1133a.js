(() => {
  const E=window.SimEngine,SP=window.SimSpatial,W=window.SimWorld;
  if(!E||!SP||!W)return;

  const VERSION='11.13.3a-observability-controls';
  const RESPONSE_ACTIONS=new Set(['acceptTalk','briefTalkReply','declineTalk']);
  const NEED_SHORT={hunger:'餓',thirst:'渴',fatigue:'累',sleepNeed:'睡',social:'社'};
  const recentSocialByAgent=new Map();
  const baseAddEvent=E.addEvent,baseActionLabel=E.actionLabel,baseTick=E.tick,baseReset=E.reset;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));

  function agentName(id,fallback='對方'){
    return E.getState()?.agents?.[id]?.name||fallback;
  }
  function interactionName(bid){
    const kind=E.socialBidInteractionKind?.(bid)||bid?.data?.interactionKind||null;
    return W.interactionLabel?.(kind)||kind||'互動';
  }
  function clearerSocialText(text,data={}){
    const actor=agentName(data.actor,'對方'),target=agentName(data.target,'對方');
    if(data.action==='talkOffer')return `${actor}走近${target}，開口示意想聊幾句（聊天邀請）。`;
    if(data.action==='acceptTalk')return `${actor}回應了${target}的聊天邀請，明確接下話題。`;
    if(data.action==='briefTalkReply')return `${actor}簡短回應了${target}的聊天邀請，但沒有繼續聊天。`;
    if(data.action==='declineTalk')return `${actor}回應了${target}的聊天邀請，明確表示這次不繼續聊天。`;
    return text;
  }
  function rememberSocialEvent(data={}){
    const st=E.getState(),tick=st?.tick??0;
    if(RESPONSE_ACTIONS.has(data.action)&&data.actor){
      const response=data.talkResponse||data.action;
      recentSocialByAgent.set(data.actor,{tick,role:'responder',otherId:data.target,response});
      if(data.target)recentSocialByAgent.set(data.target,{tick,role:'requester',otherId:data.actor,response});
    }
    if(data.action==='talk'&&data.talkOfferId&&data.actor){
      recentSocialByAgent.set(data.actor,{tick,role:'talked',otherId:data.target,response:'engage'});
    }
  }
  E.addEvent=(text,type='normal',causeIds=[],data={})=>{
    const id=baseAddEvent(clearerSocialText(text,data),type,causeIds,data);
    rememberSocialEvent(data);
    return id;
  };

  function responseLabel(record){
    const other=agentName(record.otherId);
    if(record.role==='talked')return `↩ 剛和${other}聊了一會兒`;
    if(record.role==='requester'){
      if(record.response==='engage')return `↩ 剛收到${other}的聊天回應・願意繼續聊`;
      if(record.response==='brief')return `↩ 剛收到${other}的聊天回應・簡短回覆`;
      return `↩ 剛收到${other}的聊天回應・這次不繼續聊`;
    }
    if(record.response==='engage')return `↩ 剛回應${other}的聊天邀請・投入聊天`;
    if(record.response==='brief')return `↩ 剛回應${other}的聊天邀請・簡短回覆`;
    return `↩ 剛回應${other}的聊天邀請・這次不繼續聊`;
  }
  E.actionLabel=(a)=>{
    const p=a?.action;
    if(p&&E.actionKind?.(p)==='talk'&&p.phase==='respondBid'&&p.responseToBid)return `回應${agentName(p.targetAgent)}的聊天邀請`;
    if(!p&&a?.activeIntent?.kind==='awaitResponse'){
      const bidId=a.activeIntent.source?.bidId,bid=bidId&&E.bidEvent?.(E.getState(),bidId),targetId=bid?.data?.bidTo;
      return `等待${agentName(targetId)}對「${interactionName(bid)}」作出回應`;
    }
    if(!p){
      const record=recentSocialByAgent.get(a?.id),tick=E.getState()?.tick??0;
      if(record&&tick-record.tick<=1)return responseLabel(record);
    }
    return baseActionLabel(a);
  };

  function installTurnControls(){
    const toolbar=document.querySelector('.toolbar');
    if(!toolbar||document.querySelector('.turn-controls'))return;
    const bar=document.createElement('div');
    bar.className='turn-controls';
    bar.setAttribute('aria-label','模擬操作');
    for(const id of ['play','step','step10','reset']){
      const button=document.getElementById(id);if(button)bar.appendChild(button);
    }
    toolbar.classList.add('toolbar-options');
    toolbar.querySelector('.toolbar-spacer')?.remove();
    toolbar.parentNode.insertBefore(bar,toolbar);
  }
  function ensureMobileSummary(){
    let host=document.getElementById('mobileAgentSummary');
    if(host)return host;
    const map=document.getElementById('map');if(!map?.parentElement)return null;
    host=document.createElement('div');host.id='mobileAgentSummary';host.className='mobile-agent-summary';
    map.insertAdjacentElement('afterend',host);
    return host;
  }
  function renderMobileSummary(){
    const host=ensureMobileSummary(),st=E.getState();if(!host||!st)return;
    host.innerHTML=Object.values(st.agents||{}).map(a=>{
      const where=a.offMap?'門外':SP.describePlace(st,a),needs=['hunger','thirst','fatigue','sleepNeed','social']
        .map(k=>`${NEED_SHORT[k]} ${Math.round(clamp(Number(a.needs?.[k])||0,0,100))}`).join(' · ');
      return `<button class="mobile-agent-row agent-${esc(a.id)}" data-entity="agent:${esc(a.id)}"><span class="mobile-agent-identity"><span>${a.kind==='cat'?'🐈':'👤'}</span><b>${esc(a.name)}</b><small>${esc(where)}</small></span><span class="mobile-agent-detail"><span class="mobile-agent-action">${esc(E.actionLabel(a))}</span><span class="mobile-agent-needs">${esc(needs)}</span></span></button>`;
    }).join('');
  }

  E.tick=(...args)=>{const result=baseTick(...args);renderMobileSummary();return result;};
  E.reset=(...args)=>{recentSocialByAgent.clear();const result=baseReset(...args);renderMobileSummary();return result;};

  installTurnControls();
  renderMobileSummary();
  window.addEventListener('resize',renderMobileSummary,{passive:true});
  E.UI_OBSERVABILITY_CONTROLS_VERSION=VERSION;
})();
