(() => {
  const W=window.SimWorld;if(!W?.MEMORY_DELIBERATION_SCHEMA_VERSION)return;
  if(!W.registerInitialStateInitializer)throw new Error('social-outcome-memory-schema-v1135.js requires world.js initial-state pipeline.');
  const VERSION='11.13.5-requester-social-outcome-memory';

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('socialOutcomeMemory.schema',(st)=>{
    st.version=VERSION;
    return st;
  },1300);

  W.SOCIAL_OUTCOME_MEMORY_SCHEMA_VERSION=VERSION;
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
