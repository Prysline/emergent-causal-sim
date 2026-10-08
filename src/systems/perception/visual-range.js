(() => {
  const A=window.SimWorldAuthoring,P=window.SimPerception;
  if(!A?.CELL_SIZE_METERS)throw new Error('systems/perception/visual-range.js requires canonical World Authoring cell scale.');
  if(!P?.VISUAL_ORIENTATION_VERSION)throw new Error('systems/perception/visual-range.js requires visual-orientation.js.');

  const VERSION='perception-visual-range-v1';
  const CELL_SIZE_METERS=Number(A.CELL_SIZE_METERS);
  const MAXIMUM_HORIZON_METERS=11;

  function finitePlanarPoint(point,label){
    if(!point||!Number.isFinite(Number(point.x))||!Number.isFinite(Number(point.y)))throw new Error(`${label} requires finite x/y coordinates.`);
    return {x:Number(point.x),y:Number(point.y)};
  }

  function visualDistanceMeters(observerOrigin,targetRepresentativePosition){
    const from=finitePlanarPoint(observerOrigin,'observerOrigin'),to=finitePlanarPoint(targetRepresentativePosition,'targetRepresentativePosition');
    return Math.hypot(to.x-from.x,to.y-from.y)*CELL_SIZE_METERS;
  }

  function visualDistanceAttenuation(distanceMeters){
    const distance=Number(distanceMeters);
    if(!Number.isFinite(distance)||distance<0)throw new Error(`Invalid visual distance: ${String(distanceMeters)}`);
    return Math.exp(-distance/MAXIMUM_HORIZON_METERS);
  }

  function classifyVisualRange(observerOrigin,targetRepresentativePosition){
    const distanceMeters=visualDistanceMeters(observerOrigin,targetRepresentativePosition);
    const rangeAvailable=distanceMeters<=MAXIMUM_HORIZON_METERS;
    return Object.freeze({
      distanceMeters,
      maximumHorizonMeters:MAXIMUM_HORIZON_METERS,
      distanceQuality:rangeAvailable?visualDistanceAttenuation(distanceMeters):0,
      rangeAvailable,
      unavailableReason:rangeAvailable?null:'beyond-maximum-horizon'
    });
  }

  if(P.VISUAL_RANGE_VERSION)throw new Error('Visual range perception foundation is already registered.');
  Object.assign(P,{
    VISUAL_RANGE_VERSION:VERSION,
    VISUAL_CELL_SIZE_METERS:CELL_SIZE_METERS,
    VISUAL_MAXIMUM_HORIZON_METERS:MAXIMUM_HORIZON_METERS,
    visualDistanceMeters,
    visualDistanceAttenuation,
    classifyVisualRange
  });
})();
