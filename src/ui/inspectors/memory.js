(() => {
  const E=window.SimEngine;if(!E?.MEMORY_SCHEMA_VERSION||typeof document==='undefined')return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const entityName=(st,id)=>id?(st.agents?.[id]?.name||st.containers?.[id]?.name||st.sources?.[id]?.name||st.furniture?.[id]?.name||id):'—';
  const actionName=a=>E.ZH?.[a]||a||'未知事件';

  function memorySummary(st,m){
    const o=m.observed||{},who=o.actorId?entityName(st,o.actorId):'未知',target=o.targetId?` → ${entityName(st,o.targetId)}`:'',where=o.positionRef?`・${o.positionRef}`:'',source=st.causes?.[m.sourceEventId]?'event hot':'snapshot only';
    return `${actionName(o.action)}・${who}${target}${where}・${source}`;
  }
  function decorateInspector({host,selected,state:st}){
    if(!host||host.querySelector('[data-v1130-memory]')||selected?.type!=='agent')return;
    const id=selected.id,a=st?.agents?.[id];if(!a)return;
    const memories=(a.episodicMemories||[]).slice().reverse().slice(0,6),rows=memories.length?memories.map(m=>`<div class="k">${esc(m.sourceEventId)}・Tick ${esc(m.observedTick)}</div><div>${esc(memorySummary(st,m))}</div>`).join(''):'<div class="k">Recent memories</div><div>目前沒有 episodic memory</div>';
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1130Memory='';
    section.innerHTML=`<h3>近期情節記憶</h3><div class="kv"><div class="k">Hot memory</div><div>${a.episodicMemories?.length||0} / ${E.MAX_EPISODIC_MEMORIES}</div>${rows}</div><p class="hint">本區只顯示 Agent 實際觀察到的 world event minimal snapshot；若後續 appraisal extension 已啟用，主觀評估會在獨立區塊顯示。source event 離開 hot cause state 後，memory 仍可由 snapshot 保留基本歷史語意。</p>`;
    const intent=host.querySelector('[data-v1121-intent]');if(intent)intent.after(section);else{const first=host.querySelector('.inspect-section');if(first)first.after(section);else host.append(section);}
  }

  const UI=window.SimUI;
  if(!UI?.registerInspectorDecorator)throw new Error('memory.episodic requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('memory.episodic',decorateInspector,400);
})();
