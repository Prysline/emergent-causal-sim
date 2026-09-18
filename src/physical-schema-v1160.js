(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.17.0-passage-profile-multimode';
  const baseCreateInitialState=W.createInitialState;
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

  const currentReleaseVersion=()=>W.PRESENTATION_SCHEMA_VERSION||VERSION;
  W.VERSION=currentReleaseVersion();
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=currentReleaseVersion();
    for(const a of Object.values(st.agents||{})){
      if(a.physical)continue;
      const profile=defaultPhysicalProfile(a.kind);
      if(profile)a.physical=profile;
    }
    return st;
  };
  W.PHYSICAL_SCHEMA_VERSION=VERSION;
  W.PHYSICAL_DEFAULT_PROFILES=DEFAULT_PHYSICAL_PROFILES;
  W.defaultPhysicalProfile=defaultPhysicalProfile;
})();
