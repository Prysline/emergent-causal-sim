(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.19.0-locomotion-execution-posture';
  const baseCreateInitialState=W.createInitialState;

  const currentReleaseVersion=()=>W.PRESENTATION_SCHEMA_VERSION||VERSION;
  W.VERSION=currentReleaseVersion();
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=currentReleaseVersion();
    for(const a of Object.values(st.agents||{})){
      if(!a.locomotion)a.locomotion={mode:null,phase:'idle'};
    }
    return st;
  };
  W.LOCOMOTION_SCHEMA_VERSION=VERSION;
})();