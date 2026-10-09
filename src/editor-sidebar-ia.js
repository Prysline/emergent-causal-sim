(() => {
  if(typeof document==='undefined')return;

  const scenePane=document.querySelector('[data-sidebar-section="scene"]');
  const addPane=document.querySelector('[data-sidebar-section="add"]');
  const ordinaryHost=document.getElementById('ordinaryObjectCatalogHost');
  const ordinaryPalette=document.querySelector('[data-ordinary-object-authoring]');
  if(!scenePane||!addPane||!ordinaryHost||!ordinaryPalette){
    throw new Error('World Editor Scene / Add sidebar IA requires Scene, Add, and ordinary-object catalog hosts.');
  }
  if(!scenePane.contains(document.getElementById('sceneList'))){
    throw new Error('World Editor Scene pane must own the canonical instance projection list.');
  }
  if(!addPane.contains(document.getElementById('furnitureCatalog'))){
    throw new Error('World Editor Add pane must own the Furniture definition catalog.');
  }

  ordinaryPalette.classList.add('sidebar-add-category');
  ordinaryHost.replaceChildren(ordinaryPalette);

  for(const link of document.querySelectorAll('[data-sidebar-jump]')){
    link.addEventListener('click',()=>{
      const target=link.dataset.sidebarJump;
      for(const item of document.querySelectorAll('[data-sidebar-jump]'))item.removeAttribute('aria-current');
      link.setAttribute('aria-current',target==='scene'?'location':'page');
    });
  }
})();
