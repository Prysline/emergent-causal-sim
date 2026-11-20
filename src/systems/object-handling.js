(() => {
  const VERSION='object-handling-v2-movable-containment';
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
    const mass=item?.handling?.massKg;
    if(!Number.isFinite(mass)||mass<=0)throw new Error('Contained Object '+String(item?.id||'?')+' requires positive handling.massKg.');
    if(item.resourceContainer===true||item.objectContainment===true)throw new Error('Nested / Resource Object cargo is not supported in movable containment v1.');
    return mass;
  }
  function objectStorageStatus(st,idOrObject){
    const container=resolveObject(st,idOrObject),storage=container?.objectStorage;
    if(container?.objectContainment!==true||container.portable!==true||!storage||!Number.isInteger(storage.maxItems)||storage.maxItems<=0||!Number.isFinite(storage.maxMassKg)||storage.maxMassKg<=0)throw new Error('Movable Object container '+String(container?.id||'?')+' requires positive maxItems and maxMassKg.');
    const items=containedObjects(st,container.id);
    const massKg=items.reduce((sum,item)=>sum+cargoMassKg(item),0);
    return {items,count:items.length,massKg,maxItems:storage.maxItems,maxMassKg:storage.maxMassKg,withinCapacity:items.length<=storage.maxItems&&massKg<=storage.maxMassKg+1e-9};
  }
  function objectStorageLegality(st,containerId,childId){
    const container=resolveObject(st,containerId),child=resolveObject(st,childId);
    if(!container||!child||container.id===child.id||container.objectContainment!==true||container.portable!==true||child.resourceContainer===true||child.objectContainment===true)return false;
    if(child.containedBy&&child.containedBy!==container.id)return false;
    const status=objectStorageStatus(st,container);
    if(!status.withinCapacity)return false;
    const already=status.items.some(item=>item.id===child.id);
    const mass=cargoMassKg(child);
    return status.count+(already?0:1)<=status.maxItems&&status.massKg+(already?0:mass)<=status.maxMassKg+1e-9;
  }
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
