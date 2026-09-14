(() => {
  const E=window.SimEngine;if(!E?.APPRAISAL_SCHEMA_VERSION||typeof document==='undefined')return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const entityName=(st,id)=>id?(st.agents?.[id]?.name||id):'—';
  const signed=v=>`${v>0?'+':''}${Number(v||0).toFixed(2)}`;
  const pct=v=>`${Math.round((Number(v)||0)*100)}%`;
  const agencyLabel=(st,p)=>{
    const a=p?.agency;if(!a)return '未知';
    if(a.kind==='self')return '自己';
    if(a.kind==='other')return `他者・${entityName(st,a.agentId)}`;
    if(a.kind==='environment')return '環境';
    return '未知';
  };
  const factorLabel=f=>{
    if(!f)return '—';
    if(f.kind==='need')return `${f.kind}:${f.key}=${pct(f.level)}`;
    if(f.kind==='trait')return `${f.kind}:${f.key}=${pct(f.level)}`;
    if(f.kind==='spillProximity')return `${f.kind}:d=${f.distance}`;
    return f.kind;
  };

  function decorateInspector(){
    const host=document.getElementById('inspector');if(!host||host.querySelector('[data-v1131-appraisal]'))return;
    const meta=[...host.querySelectorAll('.inspect-title small')].find(x=>x.textContent?.startsWith('Agent・'));if(!meta)return;
    const id=meta.textContent.slice('Agent・'.length),st=E.getState(),a=st?.agents?.[id];if(!a)return;
    const memories=(a.episodicMemories||[]).filter(m=>m.appraisal).slice().reverse().slice(0,6);
    const rows=memories.length?memories.map(m=>{
      const p=m.appraisal,factors=(p.factors||[]).map(factorLabel).join('・')||'—';
      return `<div class="k">${esc(m.sourceEventId)}・${esc(m.observed?.action||'unknown')}</div><div>關聯 ${esc(pct(p.relevance))}・目標一致 ${esc(signed(p.goalCongruence))}・Agency ${esc(agencyLabel(st,p))}<br><span class="hint">${esc(p.ruleId)}・${esc(factors)}</span></div>`;
    }).join(''):'<div class="k">Historical appraisal</div><div>目前沒有已評估的 episodic memory</div>';
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1131Appraisal='';
    section.innerHTML=`<h3>事件主觀評估</h3><div class="kv">${rows}</div><p class="hint">v11.13.1 的 appraisal 在 memory 首次形成時固定保存，只讀 observable snapshot＋該 Agent 當下 private context；不重新讀 raw event.data、不隨目前需求重算，也尚不產生情緒或改變 deliberation。</p>`;
    const memory=host.querySelector('[data-v1130-memory]');if(memory)memory.after(section);else{const intent=host.querySelector('[data-v1121-intent]');if(intent)intent.after(section);else host.append(section);}
  }

  const host=document.getElementById('inspector');
  if(host)new MutationObserver(()=>queueMicrotask(decorateInspector)).observe(host,{childList:true,subtree:false});
  document.addEventListener('click',()=>queueMicrotask(decorateInspector));
  queueMicrotask(decorateInspector);
})();
