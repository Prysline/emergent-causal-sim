(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('deliberation-schema-v1124.js requires world.js initial-state pipeline.');
  const VERSION='11.12.4-soft-reconsideration';
  W.registerInitialStateInitializer('deliberation.schema',(st)=>{
    
    return st;
  },500);
  W.DELIBERATION_SCHEMA_VERSION=VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.currentUtility='目前意圖效用';
    W.DATA_ZH.challengerUtility='挑戰意圖效用';
    W.DATA_ZH.switchMargin='切換門檻';
    W.DATA_ZH.commitmentCost='承諾成本';
    W.DATA_ZH.switchThreshold='實際切換門檻';
    W.DATA_ZH.challengerIntentKind='挑戰意圖';
    W.DATA_ZH.priorIntentId='原 Intent ID';
  }
})();
