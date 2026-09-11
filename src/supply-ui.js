(() => {
  const S=window.SimEngine;
  if(!S?.supplyStatus)return;
  let busy=false;

  function ensureBadge(host,key,text,cls=''){
    let el=host.querySelector(`[data-supply-badge="${key}"]`);
    if(!el){el=document.createElement('span');el.className=`mini-badge ${cls}`.trim();el.dataset.supplyBadge=key;host.appendChild(el);}
    if(el.textContent!==text)el.textContent=text;
  }

  function patch(){
    if(busy)return;busy=true;
    const status=S.supplyStatus();
    const badges=document.getElementById('worldBadges');
    if(badges){
      ensureBadge(badges,'food',`食物 ${Math.round(status.stock)}`);
      if(status.workerName)ensureBadge(badges,'worker',`補給：${status.workerName}`,'');
      else badges.querySelector('[data-supply-badge="worker"]')?.remove();
    }

    const ins=document.getElementById('inspector');
    if(ins){
      const small=[...ins.querySelectorAll('.inspect-title small')].find(x=>x.textContent.startsWith('Agent・'));
      const id=small?.textContent.split('・')[1];
      const a=id?S.getState().agents[id]:null;
      if(a?.supplyTask){
        const firstKv=ins.querySelector('.inspect-section .kv');
        if(firstKv&&!firstKv.querySelector('[data-supply-agent-key]')){
          const k=document.createElement('div');k.className='k';k.dataset.supplyAgentKey='1';k.textContent='補給工作';
          const v=document.createElement('div');v.dataset.supplyAgentKey='1';v.textContent=S.planLabel(a);
          firstKv.append(k,v);
        }
      }

      const containerSmall=[...ins.querySelectorAll('.inspect-title small')].find(x=>x.textContent.startsWith('Container・'));
      const cid=containerSmall?.textContent.split('・')[1];
      if((cid==='foodPantry'||cid==='mealTray')&&!ins.querySelector('.supply-overview')){
        const sec=document.createElement('div');sec.className='inspect-section supply-overview';
        sec.innerHTML=`<h3>補給閉環</h3><div class="kv"><div class="k">食物總庫存</div><div>${Math.round(status.stock*10)/10}</div><div class="k">觸發門檻</div><div>${status.trigger}</div><div class="k">補給中</div><div>${status.workerName||'無'}</div><div class="k">已完成趟數</div><div>${status.trips}</div><div class="k">累積帶回</div><div>${Math.round(status.totalProduced*10)/10}</div></div>`;
        const recent=[...ins.querySelectorAll('.inspect-section h3')].find(h=>h.textContent==='最近相關事件')?.parentElement;
        if(recent)ins.insertBefore(sec,recent);else ins.appendChild(sec);
      }
    }
    busy=false;
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(patch));
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  patch();
})();
