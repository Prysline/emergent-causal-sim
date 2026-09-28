(() => {
  const W=window.SimWorld,C=window.SimEmbodimentCapabilities;if(!W)return;
  if(!C?.defaultPhysicalProfile||!C?.DEFAULT_PHYSICAL_PROFILES||!C?.getPoseEnvelopeForKind||!C?.getSupportFootprintForKind||!C?.surfaceManeuverProfileForKind||!C?.poseEnvelopeFitsUsableSpace)throw new Error('systems/physical.js requires embodiment-capabilities.js.');
  if(!W.registerInitialStateInitializer)throw new Error('systems/physical.js requires world.js initial-state pipeline.');
  const VERSION='11.33.0-pose-envelope-static-fit';

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
  function getPoseEnvelope(agent,posture){
    const physical=getPhysicalProfile(agent);if(!physical)return null;
    return C.getPoseEnvelopeForKind(agent?.kind,physical.bodyGeometry,posture);
  }
  function poseEnvelopeFits(envelope,usableSpace){return C.poseEnvelopeFitsUsableSpace(envelope,usableSpace);}
  function agentPoseFitsUsableSpace(agent,posture,usableSpace){
    const envelope=getPoseEnvelope(agent,posture);
    return !!envelope&&poseEnvelopeFits(envelope,usableSpace);
  }
  function getSupportFootprint(agent,posture='standing'){
    const physical=getPhysicalProfile(agent);if(!physical)return null;
    const override=physical.supportProfiles?.[posture]||null;
    return override?C.deriveSupportFootprint(physical.bodyGeometry,override):C.getSupportFootprintForKind(agent?.kind,physical.bodyGeometry,posture);
  }
  function getSurfaceManeuverProfile(agent,family){
    const physical=getPhysicalProfile(agent);if(!physical)return null;
    return physical.surfaceManeuverProfiles?.[family]||C.surfaceManeuverProfileForKind(agent?.kind,family);
  }
  function getSurfaceManeuverCapability(agent,family){
    const physical=getPhysicalProfile(agent),profile=getSurfaceManeuverProfile(agent,family),height=Number(physical?.bodyGeometry?.height);
    if(!profile||!finitePositive(height))return null;
    const up=Number(profile.upHeightRatio),down=Number(profile.downHeightRatio),gap=Number(profile.horizontalGapRatio);
    if(![up,down,gap].every(finitePositive))return null;
    return {family,maxUpHeight:height*up,maxDownHeight:height*down,maxHorizontalGap:height*gap,ratios:{upHeightRatio:up,downHeightRatio:down,horizontalGapRatio:gap}};
  }
  function surfaceManeuverScaleCandidates(agent,transition={}){
    const verticalDelta=Number(transition.verticalDelta),horizontalGap=Number(transition.horizontalGap);
    if(!Number.isFinite(verticalDelta)||!Number.isFinite(horizontalGap)||horizontalGap<0)return[];
    const EPS=1e-9,direction=verticalDelta>EPS?'up':verticalDelta<-EPS?'down':'level',heightDelta=Math.abs(verticalDelta),out=[];
    for(const family of ['step','climb','jump']){
      const capability=getSurfaceManeuverCapability(agent,family);if(!capability)continue;
      const maxHeight=direction==='up'?capability.maxUpHeight:direction==='down'?capability.maxDownHeight:0;
      if(direction!=='level'&&heightDelta>maxHeight+EPS)continue;
      if(horizontalGap>capability.maxHorizontalGap+EPS)continue;
      const suffix=direction==='up'?'Up':direction==='down'?'Down':'Across';
      out.push({family,kind:family+suffix,direction,heightDelta,horizontalGap,maxHeight,maxHorizontalGap:capability.maxHorizontalGap});
    }
    return out;
  }
  function requiredClearance(agent,mode='walk'){return getMovementEnvelope(agent,mode)?.clearanceHeight??null;}

  Object.assign(P,{VERSION,getPhysicalProfile,getLocomotionProfile,supportedLocomotionModes,getMovementEnvelope,getPoseEnvelope,poseEnvelopeFits,agentPoseFitsUsableSpace,getSupportFootprint,getSurfaceManeuverProfile,getSurfaceManeuverCapability,surfaceManeuverScaleCandidates,requiredClearance});
  window.SimPhysical=P;
  W.PHYSICAL_RUNTIME_VERSION=VERSION;
})();
