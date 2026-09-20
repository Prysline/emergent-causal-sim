(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('social-bid-schema-v1122.js requires world.js initial-state pipeline.');
  const VERSION='11.12.2-social-bid-lifecycle';
  W.registerInitialStateInitializer('socialBid.schema',(st)=>{
    
    for(const a of Object.values(st.agents||{})){
      a.observedSocialBids=[];
    }
    return st;
  },300);
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
