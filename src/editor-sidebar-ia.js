(() => {
  if(typeof document==='undefined')return;

  const scenePane=document.querySelector('[data-sidebar-section="scene"]');
  const addPane=document.querySelector('[data-sidebar-section="add"]');
  const furnitureHeading=addPane?.querySelector('[data-add-category="furniture"] h3');
  const ordinaryHost=document.getElementById('ordinaryObjectCatalogHost');
  const ordinaryPalette=document.querySelector('[data-ordinary-object-authoring]');
  if(!scenePane||!addPane||!furnitureHeading||!ordinaryHost||!ordinaryPalette){
    throw new Error('World Editor Scene / Add sidebar IA requires Scene, Add, and supported catalog hosts.');
  }
  if(!scenePane.contains(document.getElementById('sceneList'))){
    throw new Error('World Editor Scene pane must own the canonical instance projection list.');
  }
  if(!addPane.contains(document.getElementById('furnitureCatalog'))){
    throw new Error('World Editor Add pane must own the Furniture definition catalog.');
  }

  furnitureHeading.textContent='家具目錄';
  ordinaryPalette.classList.add('sidebar-add-category');
  ordinaryPalette.dataset.addCategory='ordinary-object';
  ordinaryHost.replaceChildren(ordinaryPalette);
})();
