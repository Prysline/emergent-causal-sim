(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('systems/social/state.js requires world.js initial-state pipeline.');

  const SOCIAL_BID_VERSION='11.12.2-social-bid-lifecycle';
  W.registerInitialStateInitializer('socialBid.schema',(st)=>{
    for(const a of Object.values(st.agents||{}))a.observedSocialBids=[];
    return st;
  },300);
  W.SOCIAL_BID_SCHEMA_VERSION=SOCIAL_BID_VERSION;
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

  const ANIMAL_RESPONSE_VERSION='11.13.2a-social-response-agency';
  W.registerInitialStateInitializer('socialResponse.schema',(st)=>st,900);
  W.SOCIAL_RESPONSE_SCHEMA_VERSION=ANIMAL_RESPONSE_VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.petOfferId='撫摸邀請';
    W.DATA_ZH.petResponse='撫摸回應';
  }

  const HUMAN_RESPONSE_VERSION='11.13.3a-human-social-response';
  W.registerInitialStateInitializer('humanSocialResponse.schema',(st)=>st,1100);
  W.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION=HUMAN_RESPONSE_VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.talkOfferId='聊天邀請';
    W.DATA_ZH.talkResponse='聊天回應';
    W.DATA_ZH.observedResponderActionKind='觀察到的對方行動';
  }
})();
