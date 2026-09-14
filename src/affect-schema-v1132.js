(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.13.2-short-lived-affect';
  const DECAY=Object.freeze({valence:.90,activation:.82,frustration:.86});
  const EPSILON=.005;
  const baseCreateInitialState=W.createInitialState;
  const createNeutralAffect=(tick=0)=>({valence:0,activation:0,frustration:0,lastUpdatedTick:tick,lastDecayTick:tick,source:null});

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    for(const a of Object.values(st.agents||{}))a.affect=createNeutralAffect(st.tick||0);
    return st;
  };
  Object.assign(W,{AFFECT_SCHEMA_VERSION:VERSION,AFFECT_DECAY:DECAY,AFFECT_EPSILON:EPSILON,createNeutralAffect});
})();
