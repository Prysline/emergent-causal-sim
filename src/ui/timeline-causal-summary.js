(() => {
  const E=window.SimEngine,UI=window.SimUI;
  if(!E||!UI?.registerStartupExtension||typeof document==='undefined')return;
  const VERSION='timeline-causal-summary-v1';
  const WAKE_OUTCOMES=new Set(['sleepWake','sleepDisturbance']);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function attentionCauseIds(st,event){
    const out=[];
    for(const id of event?.causeIds||[]){
      const cause=st?.causes?.[id];
      if(cause?.data?.action==='attentionStimulus')out.push(id);
    }
    return out;
  }
  function causalSummaryExtraEventIds(st,visibleIds=[]){
    const visible=new Set(visibleIds),extras=new Set();
    for(const event of st?.events||[]){
      if(event?.data?.action==='sleepWake'&&attentionCauseIds(st,event).length)extras.add(event.id);
    }
    for(const id of [...visible,...extras]){
      const event=st?.causes?.[id];
      if(!WAKE_OUTCOMES.has(event?.data?.action))continue;
      for(const causeId of attentionCauseIds(st,event))extras.add(causeId);
    }
    return [...extras];
  }
  function eventMarkup(event){return `<button class="timeline-entry ${esc(event.type)}" data-entity="event:${esc(event.id)}"><span class="time">${esc(event.time)}</span><span class="text">${esc(event.text)}</span></button>`;}
  function projectCausalSummary(){
    const summaryButton=document.querySelector('[data-logmode="summary"]');
    if(!summaryButton?.classList.contains('active'))return false;
    const host=document.getElementById('timeline'),st=E.getState?.();if(!host||!st)return false;
    const visibleIds=[...host.querySelectorAll('.timeline-entry[data-entity^="event:"]')].map(node=>node.dataset.entity.slice(6));
    const extras=causalSummaryExtraEventIds(st,visibleIds),wanted=new Set([...visibleIds,...extras]);
    if(extras.every(id=>visibleIds.includes(id)))return false;
    const events=(st.events||[]).filter(event=>wanted.has(event.id)).slice(0,80);
    host.innerHTML=events.length?events.map(eventMarkup).join(''):'<div class="timeline-empty">目前沒有符合摘要條件的事件。</div>';
    return true;
  }

  UI.registerStartupExtension('timeline.causal-summary',()=>{
    const host=document.getElementById('timeline');if(!host)return;
    const observer=new MutationObserver(()=>projectCausalSummary());
    observer.observe(host,{childList:true});
    document.querySelectorAll('[data-logmode]').forEach(button=>button.addEventListener('click',()=>queueMicrotask(projectCausalSummary)));
    queueMicrotask(projectCausalSummary);
  },250);

  Object.assign(UI,{TIMELINE_CAUSAL_SUMMARY_VERSION:VERSION,causalSummaryExtraEventIds,projectCausalSummary});
})();
