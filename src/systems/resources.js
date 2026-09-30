(() => {
  const W=window.SimWorld;
  if(!W?.RESOURCE_TYPES)throw new Error('systems/resources.js requires world.js.');
  const VERSION='11.38.1-carried-risk-curve';
  const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;
  const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
  const CONTAINMENT_CONTENTS_FACTOR=Object.freeze({open:1,covered:.25,sealed:0});
  const RESOURCE_PHASE_CONTENTS_FACTOR=Object.freeze({liquid:1,solid:.45});
  const RETENTION_DIMENSIONS=Object.freeze(['tilt','impact','oscillation']);
  const LOW_RISK_RETENTION_SEVERITY=.01;
  const HIGH_RISK_RETENTION_SEVERITY=.80;

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
  function fillRatio(st,idOrObject){
    const container=resolveContainer(st,idOrObject),capacity=Math.max(0,Number(container?.capacity)||0);
    if(!container||capacity<=0)return 0;
    const used=Object.values(container.contents||{}).reduce((sum,amount)=>sum+Math.max(0,Number(amount)||0),0);
    return clamp01(used/capacity);
  }
  function handlingRiskContract(container){
    const handling=container?.handling,retention=handling?.contentRetention;
    if(!handling||!Object.prototype.hasOwnProperty.call(CONTAINMENT_CONTENTS_FACTOR,handling.containment)||!retention)throw new Error('Held Container '+String(container?.id||'?')+' is missing a valid handling-risk contract.');
    for(const dimension of RETENTION_DIMENSIONS){
      const band=retention[dimension],low=Number(band?.lowRiskExposure),high=Number(band?.highRiskExposure);
      if(!Number.isFinite(low)||low<=0||!Number.isFinite(high)||high<=low)throw new Error('Held Container '+String(container?.id||'?')+' has invalid '+dimension+' contentRetention calibration anchors.');
    }
    return handling;
  }
  function retentionSeverity(exposureValue,band){
    const value=Math.max(0,Number(exposureValue)||0),low=Number(band.lowRiskExposure),high=Number(band.highRiskExposure);
    if(value<=0)return 0;
    if(value<=low)return LOW_RISK_RETENTION_SEVERITY*(value/low);
    if(value<=high){
      const t=(value-low)/(high-low);
      return LOW_RISK_RETENTION_SEVERITY+(HIGH_RISK_RETENTION_SEVERITY-LOW_RISK_RETENTION_SEVERITY)*t;
    }
    const excess=(value-high)/(high-low);
    return HIGH_RISK_RETENTION_SEVERITY+(1-HIGH_RISK_RETENTION_SEVERITY)*(excess/(1+excess));
  }
  function contentsPhaseFactor(container){
    let total=0,weighted=0;
    for(const [resourceId,raw] of Object.entries(container?.contents||{})){
      const amount=Math.max(0,Number(raw)||0);if(amount<=0)continue;
      total+=amount;weighted+=amount*(RESOURCE_PHASE_CONTENTS_FACTOR[W.RESOURCE_TYPES[resourceId]?.phase]??.65);
    }
    return total>0?weighted/total:0;
  }
  function handlingRiskForContainer(st,idOrObject,exposure={}){
    const container=resolveContainer(st,idOrObject);if(!container)return {contentsLoss:0,containerDrop:0};
    const handling=handlingRiskContract(container),fill=fillRatio(st,container),contentsTotal=Object.values(container.contents||{}).reduce((sum,amount)=>sum+Math.max(0,Number(amount)||0),0);
    const retentionSeverityValue=Math.max(...RETENTION_DIMENSIONS.map(dimension=>retentionSeverity(exposure[dimension],handling.contentRetention[dimension])));
    const contentsLoss=contentsTotal<=0?0:clamp01(retentionSeverityValue*CONTAINMENT_CONTENTS_FACTOR[handling.containment]*fill*contentsPhaseFactor(container));
    const impact=Math.max(0,Number(exposure.impact)||0),tilt=Math.max(0,Number(exposure.tilt)||0),oscillation=Math.max(0,Number(exposure.oscillation)||0),loadFactor=Math.min(1,containerLoad(st,container)/12);
    const containerDrop=clamp01((impact*.62+tilt*.18+oscillation*.12)*(.75+.25*loadFactor));
    return {contentsLoss,containerDrop};
  }
  function getCarriedHandlingRisk(st,agent,exposure){
    const container=heldContainer(st,agent);return container?handlingRiskForContainer(st,container,exposure):{contentsLoss:0,containerDrop:0};
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
    getCarriedHandlingProfile,fillRatio,handlingRiskForContainer,getCarriedHandlingRisk,effectiveCarryLoad,availableSupportHands
  });
  W.RESOURCES_RUNTIME_VERSION=VERSION;
})();