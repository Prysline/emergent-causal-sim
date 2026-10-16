(() => {
  const A=window.SimWorldAuthoring,D=window.SimFurnitureDefinitions,SP=window.SimSpatial,P=window.SimPerception;
  if(!A?.resolveFurniturePassageYieldingContract||!D?.resolveInstance||!D?.analyzeFloorTile)throw new Error('furniture-passage-yielding.js requires current Furniture authoring/geometry authority.');
  if(!SP?.planRoute||!SP?.supportContactNodes||!SP?.edgeStructurallyOpen||!SP?.tileByPos)throw new Error('furniture-passage-yielding.js requires current Spatial route/contact authority.');
  if(!P?.classifyFurnitureVisualSensoryAvailability)throw new Error('furniture-passage-yielding.js requires Furniture visual availability.');

  const VERSION='furniture-passage-yielding-v1',EPS=1e-9;
  const basePlanRoute=SP.planRoute.bind(SP),clone=value=>value==null?value:JSON.parse(JSON.stringify(value)),zOf=p=>p?.z??0;
  const nodeSame=(left,right)=>!!left&&!!right&&left.x===right.x&&left.y===right.y&&zOf(left)===zOf(right)&&(left.surfaceId??'floor')===(right.surfaceId??'floor');
  const placementSame=(left,right)=>!!left&&!!right&&left.origin?.x===right.origin?.x&&left.origin?.y===right.origin?.y&&zOf(left.origin)===zOf(right.origin)&&left.orientation===right.orientation;
  const placementForFurniture=furniture=>({origin:clone(furniture?.origin||furniture?.displayAt||furniture?.footprint?.[0]||null),orientation:furniture?.orientation});
  const routeReachable=route=>Array.isArray(route?.path)&&route.path.length>0&&Number.isFinite(route.traversalCost);

  function translatedResolvedFurniture(furniture,placement){
    if(!furniture?.id||!furniture?.definitionId||!placement?.origin)return null;
    const resolved=D.resolveInstance({id:furniture.id,definitionId:furniture.definitionId,origin:clone(placement.origin),orientation:placement.orientation,name:furniture.name});
    resolved.definitionId=furniture.definitionId;
    resolved.origin=clone(placement.origin);
    resolved.passageYielding=clone(furniture.passageYielding);
    return resolved;
  }
  function overlapAmount(a0,a1,b0,b1){return Math.min(a1,b1)-Math.max(a0,b0);}
  function solidsOverlap(left,right){
    const a=left?.bounds,b=right?.bounds;if(!a||!b)return false;
    return overlapAmount(a.x,a.x+a.width,b.x,b.x+b.width)>EPS&&overlapAmount(a.y,a.y+a.depth,b.y,b.y+b.depth)>EPS&&overlapAmount(a.z,a.z+a.height,b.z,b.z+b.height)>EPS;
  }
  function sweptSolid(current,next){
    const a=current.bounds,b=next.bounds,minX=Math.min(a.x,b.x),minY=Math.min(a.y,b.y),minZ=Math.min(a.z,b.z),maxX=Math.max(a.x+a.width,b.x+b.width),maxY=Math.max(a.y+a.depth,b.y+b.depth),maxZ=Math.max(a.z+a.height,b.z+b.height);
    return {bounds:{x:minX,y:minY,z:minZ,width:maxX-minX,depth:maxY-minY,height:maxZ-minZ}};
  }
  function slotIdsForFurniture(furniture){return new Set((furniture?.slots||[]).map(slot=>slot.id));}
  function targetRelationHitsFurniture(relation,furnitureId,slotIds){const target=relation?.target;return !!target&&((target.kind==='furniture'&&target.id===furnitureId)||(target.kind==='slot'&&slotIds.has(target.id)));}
  function dependencyLegality(st,furniture){
    const slotIds=slotIdsForFurniture(furniture),id=furniture.id;
    for(const agent of Object.values(st.agents||{}))if(agent?.posture?.furnitureId===id||slotIds.has(agent?.posture?.slotId))return {ok:false,reason:'occupied-or-posture-bound',agentId:agent.id};
    for(const slotId of slotIds)if(st.reservations?.[`slot:${slotId}`])return {ok:false,reason:'reserved-slot',slotId};
    for(const object of Object.values(st.objects||{})){if(object?.supportId===id)return {ok:false,reason:'supported-object',objectId:object.id};if(object?.containedBy===id)return {ok:false,reason:'contained-object',objectId:object.id};}
    for(const [name,list] of [['usageAssignments',st.usageAssignments],['claimEligibility',st.claimEligibility],['usageClaims',st.usageClaims]])for(const relation of list||[])if(targetRelationHitsFurniture(relation,id,slotIds))return {ok:false,reason:'durable-usage-relation',relationLayer:name,relationId:relation.id};
    return {ok:true,reason:null};
  }
  function displacementFor(furniture){
    const current=placementForFurniture(furniture),parked=furniture?.passageYielding?.parkedPlacement;if(!current.origin||!parked?.origin)return null;
    return {dx:parked.origin.x-current.origin.x,dy:parked.origin.y-current.origin.y,dz:zOf(parked.origin)-zOf(current.origin),current,parked};
  }
  function geometryLegality(st,furniture){
    const displacement=displacementFor(furniture);if(!displacement)return {ok:false,reason:'missing-placement'};
    const {dx,dy,dz,current,parked}=displacement;
    if(placementSame(current,parked))return {ok:false,reason:'already-parked'};
    if(dz!==0||Math.abs(dx)+Math.abs(dy)!==1||current.orientation!==parked.orientation)return {ok:false,reason:'bounded-displacement-contract'};
    const candidate=translatedResolvedFurniture(furniture,parked);if(!candidate)return {ok:false,reason:'resolve-failed'};
    const currentRoom=SP.roomAt?.(st,current.origin)||null,parkedRoom=SP.roomAt?.(st,parked.origin)||null;if(currentRoom&&parkedRoom&&currentRoom!==parkedRoom)return {ok:false,reason:'room-to-room-unsupported'};
    for(const cell of candidate.footprint||[]){const tile=SP.tileByPos(st,cell),blocker=SP.blockerAt?.(st,cell);if(!tile||!tile.walkable)return {ok:false,reason:'destination-nonfloor',position:clone(cell)};if(blocker)return {ok:false,reason:'destination-blocker',position:clone(cell),blocker};}
    const currentFootprint=furniture.footprint||[];for(const cell of currentFootprint){const to={x:cell.x+dx,y:cell.y+dy,z:zOf(cell)};if(!SP.edgeStructurallyOpen(st,cell,to))return {ok:false,reason:'transition-boundary-blocked',from:clone(cell),to};}
    const others=Object.values(st.furniture||{}).filter(other=>other.id!==furniture.id).flatMap(other=>other.spatial?.solids||[]);
    for(const solid of candidate.spatial?.solids||[])for(const blocker of others)if(solidsOverlap(solid,blocker))return {ok:false,reason:'destination-solid-overlap',solidKey:solid.key,blockingSolidKey:blocker.key};
    const currentSolids=furniture.spatial?.solids||[],nextByKey=new Map((candidate.spatial?.solids||[]).map(solid=>[solid.key,solid]));
    for(const solid of currentSolids){const next=nextByKey.get(solid.key);if(!next)continue;const swept=sweptSolid(solid,next);for(const blocker of others)if(solidsOverlap(swept,blocker))return {ok:false,reason:'transition-solid-overlap',solidKey:solid.key,blockingSolidKey:blocker.key};}
    return {ok:true,reason:null,candidate,displacement};
  }
  function placementLegality(st,furniture){const dependency=dependencyLegality(st,furniture);if(!dependency.ok)return dependency;return geometryLegality(st,furniture);}
  function interactionPositions(st,a,furniture,displacement){
    const {dx,dy}=displacement||displacementFor(furniture)||{},footprint=furniture?.footprint||[],keys=new Set(footprint.map(cell=>`${cell.x-dx},${cell.y-dy},${zOf(cell)}`)),out=[];
    for(const node of SP.supportContactNodes(st,furniture.id,a)||[]){if(!keys.has(`${node.x},${node.y},${zOf(node)}`))continue;const route=basePlanRoute(st,a,node,{mode:'walk',objective:'traversalCost'});if(routeReachable(route))out.push({position:clone(node),route});}
    out.sort((left,right)=>left.route.traversalCost-right.route.traversalCost||String(SP.nodeKey?.(st,left.position)||'').localeCompare(String(SP.nodeKey?.(st,right.position)||'')));return out;
  }
  function hypotheticalState(st,furniture,candidate){return {...st,furniture:{...st.furniture,[furniture.id]:candidate}};}
  function observedEvidence(st,a,furniture){try{return P.classifyFurnitureVisualSensoryAvailability(st,a,furniture);}catch{return null;}}
  function evaluateFurnitureCandidate(st,a,goal,furniture,{requireObservation=true,currentWalk=null}={}){
    if(!furniture?.passageYielding||placementSame(placementForFurniture(furniture),furniture.passageYielding.parkedPlacement))return null;
    const dependency=dependencyLegality(st,furniture);if(!dependency.ok)return null;const geometry=geometryLegality(st,furniture);if(!geometry.ok)return null;
    const observed=requireObservation?observedEvidence(st,a,furniture):null;if(requireObservation&&!observed?.visualAvailable)return null;
    const interaction=interactionPositions(st,a,furniture,geometry.displacement)[0];if(!interaction)return null;
    const hypothetical=hypotheticalState(st,furniture,geometry.candidate),parkedWalk=basePlanRoute(hypothetical,a,goal,{mode:'walk',objective:'traversalCost'});if(!routeReachable(parkedWalk))return null;
    return {furnitureId:furniture.id,goal:clone(goal),currentWalk:currentWalk?clone(currentWalk):null,parkedWalk:clone(parkedWalk),interactionPosition:clone(interaction.position),observation:observed?clone(observed):null,parkedPlacement:clone(furniture.passageYielding.parkedPlacement),source:furniture.passageYielding.source};
  }
  function candidateForNavigation(st,a,goal){
    if(!st||!a?.id||a.offMap||!goal)return null;const currentWalk=basePlanRoute(st,a,goal,{mode:'walk',objective:'traversalCost'});if(routeReachable(currentWalk))return null;
    for(const furniture of Object.values(st.furniture||{}).sort((left,right)=>String(left.id).localeCompare(String(right.id)))){const candidate=evaluateFurnitureCandidate(st,a,goal,furniture,{currentWalk});if(candidate)return candidate;}
    return null;
  }
  function recomputeFurnitureProjections(st){
    for(const tile of Object.values(st.map?.tiles||{})){tile.furnitureIds=[];}
    for(const furniture of Object.values(st.furniture||{}))for(const cell of furniture.footprint||[]){const tile=SP.tileByPos(st,cell);if(tile&&!tile.furnitureIds.includes(furniture.id))tile.furnitureIds.push(furniture.id);}
    const solidsByLayer=new Map();for(const furniture of Object.values(st.furniture||{}))for(const solid of furniture.spatial?.solids||[]){const list=solidsByLayer.get(solid.layerZ)||[];list.push(solid);solidsByLayer.set(solid.layerZ,list);}
    for(const tile of Object.values(st.map?.tiles||{}))tile.floorGeometry=clone(D.analyzeFloorTile(solidsByLayer.get(tile.z)||[],tile.x,tile.y,tile.z));
    for(const room of Object.values(st.map?.rooms||{})){const ids=new Set();for(const tileId of room.floorTiles||[])for(const furnitureId of st.map.tiles?.[tileId]?.furnitureIds||[])ids.add(furnitureId);room.furnitureIds=[...ids].sort();}
  }
  function applyRuntimeFurniturePlacement(st,furnitureId,placement){
    const furniture=st.furniture?.[furnitureId];if(!furniture)return {ok:false,reason:'missing-furniture'};const parked=furniture.passageYielding?.parkedPlacement;if(!parked||!placementSame(parked,placement))return {ok:false,reason:'placement-not-canonical-parked'};
    const legality=placementLegality(st,furniture);if(!legality.ok)return legality;st.furniture[furnitureId]=legality.candidate;recomputeFurnitureProjections(st);return {ok:true,reason:null,furniture:st.furniture[furnitureId],fromPlacement:legality.displacement.current,toPlacement:clone(parked)};
  }
  function recoveryGoalMatches(action,goal){return !!action?.spatialGoal&&nodeSame(action.spatialGoal,goal);}
  function redirectedPlan(st,a,goal,options){
    if(options?.mode!=='auto'||!a?.action||!recoveryGoalMatches(a.action,goal))return null;
    const recovery=a.action.passageYieldingRecovery;if(recovery?.interactionPosition){return basePlanRoute(st,a,recovery.interactionPosition,{...options,mode:'walk'});}
    const candidate=candidateForNavigation(st,a,goal);if(!candidate)return null;
    const blocked=basePlanRoute(st,a,goal,{...options,mode:'walk'});return {...blocked,mode:'auto',requestedMode:'auto',objective:options.objective||blocked.objective};
  }
  SP.planRoute=(st,a,goal,options={})=>redirectedPlan(st,a,goal,options)||basePlanRoute(st,a,goal,options);
  SP.PASSAGE_YIELDING_VERSION=VERSION;

  window.SimFurniturePassageYielding={VERSION,basePlanRoute,placementForFurniture,placementSame,dependencyLegality,geometryLegality,placementLegality,interactionPositions,evaluateFurnitureCandidate,candidateForNavigation,applyRuntimeFurniturePlacement,recomputeFurnitureProjections};
})();