(() => {
  const E=window.SimEngine,SP=window.SimSpatial,W=window.SimWorld,UI=window.SimUI;
  if(!E||!SP||!W)return;
  if(!UI?.registerStartupExtension)throw new Error('UI observability requires UI startup lifecycle.');

  const VERSION='11.48.0-debug-replay-p1';
  const SIMULATION_MINUTES_PER_TICK=2;
  const RESPONSE_ACTIONS=new Set(['acceptTalk','briefTalkReply','declineTalk']);
  const NEED_SHORT={hunger:'餓',thirst:'渴',fatigue:'累',sleepNeed:'睡',social:'社'};
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const priorManualBatchActive=UI.isManualBatchActive?.bind(UI)||(()=>false);
  const priorManualBatchIntermediate=UI.isManualBatchIntermediate?.bind(UI)||(()=>false);
  let debugRun=null,debugRunGeneration=0;

  UI.isManualBatchActive=()=>!!debugRun||priorManualBatchActive();
  UI.isManualBatchIntermediate=()=>!!debugRun?.intermediate||priorManualBatchIntermediate();

  function agentName(id,fallback='對方'){
    return E.getState()?.agents?.[id]?.name||fallback;
  }
  function interactionName(bid){
    const kind=E.socialBidInteractionKind?.(bid)||bid?.data?.interactionKind||null;
    return UI.interactionLabel?.(kind)||kind||'互動';
  }
  function recentSocialRecord(st,agentId){
    const tick=st?.tick??0;
    for(const event of st?.events||[]){
      if(!Number.isInteger(event?.tick))continue;
      const age=tick-event.tick;if(age<0)continue;if(age>1)break;
      const data=event.data||{};
      if(data.action==='talk'&&data.talkOfferId&&data.actor===agentId)return {tick:event.tick,role:'talked',otherId:data.target,response:'engage'};
      if(RESPONSE_ACTIONS.has(data.action)){
        const response=data.talkResponse||data.action;
        if(data.actor===agentId)return {tick:event.tick,role:'responder',otherId:data.target,response};
        if(data.target===agentId)return {tick:event.tick,role:'requester',otherId:data.actor,response};
      }
    }
    return null;
  }
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
  function socialActionLabel(st,a){
    const p=a?.action;
    if(p&&E.actionKind?.(p)==='talk'&&p.phase==='respondBid'&&p.responseToBid)return `回應${agentName(p.targetAgent)}的聊天邀請`;
    if(!p&&a?.activeIntent?.kind==='awaitResponse'){
      const bidId=a.activeIntent.source?.bidId,bid=bidId&&E.bidEvent?.(st,bidId),targetId=bid?.data?.bidTo;
      return `等待${agentName(targetId)}對「${interactionName(bid)}」作出回應`;
    }
    if(!p){const record=recentSocialRecord(st,a?.id);if(record)return responseLabel(record);}
    return null;
  }
  if(!E.registerActionLabelResolver)throw new Error('ui observability requires action label resolver contract');
  E.registerActionLabelResolver('uiObservability.social-status',socialActionLabel,100);

  function debugStatus(text,kind=''){
    const host=document.getElementById('debugRunStatus');if(!host)return;
    host.textContent=text||'';host.dataset.kind=kind;
  }
  function debugModePlaceholder(){
    const mode=document.getElementById('debugRunMode')?.value,input=document.getElementById('debugRunValue');if(!input)return;
    input.placeholder=mode==='count'?'例如 100':mode==='tick'?'例如 500':'例如 14:30 或 2 08:30';
    input.inputMode=mode==='time'?'text':'numeric';
  }
  function isAutoplayActive(){
    const step=document.getElementById('step'),step10=document.getElementById('step10'),play=document.getElementById('play');
    return step?.disabled===true&&step10?.disabled===true&&play?.disabled===false&&!priorManualBatchActive();
  }
  function setDebugBusy(active,context=debugRun){
    const ids=['step','step10','play','runtimeLayerSelect','showThoughts','loadSocialScenario','socialScenario','debugRunMode','debugRunValue','debugRunStart'];
    const reset=document.getElementById('reset'),workspace=document.querySelector('.workspace');
    if(active&&context&&!context.controlSnapshot){
      context.controlSnapshot=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)?.disabled??null]));
      context.resetDisabled=reset?.disabled??null;
      context.workspaceInert=workspace?.inert??false;
      context.workspaceBusy=workspace?.getAttribute('aria-busy')??null;
    }
    for(const id of ids){const control=document.getElementById(id);if(!control)continue;control.disabled=active?true:!!context?.controlSnapshot?.[id];}
    if(reset)reset.disabled=active?false:!!context?.resetDisabled;
    if(workspace){
      if(active){workspace.inert=true;workspace.setAttribute('aria-busy','true');}
      else{workspace.inert=!!context?.workspaceInert;if(context?.workspaceBusy==null)workspace.removeAttribute('aria-busy');else workspace.setAttribute('aria-busy',context.workspaceBusy);}
    }
  }
  function updateDebugProgress(){
    if(!debugRun)return;
    if(debugRun.source==='step10')document.getElementById('step10').textContent=`執行中 ${debugRun.completed}/${debugRun.total}`;
    debugStatus(`${debugRun.label}：${debugRun.completed}/${debugRun.total} ticks`,'running');
  }
  function finishDebugRunControls(context=debugRun){
    const step10=document.getElementById('step10');if(step10)step10.textContent='10 步';
    setDebugBusy(false,context);
  }
  function cancelDebugRun(message='已取消'){
    if(!debugRun)return false;
    const context=debugRun;debugRunGeneration++;debugRun=null;finishDebugRunControls(context);debugStatus(message,'cancelled');return true;
  }
  function yieldToBrowser(){return new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));}
  function dispatchFinalStep(){
    const step=document.getElementById('step');if(!step)throw new Error('Debug Replay requires the canonical single-step control.');
    const disabled=step.disabled;step.disabled=false;
    try{step.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}finally{step.disabled=disabled;}
  }
  async function runDebugTicks(total,{label=`Run ${total} ticks`,source='debug'}={}){
    if(debugRun||priorManualBatchActive()||isAutoplayActive())return false;
    if(!Number.isSafeInteger(total)||total<1){debugStatus('tick 數必須是大於 0 的整數。','error');return false;}
    const startTick=E.getState()?.tick;
    const context={token:++debugRunGeneration,total,completed:0,intermediate:true,label,source,startTick};
    debugRun=context;setDebugBusy(true,context);updateDebugProgress();
    try{
      await yieldToBrowser();
      if(debugRun!==context||context.token!==debugRunGeneration)return false;
      for(let i=0;i<total;i++){
        context.intermediate=i<total-1;
        if(context.intermediate)E.tick();else dispatchFinalStep();
        context.completed=i+1;updateDebugProgress();
        if(i<total-1){
          await yieldToBrowser();
          if(debugRun!==context||context.token!==debugRunGeneration)return false;
        }
      }
      if(debugRun!==context||context.token!==debugRunGeneration)return false;
      const finalTick=E.getState()?.tick;
      if(finalTick!==startTick+total)throw new Error(`Debug Replay exact-stop mismatch: expected Tick ${startTick+total}, got ${finalTick}.`);
      debugRun=null;finishDebugRunControls(context);debugStatus(`完成：Tick ${finalTick}`,'success');return true;
    }finally{
      if(debugRun===context){debugRun=null;finishDebugRunControls(context);}
    }
  }
  function parseSimulationTime(raw){
    const text=String(raw??'').trim();
    let day=E.getState()?.day,hour=null,minute=null,match=text.match(/^(\d{1,2}):(\d{2})$/);
    if(match){hour=Number(match[1]);minute=Number(match[2]);}
    else{
      match=text.match(/^(\d+)\s+(\d{1,2}):(\d{2})$/);
      if(match){day=Number(match[1]);hour=Number(match[2]);minute=Number(match[3]);}
    }
    if(!Number.isSafeInteger(day)||day<1||!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59)return {ok:false,message:'時間格式請使用 HH:MM，或「天 HH:MM」，例如 2 08:30。'};
    const st=E.getState(),current=(st.day-1)*1440+st.minute,target=(day-1)*1440+hour*60+minute,delta=target-current;
    if(delta<=0)return {ok:false,message:'目標 simulation time 必須晚於目前時間。'};
    if(delta%SIMULATION_MINUTES_PER_TICK!==0)return {ok:false,message:`此時間無法由目前每 tick ${SIMULATION_MINUTES_PER_TICK} 分鐘的 canonical clock 精確抵達。`};
    return {ok:true,total:delta/SIMULATION_MINUTES_PER_TICK,label:`Run to Day ${day} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`};
  }
  function debugRunRequest(){
    const mode=document.getElementById('debugRunMode')?.value,raw=document.getElementById('debugRunValue')?.value,st=E.getState();
    if(mode==='count'){
      const total=Number(raw);if(!Number.isSafeInteger(total)||total<1){debugStatus('Run N 的 N 必須是大於 0 的整數。','error');return null;}
      return {total,label:`Run ${total} ticks`};
    }
    if(mode==='tick'){
      const target=Number(raw);if(!Number.isSafeInteger(target)){debugStatus('target tick 必須是整數。','error');return null;}
      if(target<=st.tick){debugStatus('target tick 必須大於目前 tick。','error');return null;}
      return {total:target-st.tick,label:`Run to Tick ${target}`};
    }
    if(mode==='time'){
      const parsed=parseSimulationTime(raw);if(!parsed.ok){debugStatus(parsed.message,'error');return null;}return parsed;
    }
    debugStatus('未知的 Debug Replay 模式。','error');return null;
  }
  function startDebugRunFromUi(){
    const request=debugRunRequest();if(!request)return false;
    void runDebugTicks(request.total,{label:request.label}).catch(error=>{console.error(error);debugStatus(error.message||String(error),'error');});return true;
  }
  function installDebugReplayControls(bar){
    if(!bar||document.getElementById('debugRunStart'))return;
    const group=document.createElement('span');group.className='debug-replay-controls';group.innerHTML='<select id="debugRunMode" aria-label="Debug Replay mode"><option value="count">Run N</option><option value="tick">To tick</option><option value="time">To time</option></select><input id="debugRunValue" type="text" inputmode="numeric" aria-label="Debug Replay target" placeholder="例如 100"><button id="debugRunStart" type="button">快轉</button><small id="debugRunStatus" aria-live="polite"></small>';
    const reset=bar.querySelector('#reset'),step10=bar.querySelector('#step10');bar.insertBefore(group,reset||null);
    group.querySelector('#debugRunMode').addEventListener('change',debugModePlaceholder);
    group.querySelector('#debugRunStart').addEventListener('click',startDebugRunFromUi);
    group.querySelector('#debugRunValue').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();startDebugRunFromUi();}});
    reset?.addEventListener('click',()=>cancelDebugRun('已重置'),{capture:true});
    step10?.addEventListener('click',event=>{
      if(debugRun)return;
      event.preventDefault();event.stopImmediatePropagation();
      void runDebugTicks(10,{label:'Run 10 ticks',source:'step10'}).catch(error=>{console.error(error);debugStatus(error.message||String(error),'error');});
    },{capture:true});
  }
  function installTurnControls(){
    const toolbar=document.querySelector('.toolbar');if(!toolbar||document.querySelector('.turn-controls'))return;
    const bar=document.createElement('div');bar.className='turn-controls';bar.setAttribute('aria-label','模擬操作');
    for(const id of ['play','step','step10','reset']){const button=document.getElementById(id);if(button)bar.appendChild(button);}
    installDebugReplayControls(bar);
    toolbar.classList.add('toolbar-options');toolbar.querySelector('.toolbar-spacer')?.remove();toolbar.parentNode.insertBefore(bar,toolbar);
  }
  function ensureMobileSummary(){
    let host=document.getElementById('mobileAgentSummary');if(host)return host;
    const map=document.getElementById('map');if(!map?.parentElement)return null;
    host=document.createElement('div');host.id='mobileAgentSummary';host.className='mobile-agent-summary';map.insertAdjacentElement('afterend',host);return host;
  }
  function renderMobileSummary(){
    if(UI.isManualBatchIntermediate?.())return;
    const host=ensureMobileSummary(),st=E.getState();if(!host||!st)return;
    host.innerHTML=Object.values(st.agents||{}).map(a=>{
      const where=a.offMap?'門外':SP.describePlace(st,a),needs=['hunger','thirst','fatigue','sleepNeed','social'].map(k=>`${NEED_SHORT[k]} ${Math.round(clamp(Number(a.needs?.[k])||0,0,100))}`).join(' · ');
      return `<button class="mobile-agent-row agent-${esc(a.id)}" data-entity="agent:${esc(a.id)}"><span class="mobile-agent-identity"><span>${a.kind==='cat'?'🐈':'👤'}</span><b>${esc(a.name)}</b><small>${esc(where)}</small></span><span class="mobile-agent-detail"><span class="mobile-agent-action">${esc(E.actionLabel(a))}</span><span class="mobile-agent-needs">${esc(needs)}</span></span></button>`;
    }).join('');
  }
  function resetObservability(){if(UI.isStarted?.())renderMobileSummary();}

  if(!E.registerRuntimeObserver)throw new Error('ui/observability-controls.js requires runtime observer lifecycle');
  E.registerRuntimeObserver('afterTick','uiObservability.render-mobile-summary',renderMobileSummary,1000);
  E.registerRuntimeObserver('afterReset','uiObservability.reset',resetObservability,600);

  UI.registerStartupExtension('uiObservability.controls',()=>{
    installTurnControls();
    renderMobileSummary();
    window.addEventListener('resize',renderMobileSummary,{passive:true});
  },200);
  Object.assign(E,{UI_OBSERVABILITY_CONTROLS_VERSION:VERSION,DEBUG_REPLAY_MINUTES_PER_TICK:SIMULATION_MINUTES_PER_TICK,runDebugTicks});
})();
