(() => {
  const E=window.SimEngine;if(!E?.MEMORY_RETENTION_SCHEMA_VERSION||typeof document==='undefined')return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>`${Math.round((Number(v)||0)*100)}%`;

  function row(st,a,m){
    const c=E.memoryRetentionComponents(st,a,m),o=m.observed||{};
    const protectedText=c.protectedByAffect?'・Affect source 保護中':'';
    return `<div class="k">${esc(o.action||'unknown')}・Tick ${esc(m.observedTick)}</div><div><b>Salience ${esc(pct(c.score))}</b>${esc(protectedText)}<br><span class="hint">relevance ${esc(pct(c.relevance))}・affect impact ${esc(pct(c.affectImpact))}・recurrence ${esc(pct(c.recurrence))}・recency ${esc(pct(c.recency))}</span></div>`;
  }
  function decorateInspector({host,selected,state:st}){
    if(!host||host.querySelector('[data-v1133-retention]')||selected?.type!=='agent')return;
    const id=selected.id,a=st?.agents?.[id];if(!a)return;
    const memories=(a.episodicMemories||[]).slice().reverse().slice(0,6);
    const rows=memories.length?memories.map(m=>row(st,a,m)).join(''):'<div class="k">Retention</div><div>目前沒有 episodic memory</div>';
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1133Retention='';
    section.innerHTML=`<h3>Memory Retention</h3><div class="kv"><div class="k">Policy</div><div>derived salience・cap ${esc(E.MAX_EPISODIC_MEMORIES)} / Agent</div>${rows}</div><p class="hint">Salience 只在 retention / pruning 時由 historical appraisal、重要事件 recurrence 與 lastObservedTick 即時計算，不寫回 memory state。Current Affect 只暫時保護它目前的 source memory；本版本仍不把 memory 接進 deliberation utility。</p>`;
    const memory=host.querySelector('[data-v1130-memory]');if(memory)memory.after(section);else host.append(section);
  }

  const UI=window.SimUI;
  if(!UI?.registerInspectorDecorator)throw new Error('memory.retention requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('memory.retention',decorateInspector,700);
})();
