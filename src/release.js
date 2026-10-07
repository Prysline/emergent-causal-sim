(() => {
  const W=window.SimWorld;
  if(!W?.registerInitialStateInitializer)throw new Error('release.js requires world.js initial-state pipeline.');
  const VERSION='11.50.0-agent-turn-execution';

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('release.version',(st)=>{
    st.version=VERSION;
    return st;
  },0);

  window.SimRelease=Object.freeze({VERSION});
})();
