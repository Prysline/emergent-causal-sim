(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.12.3-replan-preemption';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
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
