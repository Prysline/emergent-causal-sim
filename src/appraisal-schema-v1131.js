(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('appraisal-schema-v1131.js requires world.js initial-state pipeline.');
  const VERSION='11.13.1-event-appraisal';

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('appraisal.schema',(st)=>{
    st.version=VERSION;
    return st;
  },700);
  W.APPRAISAL_SCHEMA_VERSION=VERSION;
})();
