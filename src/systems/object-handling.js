(() => {
  const VERSION='object-handling-v1';
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
    VERSION,resolveObject,handlingForObject,handCapacity,canHoldObject,heldObject,getCarriedObjectHandlingProfile,availableSupportHands
  });
})();
