(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.12.4-soft-reconsideration';
  const baseCreateInitialState=W.createInitialState;

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    return st;
  };
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
