(() => {
  const V=window.SimValidator,L=window.SimLocomotion,P=window.SimPhysical;if(!V||!L||!P)return;
  const PHASES=new Set(['idle','transition','moving']);
  const POSTURES=new Set(['standing','sitting','lying','kneeling','prone']);
  const positiveInt=v=>Number.isInteger(Number(v))&&Number(v)>0;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const a of Object.values(st?.agents||{})){
      if(!a.locomotion||typeof a.locomotion!=='object'){add('locomotion_state_missing',`${a.name} 缺少 authoritative locomotion execution state。`,{agentId:a.id});continue;}
      const phase=a.locomotion.phase,mode=a.locomotion.mode;
      if(!PHASES.has(phase))add('locomotion_phase_invalid',`${a.name} 的 locomotion phase 無效。`,{agentId:a.id,phase});
      if(!POSTURES.has(a.posture?.kind))add('locomotion_posture_invalid',`${a.name} 的 posture.kind 無效。`,{agentId:a.id,posture:a.posture?.kind});
      if(phase==='idle'&&mode!==null)add('locomotion_idle_mode_persisted',`${a.name} idle 時不應保存 active locomotion mode。`,{agentId:a.id,mode});
      if(phase!=='idle'){
        const supported=P.supportedLocomotionModes?.(a)||[];
        if(!mode||!supported.includes(mode))add('locomotion_mode_invalid',`${a.name} 的 active locomotion mode 不受 Physical Profile 支援。`,{agentId:a.id,mode});
        const expected=L.postureForMode(mode);
        if(expected&&a.posture?.kind!==expected)add('locomotion_posture_mode_mismatch',`${a.name} 的 posture 與 locomotion mode 不一致。`,{agentId:a.id,mode,posture:a.posture?.kind,expectedPosture:expected});
      }
      const pending=a.action?.locomotionStep;
      if(pending){
        const supported=P.supportedLocomotionModes?.(a)||[];
        if(!supported.includes(pending.mode))add('locomotion_step_mode_invalid',`${a.name} 的 pending locomotion step 使用不支援的 mode。`,{agentId:a.id,mode:pending.mode});
        if(!positiveInt(pending.ticksRemaining))add('locomotion_step_ticks_invalid',`${a.name} 的 pending locomotion step ticksRemaining 必須是正整數。`,{agentId:a.id,ticksRemaining:pending.ticksRemaining});
        if(!pending.to||!Number.isFinite(Number(pending.to.x))||!Number.isFinite(Number(pending.to.y))||typeof pending.toKey!=='string')add('locomotion_step_target_invalid',`${a.name} 的 pending locomotion step 缺少有效 target node。`,{agentId:a.id});
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.registerValidationLayer('locomotion.execution',validateLayer,95);
})();