(() => {
  const E=window.SimEngine,W=window.SimWorld,UI=window.SimUI;
  if(!E?.RELATIONSHIP_SCHEMA_VERSION||!W||typeof document==='undefined')return;
  if(!UI?.registerInspectorDecorator)throw new Error('Relationship View requires inspector decorator lifecycle');
  const VERSION=UI.PRESENTATION_VERSION||W.RELATIONSHIP_SCHEMA_VERSION;
  const host=document.getElementById('inspector');if(!host)return;
  let scheduled=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  function familiarityLabel(value){
    const v=clamp(Number(value)||0,0,1);
    if(v<.15)return '還不太熟';
    if(v<.35)return '有些熟悉';
    if(v<.65)return '熟悉';
    if(v<.85)return '很熟悉';
    return '非常熟悉';
  }
  function affinityLabel(value,familiarity=0){
    if((Number(familiarity)||0)<.20)return '';
    const v=clamp(Number(value)||0,-1,1);
    if(v<=-.55)return '長期相處偏不順';
    if(v<=-.20)return '相處有些不順';
    if(v<.20)return '相處大致中性';
    if(v<.55)return '相處大致愉快';
    return '長期相處很愉快';
  }
  function relationshipEntries(st,a){
    return Object.entries(a?.relationships||{}).map(([id,r])=>({id,name:st?.agents?.[id]?.name||id,...r})).sort((x,y)=>(Number(y.familiarity)||0)-(Number(x.familiarity)||0)||x.name.localeCompare(y.name));
  }
  function readableSection(st,a){
    const entries=relationshipEntries(st,a);
    const section=document.createElement('section');section.className='resident-card';section.dataset.v1150RelationshipReadable='';
    if(!entries.length){section.innerHTML='<h3>關係</h3><div class="resident-empty">目前還沒有形成明確的長期相處紀錄。</div>';return section;}
    const rows=entries.map(r=>{const familiarity=familiarityLabel(r.familiarity),affinity=affinityLabel(r.affinity,r.familiarity),summary=affinity?`${familiarity}・${affinity}`:familiarity;return `<div class="resident-memory-item"><span>◦</span><p><b>${esc(r.name)}</b>・${esc(summary)}</p></div>`;}).join('');
    section.innerHTML=`<h3>關係</h3><div class="resident-memory-list">${rows}</div><p class="resident-footnote">這裡是多次直接相處經驗累積出的慢速紀錄；熟悉不等於喜歡，也不推定對方的動機。</p>`;
    return section;
  }
  function responderEvaluationLine(st,a,counterpartId){
    const counterpart=st?.agents?.[counterpartId];if(!counterpart)return '';
    if(a.kind==='human'&&counterpart.kind==='human'&&E.talkResponseEvaluation){const x=E.talkResponseEvaluation(a,counterpart);return `Talk responder：base ${Number(x.baseScore).toFixed(3)} + Relationship ${Number(x.relationshipResponseDelta).toFixed(3)} → final ${Number(x.finalScore).toFixed(3)} (${esc(x.response)})`;}
    if(E.isAnimalAgent?.(a)&&counterpart.kind==='human'&&E.petResponseEvaluation){const x=E.petResponseEvaluation(a,counterpart);return `Pet responder：base ${Number(x.baseScore).toFixed(3)} + Relationship ${Number(x.relationshipResponseDelta).toFixed(3)} → final ${Number(x.finalScore).toFixed(3)} (${esc(x.response)})`;}
    return '';
  }
  function debugSection(st,a){
    const entries=relationshipEntries(st,a),section=document.createElement('div');section.className='inspect-section';section.dataset.v1150RelationshipDebug='';
    const rows=entries.length?entries.map(r=>{const responderLine=responderEvaluationLine(st,a,r.id);return `<div class="k">${esc(r.name)}・${esc(r.id)}</div><div>Familiarity ${Number(r.familiarity).toFixed(3)}・Affinity ${Number(r.affinity).toFixed(3)}・updated Tick ${esc(r.lastUpdatedTick)}</div>${responderLine?`<div>${responderLine}</div>`:''}`;}).join(''):'<div class="k">Relationship</div><div>目前沒有 consolidated dyadic state</div>';
    section.innerHTML=`<h3>Relationship</h3><div class="kv">${rows}</div><p class="hint">Agent-private directional slow state。只保存 familiarity / affinity / lastUpdatedTick；Responder score 分解為即時計算的 derived Debug，不保存第二份 state。Relationship target preference 與 responder bias 都不等於一般 social Action utility。</p>`;
    return section;
  }
  function decorateInspector({host:renderHost,selected,state:providedState}){
    scheduled=false;if(renderHost!==host||selected?.type!=='agent')return;
    const st=providedState||E.getState(),a=st?.agents?.[selected.id];if(!a)return;
    const shell=host.querySelector(':scope > [data-v1140-resident-root]');if(!shell)return;
    const resident=shell.querySelector('[data-v1140-resident-view]'),debug=shell.querySelector('[data-v1140-debug-view]');
    resident?.querySelector('[data-v1150-relationship-readable]')?.remove();debug?.querySelector('[data-v1150-relationship-debug]')?.remove();
    const activeTab=resident?.querySelector('[data-v1140-tab].active')?.dataset.v1140Tab||'overview';
    if(resident&&activeTab==='overview'){const body=resident.querySelector('.resident-tab-body');if(body)body.append(readableSection(st,a));}
    if(debug)debug.append(debugSection(st,a));
  }
  function refresh(){scheduled=false;const selected=UI.getInspectorSelection?.();if(selected?.type!=='agent')return;decorateInspector({host,selected,state:E.getState()});}
  function schedule(){if(!UI.isStarted?.()||scheduled)return;scheduled=true;queueMicrotask(()=>requestAnimationFrame(refresh));}

  UI.registerInspectorDecorator('relationship.view',decorateInspector,1025);
  if(!UI.registerStartupExtension)throw new Error('Relationship View requires UI startup lifecycle');
  UI.registerStartupExtension('relationshipView.controls',()=>{
    document.addEventListener('click',event=>{if(event.target.closest?.('[data-v1140-tab]'))schedule();});
    schedule();
  },400);
  if(!E.registerRuntimeObserver)throw new Error('ui-relationship-v1150.js requires runtime observer lifecycle');
  E.registerRuntimeObserver('afterTick','relationshipView.schedule',schedule,1150);
  E.registerRuntimeObserver('afterReset','relationshipView.reset',schedule,750);

  E.UI_RELATIONSHIP_VERSION=VERSION;
  E.relationshipFamiliarityLabel=familiarityLabel;
  E.relationshipAffinityLabel=affinityLabel;
  E.relationshipResponderEvaluationLine=responderEvaluationLine;
})();
