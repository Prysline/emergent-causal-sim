(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.14.0-player-resident-view-debug-inspector';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
  W.PRESENTATION_SCHEMA_VERSION=VERSION;
})();
