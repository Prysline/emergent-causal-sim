(() => {
  const A=window.SimWorldAuthoring,P=window.SimPerception;
  if(!A?.CELL_SIZE_METERS)throw new Error('furniture-visual-availability.js requires World Authoring geometry scale.');
  if(!P?.classifyStaticVisualLos||!P?.derivePhysicalSightSamples||!P?.captureVisualOrientationSnapshot||!P?.classifyVisualBearing||!P?.classifyVisualRange)throw new Error('furniture-visual-availability.js requires current Visual Perception foundations.');

  const LOS_VERSION='perception-visual-los-v3-runtime-furniture';
  const SIGHT_VERSION='perception-visual-sight-samples-v2-furniture-target';
  const AVAILABILITY_VERSION='perception-visual-availability-v2-furniture-target';
  const CELL_SIZE_METERS=Number(A.CELL_SIZE_METERS),BOUNDARY_ID_PATTERN=/^([vh]):(-?\d+),(-?\d+)$/;
  const deepFreeze=value=>{if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);return value;};

  function boundaryOccluder(layerZ,boundaryId,boundary){
    if(boundary?.kind!=='wall')return null;
    const match=BOUNDARY_ID_PATTERN.exec(String(boundaryId||''));if(!match)throw new Error(`Invalid runtime wall boundary geometry: ${String(boundaryId)}`);
    const axis=match[1],x=Number(match[2]),y=Number(match[3]);
    return deepFreeze({id:`boundary:${layerZ}:${boundaryId}`,opacity:'opaque',sourceType:'world-boundary',source:{z:layerZ,boundaryId},geometry:axis==='v'
      ?{kind:'vertical-segment',axis:'x',coordinate:(x-.5)*CELL_SIZE_METERS,spanStart:(y-.5)*CELL_SIZE_METERS,spanEnd:(y+.5)*CELL_SIZE_METERS}
      :{kind:'vertical-segment',axis:'y',coordinate:(y-.5)*CELL_SIZE_METERS,spanStart:(x-.5)*CELL_SIZE_METERS,spanEnd:(x+.5)*CELL_SIZE_METERS}});
  }
  function furnitureOccluder(furniture,solid){
    if(solid?.visualOpacity===undefined)return null;if(solid.visualOpacity!=='opaque')throw new Error(`Unsupported Furniture visual opacity: ${String(solid.visualOpacity)}`);
    const b=solid.bounds;if(!b||![b.x,b.y,b.width,b.depth].every(value=>Number.isFinite(Number(value)))||Number(b.width)<=0||Number(b.depth)<=0)throw new Error(`Invalid Furniture visual opacity geometry: ${String(furniture?.id)}:${String(solid?.key)}`);
    const minX=(Number(b.x)-.5)*CELL_SIZE_METERS,minY=(Number(b.y)-.5)*CELL_SIZE_METERS;
    return deepFreeze({id:`furniture:${furniture.id}:${solid.key}`,opacity:'opaque',sourceType:'furniture-solid',source:{furnitureId:furniture.id,definitionId:furniture.definitionId||null,solidKey:solid.key},geometry:{kind:'axis-aligned-rect',minX,maxX:minX+Number(b.width)*CELL_SIZE_METERS,minY,maxY:minY+Number(b.depth)*CELL_SIZE_METERS}});
  }
  function projectRuntimeVisualOpacity(st,layerZ,{excludeFurnitureId=null}={}){
    if(!st?.map||!Number.isInteger(layerZ))throw new Error('Runtime visual opacity projection requires state + integer layer z.');
    const occluders=[];
    for(const [runtimeKey,boundary] of Object.entries(st.map.boundaries||{})){
      const split=runtimeKey.indexOf('|'),z=split>=0?Number(runtimeKey.slice(0,split)):Number(boundary?.z),boundaryId=split>=0?runtimeKey.slice(split+1):boundary?.id;
      if(z!==layerZ)continue;const projected=boundaryOccluder(layerZ,boundaryId,boundary);if(projected)occluders.push(projected);
    }
    for(const furniture of Object.values(st.furniture||{}).sort((left,right)=>String(left.id).localeCompare(String(right.id)))){
      if(furniture.id===excludeFurnitureId)continue;
      for(const solid of furniture.spatial?.solids||[]){if(solid.layerZ!==layerZ)continue;const projected=furnitureOccluder(furniture,solid);if(projected)occluders.push(projected);}
    }
    occluders.sort((left,right)=>left.id.localeCompare(right.id));return deepFreeze(occluders);
  }
  function deriveFurnitureSightSamples(furniture){
    const solids=furniture?.spatial?.solids||[];if(!furniture?.id||!solids.length)throw new Error('Furniture sight samples require current resolved Furniture solids.');
    const layers=[...new Set(solids.map(solid=>solid.layerZ))];if(layers.length!==1||!Number.isInteger(layers[0]))throw new Error('Furniture sight samples require one canonical layer.');
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const solid of solids){const b=solid.bounds;if(!b||![b.x,b.y,b.width,b.depth].every(value=>Number.isFinite(Number(value))))throw new Error(`Invalid Furniture sight geometry: ${furniture.id}:${solid.key}`);minX=Math.min(minX,Number(b.x));maxX=Math.max(maxX,Number(b.x)+Number(b.width));minY=Math.min(minY,Number(b.y));maxY=Math.max(maxY,Number(b.y)+Number(b.depth));}
    return deepFreeze({layerZ:layers[0],targetSamples:[{kind:'resolved-solid-center',position:{x:(minX+maxX)/2-.5,y:(minY+maxY)/2-.5}}]});
  }
  function classifyFurnitureVisualSensoryAvailability(st,observer,furniture){
    if(!st||!Number.isInteger(st.tick)||st.tick<0)throw new Error('Furniture visual availability requires canonical runtime state.');
    if(!observer?.id||!furniture?.id)throw new Error('Furniture visual availability requires observer Agent + Furniture target.');
    const observerSight=P.derivePhysicalSightSamples(observer),targetSight=deriveFurnitureSightSamples(furniture);if(observerSight.layerZ!==targetSight.layerZ)return deepFreeze({visualAvailable:false,unavailableReason:'different-layer',sightSamples:{observer:observerSight,target:targetSight}});
    const targetSample=targetSight.targetSamples[0],orientationSnapshot=P.captureVisualOrientationSnapshot(st,observer),orientation=P.classifyVisualBearing(orientationSnapshot,observerSight.observerOrigin,targetSample.position),range=P.classifyVisualRange(observerSight.observerOrigin,targetSample.position),opacityProjection=projectRuntimeVisualOpacity(st,targetSight.layerZ,{excludeFurnitureId:furniture.id}),los=P.classifyStaticVisualLos(observerSight.observerOrigin,targetSample.position,opacityProjection),orientationAvailable=orientation.visualClass!=='unavailable',visualAvailable=orientationAvailable&&range.rangeAvailable&&los.losAvailable,unavailableReason=orientationAvailable?(range.rangeAvailable?(los.losAvailable?null:los.unavailableReason):range.unavailableReason):'outside-visual-field';
    return deepFreeze({visualAvailable,unavailableReason,target:{kind:'furniture',id:furniture.id,observedTick:st.tick},sightSamples:{observer:observerSight,target:targetSight},orientation,range,los});
  }

  Object.assign(P,{VISUAL_LOS_VERSION:LOS_VERSION,VISUAL_SIGHT_SAMPLES_VERSION:SIGHT_VERSION,VISUAL_AVAILABILITY_VERSION:AVAILABILITY_VERSION,projectRuntimeVisualOpacity,deriveFurnitureSightSamples,classifyFurnitureVisualSensoryAvailability});
})();