(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('presentation-schema-v1140.js requires world.js initial-state pipeline.');
  const VERSION='11.21.4-editor-playtest-bridge';
  const INTERACTION_LABELS=Object.freeze({
    talk:'聊天',
    pet:'撫摸互動',
    socialAffection:'親近互動'
  });

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('presentation.schema',(st)=>{
    st.version=VERSION;
    return st;
  },1400);
  W.PRESENTATION_SCHEMA_VERSION=VERSION;
  W.INTERACTION_LABELS=INTERACTION_LABELS;
  W.interactionLabel=(kind)=>INTERACTION_LABELS[kind]||kind||'互動';
})();