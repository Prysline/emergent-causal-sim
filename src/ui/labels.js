(() => {
  const R=window.SimRelease,UI=window.SimUI;
  if(!R||!UI)return;
  const VERSION=R.VERSION;
  if(!VERSION)throw new Error('UI labels require the canonical release version.');
  const NEED_LABELS=Object.freeze({
    hunger:'飢餓',thirst:'口渴',fatigue:'疲勞',sleepNeed:'睡意',social:'社交',groomingNeed:'整理需求',
    stimulation:'刺激需求',relaxation:'放鬆需求'
  });
  const INTERACTION_LABELS=Object.freeze({
    talk:'聊天',
    pet:'撫摸互動',
    socialAffection:'親近互動'
  });
  Object.assign(UI,{
    PRESENTATION_VERSION:VERSION,
    NEED_LABELS,
    needLabel:(key)=>NEED_LABELS[key]||key||'需求',
    INTERACTION_LABELS,
    interactionLabel:(kind)=>INTERACTION_LABELS[kind]||kind||'互動'
  });
})();
