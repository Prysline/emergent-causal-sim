(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.13.3a-human-social-response';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
  W.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION=VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.talkOfferId='聊天邀請';
    W.DATA_ZH.talkResponse='聊天回應';
    W.DATA_ZH.observedResponderActionKind='觀察到的對方行動';
  }
})();
