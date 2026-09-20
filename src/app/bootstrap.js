(() => {
  const W=window.SimWorld,E=window.SimEngine,V=window.SimValidator,UI=window.SimUI;
  if(!W||!E||!V||!UI)throw new Error('App bootstrap requires World, Engine, Validator, and UI.');
  let started=false;

  function assertReady(){
    if(!W.isInitialStateRegistryFinalized?.())throw new Error('App bootstrap requires finalized initial-state registry.');
    if(!E.isRuntimeHookRegistryFinalized?.())throw new Error('App bootstrap requires finalized runtime-hook registry.');
    if(!V.isValidationRegistryFinalized?.())throw new Error('App bootstrap requires finalized validation registry.');
    if(typeof UI.start!=='function')throw new Error('App bootstrap requires SimUI.start().');
  }
  function start(){
    if(started)return E.getState();
    assertReady();
    const state=E.reset();
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
