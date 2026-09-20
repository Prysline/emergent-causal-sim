(() => {
  const W=window.SimWorld,E=window.SimEngine,V=window.SimValidator,UI=window.SimUI;
  if(!W||!E||!V||!UI)throw new Error('App bootstrap requires World, Engine, Validator, and UI.');
  const PET_SCENARIOS=new Set(['pet-accept','pet-tolerate','pet-avoid']);
  const TALK_SCENARIOS=new Set(['talk-engage','talk-brief','talk-decline','talk-no-response']);
  let started=false,startupSourceConfigured=false;

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
  function configureStartupSource(){
    if(startupSourceConfigured)return;
    const bridge=window.SimEditorPreviewBridge;
    const preview=bridge?.getActivePreview?.()||{requested:false,ok:true,authoring:null,fingerprint:null,issues:[]};
    if(preview.requested&&!preview.ok){
      throw new Error('Editor Preview bootstrap failed: '+(preview.issues||[]).map(item=>item.code||item.message).join(', '));
    }
    if(preview.requested){
      if(typeof E.configureResetStateSource!=='function')throw new Error('App bootstrap requires Engine reset-state source configuration.');
      if(typeof W.createInitialStateFromAuthoring!=='function')throw new Error('App bootstrap requires World authoring state factory.');
      const snapshot=preview.authoring==null?null:JSON.parse(JSON.stringify(preview.authoring));
      E.configureResetStateSource('editor-preview',seed=>W.createInitialStateFromAuthoring(snapshot,seed));
      E.PREVIEW_MODE=true;
      E.PREVIEW_FINGERPRINT=preview.fingerprint||null;
    }
    startupSourceConfigured=true;
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
    configureStartupSource();
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
