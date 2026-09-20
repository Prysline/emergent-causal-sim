(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('human-social-response-schema-v1133a.js requires world.js initial-state pipeline.');
  const VERSION='11.13.3a-human-social-response';
  W.registerInitialStateInitializer('humanSocialResponse.schema',(st)=>{
    
    return st;
  },1100);
  W.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION=VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.talkOfferId='聊天邀請';
    W.DATA_ZH.talkResponse='聊天回應';
    W.DATA_ZH.observedResponderActionKind='觀察到的對方行動';
  }
})();
