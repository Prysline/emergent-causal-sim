(() => {
  const W=window.SimWorld;
  if(!W?.RESOURCE_TYPES)throw new Error('systems/resources.js requires world.js.');
  const VERSION='11.37.0-carried-container-feasibility';
  const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;

  function resourceLoad(resourceId,amount){
    return Math.max(0,Number(amount)||0)*(W.RESOURCE_TYPES[resourceId]?.loadPerUnit||0);
  }
  function resolveContainer(st,idOrObject){
    return typeof idOrObject==='string'?st?.containers?.[idOrObject]||null:idOrObject||null;
  }
  function containerLoad(st,idOrObject){
    const container=resolveContainer(st,idOrObject);
    if(!container)return 0;
    return Math.max(0,Number(container.emptyLoad)||0)+Object.entries(container.contents||{}).reduce((sum,[resourceId,amount])=>sum+resourceLoad(resourceId,amount),0);
  }
  function heldContainer(st,agent){
    return agent?.held?st?.containers?.[agent.held]||null:null;
  }
  function handlingFor(container){
    const handling=container?.handling,geometry=handling?.carryGeometry;
    if(!handling||!geometry||!['width','height','length'].every(axis=>positive(geometry[axis]))||!Number.isInteger(handling.handsRequired)||handling.handsRequired<0){
      throw new Error('Held Container '+String(container?.id||'?')+' is missing a valid handling contract.');
    }
    return handling;
  }
  function handCapacity(agent){
    const value=agent?.physical?.manipulation?.handCapacity;
    return Number.isInteger(value)&&value>=0?value:0;
  }
  function canHoldContainer(st,agent,idOrObject){
    const container=resolveContainer(st,idOrObject);
    if(!container?.portable)return false;
    return handCapacity(agent)>=handlingFor(container).handsRequired;
  }
  function getCarriedHandlingProfile(st,agent){
    const container=heldContainer(st,agent);
    if(!container)return null;
    const handling=handlingFor(container),geometry=handling.carryGeometry;
    return {
      containerId:container.id,
      carryGeometry:{width:Number(geometry.width),height:Number(geometry.height),length:Number(geometry.length)},
      handsRequired:handling.handsRequired,
      effectiveCarryLoad:containerLoad(st,container)
    };
  }
  function effectiveCarryLoad(st,agent){
    return agent?.held?containerLoad(st,agent.held):0;
  }
  function availableSupportHands(st,agent){
    const carried=getCarriedHandlingProfile(st,agent);
    return Math.max(0,handCapacity(agent)-(carried?.handsRequired||0));
  }

  window.SimResources=Object.freeze({
    VERSION,resourceLoad,containerLoad,heldContainer,handCapacity,canHoldContainer,
    getCarriedHandlingProfile,effectiveCarryLoad,availableSupportHands
  });
  W.RESOURCES_RUNTIME_VERSION=VERSION;
})();