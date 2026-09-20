(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('systems/appraisal/state.js requires world.js initial-state pipeline.');
  const VERSION='11.13.1-event-appraisal';
  W.registerInitialStateInitializer('appraisal.schema',(st)=>{
    
    return st;
  },700);
  W.APPRAISAL_SCHEMA_VERSION=VERSION;
})();
