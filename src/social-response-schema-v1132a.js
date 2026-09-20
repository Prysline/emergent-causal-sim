(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('social-response-schema-v1132a.js requires world.js initial-state pipeline.');
  const VERSION='11.13.2a-social-response-agency';
  W.registerInitialStateInitializer('socialResponse.schema',(st)=>{
    
    return st;
  },900);
  W.SOCIAL_RESPONSE_SCHEMA_VERSION=VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.petOfferId='撫摸邀請';
    W.DATA_ZH.petResponse='撫摸回應';
  }
})();
