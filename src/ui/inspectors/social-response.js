(() => {
  const UI=window.SimUI;
  if(!UI?.registerStartupExtension)throw new Error('Social response controls require UI startup lifecycle.');
  UI.registerStartupExtension('socialResponse.scenario-controls',()=>{
    const select=document.getElementById('socialScenario'),button=document.getElementById('loadSocialScenario');
    if(!select||!button)return;
    const params=new URLSearchParams(location.search||''),current=params.get('scenario')||'';
    if([...select.options].some(o=>o.value===current))select.value=current;
    button.addEventListener('click',()=>{
      const next=new URLSearchParams(location.search||''),value=select.value;
      if(value)next.set('scenario',value);else next.delete('scenario');
      location.search=next.toString();
    });
  },100);
})();
