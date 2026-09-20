(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('systems/intent/state.js requires world.js initial-state pipeline.');

  const INTENT_VERSION='11.12.1-active-intent-foundation';
  W.registerInitialStateInitializer('intent.schema',(st)=>{
    
    for(const a of Object.values(st.agents||{}))a.activeIntent=null;
    return st;
  },200);
  W.INTENT_SCHEMA_VERSION=INTENT_VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.actionKind='Action 類型';
    W.DATA_ZH.intentId='Intent ID';
    W.DATA_ZH.sourceIntentId='來源 Intent';
  }

  const INTERRUPTION_VERSION='11.12.3-replan-preemption';
  W.registerInitialStateInitializer('interruption.schema',(st)=>{
    
    return st;
  },400);
  W.INTERRUPTION_SCHEMA_VERSION=INTERRUPTION_VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.intentId='Intent ID';
    W.DATA_ZH.intentKind='Intent 類型';
    W.DATA_ZH.priorActionKind='原 Action';
    W.DATA_ZH.nextActionKind='新 Action';
    W.DATA_ZH.emergencyNeed='緊急需求';
    W.DATA_ZH.emergencyValue='緊急值';
    W.DATA_ZH.replanCount='Replan 次數';
  }

  const DELIBERATION_VERSION='11.12.4-soft-reconsideration';
  W.registerInitialStateInitializer('deliberation.schema',(st)=>{
    
    return st;
  },500);
  W.DELIBERATION_SCHEMA_VERSION=DELIBERATION_VERSION;
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
