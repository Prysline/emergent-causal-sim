(() => {
  const E=window.SimEngine,W=window.SimWorld;if(!E||!W)return;
  const VERSION=W.ACTION_SCHEMA_VERSION||'11.12.0-action-terminology';
  function actionKind(action){return action?.kind??null;}
  Object.assign(E,{ACTION_SCHEMA_VERSION:VERSION,actionKind});
})();
