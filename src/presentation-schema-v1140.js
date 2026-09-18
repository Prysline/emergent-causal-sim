(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.20.0-dynamic-congestion';
  const baseCreateInitialState=W.createInitialState;
  const INTERACTION_LABELS=Object.freeze({
    talk:'聊天',
    pet:'撫摸互動',
    socialAffection:'親近互動'
  });

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
  W.PRESENTATION_SCHEMA_VERSION=VERSION;
  W.INTERACTION_LABELS=INTERACTION_LABELS;
  W.interactionLabel=(kind)=>INTERACTION_LABELS[kind]||kind||'互動';
})();