(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('locomotion-schema-v1190.js requires world.js initial-state pipeline.');
  const VERSION='11.19.0-locomotion-execution-posture';

  const currentReleaseVersion=()=>W.PRESENTATION_SCHEMA_VERSION||VERSION;
  W.VERSION=currentReleaseVersion();
  W.registerInitialStateInitializer('locomotion.schema',(st)=>{
    st.version=currentReleaseVersion();
    for(const a of Object.values(st.agents||{})){
      if(!a.locomotion)a.locomotion={mode:null,phase:'idle'};
    }
    return st;
  },1700);
  W.LOCOMOTION_SCHEMA_VERSION=VERSION;
})();