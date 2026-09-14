(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.13.1-event-appraisal';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
  W.APPRAISAL_SCHEMA_VERSION=VERSION;
})();
