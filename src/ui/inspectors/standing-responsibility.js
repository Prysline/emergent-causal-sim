(() => {
  const E=window.SimEngine,S=window.SimStandingResponsibility,UI=window.SimUI;
  if(!E||!S||typeof document==='undefined')return;
  if(!UI?.registerInspectorDecorator)throw new Error('Standing Responsibility View requires inspector decorator lifecycle');
  const host=document.getElementById('inspector');if(!host)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let scheduled=false;

  function known(st,a){return S.knownAssignments(st,a);}
  function label(assignment){
    const resource=assignment?.scope?.resource||'資源';
    const resourceLabel=E.resourceName?.(resource)||resource;
    return assignment?.responsibility==='restock'?`補充 ${resourceLabel}`:S.describeAssignment(assignment);
  }
  function residentSection(st,a,assignments){
    const section=document.createElement('section');section.className='resident-card';section.dataset.standingResponsibilityResident='';section.dataset.signature=assignments.map(item=>item.id).sort().join('|');
    section.innerHTML=`<h3>長期責任</h3>${assignments.length?`<div class="resident-memory-list">${assignments.map(assignment=>`<div class="resident-memory-item"><span>◦</span><p>${esc(label(assignment))}</p></div>`).join('')}</div>`:'<div class="resident-empty">目前沒有已知的長期資源責任。</div>'}<p class="resident-footnote">只顯示此居民已知的 durable responsibility；不代表目前有客觀補貨需求，也不等於正在執行的 Action。</p>`;
    return section;
  }
  function debugSection(st,a,canonical,refs,index){
    const section=document.createElement('div');section.className='inspect-section';section.dataset.standingResponsibilityDebug='';section.dataset.signature=JSON.stringify([canonical.map(item=>item.id).sort(),[...refs].sort()]);
    const canonicalText=canonical.length?canonical.map(assignment=>`${esc(assignment.id)} → ${esc(label(assignment))}`).join('<br>'):'無';
    const refText=refs.length?refs.map(id=>`${esc(id)} → ${index.has(id)?'canonical linked':'MISSING'}`).join('<br>'):'無';
    section.innerHTML=`<h3>Standing Responsibility</h3><div class="kv"><div class="k">Canonical assignments</div><div>${canonicalText}</div><div class="k">Known refs</div><div>${refText}</div></div><p class="hint">Canonical World assignment 只保存一份；Agent-private 只保存 assignment ID。Decision contribution 只能由已知且 principal 相符的 ref 形成。</p>`;
    return section;
  }
  function ensureProjection(st,a,shell){
    const resident=shell.querySelector('[data-v1140-resident-view]'),debug=shell.querySelector('[data-v1140-debug-view]'),assignments=known(st,a);
    const body=resident?.querySelector('.resident-tab-body'),overviewActive=!!resident?.querySelector('[data-v1140-tab="overview"].active');
    const residentSignature=assignments.map(item=>item.id).sort().join('|'),residentExisting=resident?.querySelector('[data-standing-responsibility-resident]');
    if(!overviewActive)residentExisting?.remove();
    else if(body&&residentExisting?.dataset.signature!==residentSignature){residentExisting?.remove();body.append(residentSection(st,a,assignments));}
    const canonical=(st.resourceResponsibilityAssignments||[]).filter(assignment=>assignment?.principal?.kind==='agent'&&assignment.principal.id===a.id),refs=a.knownResponsibilityAssignmentIds||[],index=new Map((st.resourceResponsibilityAssignments||[]).map(assignment=>[assignment.id,assignment]));
    const debugSignature=JSON.stringify([canonical.map(item=>item.id).sort(),[...refs].sort()]),debugExisting=debug?.querySelector('[data-standing-responsibility-debug]');
    if(debug&&debugExisting?.dataset.signature!==debugSignature){debugExisting?.remove();debug.prepend(debugSection(st,a,canonical,refs,index));}
  }
  function decorateInspector({host:renderHost,selected,state:providedState}){
    if(renderHost!==host||selected?.type!=='agent')return;
    const st=providedState||E.getState(),a=st?.agents?.[selected.id];if(!a)return;
    const shell=host.querySelector(':scope > [data-v1140-resident-root]');if(shell)ensureProjection(st,a,shell);
  }
  function refresh(){scheduled=false;const selected=UI.getInspectorSelection?.();if(selected?.type!=='agent')return;decorateInspector({host,selected,state:E.getState()});}
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(refresh);}

  UI.registerInspectorDecorator('standingResponsibility.view',decorateInspector,1040);
  new MutationObserver(schedule).observe(host,{childList:true,subtree:true});
  E.UI_STANDING_RESPONSIBILITY_VERSION=S.VERSION;
})();
