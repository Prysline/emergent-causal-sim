(() => {
  const W=window.SimWorld;if(!W?.MEMORY_DELIBERATION_SCHEMA_VERSION)return;
  const VERSION='11.13.5-requester-social-outcome-memory';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };

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
