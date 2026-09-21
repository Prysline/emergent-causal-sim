(() => {
  const VERSION='embodiment-capabilities-v1';
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
      bodyGeometry:{height:1.65,width:.45,length:.30},
      locomotionCapabilities:{walk:true,kneelCrawl:true,proneCrawl:true},
      locomotionProfiles:{
        walk:{heightFactor:1,widthFactor:1,lengthFactor:1,speedFactor:1},
        kneelCrawl:{heightFactor:.55,widthFactor:1.15,lengthFactor:3,speedFactor:.55},
        proneCrawl:{heightFactor:.30,widthFactor:1.10,lengthFactor:5,speedFactor:.35}
      }
    },
    cat:{
      mass:4.5,
      volume:.0045,
      bodyGeometry:{height:.32,width:.18,length:.45},
      locomotionCapabilities:{walk:true},
      locomotionProfiles:{walk:{heightFactor:1,widthFactor:1,lengthFactor:1,speedFactor:1}}
    }
  });
  const ALL_POSTURES=Object.freeze(['standing','sitting','lying','kneeling','prone']);
  const POSTURE_BY_MODE=Object.freeze({walk:'standing',kneelCrawl:'kneeling',proneCrawl:'prone'});
  const MODE_BY_POSTURE=Object.freeze({standing:'walk',kneeling:'kneelCrawl',prone:'proneCrawl'});
  const POSTURE_LABELS=Object.freeze({standing:'站立',sitting:'坐姿',lying:'躺臥',kneeling:'跪姿',prone:'俯臥'});
  const MODE_LABELS=Object.freeze({walk:'步行',kneelCrawl:'跪爬',proneCrawl:'匍匐'});

  function defaultPhysicalProfile(kind){
    const template=DEFAULT_PHYSICAL_PROFILES[kind];
    return template?clone(template):null;
  }
  function supportedLocomotionModesForKind(kind){
    const profile=DEFAULT_PHYSICAL_PROFILES[kind];
    if(!profile)return [];
    return Object.keys(profile.locomotionCapabilities||{}).filter(mode=>profile.locomotionCapabilities?.[mode]===true&&!!profile.locomotionProfiles?.[mode]);
  }
  function postureForMode(mode){return POSTURE_BY_MODE[mode]||null;}
  function modeFromPosture(posture){return MODE_BY_POSTURE[posture]||null;}
  function freePosturesForKind(kind){
    if(!DEFAULT_PHYSICAL_PROFILES[kind])return [];
    const supported=new Set(supportedLocomotionModesForKind(kind).map(postureForMode).filter(Boolean));
    supported.add('lying');
    return ALL_POSTURES.filter(kind=>kind!=='sitting'&&supported.has(kind));
  }
  function slotPosturesForKind(kind,slot={}){
    if(!DEFAULT_PHYSICAL_PROFILES[kind])return [];
    const supported=new Set(freePosturesForKind(kind));
    supported.add('sitting');
    if(!slot?.canRest&&!slot?.canSleep)supported.delete('lying');
    return ALL_POSTURES.filter(posture=>supported.has(posture));
  }
  function postureLabel(posture){return POSTURE_LABELS[posture]||posture||'未知';}
  function modeLabel(mode){return MODE_LABELS[mode]||mode||'移動';}

  window.SimEmbodimentCapabilities=Object.freeze({
    VERSION,
    DEFAULT_PHYSICAL_PROFILES,
    ALL_POSTURES,
    POSTURE_BY_MODE,
    MODE_BY_POSTURE,
    defaultPhysicalProfile,
    supportedLocomotionModesForKind,
    postureForMode,
    modeFromPosture,
    freePosturesForKind,
    slotPosturesForKind,
    postureLabel,
    modeLabel
  });
})();