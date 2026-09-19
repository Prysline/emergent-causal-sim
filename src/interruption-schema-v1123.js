(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('interruption-schema-v1123.js requires world.js initial-state pipeline.');
  const VERSION='11.12.3-replan-preemption';

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('interruption.schema',(st)=>{
    st.version=VERSION;
    return st;
  },400);
  W.INTERRUPTION_SCHEMA_VERSION=VERSION;
  if(W.DATA_ZH){
    W.DATA_ZH.intentId='Intent ID';
    W.DATA_ZH.intentKind='Intent 類型';
    W.DATA_ZH.priorActionKind='原 Action';
    W.DATA_ZH.nextActionKind='新 Action';
    W.DATA_ZH.emergencyNeed='緊急需求';
    W.DATA_ZH.emergencyValue='緊急值';
    W.DATA_ZH.replanCount='Replan 次數';
  }
})();
