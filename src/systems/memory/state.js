(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('systems/memory/state.js requires world.js initial-state pipeline.');

  const MEMORY_VERSION='11.13.0-episodic-memory-foundation';
  W.registerInitialStateInitializer('memory.schema',(st)=>{
    
    return st;
  },600);
  W.MEMORY_SCHEMA_VERSION=MEMORY_VERSION;
  W.MAX_EPISODIC_MEMORIES=64;
  W.EPISODIC_OBSERVATION_RANGE=4;

  const RETENTION_VERSION='11.13.3-memory-salience-pruning';
  W.registerInitialStateInitializer('memoryRetention.schema',(st)=>{
    
    return st;
  },1000);
  W.MEMORY_RETENTION_SCHEMA_VERSION=RETENTION_VERSION;
  W.MEMORY_SALIENCE_WEIGHTS=Object.freeze({relevance:.50,affectImpact:.25,recurrence:.15,recency:.10});
  W.MEMORY_RECENCY_HALF_LIFE=32;
  W.MEMORY_RECURRENCE_RELEVANCE_MIN=.45;
  W.MEMORY_RECURRENCE_FULL_COUNT=3;

  const DELIBERATION_VERSION='11.13.4-memory-deliberation-influence';
  W.registerInitialStateInitializer('memoryDeliberation.schema',(st)=>{
    
    return st;
  },1200);
  W.MEMORY_DELIBERATION_SCHEMA_VERSION=DELIBERATION_VERSION;
  W.MEMORY_DELIBERATION_TOP_MEMORIES=6;
  W.MEMORY_DELIBERATION_MAX_DELTA=18;
  W.MEMORY_TARGET_ACCESS_COST_WEIGHT=2;
  W.MEMORY_TARGET_ACCESS_COST_CAP=12;

  const SOCIAL_OUTCOME_VERSION='11.13.5-requester-social-outcome-memory';
  W.registerInitialStateInitializer('socialOutcomeMemory.schema',(st)=>{
    
    return st;
  },1300);
  W.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION=SOCIAL_OUTCOME_VERSION;
  W.SOCIAL_OUTCOME_RELEVANCE_BASE=.30;
  W.SOCIAL_OUTCOME_RELEVANCE_SOCIAL_SCALE=.40;
  W.SOCIAL_OUTCOME_CONTEXT_CONGRUENCE=Object.freeze({
    unobserved:-.22,
    sleeping:-.05,
    highCommitment:-.12,
    observedAction:-.28,
    observedIdle:-.45
  });
})();
