(() => {
  const W=window.SimWorld,E=window.SimEngine,V=window.SimValidator,UI=window.SimUI;
  if(!W||!E||!V||!UI)throw new Error('App bootstrap requires World, Engine, Validator, and UI.');
  const PET_SCENARIOS=new Set(['pet-accept','pet-tolerate','pet-avoid']);
  const TALK_SCENARIOS=new Set(['talk-engage','talk-brief','talk-decline','talk-no-response']);
  let started=false;

  function assertReady(){
    if(!W.isInitialStateRegistryFinalized?.())throw new Error('App bootstrap requires finalized initial-state registry.');
    if(!E.isRuntimeHookRegistryFinalized?.())throw new Error('App bootstrap requires finalized runtime-hook registry.');
    if(!V.isValidationRegistryFinalized?.())throw new Error('App bootstrap requires finalized validation registry.');
    if(typeof UI.start!=='function')throw new Error('App bootstrap requires SimUI.start().');
  }
  function requestedScenario(){
    try{return new URLSearchParams(window.location?.search||'').get('scenario')||'';}
    catch{return '';}
  }
  function startRuntime(){
    const scenario=requestedScenario();
    if(PET_SCENARIOS.has(scenario)){
      if(typeof E.preparePetResponseScenario!=='function')throw new Error('App bootstrap requires pet-response scenario preparation.');
      return E.preparePetResponseScenario(scenario);
    }
    if(TALK_SCENARIOS.has(scenario)){
      if(typeof E.prepareHumanTalkScenario!=='function')throw new Error('App bootstrap requires human-talk scenario preparation.');
      return E.prepareHumanTalkScenario(scenario);
    }
    return E.reset();
  }
  function start(){
    if(started)return E.getState();
    assertReady();
    const state=startRuntime();
    UI.start();
    window.SimEditorPreviewBridge?.startUI?.();
    started=true;
    return state;
  }

  window.SimApp=Object.freeze({
    APP_BOOTSTRAP_VERSION:'app-bootstrap-1',
    start,
    isStarted:()=>started
  });
  start();
})();
