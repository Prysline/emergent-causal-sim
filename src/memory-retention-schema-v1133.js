(() => {
  const W=window.SimWorld;if(!W?.MEMORY_SCHEMA_VERSION)return;
  const VERSION='11.13.3-memory-salience-pruning';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
  W.MEMORY_RETENTION_SCHEMA_VERSION=VERSION;
  W.MEMORY_SALIENCE_WEIGHTS=Object.freeze({relevance:.50,affectImpact:.25,recurrence:.15,recency:.10});
  W.MEMORY_RECENCY_HALF_LIFE=32;
  W.MEMORY_RECURRENCE_RELEVANCE_MIN=.45;
  W.MEMORY_RECURRENCE_FULL_COUNT=3;
})();
