(() => {
  const P=window.SimPerception,SP=window.SimSpatial;
  if(!P?.projectRuntimeVisualOpacity||!P?.derivePhysicalSightSamples||!P?.classifyStaticVisualLos||!SP?.objectLocationState||!SP?.objectPosition)throw new Error('Tidying target visibility requires canonical Spatial and Visual composition.');
  const VERSION='perception-visual-availability-v3-object-point';
  const freeze=value=>{if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))freeze(child);return value;};
  function classifyObjectPointVisualAvailability(st,observer,object){
    if(!Number.isInteger(st?.tick)||st.tick<0||!observer?.id||!object?.id)throw new Error('Point availability requires canonical state, observer and Object.');
    const kind=SP.objectLocationState(st,object.id);
    if(!['free','supported'].includes(kind))return freeze({visualAvailable:false,unavailableReason:'object-not-exposed',observedTick:st.tick});
    const location=SP.objectPosition(st,object.id),layer=location?.z??0;
    if(!location||!Number.isFinite(location.x)||!Number.isFinite(location.y)||!Number.isInteger(layer))throw new Error('Object point target requires a canonical position and layer.');
    const normalized=observer.position?.z===undefined?{...observer,position:{...observer.position,z:observer.position?.z??0}}:observer;
    const observerSight=P.derivePhysicalSightSamples(normalized);
    if(observerSight.layerZ!==layer)return freeze({visualAvailable:false,unavailableReason:'different-layer',observedTick:st.tick});
    const point={x:location.x,y:location.y},snap=P.captureVisualOrientationSnapshot(st,observer),orientation=P.classifyVisualBearing(snap,observerSight.observerOrigin,point),range=P.classifyVisualRange(observerSight.observerOrigin,point),los=P.classifyStaticVisualLos(observerSight.observerOrigin,point,P.projectRuntimeVisualOpacity(st,layer));
    const visualAvailable=orientation.visualClass!=='unavailable'&&range.rangeAvailable&&los.losAvailable;
    return freeze({visualAvailable,unavailableReason:orientation.visualClass==='unavailable'?'outside-visual-field':!range.rangeAvailable?range.unavailableReason:!los.losAvailable?los.unavailableReason:null,observedTick:st.tick,target:{kind:'object',id:object.id,locationState:kind,position:{...location},supportId:object.supportId||null},orientation,range,los,observerSight});
  }
  Object.assign(P,{VISUAL_AVAILABILITY_VERSION:VERSION,classifyObjectPointVisualAvailability});
})();
