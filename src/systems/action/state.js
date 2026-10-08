(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('systems/action/state.js requires world.js initial-state pipeline.');
  const VERSION='11.51.0-activity-concurrency';
  W.registerInitialStateInitializer('action.schema',(st)=>{
    
    return st;
  },100);
  W.ACTION_SCHEMA_VERSION=VERSION;
})();
