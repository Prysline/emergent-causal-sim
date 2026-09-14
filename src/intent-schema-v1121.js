(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.12.1-active-intent-foundation';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    for(const a of Object.values(st.agents||{}))a.activeIntent=null;
    return st;
  };
  W.INTENT_SCHEMA_VERSION=VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.actionKind='Action 類型';
    W.DATA_ZH.intentId='Intent ID';
    W.DATA_ZH.sourceIntentId='來源 Intent';
  }
})();
