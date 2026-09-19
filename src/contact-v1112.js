(() => {
  const W=window.SimWorld,SP=window.SimSpatial;if(!W||!SP?.normalizeNode)return;
  if(!W.registerInitialStateInitializer)throw new Error('contact-v1112.js requires world.js initial-state pipeline.');
  const VERSION='11.11.2-supported-contact-audit';
  const baseInit=SP.init;

  function mergeInteractions(container,defs){
    if(!container)return;
    container.interactions={...(container.interactions||{}),...defs};
  }

  function installSupportedContactDefs(st){
    const C=st.containers||{};

    // A supported object's exact tabletop cell, not the whole support furniture,
    // defines reach for the affordances currently exercised by the simulation.
    mergeInteractions(C.mealTray,{
      serve:{mode:'reach'},
      eatFrom:{mode:'reach'},
      deposit:{mode:'reach'},
      receive:{mode:'reach'}
    });

    for(const id of ['plateA','plateB'])mergeInteractions(C[id],{
      pickup:{mode:'reach'},
      eatFrom:{mode:'reach'}
    });

    for(const id of ['cupA','cupB','alcoholBottle'])mergeInteractions(C[id],{
      pickup:{mode:'reach'},
      drinkFrom:{mode:'reach'},
      fill:{mode:'reach'}
    });

    return st;
  }

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('contact.schema',(st)=>{
    st.version=VERSION;
    installSupportedContactDefs(st);
  },30);
  SP.init=(st)=>{const result=baseInit(st);installSupportedContactDefs(st);return result;};
  Object.assign(SP,{CONTACT_VERSION:VERSION,installSupportedContactDefs});
})();
