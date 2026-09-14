(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.13.0-episodic-memory-foundation';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
  W.MEMORY_SCHEMA_VERSION=VERSION;
  W.MAX_EPISODIC_MEMORIES=64;
  W.EPISODIC_OBSERVATION_RANGE=4;
})();
