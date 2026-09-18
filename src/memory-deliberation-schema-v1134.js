(() => {
  const W=window.SimWorld;if(!W?.MEMORY_RETENTION_SCHEMA_VERSION)return;
  const VERSION='11.13.4-memory-deliberation-influence';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
  W.MEMORY_DELIBERATION_SCHEMA_VERSION=VERSION;
  W.MEMORY_DELIBERATION_TOP_MEMORIES=6;
  W.MEMORY_DELIBERATION_MAX_DELTA=18;
  W.MEMORY_TARGET_ACCESS_COST_WEIGHT=2;
  W.MEMORY_TARGET_ACCESS_COST_CAP=12;
})();
