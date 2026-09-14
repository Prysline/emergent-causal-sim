(() => {
  const E=window.SimEngine;if(!E?.intentLabel||typeof document==='undefined')return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function decorateInspector(){
    const host=document.getElementById('inspector');if(!host||host.querySelector('[data-v1121-intent]'))return;
    const meta=[...host.querySelectorAll('.inspect-title small')].find(x=>x.textContent?.startsWith('Agent・'));if(!meta)return;
    const id=meta.textContent.slice('Agent・'.length),a=E.getState()?.agents?.[id];if(!a)return;
    const intent=a.activeIntent,action=a.action;
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1121Intent='';
    section.innerHTML=`<h3>意圖與執行</h3><div class="kv"><div class="k">Active Intent</div><div>${intent?esc(E.intentLabel(intent)):'無'}</div><div class="k">Intent ID</div><div>${esc(intent?.id||'無')}</div><div class="k">來源</div><div>${intent?esc(intent.source?.type==='deliberation'?`自主決策・Tick ${intent.source.tick}`:intent.source?.type||'未知'):'無'}</div><div class="k">Action kind</div><div>${esc(action?.kind||'無')}</div><div class="k">Phase</div><div>${esc(action?.phase||'無')}</div><div class="k">Action → Intent</div><div>${esc(action?.intentId||'無')}</div></div><p class="hint">Active Intent 是 Agent-private 的短期目標；Action kind 是目前具體執行方案。v11.12.1 先建立 1:1 foundation，尚未啟用通用 replan / preemption。</p>`;
    const first=host.querySelector('.inspect-section');if(first)first.after(section);else host.append(section);
  }

  const host=document.getElementById('inspector');
  if(host)new MutationObserver(()=>queueMicrotask(decorateInspector)).observe(host,{childList:true,subtree:false});
  document.addEventListener('click',()=>queueMicrotask(decorateInspector));
  queueMicrotask(decorateInspector);
})();
