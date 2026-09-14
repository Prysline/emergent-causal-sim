(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.12.2-social-bid-lifecycle';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    for(const a of Object.values(st.agents||{})){
      a.observedSocialBids=[];
      delete a.pendingInteraction;
    }
    return st;
  };
  W.SOCIAL_BID_SCHEMA_VERSION=VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.bidId='Social Bid';
    W.DATA_ZH.bidKind='Bid 類型';
    W.DATA_ZH.bidFrom='Bid 發起者';
    W.DATA_ZH.bidTo='Bid 對象';
    W.DATA_ZH.perceivedByTarget='目標是否感知';
    W.DATA_ZH.responseToBid='回應 Bid';
    W.DATA_ZH.visibility='可見性';
    W.DATA_ZH.owner='Private Owner';
  }
})();
