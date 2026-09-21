(() => {
  const W=window.SimWorld,C=window.SimEmbodimentCapabilities;if(!W)return;
  if(!C?.defaultPhysicalProfile||!C?.DEFAULT_PHYSICAL_PROFILES)throw new Error('systems/physical.js requires embodiment-capabilities.js.');
  if(!W.registerInitialStateInitializer)throw new Error('systems/physical.js requires world.js initial-state pipeline.');
  const VERSION='11.17.0-passage-profile-multimode';

  function defaultPhysicalProfile(kind){return C.defaultPhysicalProfile(kind);}

  W.registerInitialStateInitializer('physical.schema',(st)=>{
    for(const a of Object.values(st.agents||{})){
      if(a.physical)continue;
      const profile=defaultPhysicalProfile(a.kind);
      if(profile)a.physical=profile;
    }
    return st;
  },1600);

  W.PHYSICAL_SCHEMA_VERSION=VERSION;
  W.PHYSICAL_DEFAULT_PROFILES=C.DEFAULT_PHYSICAL_PROFILES;
  W.defaultPhysicalProfile=defaultPhysicalProfile;

  const P=window.SimPhysical||{};
  const finitePositive=v=>Number.isFinite(Number(v))&&Number(v)>0;

  function getPhysicalProfile(agent){return agent?.physical||null;}
  function getLocomotionProfile(agent,mode='walk'){
    const physical=getPhysicalProfile(agent);if(!physical)return null;
    if(physical.locomotionCapabilities?.[mode]!==true)return null;
    return physical.locomotionProfiles?.[mode]||null;
  }
  function supportedLocomotionModes(agent){
    const physical=getPhysicalProfile(agent);if(!physical)return [];
    return Object.keys(physical.locomotionCapabilities||{}).filter(mode=>physical.locomotionCapabilities?.[mode]===true&&!!physical.locomotionProfiles?.[mode]);
  }
  function resolvedDimension(base,factor,absoluteOverride){
    if(finitePositive(absoluteOverride))return Number(absoluteOverride);
    if(!finitePositive(base))return null;
    const scale=Number.isFinite(Number(factor))&&Number(factor)>0?Number(factor):1;
    return Number(base)*scale;
  }
  function getMovementEnvelope(agent,mode='walk'){
    const physical=getPhysicalProfile(agent),profile=getLocomotionProfile(agent,mode);if(!physical||!profile)return null;
    const geometry=physical.bodyGeometry||{};
    const clearanceHeight=resolvedDimension(geometry.height,profile.heightFactor,profile.clearanceHeight);
    const clearanceWidth=resolvedDimension(geometry.width,profile.widthFactor,profile.clearanceWidth);
    const clearanceLength=resolvedDimension(geometry.length,profile.lengthFactor,profile.clearanceLength);
    const speedFactor=finitePositive(profile.speedFactor)?Number(profile.speedFactor):1;
    if(![clearanceHeight,clearanceWidth,clearanceLength].every(finitePositive))return null;
    return {clearanceHeight,clearanceWidth,clearanceLength,speedFactor,sourceMode:mode};
  }
  function requiredClearance(agent,mode='walk'){return getMovementEnvelope(agent,mode)?.clearanceHeight??null;}

  Object.assign(P,{VERSION,getPhysicalProfile,getLocomotionProfile,supportedLocomotionModes,getMovementEnvelope,requiredClearance});
  window.SimPhysical=P;
  W.PHYSICAL_RUNTIME_VERSION=VERSION;
})();
