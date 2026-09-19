(() => {
  const W=window.SimWorld;if(!W?.MEMORY_SCHEMA_VERSION)return;
  if(!W.registerInitialStateInitializer)throw new Error('memory-retention-schema-v1133.js requires world.js initial-state pipeline.');
  const VERSION='11.13.3-memory-salience-pruning';

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('memoryRetention.schema',(st)=>{
    st.version=VERSION;
    return st;
  },1000);
  W.MEMORY_RETENTION_SCHEMA_VERSION=VERSION;
  W.MEMORY_SALIENCE_WEIGHTS=Object.freeze({relevance:.50,affectImpact:.25,recurrence:.15,recency:.10});
  W.MEMORY_RECENCY_HALF_LIFE=32;
  W.MEMORY_RECURRENCE_RELEVANCE_MIN=.45;
  W.MEMORY_RECURRENCE_FULL_COUNT=3;
})();
