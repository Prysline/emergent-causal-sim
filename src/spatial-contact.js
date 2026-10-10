(() => {
  const W=window.SimWorld,SP=window.SimSpatial;if(!W||!SP?.normalizeNode)return;
  if(!W.registerInitialStateInitializer)throw new Error('spatial-contact.js requires world.js initial-state pipeline.');
  const VERSION='11.32.0-contact-slot-corner';

  function mergeInteractions(container,defs){
    if(!container)return;
    container.interactions={...(container.interactions||{}),...defs};
  }

  function installSupportedContactDefs(st){
    const C=st.containers||{};

    // A supported object's exact tabletop cell, not the whole support furniture,
    // defines reach for the affordances currently exercised by the simulation.
    // Pickup geometry is support-derived by Spatial and is intentionally not
    // authored or injected by object type here.
    mergeInteractions(C.mealTray,{
      serve:{mode:'reach'},
      eatFrom:{mode:'reach'},
      deposit:{mode:'reach'},
      receive:{mode:'reach'}
    });

    for(const id of ['plateA','plateB'])mergeInteractions(C[id],{
      eatFrom:{mode:'reach'}
    });

    for(const id of ['cupA','cupB','alcoholBottle'])mergeInteractions(C[id],{
      drinkFrom:{mode:'reach'},
      fill:{mode:'reach'}
    });

    return st;
  }
  W.registerInitialStateInitializer('contact.schema',(st)=>{installSupportedContactDefs(st);},30);
  Object.assign(SP,{CONTACT_VERSION:VERSION,installSupportedContactDefs});
})();