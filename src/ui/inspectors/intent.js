(() => {
  const E=window.SimEngine;if(!E?.intentLabel||typeof document==='undefined')return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number.isFinite(v)?Math.round(v*10)/10:'—';

  function decorateInspector({host,selected,state:st}){
    if(!host||host.querySelector('[data-v1121-intent]')||selected?.type!=='agent')return;
    const id=selected.id,a=st?.agents?.[id];if(!a)return;
    const intent=a.activeIntent,action=a.action,soft=E.reconsiderationSnapshot?.(st,a);
    const source=intent?.source?.type==='deliberation'?`自主決策・Tick ${intent.source.tick}`:intent?.source?.type==='softReconsideration'?`Soft reconsideration・Tick ${intent.source.tick}`:intent?.source?.type||'未知';
    const softState=!soft?'未啟用':soft.ok?'可重新評估':soft.reason==='minimum-hold'?`最短承諾中・剩 ${soft.holdRemaining} tick`:soft.reason==='protected-action'?'目前流程受保護':soft.reason==='emergency-priority'?'交由 Emergency preemption':'目前不重新評估';
    const challenger=soft?.bestChallenger?`${E.intentLabel?.(soft.bestChallenger.intentKind)||soft.bestChallenger.intentKind}・${num(soft.bestChallenger.utility)}`:'無';
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1121Intent='';
    section.innerHTML=`<h3>意圖與執行</h3><div class="kv"><div class="k">Active Intent</div><div>${intent?esc(E.intentLabel(intent)):'無'}</div><div class="k">Intent ID</div><div>${esc(intent?.id||'無')}</div><div class="k">來源</div><div>${intent?esc(source):'無'}</div><div class="k">Action kind</div><div>${esc(action?.kind||'無')}</div><div class="k">Phase</div><div>${esc(action?.phase||'無')}</div><div class="k">Action → Intent</div><div>${esc(action?.intentId||'無')}</div>${soft?`<div class="k">Soft reconsideration</div><div>${esc(softState)}</div><div class="k">目前效用</div><div>${num(soft.currentUtility)}</div><div class="k">承諾成本</div><div>${num(soft.commitmentCost)}</div><div class="k">最佳挑戰</div><div>${esc(challenger)}</div><div class="k">切換門檻</div><div>${num(soft.switchThreshold)}</div>`:''}</div><p class="hint">Active Intent 是 Agent-private 的短期目標；Action kind 是目前具體執行方案。v11.12.3 已支援 bounded replan / emergency preemption；v11.12.4 以 derived utility、switch margin 與 commitment cost 處理一般 Soft reconsideration，不保存第二份 utility / commitment truth。</p>`;
    const first=host.querySelector('.inspect-section');if(first)first.after(section);else host.append(section);
  }

  const UI=window.SimUI;
  if(!UI?.registerInspectorDecorator)throw new Error('intent.active requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('intent.active',decorateInspector,300);
})();
