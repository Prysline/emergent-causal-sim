(() => {
  // A single physical-volume contract for World Authoring and live runtime.
  const VERSION='object-storage-volume-v1';
  const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
  function physicalVolumeCubicMeters(item){
    const invalid=()=>new Error('Object '+String(item?.id||'?')+' requires canonical physical volume.');
    if(!item||typeof item!=='object')throw invalid();
    if((item.ingredient!==undefined||item.meal!==undefined)&&item.physicalVolumeCubicMeters!==undefined)throw invalid();
    if(item.ingredient!==undefined&&item.meal!==undefined)throw invalid();
    if(item.ingredient!==undefined){
      if(!positive(item.handling?.massKg)||!positive(item.ingredient?.densityKgPerM3))throw invalid();
      return item.handling.massKg/item.ingredient.densityKgPerM3;
    }
    if(item.meal!==undefined){
      if(!Number.isSafeInteger(item.meal?.edibleMassGrams)||item.meal.edibleMassGrams<=0||!positive(item.meal.densityKgPerM3))throw invalid();
      return (item.meal.edibleMassGrams/1000)/item.meal.densityKgPerM3;
    }
    if(!positive(item.physicalVolumeCubicMeters))throw invalid();
    return item.physicalVolumeCubicMeters;
  }
  function physicalMassKg(item){
    if(item?.meal!==undefined)return Number.isSafeInteger(item.meal?.edibleMassGrams)&&item.meal.edibleMassGrams>0?item.meal.edibleMassGrams/1000:null;
    return positive(item?.handling?.massKg)?item.handling.massKg:null;
  }
  function storageOf(container){
    if(container?.objectContainment!==true)throw new Error('Storage target lacks objectContainment: '+String(container?.id||'?'));
    const s=container.objectStorage;
    if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).length!==1||!positive(s.capacityCubicMeters))
      throw new Error('Object Storage '+String(container?.id||'?')+' requires only positive capacityCubicMeters.');
    return s;
  }
  function resolve(st,idOrEntity){
    if(typeof idOrEntity!=='string')return idOrEntity||null;
    const object=st?.objects?.[idOrEntity],furniture=st?.furniture?.[idOrEntity];
    if(object&&furniture)throw new Error('Ambiguous Object Storage id: '+idOrEntity);
    return object||furniture||null;
  }
  const containedObjects=(st,id)=>Object.values(st?.objects||{}).filter(item=>item?.containedBy===id);
  function storageStatus(st,idOrEntity){
    const container=resolve(st,idOrEntity),capacityCubicMeters=storageOf(container).capacityCubicMeters;
    const items=containedObjects(st,container.id),isObject=!!st?.objects?.[container.id];
    if(isObject&&container.portable!==true)throw new Error('Movable Object Storage must be portable.');
    let volumeCubicMeters=0,massKg=0;
    for(const item of items){
      if(item.resourceContainer===true||item.objectContainment===true)throw new Error('Nested/Resource Object cargo unsupported: '+item.id);
      volumeCubicMeters+=physicalVolumeCubicMeters(item);
      const mass=physicalMassKg(item);
      if(isObject&&mass===null)throw new Error('Contained Object '+item.id+' requires positive physical mass.');
      massKg+=mass||0;
    }
    const tolerance=Math.max(1e-12,capacityCubicMeters*1e-9);
    return {items,count:items.length,massKg,volumeCubicMeters,capacityCubicMeters,
      freeVolumeCubicMeters:Math.max(0,capacityCubicMeters-volumeCubicMeters),
      withinCapacity:volumeCubicMeters<=capacityCubicMeters+tolerance};
  }
  function storageLegality(st,containerId,childId){
    const container=resolve(st,containerId),child=st?.objects?.[childId];
    if(!container||!child||container.id===child.id||container.objectContainment!==true
      ||child.resourceContainer===true||child.objectContainment===true)return false;
    if(child.containedBy&&child.containedBy!==container.id)return false;
    const isObject=!!st?.objects?.[container.id];
    if(isObject&&(container.portable!==true||physicalMassKg(child)===null))return false;
    const status=storageStatus(st,container);
    if(!status.withinCapacity)return false;
    if(status.items.some(item=>item.id===child.id))return true;
    return status.volumeCubicMeters+physicalVolumeCubicMeters(child)
      <=status.capacityCubicMeters+Math.max(1e-12,status.capacityCubicMeters*1e-9);
  }
  window.SimObjectStorageVolume=Object.freeze({VERSION,positive,physicalVolumeCubicMeters,physicalMassKg,
    storageOf,resolve,containedObjects,storageStatus,storageLegality});
})();
