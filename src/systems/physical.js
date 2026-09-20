(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('systems/physical.js requires world.js initial-state pipeline.');
  const VERSION='11.17.0-passage-profile-multimode';
  const clone=o=>JSON.parse(JSON.stringify(o));
  const DEFAULT_PHYSICAL_PROFILES=Object.freeze({
    human:Object.freeze({
      mass:70,
      volume:.07,
      bodyGeometry:Object.freeze({height:1.65,width:.45,length:.30}),
      locomotionCapabilities:Object.freeze({walk:true,kneelCrawl:true,proneCrawl:true}),
      locomotionProfiles:Object.freeze({
        walk:Object.freeze({heightFactor:1,widthFactor:1,lengthFactor:1,speedFactor:1}),
        kneelCrawl:Object.freeze({heightFactor:.55,widthFactor:1.15,lengthFactor:3,speedFactor:.55}),
        proneCrawl:Object.freeze({heightFactor:.30,widthFactor:1.10,lengthFactor:5,speedFactor:.35})
      })
    }),
    cat:Object.freeze({
      mass:4.5,
      volume:.0045,
      bodyGeometry:Object.freeze({height:.32,width:.18,length:.45}),
      locomotionCapabilities:Object.freeze({walk:true}),
      locomotionProfiles:Object.freeze({walk:Object.freeze({heightFactor:1,widthFactor:1,lengthFactor:1,speedFactor:1})})
    })
  });

  function defaultPhysicalProfile(kind){
    const template=DEFAULT_PHYSICAL_PROFILES[kind];
    return template?clone(template):null;
  }

  W.registerInitialStateInitializer('physical.schema',(st)=>{
    for(const a of Object.values(st.agents||{})){
      if(a.physical)continue;
      const profile=defaultPhysicalProfile(a.kind);
      if(profile)a.physical=profile;
    }
    return st;
  },1600);

  W.PHYSICAL_SCHEMA_VERSION=VERSION;
  W.PHYSICAL_DEFAULT_PROFILES=DEFAULT_PHYSICAL_PROFILES;
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
