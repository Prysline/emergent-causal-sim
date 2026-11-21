(() => {
  const A=window.SimWorldAuthoring,Physical=window.SimPhysical,P=window.SimPerception,C=window.SimEmbodimentCapabilities;
  if(!A?.CELL_SIZE_METERS)throw new Error('systems/perception/visual-sight-samples.js requires canonical World Authoring geometry scale.');
  if(!Physical?.getPoseEnvelope)throw new Error('systems/perception/visual-sight-samples.js requires systems/physical.js.');
  if(!C?.modeFromPosture||!C?.poseProfileForKind||!C?.DEFAULT_PHYSICAL_PROFILES)throw new Error('Physical-derived sight samples require canonical Embodiment posture profiles.');
  if(!P?.VISUAL_LOS_VERSION)throw new Error('systems/perception/visual-sight-samples.js requires visual-los.js.');

  const VERSION='perception-visual-sight-samples-v2-locomotion-posture-guard';
  const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }

  function canonicalPlanarPosition(agent){
    const position=agent?.position;
    if(!position||!Number.isFinite(Number(position.x))||!Number.isFinite(Number(position.y))||!Number.isInteger(position.z)){
      throw new Error('Physical-derived sight samples require canonical Agent position with finite x / y and integer z.');
    }
    return {x:Number(position.x),y:Number(position.y)};
  }

  // Consumer preflight only: supported locomotion posture without canonical static sight pose.
  // Unknown kinds, unsupported modes and malformed geometry still reach strict Perception checks.
  function lacksVisualPoseEnvelopeForSupportedLocomotion(agent){
    const posture=agent?.posture?.kind,mode=C.modeFromPosture(posture),physical=agent?.physical;
    if(!mode||!C.DEFAULT_PHYSICAL_PROFILES[agent?.kind]||
      physical?.locomotionCapabilities?.[mode]!==true||!physical?.locomotionProfiles?.[mode])return false;
    return C.poseProfileForKind(agent.kind,posture)===null;
  }

  function derivePhysicalSightSamples(agent){
    const posture=agent?.posture?.kind;
    if(typeof posture!=='string'||!posture)throw new Error('Physical-derived sight samples require canonical Agent posture.');
    const envelope=Physical.getPoseEnvelope(agent,posture);
    if(!envelope||!positive(envelope.height)||!positive(envelope.width)||!positive(envelope.length)){
      throw new Error('Physical-derived sight samples do not support posture '+String(posture)+' without a canonical PoseEnvelope.');
    }
    const center=canonicalPlanarPosition(agent);
    return deepFreeze({
      layerZ:agent.position.z,
      posture,
      poseEnvelope:{height:Number(envelope.height),width:Number(envelope.width),length:Number(envelope.length)},
      observerOrigin:{...center},
      targetSamples:[{kind:'body-center',position:{...center}}]
    });
  }

  if(P.VISUAL_SIGHT_SAMPLES_VERSION)throw new Error('Physical-derived visual sight samples are already registered.');
  Object.assign(P,{
    VISUAL_SIGHT_SAMPLES_VERSION:VERSION,
    derivePhysicalSightSamples,
    lacksVisualPoseEnvelopeForSupportedLocomotion
  });
})();
