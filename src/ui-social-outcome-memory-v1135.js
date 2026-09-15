(() => {
  const E=window.SimEngine;if(!E?.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION||typeof document==='undefined')return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const entityName=(st,id)=>id?(st.agents?.[id]?.name||id):'—';
  const contextLabel=kind=>({unobserved:'當時看不到對方狀態',sleeping:'看見對方正在睡',highCommitment:'看見對方正忙於高承諾活動',observedAction:'看見對方正在做別的事',observedIdle:'看得到對方，但沒有明顯活動'})[kind]||kind||'未知';
  const signed=v=>{const n=Number(v)||0;return `${n>0?'+':''}${n.toFixed(2)}`;};

  function decorateInspector(){
    const host=document.getElementById('inspector');if(!host||host.querySelector('[data-v1135-social-outcome-memory]'))return;
    const meta=[...host.querySelectorAll('.inspect-title small')].find(x=>x.textContent?.startsWith('Agent・'));if(!meta)return;
    const id=meta.textContent.slice('Agent・'.length),st=E.getState(),a=st?.agents?.[id];if(!a)return;
    const memories=(a.episodicMemories||[]).filter(m=>m?.episodeKind==='privateSocialOutcome').slice().reverse().slice(0,5);
    const rows=memories.length?memories.map(m=>{
      const x=m.experienced||{},p=m.appraisal||{};
      return `<div class="k">${esc(entityName(st,x.counterpartId))}・等待 ${esc(x.waitedTicks)} tick</div><div>${esc(contextLabel(x.contextKind))}・relevance ${esc((Number(p.relevance)||0).toFixed(2))}・congruence ${esc(signed(p.goalCongruence))}・agency ${esc(p.agency?.kind||'—')}</div>`;
    }).join(''):'<div class="k">Requester outcome</div><div>目前沒有 no-response private experience</div>';
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1135SocialOutcomeMemory='';
    section.innerHTML=`<h3>Requester 社交結果記憶</h3><div class="kv">${rows}</div><p class="hint">這裡記的是「我沒有得到回應」的 requester-private historical experience；counterpart 只表示當時在等誰，不代表對方故意忽略、拒絕或討厭我。可觀察 context 只用來調整 bounded appraisal。</p>`;
    const anchor=host.querySelector('[data-v1134-memory-deliberation]')||host.querySelector('[data-v1130-memory]')||host.querySelector('.inspect-section');
    if(anchor)anchor.after(section);else host.append(section);
  }

  const host=document.getElementById('inspector');
  if(host)new MutationObserver(()=>queueMicrotask(decorateInspector)).observe(host,{childList:true,subtree:false});
  document.addEventListener('click',()=>queueMicrotask(decorateInspector));
  queueMicrotask(decorateInspector);
})();
