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
      if(p.locomotionCapabilities?.standing!==true)add('physical_standing_capability_missing',`${a.name} 缺少第一版 standing locomotion capability。`,{agentId:a.id});
      const envelope=P.getMovementEnvelope(a,'standing');
      if(!envelope)add('physical_standing_envelope_invalid',`${a.name} 無法推導 standing MovementEnvelope。`,{agentId:a.id});
      else for(const key of ['clearanceHeight','clearanceWidth','clearanceLength','speedFactor'])if(!positive(envelope[key]))add('physical_envelope_invalid',`${a.name} 的 standing MovementEnvelope.${key} 必須是正數。`,{agentId:a.id,field:key,value:envelope[key]});
      if(Object.prototype.hasOwnProperty.call(p,'movementEnvelope'))add('physical_derived_envelope_persisted',`${a.name} 不應保存 derived movementEnvelope cache。`,{agentId:a.id});
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.registerValidationLayer('physical.profile',validateLayer,90);
})();
