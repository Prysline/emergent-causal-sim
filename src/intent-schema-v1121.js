(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('intent-schema-v1121.js requires world.js initial-state pipeline.');
  const VERSION='11.12.1-active-intent-foundation';
  W.registerInitialStateInitializer('intent.schema',(st)=>{
    
    for(const a of Object.values(st.agents||{}))a.activeIntent=null;
    return st;
  },200);
  W.INTENT_SCHEMA_VERSION=VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.actionKind='Action 類型';
    W.DATA_ZH.intentId='Intent ID';
    W.DATA_ZH.sourceIntentId='來源 Intent';
  }
})();
