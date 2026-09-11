(() => {
  const E=window.SimEngine;
  if(!E||E.__recoveryV81)return;
  E.__recoveryV81=true;
  const baseTick=E.tick.bind(E), baseReset=E.reset.bind(E), baseApply=E.applyExertion.bind(E);

  const clamp=E.clamp;
  function ensureTraits(a){
    a.traits??={};
    if(a.traits.exertionSensitivity==null)a.traits.exertionSensitivity=a.kind==='cat'?.90:1;
    if(a.traits.recoveryRate==null)a.traits.recoveryRate=a.kind==='cat'?1.10:1;
  }
  function restRecoveryInfo(a,zoneId=a.location){
    ensureTraits(a);
    const st=E.getState(),zone=st.zones[zoneId];
    const noise=E.zoneNoise(zoneId), restQuality=zone?.restQuality||0;
    const restEfficiency=clamp(.35+(restQuality/30)*.65-(noise/40)*.35,.18,1.20);
    const recoveryRate=a.traits.recoveryRate??1;
    const recovery=3.2*restEfficiency*recoveryRate;
    return {recovery,restEfficiency,recoveryRate,noise,restQuality};
  }
  function prepareState(st){for(const a of Object.values(st.agents)){ensureTraits(a);delete a.__recoverySession;}}
  function patchResetEvent(st){
    const e=st.events?.[0];
    if(e?.text?.startsWith('v8 初始化')) e.text=e.text.replace(/^v8 初始化：[^。]*。/,'v8.1 初始化：活動量與疲勞分離；休息會依角色恢復倍率與環境逐步降低疲勞。');
  }

  function reset(seed){
    const st=baseReset(seed);prepareState(st);patchResetEvent(st);return st;
  }
  function tick(){
    const st=E.getState(), beforeDay=st.day, snap={};
    for(const a of Object.values(st.agents)){
      ensureTraits(a);
      const p=a.plan;
      const resting=!!(p&&p.intent==='rest'&&a.location===p.targetZone);
      snap[a.id]={fatigue:a.needs.fatigue,lastExertion:a.metrics?.lastExertion||null,resting,target:p?.targetZone||null};
      if(resting&&a.__recoverySession) p.restTicks=-1000;
    }

    baseTick();
    const next=E.getState(), dayChanged=next.day!==beforeDay;
    for(const a of Object.values(next.agents)){
      ensureTraits(a);
      const prev=snap[a.id]; if(!prev)continue;
      const recent=a.metrics?.lastExertion;
      const activity=recent?.tick===next.tick?(recent.amount||0):0;
      if(activity>0){
        const fatigueCost=activity*(a.traits.exertionSensitivity??1);
        a.needs.fatigue=clamp(a.needs.fatigue+activity*((a.traits.exertionSensitivity??1)-1));
        recent.fatigueCost=fatigueCost;
      }else if(dayChanged&&a.metrics&&!a.metrics.lastExertion&&prev.lastExertion){
        a.metrics.lastExertion=prev.lastExertion;
      }

      const p=a.plan;
      const continuedRest=prev.resting&&p?.intent==='rest'&&a.location===prev.target&&p.targetZone===prev.target;
      const startedRestHere=!prev.resting&&p?.intent==='rest'&&p.restTicks===1&&a.location===p.targetZone;
      const performedRest=continuedRest||startedRestHere;
      if(performedRest){
        const info=restRecoveryInfo(a,a.location);
        a.__recoverySession??={ticks:0,startFatigue:prev.fatigue,targetFatigue:a.kind==='cat'?18:20};
        const session=a.__recoverySession;session.ticks++;
        a.needs.fatigue=clamp(prev.fatigue-info.recovery);
        if(session.ticks===1){
          const ev=next.events.find(e=>e.data?.action==='rest'&&e.data?.location===a.location&&e.text.includes(a.name));
          if(ev)Object.assign(ev.data,{recoveryRate:info.recoveryRate,restEfficiency:info.restEfficiency,recovery:info.recovery});
        }
        p.restTicks=session.ticks;
        if(a.needs.fatigue<=session.targetFatigue||session.ticks>=24){
          a.plan=null;delete a.__recoverySession;
        }
      }else if(p?.intent!=='rest'){
        delete a.__recoverySession;
      }
    }
  }
  function applyExertion(a,amount,reason,opts){
    ensureTraits(a);
    const before=a.needs.fatigue, activity=baseApply(a,amount,reason,opts);
    const fatigueCost=activity*(a.traits.exertionSensitivity??1);
    a.needs.fatigue=clamp(before+fatigueCost);
    if(a.metrics?.lastExertion){a.metrics.lastExertion.fatigueCost=fatigueCost;}
    return activity;
  }

  E.tick=tick;E.reset=reset;E.applyExertion=applyExertion;E.restRecoveryInfo=restRecoveryInfo;
  prepareState(E.getState());patchResetEvent(E.getState());
})();
