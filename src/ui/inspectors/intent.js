(() => {
  const E=window.SimEngine,SP=window.SimSpatial,U=window.SimUsage,SC=window.SimSleepConflict,AC=window.SimAgentCarry,UI=window.SimUI;
  if(!E?.intentLabel||!SP||!U||!SC||!AC||typeof document==='undefined')return;
  const DEBUG_VERSION='11.48.0-debug-inspector-contextual-diagnostics';
  const VIEW_DEFS=Object.freeze([
    ['overview','Overview'],['decision','Decision / Intent'],['execution','Execution / Physical'],['world','World / Spatial'],['perception','Perception / Memory'],['social','Social / Affect'],['all','All']
  ]);
  const CANDIDATE_KINDS=Object.freeze(['alternate','wait','attention','requestYield','driveAway','requestCarryCooperation','carryOccupant']);
  const CATEGORY_SELECTORS=Object.freeze({
    decision:['[data-v1121-intent]','[data-debug-sleep-conflict]'],
    execution:['[data-v1160-physical-debug]','[data-v1190-locomotion-debug]'],
    world:['.spatial-observability-section','.spatial-environment-section'],
    perception:['[data-v1130-memory]','[data-v1131-appraisal]','[data-v1133-retention]','[data-v1135-social-outcome-memory]'],
    social:['[data-v1132-affect]','[data-v1134-memory-deliberation]','[data-v1150-relationship-debug]']
  });
  const observers=new WeakMap();
  let activeView='all',scheduled=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number.isFinite(v)?Math.round(v*10)/10:'—';
  const json=v=>esc(JSON.stringify(v??null));
  const nameFor=(st,id)=>id?(st.agents?.[id]?.name||id):'—';
  const reasonLabel=reason=>({
    'target-unobserved':'目標目前不可觀察','observed-target-kind-unsupported':'觀察到的目標種類不支援 Agent Carry','no-observed-sleep-or-cooperation':'目標未被觀察為睡眠中，且沒有有效 cooperation evidence','carry-method-unsupported':'目前 carry method 不支援','hand-capacity-exceeded':'手部容量不足','carrier-already-in-carry-relation':'搬運者已處於 carry relation','carrier-off-map':'搬運者不在地圖上','missing-carrier':'找不到搬運者','no-relocation-placement-proposal':'目前找不到可形成 candidate 的 relocation placement proposal','cooperation-required':'清醒 occupant 需要有效的 carryCooperation accepted evidence','occupant-missing':'目前找不到 preferred Slot occupant','not-applicable':'目前狀態不適用'}[reason]||reason||'未知');

  function currentConflict(st,a){
    const action=a?.action,stored=E.currentConflictResolutionEvidence?.(a)||null,slotId=action?.preferredConflictSlotId||stored?.preferredSlot?.id||null;
    if(action?.kind!=='sleep'||(!slotId&&action?.phase!=='conflictWait'&&!stored))return null;
    const associations=SC.selfSleepAssociations?.(st,a)||[];
    const conflict=(slotId?associations.find(x=>x?.slot?.id===slotId):null)||associations.find(x=>SP.sleepTargetExclusion?.(st,a,x?.slot?.id)?.reason==='occupied')||null;
    return {slotId:slotId||conflict?.slot?.id||null,conflict};
  }
  function historicalEvidence(a,slotId){
    const current=E.currentConflictResolutionEvidence?.(a);if(current&&(!slotId||current.preferredSlot?.id===slotId))return current;
    return (a?.conflictResolutionEvidence||[]).filter(x=>!slotId||x?.preferredSlot?.id===slotId).sort((x,y)=>(Number(y?.sequence)||0)-(Number(x?.sequence)||0))[0]||null;
  }
  function currentCarryAbsenceReason(st,a,evaluation){
    const observation=evaluation?.observation;
    if(!observation?.observable)return observation?.reason||'target-unobserved';
    if(!['human','animal'].includes(observation.observedAgentKind))return 'observed-target-kind-unsupported';
    const sleeping=observation.observedActionKind==='sleep'&&observation.observedPosture==='lying';
    if(sleeping){const attempt=AC.candidateAttemptability?.(st,a,observation);return attempt?.ok?'no-relocation-placement-proposal':attempt?.reason||'not-applicable';}
    if(evaluation?.candidates?.some(x=>x.kind==='requestCarryCooperation'))return 'cooperation-required';
    const hypothetical=AC.candidateAttemptability?.(st,a,observation,{cooperationEvidence:{accepted:true}});
    return hypothetical?.ok?'no-relocation-placement-proposal':hypothetical?.reason||'cooperation-required';
  }
  function rejectionReason(st,a,evaluation,kind){
    if(evaluation?.candidates?.some(x=>x.kind===kind))return null;
    const observation=evaluation?.observation;
    if(kind==='alternate')return '目前沒有合法 alternate sleep target';
    if(kind==='wait')return 'resolver 未形成 wait candidate';
    if(kind==='attention')return observation?.observable?'resolver 未形成 attention candidate':reasonLabel(observation?.reason||'target-unobserved');
    if(kind==='requestYield'||kind==='driveAway')return !observation?.observable?reasonLabel(observation?.reason||'target-unobserved'):observation.observedAgentKind!=='human'?'只對已觀察的 Human occupant 形成':'resolver 未形成此 candidate';
    if(kind==='requestCarryCooperation'){
      if(!observation?.observable)return reasonLabel(observation?.reason||'target-unobserved');
      if(!['human','animal'].includes(observation.observedAgentKind))return reasonLabel('observed-target-kind-unsupported');
      if(observation.observedActionKind==='sleep'&&observation.observedPosture==='lying')return '睡眠 occupant 走 sleeping carry path，不需要先請求 cooperation';
      const hypothetical=AC.candidateAttemptability?.(st,a,observation,{cooperationEvidence:{accepted:true}});
      return hypothetical?.ok?reasonLabel('no-relocation-placement-proposal'):reasonLabel(hypothetical?.reason||'not-applicable');
    }
    if(kind==='carryOccupant')return reasonLabel(currentCarryAbsenceReason(st,a,evaluation));
    return 'resolver 未形成此 candidate';
  }
  function candidateRows(st,a,evaluation){
    const byKind=new Map((evaluation?.candidates||[]).map(c=>[c.kind,c]));
    return CANDIDATE_KINDS.map(kind=>{
      const c=byKind.get(kind);if(!c)return `<div class="debug-candidate rejected"><b>${esc(kind)}</b><span>不可用・${esc(rejectionReason(st,a,evaluation,kind))}</span></div>`;
      const target=c.targetAgent?`・target ${esc(nameFor(st,c.targetAgent))}`:'',placement=c.targetPlacement?`・placement ${json(c.targetPlacement)}`:'',cooperation=c.cooperative===true?'・cooperative':'';
      return `<div class="debug-candidate eligible"><b>${esc(kind)}</b><span>可用・utility ${esc(c.score)}${target}${placement}${cooperation}</span><small>contributors ${json(c.contributors||[])}</small></div>`;
    }).join('');
  }
  function historicalCandidateRows(st,evidence){
    if(!evidence)return '<div class="debug-empty">目前沒有對應的 adopted conflict evidence。</div>';
    const rows=(evidence.candidates||[]).map(c=>`<div class="debug-candidate eligible"><b>${esc(c.kind)}</b><span>historical utility ${esc(c.score)}${c.targetAgent?`・target ${esc(nameFor(st,c.targetAgent))}`:''}${c.targetPlacement?`・placement ${json(c.targetPlacement)}`:''}</span><small>contributors ${json(c.contributors||[])}</small></div>`).join('');
    return rows||'<div class="debug-empty">此 historical evidence 沒有保存 candidate ranking。</div>';
  }
  function sleepDiagnostic(st,a,context){
    const slotId=context.slotId,conflict=context.conflict,evidence=historicalEvidence(a,slotId),action=a.action,occupant=slotId?SP.slotOccupant?.(st,slotId,a.id):null;
    let evaluation=null;if(conflict){try{evaluation=SC.conflictCandidates?.(st,a,conflict)||null;}catch(error){evaluation={error:error?.message||String(error),candidates:[]};}}
    const contributors=conflict?.associationContributors||U.preferenceContributors?.(st,a,'sleep',{kind:'slot',id:slotId})||[],reasons=conflict?.reasons||U.associationReasons?.(st,a,'sleep',{kind:'slot',id:slotId})||[];
    const section=document.createElement('section');section.className='inspect-section contextual-diagnostic';section.dataset.debugSleepConflict='';section.dataset.debugDomain='decision';
    section.innerHTML=`<div class="debug-domain-heading"><h3>Sleep preferred Slot conflict</h3><span>Contextual diagnostic</span></div>
      <div class="kv"><div class="k">Preferred Slot</div><div>${esc(slotId||'—')}</div><div class="k">Preference strength</div><div>${esc(conflict?.strength??'—')}</div><div class="k">Preference source</div><div>${json(reasons)}</div><div class="k">Preference contributors</div><div>${json(contributors)}</div><div class="k">Canonical current occupant</div><div>${occupant?`${esc(nameFor(st,occupant.id))}・${esc(occupant.id)}`:'無'}</div><div class="k">conflictWaitSource</div><div>${esc(action?.conflictWaitSource||'—')}</div><div class="k">conflictWaitStartedTick</div><div>${esc(action?.conflictWaitStartedTick??'—')}</div><div class="k">conflictWaitUntilTick</div><div>${esc(action?.conflictWaitUntilTick??'—')}</div></div>
      <div class="debug-evidence-block historical"><h4>Historical / adopted evidence</h4><p class="hint">回答「當時為什麼選這個」；只讀 frozen conflict evidence，不以現在重算結果冒充歷史 ranking。</p>${evidence?`<div class="kv"><div class="k">Evidence ID</div><div>${esc(evidence.id)}</div><div class="k">Evaluated Tick</div><div>${esc(evidence.evaluatedTick)}</div><div class="k">Adopted resolution</div><div>${esc(evidence.selectedResolution||'—')}</div><div class="k">Decision-time observation</div><div>${json(evidence.observation)}</div></div>${historicalCandidateRows(st,evidence)}${CANDIDATE_KINDS.filter(kind=>!(evidence.candidates||[]).some(c=>c.kind===kind)).length?'<p class="hint">未列出的 candidate：historical evidence 沒有保存 rejection reason；此處不以 current state 回填歷史原因。</p>':''}`:'<div class="debug-empty">沒有可對應的 historical conflict evidence。</div>'}</div>
      <div class="debug-evidence-block current"><h4>Current-derived probe</h4><p class="hint">回答「現在重新評估會怎樣」；即時計算，不是 persisted truth，也不是 historical decision。</p>${evaluation?.error?`<div class="debug-empty">Probe error：${esc(evaluation.error)}</div>`:evaluation?`<div class="kv"><div class="k">Observed now</div><div>${json(evaluation.observation)}</div><div class="k">Current selected</div><div>${esc(evaluation.selected?.kind||'none')}</div></div><div class="debug-candidates">${candidateRows(st,a,evaluation)}</div>`:'<div class="debug-empty">目前 conflict 已不存在或無法形成 current probe。</div>'}</div>`;
    return section;
  }
  function categoryFor(section){
    if(section.matches?.('[data-debug-sleep-conflict]'))return 'decision';
    for(const [category,selectors] of Object.entries(CATEGORY_SELECTORS))if(selectors.some(selector=>section.matches?.(selector)))return category;
    return 'overview';
  }
  function applyView(debug){
    debug.querySelectorAll(':scope > .inspect-section').forEach(section=>{
      const category=section.dataset.debugDomain||categoryFor(section);section.dataset.debugDomain=category;
      const contextual=section.hasAttribute('data-debug-sleep-conflict');
      section.hidden=activeView!=='all'&&activeView!=='overview'&&category!==activeView&&!contextual;
      if(activeView==='overview')section.hidden=category!=='overview'&&!contextual;
    });
    debug.querySelectorAll('[data-debug-inspector-view]').forEach(button=>{const on=button.dataset.debugInspectorView===activeView;button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on));});
  }
  function observeSections(debug){
    if(observers.has(debug))return;
    const observer=new MutationObserver(()=>applyView(debug));observer.observe(debug,{childList:true});observers.set(debug,observer);
  }
  function installNav(debug){
    let nav=debug.querySelector(':scope > [data-debug-inspector-nav]');if(nav)return nav;
    nav=document.createElement('div');nav.className='debug-inspector-nav';nav.dataset.debugInspectorNav='';nav.setAttribute('role','toolbar');nav.setAttribute('aria-label','Debug Inspector views');
    nav.innerHTML=VIEW_DEFS.map(([id,label])=>`<button type="button" data-debug-inspector-view="${id}" class="${id===activeView?'active':''}" aria-pressed="${id===activeView}">${esc(label)}</button>`).join('');
    nav.addEventListener('click',event=>{const button=event.target.closest?.('[data-debug-inspector-view]');if(!button)return;activeView=button.dataset.debugInspectorView;applyView(debug);});
    debug.prepend(nav);return nav;
  }
  function scheduleDiagnostics({host,selected,state:st}){
    if(scheduled)return;scheduled=true;queueMicrotask(()=>requestAnimationFrame(()=>{
      scheduled=false;const renderHost=host||document.getElementById('inspector'),currentSelected=UI.getInspectorSelection?.()||selected,currentState=E.getState()||st;
      if(!renderHost||currentSelected?.type!=='agent')return;const a=currentState?.agents?.[currentSelected.id];if(!a)return;
      const shell=renderHost.querySelector(':scope > [data-v1140-resident-root]'),debug=shell?.querySelector('[data-v1140-debug-view]');if(!debug)return;
      observeSections(debug);debug.querySelector(':scope > [data-debug-sleep-conflict]')?.remove();installNav(debug);
      const context=currentConflict(currentState,a);if(context?.slotId){const section=sleepDiagnostic(currentState,a,context),nav=debug.querySelector(':scope > [data-debug-inspector-nav]');nav?.insertAdjacentElement('afterend',section);}
      applyView(debug);
    }));
  }

  function decorateInspector({host,selected,state:st}){
    if(!host||host.querySelector('[data-v1121-intent]')||selected?.type!=='agent')return;
    const id=selected.id,a=st?.agents?.[id];if(!a)return;
    const intent=a.activeIntent,action=a.action,soft=E.reconsiderationSnapshot?.(st,a),decision=E.currentDecisionEvidence?.(a)||null,targetDecision=E.currentTargetSelectionEvidence?.(a)||null;
    const source=intent?.source?.type==='deliberation'?`自主決策・Tick ${intent.source.tick}`:intent?.source?.type==='softReconsideration'?`Soft reconsideration・Tick ${intent.source.tick}`:intent?.source?.type||'未知';
    const softState=!soft?'未啟用':soft.ok?'可重新評估':soft.reason==='minimum-hold'?`最短承諾中・剩 ${soft.holdRemaining} tick`:soft.reason==='protected-action'?'目前流程受保護':soft.reason==='emergency-priority'?'交由 Emergency preemption':'目前不重新評估';
    const challenger=soft?.bestChallenger?`${E.intentLabel?.(soft.bestChallenger.intentKind)||soft.bestChallenger.intentKind}・${num(soft.bestChallenger.utility)}`:'無';
    const decisionSource=decision?.source?.type||'無',decisionContributors=decision?JSON.stringify(decision.contributors||[]):'無',targetDecisionText=targetDecision?JSON.stringify(targetDecision):'無';
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1121Intent='';
    section.innerHTML=`<h3>意圖與執行</h3><div class="kv"><div class="k">Active Intent</div><div>${intent?esc(E.intentLabel(intent)):'無'}</div><div class="k">Intent ID</div><div>${esc(intent?.id||'無')}</div><div class="k">來源</div><div>${intent?esc(source):'無'}</div><div class="k">Action kind</div><div>${esc(action?.kind||'無')}</div><div class="k">Phase</div><div>${esc(action?.phase||'無')}</div><div class="k">Action → Intent</div><div>${esc(action?.intentId||'無')}</div><div class="k">Action → Decision</div><div>${esc(action?.decisionId||'無')}</div><div class="k">Final Decision Source</div><div>${esc(decisionSource)}</div><div class="k">Final Decision Contributors</div><div>${esc(decisionContributors)}</div><div class="k">Target Selection Evidence（私人）</div><div>${esc(targetDecisionText)}</div>${soft?`<div class="k">Soft reconsideration</div><div>${esc(softState)}</div><div class="k">目前效用</div><div>${num(soft.currentUtility)}</div><div class="k">承諾成本</div><div>${num(soft.commitmentCost)}</div><div class="k">最佳挑戰</div><div>${esc(challenger)}</div><div class="k">切換門檻</div><div>${num(soft.switchThreshold)}</div>`:''}</div><p class="hint">Active Intent 是 Agent-private 的短期目標；Action kind 是目前具體執行方案。v11.12.3 已支援 bounded replan / emergency preemption；v11.36.0 另以 Agent-private adopted Decision Evidence 保存目前 Action 真正採納時的 structured contributors；current-derived utility / target diagnostics 仍保持 derived，不形成第二份 decision truth。</p>`;
    const first=host.querySelector('.inspect-section');if(first)first.after(section);else host.append(section);
    scheduleDiagnostics({host,selected,state:st});
  }

  if(!UI?.registerInspectorDecorator)throw new Error('intent.active requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('intent.active',decorateInspector,300);
  UI.DEBUG_INSPECTOR_DIAGNOSTICS_VERSION=DEBUG_VERSION;
  UI.DEBUG_INSPECTOR_VIEWS=VIEW_DEFS.map(([id])=>id);
})();
