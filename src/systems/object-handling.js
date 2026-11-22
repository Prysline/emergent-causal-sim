(() => {
  const VERSION='object-handling-v4-storage-volume',S=window.SimObjectStorageVolume;
  if(S?.VERSION!=='object-storage-volume-v1')throw new Error('Object Handling requires canonical Storage Volume.');
  const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;

  function resolveObject(st,idOrObject){
    return typeof idOrObject==='string'?st?.objects?.[idOrObject]||null:idOrObject||null;
  }
  function handlingForObject(object){
    const handling=object?.handling,geometry=handling?.carryGeometry;
    if(!handling||!geometry||!['width','height','length'].every(axis=>positive(geometry[axis]))||!Number.isInteger(handling.handsRequired)||handling.handsRequired<0){
      throw new Error('Portable Object '+String(object?.id||'?')+' is missing a valid physical handling contract.');
    }
    return handling;
  }
  // Child-side containedBy remains the sole canonical ordinary-Object inventory relation.
  function containedObjects(st,containerId){return Object.values(st?.objects||{}).filter(item=>item.containedBy===containerId);}
  function cargoMassKg(item){
    // Fully edible Meal cargo mass is derived from the same canonical grams consumed by eat.
    const F=window.SimFood;
    const mass=F?.hasMeal(item)?F.remainingGrams(item)/1000:item?.handling?.massKg;
    if(!Number.isFinite(mass)||mass<=0)throw new Error('Contained Object '+String(item?.id||'?')+' requires positive canonical cargo mass.');
    if(item.resourceContainer===true||item.objectContainment===true)throw new Error('Nested / Resource Object cargo is not supported in movable containment v1.');
    return mass;
  }
  function objectStorageStatus(st,idOrObject){return S.storageStatus(st,idOrObject);}
  function objectStorageLegality(st,containerId,childId){return S.storageLegality(st,containerId,childId);}
  function handCapacity(agent){
    const value=agent?.physical?.manipulation?.handCapacity;
    return Number.isInteger(value)&&value>=0?value:0;
  }
  function canHoldObject(st,agent,idOrObject){
    const object=resolveObject(st,idOrObject);
    if(!object?.portable)return false;
    return handCapacity(agent)>=handlingForObject(object).handsRequired;
  }
  function heldObject(st,agent){
    return agent?.held?st?.objects?.[agent.held]||null:null;
  }
  function getCarriedObjectHandlingProfile(st,agent){
    const object=heldObject(st,agent);if(!object)return null;
    const handling=handlingForObject(object),geometry=handling.carryGeometry;
    return Object.freeze({
      objectId:object.id,
      carryGeometry:{width:Number(geometry.width),height:Number(geometry.height),length:Number(geometry.length)},
      handsRequired:handling.handsRequired
    });
  }
  function availableSupportHands(st,agent){
    const carried=getCarriedObjectHandlingProfile(st,agent);
    return Math.max(0,handCapacity(agent)-(carried?.handsRequired||0));
  }

  window.SimObjectHandling=Object.freeze({
    VERSION,resolveObject,handlingForObject,containedObjects,cargoMassKg,objectStorageStatus,objectStorageLegality,handCapacity,canHoldObject,heldObject,getCarriedObjectHandlingProfile,availableSupportHands
  });
})();
