(() => {
  const E=window.SimEngine;if(!E?.MEMORY_DELIBERATION_SCHEMA_VERSION||typeof document==='undefined')return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const signed=v=>`${Number(v)>=0?'+':''}${Math.round((Number(v)||0)*10)/10}`;
  const intentLabel=kind=>({socialize:'找人聊天',interactWithAnimal:'和動物互動',seekSocialContact:'找人撒嬌'}[kind]||kind);

  function contributionText(st,e){
    if(!e.contributions?.length)return '無 target-related memory';
    return e.contributions.map(c=>`${esc(c.memoryId)} ${signed(c.evidence)}`).join('・');
  }
  function row(st,a,e){
    const target=st.agents?.[e.targetAgent];
    return `<div class="k">${esc(intentLabel(e.intentKind))} → ${esc(target?.name||e.targetAgent)}</div><div><b>${esc(signed(e.memoryUtilityDelta))} memory delta</b>・relationship ${esc(signed(e.relationshipTargetDelta))}・access penalty -${esc(e.accessPenalty)}・base ${esc(e.baseUtility)} → final ${esc(e.finalUtility)}<br><span class="hint">path distance ${esc(e.pathDistance)}・traversal cost ${esc(e.traversalCost)}・travel time ${esc(e.travelTime)} tick・target preference ${esc(e.targetPreference)}・association ${esc(e.association)}<br>${contributionText(st,e)}</span></div>`;
  }
  function decorateInspector({host,selected,state:st}){
    if(!host||host.querySelector('[data-v1134-memory-deliberation]')||selected?.type!=='agent')return;
    const id=selected.id,a=st?.agents?.[id];if(!a)return;
    const evaluations=E.currentSocialTargetEvaluations?.(st,a)||[];
    const rows=evaluations.length?evaluations.map(e=>row(st,a,e)).join(''):'<div class="k">Target-aware candidates</div><div>目前沒有可評估的社交目標。</div>';
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1134MemoryDeliberation='';
    section.innerHTML=`<h3>Memory + Relationship → Social Target</h3><div class="kv">${rows}</div><p class="hint">Memory 仍以 historical appraisal 聚合出 bounded ±18 的短期 utility delta，並同時影響 social action utility 與 target ranking。Relationship 只提供 bounded ±8 的長期 target preference：8 × familiarity × affinity，不加入 final utility。Access penalty 由 traversal cost 派生，只參與同一 social intent 的 target ranking；path distance 與 travel time 分開顯示，不冒充彼此。Current Affect 與 pet / talk responder score 仍不直接參與本層。</p>`;
    const retention=host.querySelector('[data-v1133-retention]');if(retention)retention.after(section);else host.append(section);
  }
  const UI=window.SimUI;
  if(!UI?.registerInspectorDecorator)throw new Error('memory.deliberation requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('memory.deliberation',decorateInspector,800);
})();
