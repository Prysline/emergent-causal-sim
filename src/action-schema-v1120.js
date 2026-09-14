(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.12.0-action-terminology';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
  W.ACTION_SCHEMA_VERSION=VERSION;
})();
