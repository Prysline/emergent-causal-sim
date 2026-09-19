(() => {
  const W=window.SimWorld;if(!W?.MEMORY_RETENTION_SCHEMA_VERSION)return;
  if(!W.registerInitialStateInitializer)throw new Error('memory-deliberation-schema-v1134.js requires world.js initial-state pipeline.');
  const VERSION='11.13.4-memory-deliberation-influence';

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('memoryDeliberation.schema',(st)=>{
    st.version=VERSION;
    return st;
  },1200);
  W.MEMORY_DELIBERATION_SCHEMA_VERSION=VERSION;
  W.MEMORY_DELIBERATION_TOP_MEMORIES=6;
  W.MEMORY_DELIBERATION_MAX_DELTA=18;
  W.MEMORY_TARGET_ACCESS_COST_WEIGHT=2;
  W.MEMORY_TARGET_ACCESS_COST_CAP=12;
})();
