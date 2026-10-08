(() => {
  const P=window.SimPerception;
  if(!P?.VISUAL_ORIENTATION_VERSION||!P?.VISUAL_RANGE_VERSION||!P?.VISUAL_LOS_VERSION||!P?.VISUAL_SIGHT_SAMPLES_VERSION){
    throw new Error('systems/perception/visual-availability.js requires visual orientation, range, LOS, and sight-sample foundations.');
  }

  const VERSION='perception-visual-availability-v1';

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }

  function classifyVisualSensoryAvailability(st,observer,target,opacityProjection){
    if(!st||!Number.isInteger(st.tick)||st.tick<0)throw new Error('Visual sensory availability requires a non-negative integer state tick.');
    if(!observer?.id)throw new Error('Visual sensory availability requires an observer Agent id.');
    if(!target)throw new Error('Visual sensory availability requires a target Agent.');
    if(!Array.isArray(opacityProjection))throw new Error('Visual sensory availability requires an explicit visual opacity projection.');

    const observerSight=P.derivePhysicalSightSamples(observer);
    const targetSight=P.derivePhysicalSightSamples(target);
    if(observerSight.layerZ!==targetSight.layerZ){
      throw new Error(`Core Visual sensory availability does not support cross-layer sight (${observerSight.layerZ} -> ${targetSight.layerZ}).`);
    }
    if(targetSight.targetSamples.length!==1){
      throw new Error(`Core Visual sensory availability requires exactly one canonical target sight sample; received ${targetSight.targetSamples.length}.`);
    }

    const targetSample=targetSight.targetSamples[0];
    const orientationSnapshot=P.captureVisualOrientationSnapshot(st,observer);
    const orientation=P.classifyVisualBearing(orientationSnapshot,observerSight.observerOrigin,targetSample.position);
    const range=P.classifyVisualRange(observerSight.observerOrigin,targetSample.position);
    const los=P.classifyStaticVisualLos(observerSight.observerOrigin,targetSample.position,opacityProjection);
    const orientationAvailable=orientation.visualClass!=='unavailable';
    const visualAvailable=orientationAvailable&&range.rangeAvailable&&los.losAvailable;
    const unavailableReason=orientationAvailable
      ?(range.rangeAvailable?(los.losAvailable?null:los.unavailableReason):range.unavailableReason)
      :'outside-visual-field';

    return deepFreeze({
      visualAvailable,
      unavailableReason,
      sightSamples:{observer:observerSight,target:targetSight},
      orientation,
      range,
      los
    });
  }

  if(P.VISUAL_AVAILABILITY_VERSION)throw new Error('Visual sensory availability composition is already registered.');
  Object.assign(P,{
    VISUAL_AVAILABILITY_VERSION:VERSION,
    classifyVisualSensoryAvailability
  });
})();
