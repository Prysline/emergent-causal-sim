(() => {
  const A=window.SimWorldAuthoring,P=window.SimPerception;
  if(!A?.CELL_SIZE_METERS)throw new Error('systems/perception/visual-los.js requires canonical World Authoring geometry scale.');
  if(!P?.VISUAL_RANGE_VERSION)throw new Error('systems/perception/visual-los.js requires visual-range.js.');

  const VERSION='perception-visual-los-v1';
  const CELL_SIZE_METERS=Number(A.CELL_SIZE_METERS);
  const EPS=1e-9;
  const BOUNDARY_ID_PATTERN=/^([vh]):(-?\d+),(-?\d+)$/;

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }

  function finitePlanarPoint(point,label){
    if(!point||!Number.isFinite(Number(point.x))||!Number.isFinite(Number(point.y)))throw new Error(`${label} requires finite x/y coordinates.`);
    return {x:Number(point.x)*CELL_SIZE_METERS,y:Number(point.y)*CELL_SIZE_METERS};
  }

  function authoredWallOccluder(layerZ,boundaryId,boundary){
    if(boundary?.kind!=='wall')return null;
    const match=BOUNDARY_ID_PATTERN.exec(String(boundaryId||''));
    if(!match)throw new Error(`Invalid authored wall boundary geometry: ${String(boundaryId)}`);
    const axis=match[1],x=Number(match[2]),y=Number(match[3]);
    const geometry=axis==='v'
      ?{kind:'vertical-segment',axis:'x',coordinate:(x-.5)*CELL_SIZE_METERS,spanStart:(y-.5)*CELL_SIZE_METERS,spanEnd:(y+.5)*CELL_SIZE_METERS}
      :{kind:'vertical-segment',axis:'y',coordinate:(y-.5)*CELL_SIZE_METERS,spanStart:(x-.5)*CELL_SIZE_METERS,spanEnd:(x+.5)*CELL_SIZE_METERS};
    return deepFreeze({
      id:`boundary:${layerZ}:${boundaryId}`,
      opacity:'opaque',
      sourceType:'world-boundary',
      source:{z:layerZ,boundaryId},
      geometry
    });
  }

  function projectStaticVisualOpacity(authoring,layerZ){
    if(!Number.isInteger(layerZ))throw new Error('Static visual opacity projection requires an explicit integer layer z.');
    const layers=authoring?.map?.layers;
    if(!Array.isArray(layers))throw new Error('Static visual opacity projection requires authored map layers.');
    const layer=layers.find(candidate=>candidate?.z===layerZ);
    if(!layer)throw new Error(`Static visual opacity projection cannot find authored layer ${layerZ}.`);
    if(!layer.boundaries||typeof layer.boundaries!=='object'||Array.isArray(layer.boundaries))throw new Error(`Static visual opacity projection requires boundary geometry for layer ${layerZ}.`);
    const occluders=[];
    for(const [boundaryId,boundary] of Object.entries(layer.boundaries)){
      const occluder=authoredWallOccluder(layerZ,boundaryId,boundary);
      if(occluder)occluders.push(occluder);
    }
    occluders.sort((left,right)=>left.id.localeCompare(right.id));
    return deepFreeze(occluders);
  }

  function segmentCrossingParameter(from,to,occluder){
    const geometry=occluder?.geometry;
    if(occluder?.opacity!=='opaque'||geometry?.kind!=='vertical-segment'||!['x','y'].includes(geometry.axis))throw new Error(`Invalid visual opacity geometry: ${String(occluder?.id)}`);
    const coordinate=Number(geometry.coordinate),start=Number(geometry.spanStart),end=Number(geometry.spanEnd);
    if(!Number.isFinite(coordinate)||!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw new Error(`Invalid visual opacity geometry: ${String(occluder?.id)}`);
    const along=geometry.axis,across=along==='x'?'y':'x',delta=to[along]-from[along];
    if(Math.abs(delta)<=EPS)return null;
    const t=(coordinate-from[along])/delta;
    if(!(t>EPS&&t<1-EPS))return null;
    const crossing=from[across]+t*(to[across]-from[across]);
    if(crossing<start-EPS||crossing>end+EPS)return null;
    return t;
  }

  function classifyStaticVisualLos(observerOrigin,targetRepresentativePosition,opacityProjection){
    const from=finitePlanarPoint(observerOrigin,'observerOrigin'),to=finitePlanarPoint(targetRepresentativePosition,'targetRepresentativePosition');
    if(Math.hypot(to.x-from.x,to.y-from.y)<=EPS)throw new Error('Static visual LOS requires distinct observer and target representative positions.');
    if(!Array.isArray(opacityProjection))throw new Error('Static visual LOS requires an explicit visual opacity projection.');
    let blocker=null,blockerT=Infinity;
    for(const occluder of opacityProjection){
      const t=segmentCrossingParameter(from,to,occluder);
      if(t===null)continue;
      if(t<blockerT-EPS||(Math.abs(t-blockerT)<=EPS&&String(occluder.id).localeCompare(String(blocker?.id||''))<0)){
        blocker=occluder;blockerT=t;
      }
    }
    if(!blocker)return Object.freeze({losAvailable:true,blockedBy:null,unavailableReason:null});
    return deepFreeze({
      losAvailable:false,
      blockedBy:{id:blocker.id,sourceType:blocker.sourceType,source:blocker.source},
      unavailableReason:'opaque-static-geometry'
    });
  }

  if(P.VISUAL_LOS_VERSION)throw new Error('Static visual LOS perception foundation is already registered.');
  Object.assign(P,{
    VISUAL_LOS_VERSION:VERSION,
    projectStaticVisualOpacity,
    classifyStaticVisualLos
  });
})();
