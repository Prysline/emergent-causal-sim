(() => {
  const S=window.SimEngine;
  if(!S?.restRecoveryInfo)return;
  let busy=false;
  function patch(){
    if(busy)return;busy=true;
    document.querySelectorAll('.effort-inline').forEach(el=>{el.textContent=el.textContent.replace('今日負荷','今日活動量');});
    const ins=document.getElementById('inspector');
    if(ins){
      ins.querySelectorAll('.kv .k').forEach(k=>{
        if(k.textContent==='今日活動負荷')k.textContent='今日活動量';
        if(k.textContent==='最近負荷')k.textContent='最近活動';
      });
      const small=[...ins.querySelectorAll('.inspect-title small')].find(x=>x.textContent.startsWith('Agent・'));
      const id=small?.textContent.split('・')[1];
      const a=id?S.getState().agents[id]:null;
      if(a&&!ins.querySelector('.recovery-traits')){
        const info=S.restRecoveryInfo(a,a.location),last=a.metrics?.lastExertion;
        if(last?.fatigueCost!=null){
          const cells=[...ins.querySelectorAll('.kv .k')];
          const key=cells.find(k=>k.textContent==='最近活動');
          if(key?.nextElementSibling)key.nextElementSibling.textContent=`${last.reason} +${last.amount.toFixed(1)}（疲勞 +${last.fatigueCost.toFixed(1)}）`;
        }
        const sec=document.createElement('div');sec.className='inspect-section recovery-traits';
        sec.innerHTML=`<h3>體力特質</h3><div class="kv"><div class="k">活動疲勞敏感度</div><div>${Math.round((a.traits.exertionSensitivity??1)*100)}%</div><div class="k">休息恢復倍率</div><div>${Math.round((a.traits.recoveryRate??1)*100)}%</div><div class="k">此處休息效率</div><div>${Math.round(info.restEfficiency*100)}%</div></div>`;
        const decision=[...ins.querySelectorAll('.inspect-section h3')].find(h=>h.textContent==='最近決策')?.parentElement;
        if(decision)ins.insertBefore(sec,decision);else ins.appendChild(sec);
      }
    }
    busy=false;
  }
  const observer=new MutationObserver(()=>requestAnimationFrame(patch));
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  patch();
})();
