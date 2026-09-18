(() => {
  const E=window.SimEngine,W=window.SimWorld,L=window.SimLocomotion,P=window.SimPhysical,UI=window.SimUI;
  if(!E||!W?.LOCOMOTION_SCHEMA_VERSION||!L||typeof document==='undefined')return;
  if(!UI?.registerInspectorDecorator)throw new Error('Locomotion View requires inspector decorator lifecycle');
  const VERSION=W.PRESENTATION_SCHEMA_VERSION||W.LOCOMOTION_SCHEMA_VERSION;
  const host=document.getElementById('inspector');if(!host)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const postureLabel=k=>({standing:'站立',sitting:'坐姿',lying:'躺姿',kneeling:'跪姿',prone:'俯臥／匍匐姿勢'})[k]||k||'未知';
  const phaseLabel=p=>({idle:'idle',transition:'posture transition',moving:'moving'})[p]||p||'未知';

  function debugSection(a){
    const state=a.locomotion||{mode:null,phase:'idle'},pending=a.action?.locomotionStep||null,mode=state.mode;
    const envelope=mode?P?.getMovementEnvelope?.(a,mode):null;
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1190LocomotionDebug='';
    section.innerHTML=`<h3>Locomotion Execution</h3><div class="kv"><div class="k">Posture</div><div>${esc(postureLabel(a.posture?.kind))}</div><div class="k">Active Mode</div><div>${esc(mode?L.modeLabel(mode):'無')}</div><div class="k">Phase</div><div>${esc(phaseLabel(state.phase))}</div><div class="k">Speed Factor</div><div>${envelope?esc(Number(envelope.speedFactor).toFixed(2)):'—'}</div><div class="k">Edge Move Ticks</div><div>${mode?esc(L.edgeMoveTicks(a,mode)):'—'}</div><div class="k">Pending Edge</div><div>${pending?esc(`${pending.toKey}・remaining ${pending.ticksRemaining}`):'無'}</div></div><p class="hint">posture 是 Agent authoritative state；locomotion 記錄目前 execution phase。mode transition 會消耗明確 tick，speedFactor 已影響實際 edge movement timing；本層仍只依 objective physical route 執行，不加入人格／Relationship willingness。</p>`;
    return section;
  }
  function decorateInspector({host:renderHost,selected,state:providedState}){
    if(renderHost!==host||selected?.type!=='agent')return;
    const st=providedState||E.getState(),a=st?.agents?.[selected.id];if(!a)return;
    const shell=host.querySelector(':scope > [data-v1140-resident-root]'),debug=shell?.querySelector('[data-v1140-debug-view]');if(!debug)return;
    debug.querySelector('[data-v1190-locomotion-debug]')?.remove();
    debug.prepend(debugSection(a));
  }

  UI.registerInspectorDecorator('locomotion.view',decorateInspector,1027);
  E.UI_LOCOMOTION_VERSION=VERSION;
})();