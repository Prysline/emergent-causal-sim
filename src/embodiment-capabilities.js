(() => {
  const VERSION='embodiment-capabilities-v5';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const deepFreeze=value=>{
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  };

  const DEFAULT_PHYSICAL_PROFILES=deepFreeze({
    human:{
      mass:70,
      volume:.07,
      manipulation:{handCapacity:2},
      bodyGeometry:{height:1.65,width:.45,length:.30},
      locomotionCapabilities:{walk:true,kneelCrawl:true,proneCrawl:true},
      locomotionProfiles:{
        walk:{heightFactor:1,widthFactor:1,lengthFactor:1,speedFactor:1,supportHandsRequired:0},
        kneelCrawl:{heightFactor:.55,widthFactor:1.15,lengthFactor:3,speedFactor:.55,supportHandsRequired:1},
        proneCrawl:{heightFactor:.30,widthFactor:1.10,lengthFactor:5,speedFactor:.35,supportHandsRequired:1}
      }
    },
    cat:{
      mass:4.5,
      volume:.0045,
      manipulation:{handCapacity:0},
      bodyGeometry:{height:.32,width:.18,length:.45},
      locomotionCapabilities:{walk:true},
      locomotionProfiles:{walk:{heightFactor:1,widthFactor:1,lengthFactor:1,speedFactor:1,supportHandsRequired:0}}
    }
  });
  const POSE_PROFILES=deepFreeze({
    human:{
      standing:{height:{source:'height',factor:1},width:{source:'width',factor:1},length:{source:'length',factor:1}},
      sitting:{height:{source:'height',factor:.55},width:{source:'width',factor:1},length:{source:'height',factor:.36}},
      lying:{height:{source:'length',factor:1},width:{source:'width',factor:1},length:{source:'height',factor:1}}
    },
    cat:{
      standing:{height:{source:'height',factor:1},width:{source:'width',factor:1},length:{source:'length',factor:1}},
      sitting:{height:{source:'length',factor:1},width:{source:'width',factor:1},length:{source:'height',factor:.90}},
      lying:{height:{source:'height',factor:.50},width:{source:'width',factor:1.25},length:{source:'length',factor:1}}
    }
  });
  const SUPPORT_PROFILES=deepFreeze({
    human:{standing:{width:{source:'width',factor:.60},length:{source:'length',factor:.80}}},
    cat:{standing:{width:{source:'width',factor:1},length:{source:'length',factor:.80}}}
  });
  const SURFACE_MANEUVER_PROFILES=deepFreeze({
    human:{
      step:{upHeightRatio:.30,downHeightRatio:.35,horizontalGapRatio:.25,supportHandsRequired:0},
      climb:{upHeightRatio:.60,downHeightRatio:.70,horizontalGapRatio:.50,supportHandsRequired:1},
      jump:{upHeightRatio:.40,downHeightRatio:.75,horizontalGapRatio:.60,supportHandsRequired:0}
    },
    cat:{
      step:{upHeightRatio:.20,downHeightRatio:.30,horizontalGapRatio:.20,supportHandsRequired:0},
      climb:{upHeightRatio:1.25,downHeightRatio:1.50,horizontalGapRatio:.75,supportHandsRequired:1},
      jump:{upHeightRatio:3.00,downHeightRatio:4.50,horizontalGapRatio:4.00,supportHandsRequired:0}
    }
  });
  const AGENT_CARRY_METHODS=deepFreeze({
    twoArmCarry:{
      handsRequired:2,
      carriedGeometryCalibration:{widthFromHeightFactor:.60,lengthFromHeightFactor:.40},
      surfaceManeuvers:{step:true,jump:false}
    }
  });
  const AGENT_CARRY_CAPABILITIES=deepFreeze({human:{twoArmCarry:{massCapacity:35}},cat:{}});
  const ALL_POSTURES=Object.freeze(['standing','sitting','lying','kneeling','prone','carried']);
  const POSTURE_BY_MODE=Object.freeze({walk:'standing',kneelCrawl:'kneeling',proneCrawl:'prone'});
  const MODE_BY_POSTURE=Object.freeze({standing:'walk',kneeling:'kneelCrawl',prone:'proneCrawl'});
  const POSTURE_LABELS=Object.freeze({standing:'站立',sitting:'坐姿',lying:'躺臥',kneeling:'跪姿',prone:'俯臥',carried:'被抱持'});
  const MODE_LABELS=Object.freeze({walk:'步行',kneelCrawl:'跪爬',proneCrawl:'匍匐'});
  const finitePositive=value=>Number.isFinite(Number(value))&&Number(value)>0;

  function poseProfileForKind(kind,posture){return POSE_PROFILES[kind]?.[posture]||null;}
  function derivePoseEnvelope(bodyGeometry,poseProfile){
    if(!bodyGeometry||!poseProfile)return null;
    const out={};
    for(const axis of ['height','width','length']){
      const rule=poseProfile[axis],source=rule?.source,base=Number(bodyGeometry?.[source]),factor=Number(rule?.factor);
      if(typeof source!=='string'||!finitePositive(base)||!finitePositive(factor))return null;
      out[axis]=base*factor;
    }
    return out;
  }
  function getPoseEnvelopeForKind(kind,bodyGeometry,posture){return derivePoseEnvelope(bodyGeometry,poseProfileForKind(kind,posture));}
  function supportProfileForKind(kind,posture){return SUPPORT_PROFILES[kind]?.[posture]||null;}
  function deriveSupportFootprint(bodyGeometry,supportProfile){
    if(!bodyGeometry||!supportProfile)return null;
    const out={};
    for(const axis of ['width','length']){
      const rule=supportProfile[axis],source=rule?.source,base=Number(bodyGeometry?.[source]),factor=Number(rule?.factor);
      if(typeof source!=='string'||!finitePositive(base)||!finitePositive(factor))return null;
      out[axis]=base*factor;
    }
    return out;
  }
  function getSupportFootprintForKind(kind,bodyGeometry,posture='standing'){return deriveSupportFootprint(bodyGeometry,supportProfileForKind(kind,posture));}
  function surfaceManeuverProfileForKind(kind,family){return SURFACE_MANEUVER_PROFILES[kind]?.[family]||null;}
  function agentCarryMethod(method){return AGENT_CARRY_METHODS[method]||null;}
  function agentCarryCapabilityForKind(kind,method){
    const methodProfile=agentCarryMethod(method),species=AGENT_CARRY_CAPABILITIES[kind]?.[method];
    return methodProfile&&species?Object.freeze({...methodProfile,...species}):null;
  }
  function poseEnvelopeFitsUsableSpace(envelope,usableSpace){
    if(!envelope||!usableSpace||!finitePositive(usableSpace.width)||!finitePositive(usableSpace.length))return false;
    for(const axis of ['width','length','height']){
      if(!finitePositive(envelope[axis]))return false;
      if(usableSpace[axis]!==undefined&&(!finitePositive(usableSpace[axis])||Number(envelope[axis])>Number(usableSpace[axis])+1e-9))return false;
    }
    return true;
  }

  function defaultPhysicalProfile(kind){const template=DEFAULT_PHYSICAL_PROFILES[kind];return template?clone(template):null;}
  function supportedLocomotionModesForKind(kind){
    const profile=DEFAULT_PHYSICAL_PROFILES[kind];if(!profile)return [];
    return Object.keys(profile.locomotionCapabilities||{}).filter(mode=>profile.locomotionCapabilities?.[mode]===true&&!!profile.locomotionProfiles?.[mode]);
  }
  function postureForMode(mode){return POSTURE_BY_MODE[mode]||null;}
  function modeFromPosture(posture){return MODE_BY_POSTURE[posture]||null;}
  function freePosturesForKind(kind){
    if(!DEFAULT_PHYSICAL_PROFILES[kind])return [];
    const supported=new Set(supportedLocomotionModesForKind(kind).map(postureForMode).filter(Boolean));supported.add('lying');
    return ALL_POSTURES.filter(posture=>posture!=='sitting'&&posture!=='carried'&&supported.has(posture));
  }
  function slotPosturesForKind(kind,slot={}){
    if(!DEFAULT_PHYSICAL_PROFILES[kind])return [];
    const supported=new Set(freePosturesForKind(kind));supported.add('sitting');if(!slot?.canRest&&!slot?.canSleep)supported.delete('lying');
    return ALL_POSTURES.filter(posture=>posture!=='carried'&&supported.has(posture));
  }
  function postureLabel(posture){return POSTURE_LABELS[posture]||posture||'未知';}
  function modeLabel(mode){return MODE_LABELS[mode]||mode||'移動';}

  window.SimEmbodimentCapabilities=Object.freeze({
    VERSION,DEFAULT_PHYSICAL_PROFILES,POSE_PROFILES,SUPPORT_PROFILES,SURFACE_MANEUVER_PROFILES,AGENT_CARRY_METHODS,AGENT_CARRY_CAPABILITIES,ALL_POSTURES,POSTURE_BY_MODE,MODE_BY_POSTURE,
    defaultPhysicalProfile,poseProfileForKind,derivePoseEnvelope,getPoseEnvelopeForKind,supportProfileForKind,deriveSupportFootprint,getSupportFootprintForKind,surfaceManeuverProfileForKind,agentCarryMethod,agentCarryCapabilityForKind,poseEnvelopeFitsUsableSpace,supportedLocomotionModesForKind,postureForMode,modeFromPosture,freePosturesForKind,slotPosturesForKind,postureLabel,modeLabel
  });
})();