(() => {
  const E=window.SimEngine;if(!E?.AFFECT_SCHEMA_VERSION||typeof document==='undefined')return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>`${Math.round((Number(v)||0)*100)}%`;
  const signed=v=>`${v>0?'+':''}${Number(v||0).toFixed(2)}`;
  const decayText=()=>`valence ×${E.AFFECT_DECAY.valence.toFixed(2)}・activation ×${E.AFFECT_DECAY.activation.toFixed(2)}・frustration ×${E.AFFECT_DECAY.frustration.toFixed(2)} / tick`;

  function decorateInspector({host,selected,state:st}){
    if(!host||host.querySelector('[data-v1132-affect]')||selected?.type!=='agent')return;
    const id=selected.id,a=st?.agents?.[id];if(!a?.affect)return;
    const f=a.affect,s=f.source||null;
    const source=s?`${esc(s.sourceEventId)}・${esc(s.memoryId)}`:'目前沒有 active source';
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1132Affect='';
    section.innerHTML=`<h3>Current Affect</h3><div class="kv"><div class="k">Valence</div><div>${esc(signed(f.valence))}</div><div class="k">Activation</div><div>${esc(pct(f.activation))}</div><div class="k">Frustration</div><div>${esc(pct(f.frustration))}</div><div class="k">來源 appraisal</div><div>${source}</div><div class="k">衰減</div><div>${esc(decayText())}<br><span class="hint">last update tick ${esc(f.lastUpdatedTick)}・last decay tick ${esc(f.lastDecayTick)}</span></div></div><p class="hint">v11.13.2 的 affect 是 Agent-private、短期且 bounded 的 current state；只由已形成的 historical appraisal 更新。此版本仍不直接修改 candidate utility、Action 或 Relationship。</p>`;
    const appraisal=host.querySelector('[data-v1131-appraisal]');if(appraisal)appraisal.after(section);else host.append(section);
  }

  const UI=window.SimUI;
  if(!UI?.registerInspectorDecorator)throw new Error('affect.current requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('affect.current',decorateInspector,600);
})();
