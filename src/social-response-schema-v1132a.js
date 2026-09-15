(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.13.2a-social-response-agency';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
  W.SOCIAL_RESPONSE_SCHEMA_VERSION=VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.petOfferId='撫摸邀請';
    W.DATA_ZH.petResponse='撫摸回應';
  }
})();
