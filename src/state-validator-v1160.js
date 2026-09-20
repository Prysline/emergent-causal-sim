(() => {
  const V=window.SimValidator,P=window.SimPhysical;if(!V||!P?.getMovementEnvelope)return;
  const positive=v=>Number.isFinite(Number(v))&&Number(v)>0;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const a of Object.values(st?.agents||{})){
      const p=a.physical;
      if(!p){add('physical_profile_missing',`${a.name} 缺少 authoritative Physical Profile。`,{agentId:a.id});continue;}
      if(!positive(p.mass))add('physical_mass_invalid',`${a.name} 的 mass 必須是正數。`,{agentId:a.id,mass:p.mass});
      if(!positive(p.volume))add('physical_volume_invalid',`${a.name} 的 volume 必須是正數。`,{agentId:a.id,volume:p.volume});
      for(const key of ['height','width','length'])if(!positive(p.bodyGeometry?.[key]))add('physical_geometry_invalid',`${a.name} 的 bodyGeometry.${key} 必須是正數。`,{agentId:a.id,dimension:key,value:p.bodyGeometry?.[key]});
      if(Object.prototype.hasOwnProperty.call(p.locomotionCapabilities||{},'standing')||Object.prototype.hasOwnProperty.call(p.locomotionProfiles||{},'standing'))add('physical_legacy_standing_mode',`${a.name} 仍保存舊 standing locomotion mode；v11.17.0 起 locomotion baseline 為 walk，posture standing 與 locomotion mode 分離。`,{agentId:a.id});
      if(p.locomotionCapabilities?.walk!==true)add('physical_walk_capability_missing',`${a.name} 缺少 baseline walk locomotion capability。`,{agentId:a.id});
      for(const mode of P.supportedLocomotionModes?.(a)||[]){
        const envelope=P.getMovementEnvelope(a,mode);
        if(!envelope){add('physical_locomotion_envelope_invalid',`${a.name} 無法推導 ${mode} MovementEnvelope。`,{agentId:a.id,mode});continue;}
        for(const key of ['clearanceHeight','clearanceWidth','clearanceLength','speedFactor'])if(!positive(envelope[key]))add('physical_envelope_invalid',`${a.name} 的 ${mode} MovementEnvelope.${key} 必須是正數。`,{agentId:a.id,mode,field:key,value:envelope[key]});
      }
      for(const [mode,enabled] of Object.entries(p.locomotionCapabilities||{}))if(enabled===true&&!p.locomotionProfiles?.[mode])add('physical_locomotion_profile_missing',`${a.name} 啟用了 ${mode} capability，但缺少同名 locomotion profile。`,{agentId:a.id,mode});
      if(Object.prototype.hasOwnProperty.call(p,'movementEnvelope'))add('physical_derived_envelope_persisted',`${a.name} 不應保存 derived movementEnvelope cache。`,{agentId:a.id});
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.registerValidationLayer('physical.profile',validateLayer,90);
})();
