(() => {
  const W=window.SimWorld;
  if(!W?.registerInitialStateInitializer)throw new Error('release.js requires world.js initial-state pipeline.');
  const VERSION='11.80.1-post-pickup-posture-recovery';

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('release.version',(st)=>{
    st.version=VERSION;
    return st;
  },0);

  window.SimRelease=Object.freeze({VERSION});
})();