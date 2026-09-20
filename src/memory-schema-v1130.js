(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('memory-schema-v1130.js requires world.js initial-state pipeline.');
  const VERSION='11.13.0-episodic-memory-foundation';
  W.registerInitialStateInitializer('memory.schema',(st)=>{
    
    return st;
  },600);
  W.MEMORY_SCHEMA_VERSION=VERSION;
  W.MAX_EPISODIC_MEMORIES=64;
  W.EPISODIC_OBSERVATION_RANGE=4;
})();
