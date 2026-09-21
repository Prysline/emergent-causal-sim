(() => {
  const R=window.SimRelease,UI=window.SimUI;
  if(!R||!UI)return;
  const VERSION=R.VERSION;
  if(!VERSION)throw new Error('UI labels require the canonical release version.');
  const INTERACTION_LABELS=Object.freeze({
    talk:'聊天',
    pet:'撫摸互動',
    socialAffection:'親近互動'
  });
  Object.assign(UI,{
    PRESENTATION_VERSION:VERSION,
    INTERACTION_LABELS,
    interactionLabel:(kind)=>INTERACTION_LABELS[kind]||kind||'互動'
  });
})();
