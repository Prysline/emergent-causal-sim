(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('action-schema-v1120.js requires world.js initial-state pipeline.');
  const VERSION='11.12.0-action-terminology';
  W.registerInitialStateInitializer('action.schema',(st)=>{
    
    return st;
  },100);
  W.ACTION_SCHEMA_VERSION=VERSION;
})();
