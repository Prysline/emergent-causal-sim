(() => {
  const W=window.SimWorld,SP=window.SimSpatial,D=window.SimFurnitureDefinitions,C=window.SimEmbodimentCapabilities;if(!W||!SP||!D)return;
  if(!W.registerInitialStateInitializer)throw new Error('spatial-traversal.js requires world.js initial-state pipeline.');
  const VERSION='11.38.0-carried-handling-risk';
  const SPATIAL_IDENTITY_VERSION='11.22.0-spatial-z-identity';
  const PICKUP_INTERACTION_VERSION='pickup-interaction-v1';
  const baseDescribePlace=SP.describePlace;
  const baseInteractionGeometry=SP.interactionGeometry;
  const baseObjectPosition=SP.objectPosition;
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
  const FLOOR_DIRS=[...DIRS,[1,1],[1,-1],[-1,1],[-1,-1]];
  const FLOOR='floor';
  const STRUCTURE_TRAVERSAL_PROFILES=Object.freeze({stair:Object.freeze({upBurden:1,downBurden:.5})});

  const zOf=p=>SP.zOf?SP.zOf(p):(p?.z??0);
  const localPos=(x,y,z=0)=>z===0?{x,y}:{x,y,z};
  function cloneNode(p){if(!p)return null;const out={x:p.x,y:p.y,spaceId:p.spaceId||null,surfaceId:p.surfaceId||FLOOR};if(zOf(p)!==0)out.z=zOf(p);return out;}
  function localSame(a,b){return !!a&&!!b&&a.x===b.x&&a.y===b.y&&zOf(a)===zOf(b);}
  function sameLayer(a,b){return !!a&&!!b&&zOf(a)===zOf(b);}
  const normalizeNode=SP.normalizeNode;
  if(typeof normalizeNode!=='function')throw new Error('spatial-traversal.js requires Spatial core normalizeNode().');
  function nodeKey(st,p){const n=normalizeNode(st,p);return n?`${n.spaceId}|${n.surfaceId}|${SP.key(n)}`:'?';}
  function nodeSame(st,a,b){if(!a||!b)return false;const x=normalizeNode(st,a),y=normalizeNode(st,b);return localSame(x,y)&&x.spaceId===y.spaceId&&x.surfaceId===y.surfaceId;}
  function ensureSpatialDefs(st){
    for(const furniture of Object.values(st.furniture||{})){
      if(!Array.isArray(furniture.spatial?.solids)||!furniture.spatial.solids.length)throw new Error('Furniture '+furniture.id+' has invalid runtime metric solids.');
      const surfaces=furniture.spatial?.surfaces;
      if(!Array.isArray(surfaces))throw new Error('Furniture '+furniture.id+' requires canonical runtime spatial.surfaces.');
      for(const surface of surfaces){
        const region=surface?.supportRegion;
        if(!surface?.id||!Array.isArray(surface.cells)||!surface.sourceSolidKey||surface.face!=='top'||!region||!Number.isFinite(surface.topElevation)||![region.x,region.y,region.width,region.depth].every(Number.isFinite)||region.width<=0||region.depth<=0)throw new Error('Furniture '+furniture.id+' has invalid runtime Surface geometry.');
      }
    }
    return st;
  }
  function surfaceEntries(st){return Object.values(st.furniture||{}).flatMap(f=>(f.spatial?.surfaces||[]).map(surface=>({furniture:f,surface})));}
  function surfaceEntry(st,surfaceId){return surfaceEntries(st).find(x=>x.surface.id===surfaceId)||null;}
  function surfaceAt(st,p){return surfaceEntries(st).find(({surface})=>(surface.cells||[]).some(c=>localSame(c,p)))||null;}
  let activeGeometrySnapshot=null;
  function geometrySnapshotFor(st){return activeGeometrySnapshot?.state===st?activeGeometrySnapshot:null;}
  function withGeometrySnapshot(st,fn){
    const current=geometrySnapshotFor(st);if(current)return fn(current);
    const previous=activeGeometrySnapshot,snapshot={state:st,solidsByLayer:new Map(),floorByTile:new Map(),envelopeFits:new Map(),surfaceFits:new Map(),horizontalByLayer:new Map(),horizontalRuntimeSnapshots:new Map()};
    activeGeometrySnapshot=snapshot;
    try{return fn(snapshot);}finally{activeGeometrySnapshot=previous;}
  }
  function rawFurnitureSolids(st,z){return Object.values(st.furniture||{}).flatMap(f=>f.spatial?.solids||[]).filter(solid=>solid.layerZ===z);}
  function furnitureSolids(st,z){
    const snapshot=geometrySnapshotFor(st);if(!snapshot)return rawFurnitureSolids(st,z);
    if(!snapshot.solidsByLayer.has(z))snapshot.solidsByLayer.set(z,rawFurnitureSolids(st,z));
    return snapshot.solidsByLayer.get(z);
  }
  function floorGeometry(st,p){
    const z=zOf(p),snapshot=geometrySnapshotFor(st),key=z+'|'+p.x+'|'+p.y;
    if(snapshot?.floorByTile.has(key))return snapshot.floorByTile.get(key);
    const geometry=D.analyzeFloorTile(furnitureSolids(st,z),p.x,p.y,z);
    if(snapshot)snapshot.floorByTile.set(key,geometry);
    return geometry;
  }
  function floorEnvelopeFits(st,p,envelope){
    const z=zOf(p),snapshot=geometrySnapshotFor(st),key=z+'|'+p.x+'|'+p.y+'|'+envelope.clearanceHeight+'|'+envelope.clearanceWidth;
    if(snapshot?.envelopeFits.has(key))return snapshot.envelopeFits.get(key);
    const fits=D.envelopeFitsTile(furnitureSolids(st,z),p.x,p.y,z,envelope.clearanceHeight,envelope.clearanceWidth);
    if(snapshot)snapshot.envelopeFits.set(key,fits);
    return fits;
  }
  function overheadAt(st,p){
    const z=zOf(p);
    return Object.values(st.furniture||{}).filter(f=>(f.spatial?.solids||[]).some(solid=>{
      if(solid.layerZ!==z||solid.bounds?.z<=0)return false;
      const b=solid.bounds;
      return Math.min(p.x+1,b.x+b.width)-Math.max(p.x,b.x)>1e-9&&Math.min(p.y+1,b.y+b.depth)-Math.max(p.y,b.y)>1e-9;
    }));
  }
  function isSurfaceCell(entry,p){return !!entry&&(entry.surface.cells||[]).some(c=>localSame(c,p));}
  function isFootprintCell(entry,p){return !!entry&&(entry.furniture.footprint||[]).some(c=>localSame(c,p));}
  function agentFor(st,aOrId){if(typeof aOrId==='string')return st.agents?.[aOrId]||null;return aOrId||null;}

  function fixedFloorBlocker(st,p){
    const t=SP.tileByPos(st,p);if(!t||!t.walkable)return t?`terrain:${t.terrain}`:'out-of-bounds';
    if(floorGeometry(st,p).blocked)return `furniture:${t.furnitureIds?.[0]||'geometry'}`;
    const fixedContainer=Object.values(st.containers||{}).find(c=>c.portable===false&&!c.supportId&&localSame(baseObjectPosition(st,c.id),p));if(fixedContainer)return `container:${fixedContainer.id}`;
    const source=Object.values(st.sources||{}).find(s=>s.blocksMovement!==false&&localSame(s.position,p));if(source)return `source:${source.id}`;
    return null;
  }
  function floorWalkable(st,p,agent=null){
    if(fixedFloorBlocker(st,p))return false;
    if(agent){
      const envelope=movementEnvelopeFor(st,agent,'walk');
      if(!envelope||!floorEnvelopeFits(st,p,envelope))return false;
    }
    return true;
  }
  function movementEnvelopeFor(st,agent,mode='walk'){
    const runtime=physicalRuntime()?.getEffectiveTraversalEnvelope?.(st,agent,mode)||physicalRuntime()?.getMovementEnvelope?.(agent,mode);
    if(runtime)return runtime;
    const physical=C?.defaultPhysicalProfile?.(agent?.kind),body=physical?.bodyGeometry,profile=physical?.locomotionProfiles?.[mode];
    if(!body||!profile||physical?.locomotionCapabilities?.[mode]!==true)return null;
    return {
      clearanceHeight:body.height*(profile.heightFactor??1),
      clearanceWidth:body.width*(profile.widthFactor??1),
      bodyLength:body.length*(profile.lengthFactor??1),
      speedFactor:profile.speedFactor??1
    };
  }
  function floorNodeFitsMode(st,p,agent,mode='walk',envelopeOverride=null){
    const n=normalizeNode(st,p,FLOOR);if(!n||fixedFloorBlocker(st,n))return false;
    if(!agent)return true;
    const envelope=envelopeOverride||movementEnvelopeFor(st,agent,mode);if(!envelope)return false;
    return floorEnvelopeFits(st,n,envelope);
  }
  function axisCandidates(min,max,bounds=[]){
    const values=[min,max,(min+max)/2];
    for(const value of bounds)if(Number.isFinite(value)&&value>=min-CONTACT_EPS&&value<=max+CONTACT_EPS)values.push(Math.min(max,Math.max(min,value)));
    const sorted=[...new Set(values.map(value=>Math.round(value*1e12)/1e12))].sort((a,b)=>a-b),out=[...sorted];
    for(let i=1;i<sorted.length;i++)if(sorted[i]-sorted[i-1]>CONTACT_EPS)out.push((sorted[i]+sorted[i-1])/2);
    return [...new Set(out.map(value=>Math.round(value*1e12)/1e12))].sort((a,b)=>a-b);
  }
  function rectOverlapAtAnchor(anchor,pose,solid){
    const b=solid.bounds,body={x:anchor.x-pose.width/2,y:anchor.y-pose.length/2,width:pose.width,depth:pose.length};
    return Math.min(body.x+body.width,b.x+b.width)-Math.max(body.x,b.x)>CONTACT_EPS&&Math.min(body.y+body.depth,b.y+b.depth)-Math.max(body.y,b.y)>CONTACT_EPS;
  }
  function surfaceStaticFitResult(st,node,aOrId=null,posture='standing',traversalEnvelope=null){
    const a=agentFor(st,aOrId),n=normalizeNode(st,node),entry=n?surfaceEntry(st,n.surfaceId):null;
    if(!entry||!isSurfaceCell(entry,n))return {fits:false,reason:'surface',surfaceId:n?.surfaceId||null,witness:null};
    if(!a)return {fits:true,reason:null,surfaceId:entry.surface.id,witness:null};
    const P=physicalRuntime(),body=a.physical?.bodyGeometry||C?.defaultPhysicalProfile?.(a.kind)?.bodyGeometry||null;
    const support=P?.getSupportFootprint?.(a,posture)||C?.getSupportFootprintForKind?.(a.kind,body,posture)||null;
    const staticPose=P?.getPoseEnvelope?.(a,posture)||C?.getPoseEnvelopeForKind?.(a.kind,body,posture)||null;
    const pose=traversalEnvelope?{height:Number(traversalEnvelope.clearanceHeight),width:Number(traversalEnvelope.clearanceWidth),length:Number(traversalEnvelope.clearanceLength)}:staticPose;
    if(!support||!pose||![pose.height,pose.width,pose.length].every(value=>Number.isFinite(value)&&value>0))return {fits:false,reason:'postureProfile',surfaceId:entry.surface.id,witness:null};
    const snapshot=geometrySnapshotFor(st),cacheKey=[entry.surface.id,nodeKey(st,n),a.id||a.kind,posture,support.width,support.length,pose.width,pose.length,pose.height].join('|');
    if(snapshot?.surfaceFits.has(cacheKey))return snapshot.surfaceFits.get(cacheKey);
    const region=entry.surface.supportRegion,minX=Math.max(n.x,region.x+support.width/2),maxX=Math.min(n.x+1,region.x+region.width-support.width/2),minY=Math.max(n.y,region.y+support.length/2),maxY=Math.min(n.y+1,region.y+region.depth-support.length/2);
    if(maxX<minX-CONTACT_EPS||maxY<minY-CONTACT_EPS){
      const result={fits:false,reason:'support',surfaceId:entry.surface.id,witness:null,supportAnchorRegion:null};
      if(snapshot)snapshot.surfaceFits.set(cacheKey,result);return result;
    }
    const supportAnchorRegion={minX,maxX,minY,maxY},bodyBottom=entry.surface.topElevation,bodyTop=bodyBottom+pose.height;
    const blockers=furnitureSolids(st,zOf(n)).filter(solid=>{
      const b=solid.bounds,verticalOverlap=Math.min(bodyTop,b.z+b.height)-Math.max(bodyBottom,b.z);
      return verticalOverlap>CONTACT_EPS;
    });
    const xBounds=[],yBounds=[];
    for(const solid of blockers){
      const b=solid.bounds;xBounds.push(b.x-pose.width/2,b.x+b.width+pose.width/2);yBounds.push(b.y-pose.length/2,b.y+b.depth+pose.length/2);
    }
    const xs=axisCandidates(minX,maxX,xBounds),ys=axisCandidates(minY,maxY,yBounds);let witness=null;
    outer:for(const y of ys)for(const x of xs){
      const anchor={x,y};
      if(blockers.some(solid=>rectOverlapAtAnchor(anchor,pose,solid)))continue;
      witness={x,y,topElevation:entry.surface.topElevation};break outer;
    }
    const result={fits:!!witness,reason:witness?null:'clearance',surfaceId:entry.surface.id,witness,supportAnchorRegion,blockedSolidKeys:blockers.map(s=>s.key)};
    if(snapshot)snapshot.surfaceFits.set(cacheKey,result);return result;
  }
  function surfaceNodeFitsMode(st,node,agent,mode='walk',envelopeOverride=null){
    const entry=surfaceEntry(st,node.surfaceId);if(!entry||!isSurfaceCell(entry,node))return false;
    if(!agent)return true;
    const posture=C?.postureForMode?.(mode);if(!posture)return false;
    const envelope=envelopeOverride||movementEnvelopeFor(st,agent,mode);if(!envelope)return false;
    return surfaceStaticFitResult(st,node,agent,posture,envelope).fits;
  }
  function surfaceWalkable(st,node,agent=null){return surfaceNodeFitsMode(st,node,agent,'walk');}
  function nodeWalkable(st,p,aOrId=null){const a=agentFor(st,aOrId),n=normalizeNode(st,p);if(!n)return false;return n.surfaceId===FLOOR?floorWalkable(st,n,a):surfaceWalkable(st,n,a);}

  function nodeForAgent(st,a){return normalizeNode(st,a?.position);}
  function supportSurfaceForFurniture(st,furnitureOrId){
    const furniture=typeof furnitureOrId==='string'?st.furniture?.[furnitureOrId]:furnitureOrId;
    if(!furniture)return null;
    const surfaces=furniture.spatial?.surfaces||[];
    if(surfaces.length!==1)return null;
    return {furniture,surface:surfaces[0]};
  }
  function objectNode(st,id){
    const holder=SP.holderOf(st,id);if(holder)return nodeForAgent(st,holder);
    const c=st.containers?.[id],object=st.objects?.[id],s=st.sources?.[id],obj=c||object||s;if(!obj?.position)return null;
    let surfaceId=obj.position.surfaceId||FLOOR;
    if(obj?.supportId){const entry=supportSurfaceForFurniture(st,obj.supportId);if(entry)surfaceId=entry.surface.id;}
    return normalizeNode(st,obj.position,surfaceId);
  }
  function nodeOccupantsAt(st,p,except=null){const n=normalizeNode(st,p);return Object.values(st.agents||{}).filter(a=>!a.offMap&&!a.posture?.slotId&&a.id!==except&&nodeSame(st,a.position,n));}

  const APPROACH_DELTA=Object.freeze({north:[0,-1],east:[1,0],south:[0,1],west:[-1,0]});
  const APPROACH_CORNERS=Object.freeze([
    Object.freeze({edges:Object.freeze(['north','west']),delta:Object.freeze([-1,-1])}),
    Object.freeze({edges:Object.freeze(['north','east']),delta:Object.freeze([1,-1])}),
    Object.freeze({edges:Object.freeze(['south','west']),delta:Object.freeze([-1,1])}),
    Object.freeze({edges:Object.freeze(['south','east']),delta:Object.freeze([1,1])})
  ]);
  function cardinalSlotApproachNode(st,anchor,edge,a,mode='walk'){
    const delta=APPROACH_DELTA[edge];if(!delta)return null;
    const q=normalizeNode(st,localPos(anchor.x+delta[0],anchor.y+delta[1],zOf(anchor)),FLOOR);
    if(!floorNodeFitsMode(st,q,a,mode))return null;
    if(SP.edgeStructurallyOpen&&!SP.edgeStructurallyOpen(st,anchor,q))return null;
    return q;
  }
  function slotCornerApproachNode(st,anchor,corner,a,mode='walk'){
    const sideNodes=corner.edges.map(edge=>cardinalSlotApproachNode(st,anchor,edge,a,mode));
    if(sideNodes.some(node=>!node))return null;
    const q=normalizeNode(st,localPos(anchor.x+corner.delta[0],anchor.y+corner.delta[1],zOf(anchor)),FLOOR);
    if(!floorNodeFitsMode(st,q,a,mode))return null;
    if(!sideNodes.every(node=>walkEdgeFeasible(st,a,q,node)))return null;
    return q;
  }
  function slotApproachNodes(st,slotOrId,aOrId=null,mode='walk'){
    const slot=typeof slotOrId==='string'?SP.getSlot?.(st,slotOrId):slotOrId,a=agentFor(st,aOrId),out=new Map();
    if(!slot?.position)return[];
    const anchor=normalizeNode(st,slot.position,FLOOR),geometry=floorGeometry(st,anchor),approachEdges=new Set(slot.approachEdges||[]);
    if(floorNodeFitsMode(st,anchor,a,mode)){
      for(const edge of approachEdges)if((geometry.edgeIntervals?.[edge]||[]).length){out.set(nodeKey(st,anchor),anchor);break;}
    }
    for(const edge of approachEdges){
      const q=cardinalSlotApproachNode(st,anchor,edge,a,mode);
      if(q)out.set(nodeKey(st,q),q);
    }
    for(const corner of APPROACH_CORNERS){
      if(!corner.edges.every(edge=>approachEdges.has(edge)))continue;
      const q=slotCornerApproachNode(st,anchor,corner,a,mode);
      if(q)out.set(nodeKey(st,q),q);
    }
    return [...out.values()];
  }
  function bestSlotApproachNode(st,slotOrId,aOrId=null,{mode='walk',objective='traversalCost'}={}){
    const a=agentFor(st,aOrId);
    return withGeometrySnapshot(st,()=>bestSlotApproachNodeWithin(st,slotOrId,a,{mode,objective}));
  }
  function bestSlotApproachNodeWithin(st,slotOrId,a,{mode='walk',objective='traversalCost'}={}){
    const candidates=slotApproachNodes(st,slotOrId,a,mode);
    if(!a)return candidates[0]||null;
    const requested=locomotionRuntime()?'auto':mode,distances=objective==='pathDistance'?pathDistances(st,a,candidates,{mode:requested}):null,ranked=[];
    for(let i=0;i<candidates.length;i++){
      const node=candidates[i],route=distances?null:planRoute(st,a,node,{mode:requested,objective});
      const value=distances?distances[i]:(route?.[objective]??route?.pathDistance??Infinity);
      if(Number.isFinite(value))ranked.push({node,value,pathDistance:distances?value:(route?.pathDistance??0)});
    }
    ranked.sort((x,y)=>x.value-y.value||x.pathDistance-y.pathDistance||nodeKey(st,x.node).localeCompare(nodeKey(st,y.node)));
    return ranked[0]?.node||null;
  }
  function slotEgressNodes(st,slotOrId,aOrId=null,mode='walk'){
    const a=agentFor(st,aOrId);
    return slotApproachNodes(st,slotOrId,a,mode).filter(node=>nodeOccupantsAt(st,node,a?.id).length===0);
  }
  function routeOriginsForAgent(st,aOrId,mode='walk'){
    const a=agentFor(st,aOrId);if(!a||a.offMap)return [];
    const slotId=a.posture?.slotId;
    if(slotId)return slotEgressNodes(st,slotId,a,mode);
    const current=normalizeNode(st,a.position);return current&&nodeLocomotionAccessible(st,current,a)?[current]:[];
  }
  function crowdingRuntime(){return window.SimCrowding||null;}
  function floorStepCost(st,node,a){const t=SP.tileByPos(st,node),wet=SP.tileLiquidAmount(t);let cost=1+wet*(a?.kind==='cat'?.015:.07);if(!crowdingRuntime()){const occupied=nodeOccupantsAt(st,node,a?.id).length;cost+=occupied*(a?.kind==='cat'?2.5:5);}return cost;}
  function surfaceStepCost(st,node,a){
    if(!surfaceEntry(st,node.surfaceId))return Infinity;
    return locomotionRuntime()?.surfaceTraversalBurden?.(a)??Infinity;
  }
  function selectedSurfaceManeuver(a,modeFeasibility,mode='walk',distanceMeters=1,movementCredit=0){
    const candidates=modeFeasibility?.maneuverCandidates||[];if(!candidates.length)return null;
    const selected=locomotionRuntime()?.selectSurfaceManeuver?.(a,candidates,mode,distanceMeters,movementCredit)??modeFeasibility?.effectiveManeuver??candidates[0];
    return selected?JSON.parse(JSON.stringify(selected)):null;
  }
  function baseTraversalEdgeCost(st,from,to,a,surfaceManeuver=null){
    const structure=SP.structureBetween?.(st,from,to)||null;
    if(structure){
      const profile=STRUCTURE_TRAVERSAL_PROFILES[structure.kind];if(!profile)return Infinity;
      const direction=zOf(to)>zOf(from)?'up':'down';
      return floorStepCost(st,to,a)+(direction==='up'?profile.upBurden:profile.downBurden);
    }
    if(from.surfaceId===to.surfaceId)return to.surfaceId===FLOOR?floorStepCost(st,to,a):surfaceStepCost(st,to,a);
    const surfaceNode=from.surfaceId===FLOOR?to:from,entry=surfaceEntry(st,surfaceNode.surfaceId);if(!entry)return Infinity;
    return locomotionRuntime()?.surfaceManeuverBurden?.(a,surfaceManeuver)??Infinity;
  }
  function traversalEdgeCost(st,from,to,a,mode=null,fromMode=mode){
    const crowdingSnapshot=arguments[6]||null,maneuverSnapshot=arguments.length>7?arguments[7]:undefined,surfaceManeuverSnapshot=arguments.length>8?arguments[8]:undefined;
    const resolvedMode=mode||a?.locomotion?.mode||locomotionRuntime()?.modeFromPosture?.(a)||'walk';
    const maneuver=maneuverSnapshot===undefined?traversalManeuver(st,from,to):maneuverSnapshot;
    let surfaceManeuver=surfaceManeuverSnapshot;
    if(surfaceManeuver===undefined&&maneuver?.edgeKind==='surfaceTransition'){
      const modeFeasibility=SP.traversalFeasibility?.(st,a,from,to)?.modes?.[resolvedMode]||null;
      surfaceManeuver=selectedSurfaceManeuver(a,modeFeasibility,resolvedMode,maneuver?.distanceMeters??1,0);
    }
    const base=baseTraversalEdgeCost(st,from,to,a,surfaceManeuver);if(!Number.isFinite(base))return base;
    const locomotion=locomotionRuntime(),modeBurden=locomotion?.modeTraversalBurden?.(a,resolvedMode)??0,transitionBurden=locomotion?.modeTransitionBurden?.(a,fromMode,resolvedMode)??0;
    if(!Number.isFinite(modeBurden)||!Number.isFinite(transitionBurden))return Infinity;
    const crowding=crowdingSnapshot||crowdingRuntime()?.getCrowdingProfile?.(st,a,from,to,resolvedMode)||null;
    const movementDistance=maneuver?.edgeKind==='horizontal'&&from.surfaceId===to.surfaceId?(maneuver.distanceMeters??1):1;
    return base*movementDistance+modeBurden*movementDistance+transitionBurden+(crowding?.congestionCost||0);
  }
  function walkEdgeFeasible(st,a,from,to){
    if(!a)return true;
    const check=SP.traversalFeasibility?.(st,a,from,to),walk=check?.modes?.walk;
    return walk?walk.feasible:true;
  }
  function outsidePerimeterFloorNodes(st,entry,agent){
    const out=new Map();for(const c of entry.surface.cells||[])for(const [dx,dy] of DIRS){const p=localPos(c.x+dx,c.y+dy,zOf(c));if(isFootprintCell(entry,p))continue;const n=normalizeNode(st,p,FLOOR);if(nodeWalkable(st,n,agent)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,c,n)))out.set(nodeKey(st,n),n);}return [...out.values()];
  }
  function traversalNeighbors(st,p,aOrId=null){
    const a=agentFor(st,aOrId),n=normalizeNode(st,p),out=new Map();if(!n||!nodeWalkable(st,n,a))return [];
    if(n.surfaceId===FLOOR){
      for(const [dx,dy] of FLOOR_DIRS){const q=normalizeNode(st,localPos(n.x+dx,n.y+dy,zOf(n)),FLOOR),diagonal=dx!==0&&dy!==0,maneuver=traversalManeuver(st,n,q),legacyCardinal=!diagonal&&(!SP.getPassageProfile)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,n,q));if(nodeWalkable(st,q,a)&&(maneuver||legacyCardinal)&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
      for(const q of SP.structureNeighborNodes?.(st,n)||[])if(nodeWalkable(st,q,a)&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);
      for(const entry of surfaceEntries(st)){
        for(const c of entry.surface.cells||[]){if(!sameLayer(c,n)||Math.abs(c.x-n.x)+Math.abs(c.y-n.y)!==1||isFootprintCell(entry,n))continue;const q=normalizeNode(st,c,entry.surface.id);if(nodeWalkable(st,q,a)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,n,c))&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
      }
    }else{
      const entry=surfaceEntry(st,n.surfaceId);if(!entry)return [];
      for(const [dx,dy] of DIRS){const q=normalizeNode(st,localPos(n.x+dx,n.y+dy,zOf(n)),n.surfaceId);if(nodeWalkable(st,q,a)&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
      for(const q of outsidePerimeterFloorNodes(st,entry,a)){if(sameLayer(q,n)&&Math.abs(q.x-n.x)+Math.abs(q.y-n.y)===1&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
    }
    return [...out.values()];
  }
  function traversalManeuver(st,from,to){
    const a=normalizeNode(st,from),b=normalizeNode(st,to);if(!a||!b)return null;
    const passage=SP.getPassageProfile?.(st,a,b);if(!passage)return null;
    const structure=passage.edgeKind==='structure';
    const horizontal=passage.edgeKind==='horizontal';
    const surfaceTransition=passage.edgeKind==='surfaceTransition';
    if(!structure&&!horizontal&&!surfaceTransition)return null;
    if((horizontal||surfaceTransition)&&passage.status&&passage.status!=='candidate')return null;
    const dz=zOf(b)-zOf(a),dx=b.x-a.x,dy=b.y-a.y;
    return {
      from:cloneNode(a),to:cloneNode(b),
      directionVector:{x:dx,y:dy,z:dz},
      distanceMeters:passage.distanceMeters??(structure?(Math.abs(dz)||1):Math.hypot(dx,dy)),
      primaryResource:passage.resource||(structure&&passage.structureId?'structure:'+passage.structureId:null),
      influenceNodes:horizontal&&passage.horizontalKind==='diagonal'
        ?[a,b,normalizeNode(st,localPos(a.x,b.y,zOf(a)),FLOOR),normalizeNode(st,localPos(b.x,a.y,zOf(a)),FLOOR)].filter(Boolean).map(cloneNode)
        :[cloneNode(a),cloneNode(b)],
      edgeKind:passage.edgeKind,
      horizontalKind:passage.horizontalKind||null,
      structureId:passage.structureId||null,
      surfaceTransition:surfaceTransition&&passage.surfaceTransition?JSON.parse(JSON.stringify(passage.surfaceTransition)):null
    };
  }
  function locomotionRuntime(){return window.SimLocomotion||null;}
  function physicalRuntime(){return window.SimPhysical||null;}
  function resourcesRuntime(){return window.SimResources||null;}
  function normalizedRouteWeights(weights={}){
    const bounded=(value,max)=>Math.max(0,Math.min(max,Number(value)||0));
    return {timeWeight:bounded(weights.timeWeight,4),contentsRiskWeight:bounded(weights.contentsRiskWeight,12),dropRiskWeight:bounded(weights.dropRiskWeight,12)};
  }
  function edgeHandlingFacts(st,a,mode,distanceMeters,surfaceManeuver,maneuver){
    const exposure=locomotionRuntime()?.handlingExposureForEdge?.({mode,distanceMeters,surfaceManeuver,traversalManeuver:maneuver})||{tilt:0,impact:0,oscillation:0};
    const risk=resourcesRuntime()?.getCarriedHandlingRisk?.(st,a,exposure)||{contentsLoss:0,containerDrop:0};
    return {exposure:{tilt:Number(exposure.tilt)||0,impact:Number(exposure.impact)||0,oscillation:Number(exposure.oscillation)||0},risk:{contentsLoss:Number(risk.contentsLoss)||0,containerDrop:Number(risk.containerDrop)||0}};
  }
  function routeDecisionScore(metrics,weights={}){
    const w=normalizedRouteWeights(weights),traversal=Number(metrics?.traversalCost)||0,time=Number(metrics?.travelTime)||0,contents=Number(metrics?.handlingRisk?.contentsLoss)||0,drop=Number(metrics?.handlingRisk?.containerDrop)||0;
    return traversal+time*w.timeWeight+contents*w.contentsRiskWeight+drop*w.dropRiskWeight;
  }
  function resolvedRequestedMode(mode){return mode||(locomotionRuntime()?'auto':'walk');}
  function availableModes(a,requestedMode){
    const requested=resolvedRequestedMode(requestedMode),supported=physicalRuntime()?.supportedLocomotionModes?.(a);
    if(requested!=='auto'){
      if(Array.isArray(supported)&&!supported.includes(requested))throw new RangeError(`Unsupported locomotion mode: ${requested}`);
      if(!Array.isArray(supported)&&requested!=='walk')throw new RangeError(`Route execution currently supports walk only, got: ${requested}`);
      return [requested];
    }
    const modes=Array.isArray(supported)&&supported.length?supported:['walk'];
    return [...modes];
  }
  function nodeLocomotionAccessible(st,p,a=null){
    const n=normalizeNode(st,p);if(!n)return false;
    return n.surfaceId===FLOOR?!fixedFloorBlocker(st,n):surfaceWalkable(st,n,a);
  }
  function candidateTraversalNeighbors(st,p,aOrId=null,maneuverResolver=null){
    const a=agentFor(st,aOrId),n=normalizeNode(st,p),out=new Map();if(!n||!nodeLocomotionAccessible(st,n,a))return [];
    if(n.surfaceId===FLOOR){
      for(const [dx,dy] of FLOOR_DIRS){const q=normalizeNode(st,localPos(n.x+dx,n.y+dy,zOf(n)),FLOOR),diagonal=dx!==0&&dy!==0,maneuver=maneuverResolver?maneuverResolver(n,q):traversalManeuver(st,n,q),legacyCardinal=!diagonal&&(!SP.getPassageProfile)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,n,q));if(nodeLocomotionAccessible(st,q,a)&&(maneuver||legacyCardinal))out.set(nodeKey(st,q),q);}
      for(const q of SP.structureNeighborNodes?.(st,n)||[])if(nodeLocomotionAccessible(st,q,a))out.set(nodeKey(st,q),q);
      for(const entry of surfaceEntries(st)){
        for(const cell of entry.surface.cells||[]){
          if(!sameLayer(cell,n)||Math.abs(cell.x-n.x)+Math.abs(cell.y-n.y)!==1||isFootprintCell(entry,n))continue;
          const q=normalizeNode(st,cell,entry.surface.id);if(nodeLocomotionAccessible(st,q,a)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,n,cell)))out.set(nodeKey(st,q),q);
        }
      }
    }else{
      const entry=surfaceEntry(st,n.surfaceId);if(!entry)return [];
      for(const [dx,dy] of DIRS){const q=normalizeNode(st,localPos(n.x+dx,n.y+dy,zOf(n)),n.surfaceId);if(nodeLocomotionAccessible(st,q,a))out.set(nodeKey(st,q),q);}
      for(const cell of entry.surface.cells||[])for(const [dx,dy] of DIRS){
        const p=localPos(cell.x+dx,cell.y+dy,zOf(cell));if(isFootprintCell(entry,p))continue;
        const q=normalizeNode(st,p,FLOOR);if(sameLayer(q,n)&&Math.abs(q.x-n.x)+Math.abs(q.y-n.y)===1&&nodeLocomotionAccessible(st,q,a))out.set(nodeKey(st,q),q);
      }
    }
    return [...out.values()];
  }
  function modeEdgeFeasible(st,a,from,to,mode,feasibilitySnapshot=null){
    if(!a)return nodeLocomotionAccessible(st,to,null);
    const check=feasibilitySnapshot||SP.traversalFeasibility?.(st,a,from,to),result=check?.modes?.[mode];
    if(result)return result.feasible===true;
    return mode==='walk'&&nodeWalkable(st,to,a)&&walkEdgeFeasible(st,a,from,to);
  }
  function modeRank(mode){return mode==='walk'?0:mode==='kneelCrawl'?1:mode==='proneCrawl'?2:9;}
  function currentLocomotionMode(a){return locomotionRuntime()?.modeFromPosture?.(a)||null;}
  function normalizedMovementCredit(value){const credit=Number(value);return Number.isFinite(credit)&&credit>0?Math.min(credit,1-1e-9):0;}
  function fallbackMovementTiming(distanceMeters,movementCredit=0){const distance=Number(distanceMeters),credit=normalizedMovementCredit(movementCredit);if(!Number.isFinite(distance)||distance<=0)return {movementTicks:Infinity,movementCreditAfter:0,requiredTicks:Infinity};const requiredTicks=distance,effective=Math.max(0,requiredTicks-credit),movementTicks=Math.max(1,Math.ceil(effective-1e-12));return {movementTicks,movementCreditAfter:normalizedMovementCredit(credit+movementTicks-requiredTicks),requiredTicks};}
  function edgeMoveTiming(st,a,from,to,mode,crowdingSnapshot=null,movementCredit=0,maneuverSnapshot=undefined,surfaceManeuverSnapshot=null){
    const maneuver=maneuverSnapshot===undefined?traversalManeuver(st,from,to):maneuverSnapshot,distanceMeters=maneuver?.distanceMeters??1,L=locomotionRuntime();
    const base=surfaceManeuverSnapshot?L?.surfaceManeuverTiming?.(a,mode,surfaceManeuverSnapshot,distanceMeters,movementCredit):L?.movementTiming?.(a,mode,distanceMeters,movementCredit);
    const timing=base??fallbackMovementTiming(distanceMeters,movementCredit),delayTicks=Math.max(0,Number(crowdingSnapshot?.delayTicks)||0);
    return {distanceMeters,movementTicks:timing.movementTicks,moveTicks:Number.isFinite(timing.movementTicks)?timing.movementTicks+delayTicks:Infinity,movementCreditAfter:normalizedMovementCredit(timing.movementCreditAfter),delayTicks};
  }
  function transitionTicks(fromMode,toMode){const ticks=locomotionRuntime()?.transitionTicks?.(fromMode,toMode);return Number.isFinite(ticks)&&ticks>=0?ticks:(fromMode===toMode?0:0);}
  function routeStateKey(st,node,mode){return `${nodeKey(st,node)}|mode:${mode||'none'}`;}
  function compareRouteScore(a,b){return (a.primary-b.primary)||(a.time-b.time)||(a.transitions-b.transitions)||(a.modeRank-b.modeRank)||((b.movementCredit??0)-(a.movementCredit??0));}
  function routeStateSearch(st,start,aOrId=null,options={}){
    return withGeometrySnapshot(st,()=>routeStateSearchWithin(st,start,aOrId,options));
  }
  function routeStateSearchWithin(st,start,aOrId=null,{objective='traversalCost',mode=null,movementCredit=0,weights=null,trackPath=false,onSettle=null}={}){
    if(!['traversalCost','pathDistance','weighted'].includes(objective))throw new RangeError(`Unsupported route objective: ${objective}`);
    const routeWeights=objective==='weighted'?normalizedRouteWeights(weights):null;
    const a=agentFor(st,aOrId),requested=resolvedRequestedMode(mode),modes=availableModes(a,requested),startMode=currentLocomotionMode(a),came={},score={},states={},feasibilityByEdge=new Map(),maneuverByEdge=new Map();
    const starts=[...(Array.isArray(start)?start:[start])].map(value=>normalizeNode(st,value)).filter(node=>node&&nodeLocomotionAccessible(st,node,a)).filter((node,index,list)=>list.findIndex(other=>nodeSame(st,node,other))===index).sort((x,y)=>nodeKey(st,x).localeCompare(nodeKey(st,y)));
    const s=starts[0]||null;
    const directedEdgeKey=(from,to)=>`${nodeKey(st,from)}>${nodeKey(st,to)}`;
    const edgeFeasibility=(from,to)=>{
      const key=directedEdgeKey(from,to);
      if(!feasibilityByEdge.has(key))feasibilityByEdge.set(key,SP.traversalFeasibility?.(st,a,from,to)||null);
      return feasibilityByEdge.get(key);
    };
    const edgeManeuver=(from,to)=>{
      const key=directedEdgeKey(from,to);
      if(!maneuverByEdge.has(key))maneuverByEdge.set(key,traversalManeuver(st,from,to));
      return maneuverByEdge.get(key);
    };
    if(!starts.length)return {a,start:s,starts,startMode,requestedMode:requested,came,score,states,settledKey:null};
    const open=new Set();
    for(const origin of starts){
      const sk=routeStateKey(st,origin,startMode);open.add(sk);
      score[sk]={primary:0,time:0,transitions:0,modeRank:0,movementCredit:normalizedMovementCredit(movementCredit)};
      states[sk]={node:origin,mode:startMode};
    }
    while(open.size){
      let ck=null,best=null;
      for(const k of open){const value=score[k];if(!best||compareRouteScore(value,best)<0){best=value;ck=k;}}
      const cur=states[ck];open.delete(ck);
      if(onSettle?.(cur.node,cur.mode,best,ck)===true)return {a,start:s,starts,startMode,requestedMode:requested,came,score,states,settledKey:ck};
      for(const q of candidateTraversalNeighbors(st,cur.node,a,edgeManeuver)){
        const feasibility=edgeFeasibility(cur.node,q);
        for(const nextMode of modes){
          if(!modeEdgeFeasible(st,a,cur.node,q,nextMode,feasibility))continue;
          const maneuver=edgeManeuver(cur.node,q),distanceMeters=maneuver?.distanceMeters??1,modeFeasibility=feasibility?.modes?.[nextMode]||null;
          const transition=transitionTicks(cur.mode,nextMode),movementCreditBefore=transition>0?0:best.movementCredit,surfaceManeuver=maneuver?.edgeKind==='surfaceTransition'?selectedSurfaceManeuver(a,modeFeasibility,nextMode,distanceMeters,movementCreditBefore):null,crowding=crowdingRuntime()?.getCrowdingProfile?.(st,a,cur.node,q,nextMode,feasibility,maneuver)||null,timing=edgeMoveTiming(st,a,cur.node,q,nextMode,crowding,movementCreditBefore,maneuver,surfaceManeuver),moveTicks=timing.moveTicks,edgeCost=traversalEdgeCost(st,cur.node,q,a,nextMode,cur.mode,crowding,maneuver,surfaceManeuver);
          if(!Number.isFinite(edgeCost)||!Number.isFinite(moveTicks)||!Number.isFinite(distanceMeters)||distanceMeters<=0)continue;
          const handling=objective==='weighted'?edgeHandlingFacts(st,a,nextMode,distanceMeters,surfaceManeuver,maneuver):null,edgeTime=transition+moveTicks;
          const weightedEdge=edgeCost+edgeTime*(routeWeights?.timeWeight||0)+(handling?.risk.contentsLoss||0)*(routeWeights?.contentsRiskWeight||0)+(handling?.risk.containerDrop||0)*(routeWeights?.dropRiskWeight||0);
          const nextScore={
            primary:best.primary+(objective==='pathDistance'?distanceMeters:objective==='weighted'?weightedEdge:edgeCost),
            time:best.time+transition+moveTicks,
            transitions:best.transitions+(transition>0?1:0),
            modeRank:best.modeRank+modeRank(nextMode),
            movementCredit:timing.movementCreditAfter
          };
          const qk=routeStateKey(st,q,nextMode);
          if(score[qk]&&compareRouteScore(nextScore,score[qk])>=0)continue;
          if(trackPath){
            const step={from:cloneNode(cur.node),to:cloneNode(q),fromMode:cur.mode,mode:nextMode,distanceMeters,transitionTicks:transition,movementTicks:timing.movementTicks,moveTicks,movementCreditBefore,movementCreditAfter:timing.movementCreditAfter,crowdingDelayTicks:timing.delayTicks,speedFactor:physicalRuntime()?.getMovementEnvelope?.(a,nextMode)?.speedFactor??1,modeTraversalBurden:locomotionRuntime()?.modeTraversalBurden?.(a,nextMode)??0,modeTransitionBurden:locomotionRuntime()?.modeTransitionBurden?.(a,cur.mode,nextMode)??0,surfaceManeuver:surfaceManeuver?JSON.parse(JSON.stringify(surfaceManeuver)):null,handlingExposure:handling?{...handling.exposure}:null,handlingRisk:handling?{...handling.risk}:null,edgeTraversalCost:edgeCost,congestion:crowding};
            came[qk]={prev:ck,step};
          }
          score[qk]=nextScore;states[qk]={node:q,mode:nextMode};open.add(qk);
        }
      }
    }
    return {a,start:s,starts,startMode,requestedMode:requested,came,score,states,settledKey:null};
  }
  function routeSearch(st,start,goal,aOrId=null,{objective='traversalCost',mode=null,movementCredit=0,weights=null}={}){
    const a=agentFor(st,aOrId),s=normalizeNode(st,start),g=normalizeNode(st,goal),requested=resolvedRequestedMode(mode),startMode=currentLocomotionMode(a);
    availableModes(a,requested);
    if(!s||!g||!nodeLocomotionAccessible(st,s,a)||!nodeLocomotionAccessible(st,g,a))return {path:[],steps:[],startMode,requestedMode:requested};
    if(nodeSame(st,s,g))return {path:[cloneNode(s)],steps:[],startMode,requestedMode:requested};
    const search=routeStateSearch(st,s,a,{objective,mode:requested,movementCredit,weights,trackPath:true,onSettle:(node)=>nodeSame(st,node,g)});
    if(!search.settledKey)return {path:[],steps:[],startMode:search.startMode,requestedMode:search.requestedMode};
    const steps=[];let k=search.settledKey;
    while(search.came[k]){steps.unshift(search.came[k].step);k=search.came[k].prev;}
    return {path:[cloneNode(s),...steps.map(step=>cloneNode(step.to))],steps,startMode:search.startMode,requestedMode:search.requestedMode};
  }
  function pathDistances(st,aOrId,targets,{mode=null}={}){
    return withGeometrySnapshot(st,()=>pathDistancesWithin(st,aOrId,targets,{mode}));
  }
  function objectiveCostsFromOrigins(st,a,origins,targets,{objective='traversalCost',mode=null}={}){
    const list=Array.isArray(targets)?targets:[],out=list.map(()=>Infinity),requested=resolvedRequestedMode(mode);
    if(!a||!list.length||!origins?.length)return out;
    availableModes(a,requested);
    const goals=new Map();
    for(let i=0;i<list.length;i++){
      const g=normalizeNode(st,list[i]);if(!g||!nodeLocomotionAccessible(st,g,a))continue;
      const gk=nodeKey(st,g),indices=goals.get(gk)||[];indices.push(i);goals.set(gk,indices);
    }
    if(!goals.size)return out;
    routeStateSearch(st,origins,a,{objective,mode:requested,onSettle:(node,_mode,best)=>{
      const key=nodeKey(st,node),indices=goals.get(key);if(!indices)return false;
      for(const i of indices)out[i]=best.primary;
      goals.delete(key);return goals.size===0;
    }});
    return out;
  }
  function pathDistancesWithin(st,aOrId,targets,{mode=null}={}){
    const list=Array.isArray(targets)?targets:[],a=agentFor(st,aOrId);if(!a||!list.length)return list.map(()=>Infinity);
    const origins=routeOriginsForAgent(st,a,'walk');
    return objectiveCostsFromOrigins(st,a,origins,list,{objective:'pathDistance',mode});
  }

  function routeMetrics(st,a,route){
    if(!route?.path?.length)return {pathDistance:Infinity,stepCount:Infinity,traversalCost:Infinity,travelTime:Infinity,transitionTicks:Infinity,handlingExposure:{tilt:Infinity,impact:Infinity,oscillation:Infinity},handlingRisk:{contentsLoss:Infinity,containerDrop:Infinity}};
    let pathDistance=0,traversalCost=0,travelTime=0,transitions=0;const handlingExposure={tilt:0,impact:0,oscillation:0},handlingRisk={contentsLoss:0,containerDrop:0};
    for(const step of route.steps||[]){
      const distance=Number.isFinite(step.distanceMeters)?step.distanceMeters:(traversalManeuver(st,step.from,step.to)?.distanceMeters??1);
      const facts=step.handlingExposure&&step.handlingRisk?{exposure:step.handlingExposure,risk:step.handlingRisk}:edgeHandlingFacts(st,a,step.mode,distance,step.surfaceManeuver,{from:step.from,to:step.to,directionVector:{z:zOf(step.to)-zOf(step.from)}});
      pathDistance+=distance;traversalCost+=Number.isFinite(step.edgeTraversalCost)?step.edgeTraversalCost:traversalEdgeCost(st,step.from,step.to,a,step.mode,step.fromMode??step.mode);travelTime+=step.transitionTicks+step.moveTicks;transitions+=step.transitionTicks;
      for(const key of ['tilt','impact','oscillation'])handlingExposure[key]+=Math.max(0,Number(facts.exposure?.[key])||0);
      for(const key of ['contentsLoss','containerDrop'])handlingRisk[key]+=Math.max(0,Number(facts.risk?.[key])||0);
    }
    return {pathDistance,stepCount:(route.steps||[]).length,traversalCost,travelTime,transitionTicks:transitions,handlingExposure,handlingRisk};
  }
  function bestRouteFromOrigins(st,a,origins,goal,{mode=null,objective='traversalCost',movementCredit=0,weights=null}={}){
    const requested=resolvedRequestedMode(mode),g=normalizeNode(st,goal);
    if(!a||!g||!nodeLocomotionAccessible(st,g,a)||!origins?.length)return null;
    const search=routeStateSearch(st,origins,a,{objective,mode:requested,movementCredit,weights,trackPath:true,onSettle:(node)=>nodeSame(st,node,g)});
    if(!search.settledKey)return null;
    const steps=[];let k=search.settledKey;
    while(search.came[k]){steps.unshift(search.came[k].step);k=search.came[k].prev;}
    const origin=search.states[k]?.node;if(!origin)return null;
    const route={path:[cloneNode(origin),...steps.map(step=>cloneNode(step.to))],steps,startMode:search.startMode,requestedMode:search.requestedMode};
    const metrics=routeMetrics(st,a,route),value=objective==='weighted'?routeDecisionScore(metrics,weights):metrics[objective]??Infinity;
    return Number.isFinite(value)?{origin:cloneNode(origin),route,metrics,value}:null;
  }
  function bestSlotEgressNode(st,slotOrId,aOrId,goal,{mode=null,objective='traversalCost'}={}){
    const a=agentFor(st,aOrId),egress=slotEgressNodes(st,slotOrId,a,'walk');if(!a||!egress.length)return null;
    if(!goal)return egress[0];
    return bestRouteFromOrigins(st,a,egress,goal,{mode,objective,movementCredit:0})?.origin||null;
  }
  function planRoute(st,aOrId,goal,{mode=null,objective='traversalCost',movementCredit=0,weights=null}={}){
    const a=agentFor(st,aOrId),requested=resolvedRequestedMode(mode);
    if(!a)return {path:[],steps:[],mode:requested,requestedMode:requested,objective,pathDistance:Infinity,stepCount:Infinity,traversalCost:Infinity,travelTime:Infinity,transitionTicks:Infinity,handlingExposure:{tilt:Infinity,impact:Infinity,oscillation:Infinity},handlingRisk:{contentsLoss:Infinity,containerDrop:Infinity},decisionScore:Infinity};
    const origins=routeOriginsForAgent(st,a,'walk'),credit=a.posture?.slotId?0:movementCredit,winner=bestRouteFromOrigins(st,a,origins,goal,{mode:requested,objective,movementCredit:credit,weights});
    if(!winner)return {path:[],steps:[],mode:requested,requestedMode:requested,objective,pathDistance:Infinity,stepCount:Infinity,traversalCost:Infinity,travelTime:Infinity,transitionTicks:Infinity,handlingExposure:{tilt:Infinity,impact:Infinity,oscillation:Infinity},handlingRisk:{contentsLoss:Infinity,containerDrop:Infinity},decisionScore:Infinity,routeOrigin:null};
    const route=winner.route,metrics=winner.metrics,used=[...new Set((route.steps||[]).map(step=>step.mode))];
    const selectedMode=used.length===1?used[0]:used.length>1?'mixed':route.startMode||requested;
    return {path:route.path,steps:route.steps,mode:selectedMode,requestedMode:requested,objective,startMode:route.startMode,...metrics,objectiveWeights:objective==='weighted'?normalizedRouteWeights(weights):null,decisionScore:objective==='weighted'?winner.value:metrics.traversalCost};
  }
  function astar(st,start,goal,agentId=null){const a=agentFor(st,agentId),requested=locomotionRuntime()?'auto':'walk';return routeSearch(st,start,goal,a,{objective:'traversalCost',mode:requested}).path;}
  function traversalCost(st,aOrId,p){return planRoute(st,aOrId,p,{mode:locomotionRuntime()?'auto':'walk',objective:'traversalCost'}).traversalCost;}
  function pathCost(st,aOrId,p){return traversalCost(st,aOrId,p);}
  function pathDistance(st,aOrId,p){return planRoute(st,aOrId,p,{mode:locomotionRuntime()?'auto':'walk',objective:'pathDistance'}).pathDistance;}
  function travelTime(st,aOrId,p){return planRoute(st,aOrId,p,{mode:locomotionRuntime()?'auto':'walk',objective:'traversalCost'}).travelTime;}

  const CONTACT_EPS=1e-9;
  function contactEdgeNames(a,b){
    const dx=b.x-a.x,dy=b.y-a.y;
    if(dx===1&&dy===0)return ['east','west'];
    if(dx===-1&&dy===0)return ['west','east'];
    if(dx===0&&dy===1)return ['south','north'];
    if(dx===0&&dy===-1)return ['north','south'];
    return null;
  }
  function edgeCornerParameter(cell,edge,corner){
    return edge==='north'||edge==='south'?corner.x-cell.x:corner.y-cell.y;
  }
  function edgeCornerExtent(intervals,t){
    let extent=0;
    for(const interval of intervals||[]){
      if(t<=CONTACT_EPS){
        if(interval.start>CONTACT_EPS)continue;
        extent=Math.max(extent,interval.end);
      }else if(t>=1-CONTACT_EPS){
        if(interval.end<1-CONTACT_EPS)continue;
        extent=Math.max(extent,1-interval.start);
      }
    }
    return extent;
  }
  function cardinalCornerContactStatus(st,a,b,corner){
    const left=normalizeNode(st,a,FLOOR),right=normalizeNode(st,b,FLOOR);
    if(!left||!right||zOf(left)!==zOf(right))return 'unsupported';
    const edges=contactEdgeNames(left,right);if(!edges)return 'unsupported';
    const leftTile=SP.tileByPos(st,left),rightTile=SP.tileByPos(st,right);
    if(!leftTile?.walkable||!rightTile?.walkable)return 'blocked';
    if(SP.edgeStructurallyOpen&&!SP.edgeStructurallyOpen(st,left,right))return 'blocked';
    const leftGeometry=floorGeometry(st,left),rightGeometry=floorGeometry(st,right);
    if(leftGeometry.regionCount>1||rightGeometry.regionCount>1)return 'unsupported';
    const leftExtent=edgeCornerExtent(leftGeometry.edgeIntervals?.[edges[0]],edgeCornerParameter(left,edges[0],corner));
    const rightExtent=edgeCornerExtent(rightGeometry.edgeIntervals?.[edges[1]],edgeCornerParameter(right,edges[1],corner));
    return Math.min(leftExtent,rightExtent)>CONTACT_EPS?'candidate':'blocked';
  }
  function diagonalFloorContactStatus(st,target,candidate){
    const a=normalizeNode(st,target,FLOOR),b=normalizeNode(st,candidate,FLOOR);
    if(!a||!b||zOf(a)!==zOf(b)||Math.abs(b.x-a.x)!==1||Math.abs(b.y-a.y)!==1)return 'unsupported';
    const corner={x:Math.max(a.x,b.x),y:Math.max(a.y,b.y),z:zOf(a)};
    const horizontal=normalizeNode(st,localPos(b.x,a.y,zOf(a)),FLOOR);
    const vertical=normalizeNode(st,localPos(a.x,b.y,zOf(a)),FLOOR);
    const paths=[
      [[a,horizontal],[horizontal,b]],
      [[a,vertical],[vertical,b]]
    ];
    let sawUnsupported=false;
    for(const path of paths){
      const statuses=path.map(([from,to])=>cardinalCornerContactStatus(st,from,to,corner));
      if(statuses.every(status=>status==='candidate'))return 'candidate';
      if(!statuses.includes('blocked')&&statuses.includes('unsupported'))sawUnsupported=true;
    }
    if(sawUnsupported)return 'unsupported';
    return 'blocked';
  }
  function floorReachNodes(st,p,agent,{includeSelf=true}={}){
    const out=new Map(),target=normalizeNode(st,p,FLOOR);
    for(const [dx,dy] of FLOOR_DIRS){
      const q=normalizeNode(st,localPos(target.x+dx,target.y+dy,zOf(target)),FLOOR);
      if(!nodeWalkable(st,q,agent))continue;
      const diagonal=dx!==0&&dy!==0;
      if(diagonal){
        if(diagonalFloorContactStatus(st,target,q)!=='candidate')continue;
      }else if(SP.edgeStructurallyOpen&&!SP.edgeStructurallyOpen(st,target,q))continue;
      out.set(nodeKey(st,q),q);
    }
    if(includeSelf&&nodeWalkable(st,target,agent))out.set(nodeKey(st,target),target);
    return [...out.values()];
  }
  function surfaceLocalReachNodes(st,node,agent){
    const target=normalizeNode(st,node),out=new Map();
    if(nodeWalkable(st,target,agent))out.set(nodeKey(st,target),target);
    for(const [dx,dy] of FLOOR_DIRS){
      const q=normalizeNode(st,localPos(target.x+dx,target.y+dy,zOf(target)),target.surfaceId);
      if(nodeWalkable(st,q,agent))out.set(nodeKey(st,q),q);
    }
    return [...out.values()];
  }
  function currentSlotSurfaceContactNode(st,node,agent){
    const slotId=agent?.posture?.slotId,slot=slotId&&SP.getSlot?.(st,slotId);if(!slot?.position)return null;
    const target=normalizeNode(st,node),entry=target&&surfaceEntry(st,target.surfaceId),projected=target&&normalizeNode(st,target,FLOOR),stance=normalizeNode(st,slot.position,FLOOR),here=nodeForAgent(st,agent);
    if(!entry||!projected||!stance||!here||!nodeSame(st,here,stance)||isFootprintCell(entry,stance)||zOf(projected)!==zOf(stance))return null;
    const dx=stance.x-projected.x,dy=stance.y-projected.y;if(Math.abs(dx)>1||Math.abs(dy)>1||(dx===0&&dy===0))return null;
    if(dx!==0&&dy!==0){if(diagonalFloorContactStatus(st,projected,stance)!=='candidate')return null;}
    else if(SP.edgeStructurallyOpen&&!SP.edgeStructurallyOpen(st,projected,stance))return null;
    return stance;
  }
  function crossSurfaceContactNodes(st,node,agent,affordance){
    if(!agent||agent.kind!=='human')return [];
    const target=normalizeNode(st,node),entry=surfaceEntry(st,target.surfaceId);if(!entry)return [];
    const allowed=new Set(['pickup','serve','eatFrom','drinkFrom','fill','takeResource','deposit','receive','default']);if(!allowed.has(affordance))return [];
    const projected=normalizeNode(st,target,FLOOR),out=[];
    const currentSlotContact=currentSlotSurfaceContactNode(st,target,agent);if(currentSlotContact)out.push(currentSlotContact);
    for(const [dx,dy] of FLOOR_DIRS){
      const p=localPos(target.x+dx,target.y+dy,zOf(target));if(isFootprintCell(entry,p))continue;
      const q=normalizeNode(st,p,FLOOR);if(!nodeWalkable(st,q,agent))continue;
      const diagonal=dx!==0&&dy!==0;
      if(diagonal){
        if(diagonalFloorContactStatus(st,projected,q)!=='candidate')continue;
      }else if(SP.edgeStructurallyOpen&&!SP.edgeStructurallyOpen(st,projected,q))continue;
      out.push(q);
    }
    return dedupeNodes(st,out);
  }
  function outsideContactFloorNodes(st,entry,agent){
    const out=new Map();
    for(const cell of entry.surface.cells||[])for(const [dx,dy] of FLOOR_DIRS){
      const p=localPos(cell.x+dx,cell.y+dy,zOf(cell));if(isFootprintCell(entry,p))continue;
      const q=normalizeNode(st,p,FLOOR);if(!nodeWalkable(st,q,agent))continue;
      const projected=normalizeNode(st,cell,FLOOR),diagonal=dx!==0&&dy!==0;
      if(diagonal){
        if(diagonalFloorContactStatus(st,projected,q)!=='candidate')continue;
      }else if(SP.edgeStructurallyOpen&&!SP.edgeStructurallyOpen(st,projected,q))continue;
      out.set(nodeKey(st,q),q);
    }
    return [...out.values()];
  }
  function supportContactNodes(st,supportId,agent){
    const f=st.furniture?.[supportId],entry=supportSurfaceForFurniture(st,f);if(!f)return [];
    const out=new Map();
    if(entry){
      for(const q of outsideContactFloorNodes(st,entry,agent))out.set(nodeKey(st,q),q);
      for(const cell of entry.surface.cells||[]){const q=normalizeNode(st,cell,entry.surface.id);if(nodeWalkable(st,q,agent))out.set(nodeKey(st,q),q);}
    }else for(const p of baseInteractionGeometry(st,{kind:'furniture',id:supportId},agent,'default').positions||[]){
      const q=normalizeNode(st,p,FLOOR);if(nodeWalkable(st,q,agent))out.set(nodeKey(st,q),q);
    }
    return [...out.values()];
  }
  function dedupeNodes(st,list){const out=new Map();for(const p of list||[]){const n=normalizeNode(st,p);if(n)out.set(nodeKey(st,n),n);}return [...out.values()];}
  function groundPickupWitness(st,node,agent){
    const position=normalizeNode(st,node,FLOOR);if(!position||!agent||agent.kind!=='human')return null;
    for(const requiredMode of ['kneelCrawl','proneCrawl']){
      if(!floorNodeFitsMode(st,position,agent,requiredMode))continue;
      const requiredPosture=C?.postureForMode?.(requiredMode);if(requiredPosture)return {position,requiredMode,requiredPosture};
    }
    return null;
  }

  function agentContactNodes(st,targetAgent,agent){
    const slotId=targetAgent?.posture?.slotId;
    if(slotId)return slotApproachNodes(st,slotId,agent,'walk');
    const target=nodeForAgent(st,targetAgent);if(!target)return [];
    if(target.surfaceId===FLOOR)return floorReachNodes(st,target,agent);
    const sameSurface=surfaceLocalReachNodes(st,target,agent),cross=agent?.kind==='human'?crossSurfaceContactNodes(st,target,agent,'default'):[];return dedupeNodes(st,[...sameSurface,...cross]);
  }
  function interactionGeometry(st,target,agent=null,affordance='default'){
    if(!target)return {mode:'none',positions:[],target:null,affordance};
    if(target.kind==='slot'){
      const slot=SP.getSlot?.(st,target.id),positions=slotApproachNodes(st,slot,agent,'walk');
      return {mode:'slotApproach',positions,target,affordance,slotId:slot?.id||null};
    }
    if(target.kind==='agent'){
      const other=st.agents?.[target.id];if(!other||other.offMap)return {mode:'socialReach',positions:[],target,affordance};
      return {mode:'socialReach',positions:agentContactNodes(st,other,agent),target,affordance};
    }
    if(target.kind==='object'){
      const c=st.containers?.[target.id],object=st.objects?.[target.id],entity=object||c;if(!entity)return {mode:'none',positions:[],target,affordance};
      const holder=c?SP.holderOf(st,target.id):null,node=objectNode(st,target.id);if(!node)return {mode:'none',positions:[],target,affordance};
      if(holder){const positions=holder.id===agent?.id?[nodeForAgent(st,agent)]:agentContactNodes(st,holder,agent);return {mode:'heldReach',positions:dedupeNodes(st,positions),target,affordance,holderId:holder.id};}
      if(affordance==='pickup'){
        if(node.surfaceId===FLOOR){
          const witness=groundPickupWitness(st,node,agent),witnesses=witness?[witness]:[];
          return {mode:'groundContact',positions:witnesses.map(item=>item.position),witnesses,target,affordance,surfaceId:FLOOR};
        }
        const local=surfaceLocalReachNodes(st,node,agent),cross=crossSurfaceContactNodes(st,node,agent,affordance),positions=dedupeNodes(st,[...local,...cross]);
        return {mode:'surfaceContact',positions,target,affordance,surfaceId:node.surfaceId};
      }
      const rule=entity.interactions?.[affordance]||entity.interactions?.default||null;
      if(rule?.mode==='supportReach'&&entity.supportId)return {mode:'supportReach',positions:supportContactNodes(st,entity.supportId,agent),target,affordance,supportId:entity.supportId};
      if(rule?.mode==='occupy')return {mode:'occupy',positions:nodeWalkable(st,node,agent)?[node]:[],target,affordance};
      if(node.surfaceId!==FLOOR){
        const local=surfaceLocalReachNodes(st,node,agent),cross=crossSurfaceContactNodes(st,node,agent,affordance);
        if(rule?.mode==='reach'||affordance==='eatFrom'||affordance==='drinkFrom')return {mode:'reach',positions:dedupeNodes(st,[...local,...cross]),target,affordance,surfaceId:node.surfaceId};
        if(entity.supportId)return {mode:'supportReach',positions:supportContactNodes(st,entity.supportId,agent),target,affordance,supportId:entity.supportId};
        return {mode:'reach',positions:dedupeNodes(st,[...local,...cross]),target,affordance,surfaceId:node.surfaceId};
      }
      if(rule?.mode==='reach'||(!rule&&!entity.supportId))return {mode:'reach',positions:floorReachNodes(st,node,agent),target,affordance};
      const legacy=baseInteractionGeometry(st,target,agent,affordance);return {...legacy,positions:(legacy.positions||[]).map(p=>normalizeNode(st,p,FLOOR))};
    }
    if(target.kind==='source'){
      const src=st.sources?.[target.id],node=objectNode(st,target.id);if(!src||!node)return {mode:'none',positions:[],target,affordance};
      const rule=src.interactions?.[affordance]||src.interactions?.default||null,ports=(src.interactionPorts||[]).filter(port=>!port.affordances?.length||port.affordances.includes(affordance));
      if(rule?.mode==='reach'||(!rule&&!ports.length)){
        const positions=node.surfaceId===FLOOR?floorReachNodes(st,node,agent):surfaceLocalReachNodes(st,node,agent);
        return {mode:'reach',positions,target,affordance};
      }
    }
    const legacy=baseInteractionGeometry(st,target,agent,affordance);return {...legacy,positions:(legacy.positions||[]).map(p=>normalizeNode(st,p,FLOOR))};
  }
  function interactionWitnesses(st,target,agent,affordance='default'){
    const geometry=interactionGeometry(st,target,agent,affordance);
    return Array.isArray(geometry.witnesses)?geometry.witnesses:(geometry.positions||[]).map(position=>({position}));
  }
  function interactionPositions(st,target,agent,affordance='default'){return interactionGeometry(st,target,agent,affordance).positions;}
  function interactionTraversalCosts(st,aOrId,targets,{mode=null}={}){
    return withGeometrySnapshot(st,()=>{
      const list=Array.isArray(targets)?targets:[],a=agentFor(st,aOrId);if(!a||!list.length)return list.map(()=>Infinity);
      const current=nodeForAgent(st,a),origins=routeOriginsForAgent(st,a,'walk'),out=objectiveCostsFromOrigins(st,a,origins,list,{objective:'traversalCost',mode});
      for(let i=0;i<list.length;i++){const g=normalizeNode(st,list[i]);if(current&&g&&nodeSame(st,current,g))out[i]=0;}
      return out;
    });
  }
  function interactionWitnessTraversalCost(st,a,witness){
    const position=normalizeNode(st,witness?.position);if(!position)return Infinity;
    const route=planRoute(st,a,position,{mode:locomotionRuntime()?'auto':'walk',objective:'traversalCost'}),base=route?.traversalCost??Infinity;
    if(!Number.isFinite(base)||!witness?.requiredMode)return base;
    const terminalMode=route.steps?.length?route.steps[route.steps.length-1].mode:currentLocomotionMode(a),transition=locomotionRuntime()?.modeTransitionBurden?.(a,terminalMode,witness.requiredMode);
    return Number.isFinite(transition)?base+transition:Infinity;
  }
  function bestInteractionPositionResult(st,a,target,affordance='default'){
    const C=crowdingRuntime(),geometry=interactionGeometry(st,target,a,affordance),witnesses=interactionWitnesses(st,target,a,affordance),hasPostureWitness=witnesses.some(w=>w.requiredMode);
    const costs=hasPostureWitness?witnesses.map(w=>interactionWitnessTraversalCost(st,a,w)):interactionTraversalCosts(st,a,witnesses.map(w=>w.position),{mode:locomotionRuntime()?'auto':'walk'});
    let list=witnesses.map((w,i)=>({w,p:w.position,d:costs[i],occ:nodeOccupantsAt(st,w.position,a.id).length})).filter(x=>Number.isFinite(x.d));
    const current=nodeForAgent(st,a),differentNodeSameXY=x=>localSame(current,x.p)&&!nodeSame(st,current,x.p);if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));
    list.sort((x,y)=>(C?0:x.occ-y.occ)||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));
    const winner=list[0];return winner?{position:winner.p,traversalCost:winner.d,interactionMode:geometry.mode,requiredMode:winner.w.requiredMode||null,requiredPosture:winner.w.requiredPosture||null}:null;
  }
  function bestInteractionPosition(st,a,target,affordance='default'){return bestInteractionPositionResult(st,a,target,affordance)?.position||null;}
  function interactionWitnessSatisfied(st,a,witness){const here=nodeForAgent(st,a);return !!here&&!!witness?.position&&nodeSame(st,here,witness.position)&&(!witness.requiredPosture||a?.posture?.kind===witness.requiredPosture);}
  function isAtInteraction(st,a,target,affordance='default'){return interactionWitnesses(st,target,a,affordance).some(witness=>interactionWitnessSatisfied(st,a,witness));}
  function canInteract(st,a,target,affordance='default'){return isAtInteraction(st,a,target,affordance);}

  function describePlace(st,aOrPos){
    if(aOrPos?.offMap)return '門外';
    const slotId=aOrPos?.posture?.slotId;
    if(slotId){
      const slot=SP.getSlot?.(st,slotId);
      if(slot){
        const furniture=st.furniture?.[slot.furnitureId],name=furniture?.name||slot.furnitureId||'家具',label=slot.label||'使用位';
        return `${name}・${label}`;
      }
    }
    const p=aOrPos?.position||aOrPos,n=normalizeNode(st,p);if(n.surfaceId!==FLOOR){const entry=surfaceEntry(st,n.surfaceId);if(entry)return entry.surface.label||`${entry.furniture.name}表面`;}
    const overhead=overheadAt(st,n);if(overhead.length){const names=[...new Set(overhead.map(f=>f?.name).filter(Boolean))];return names.length===1?`${names[0]}所在格的地面`:'家具所在格的地面';}return baseDescribePlace(st,aOrPos);
  }
  W.registerInitialStateInitializer('spatial.schema',(st)=>{ensureSpatialDefs(st);},10);
  SP.walkable=(st,p)=>nodeWalkable(st,p,null);
  SP.astar=astar;
  SP.pathDistance=pathDistance;
  SP.pathDistances=pathDistances;
  SP.traversalCost=traversalCost;
  SP.travelTime=travelTime;
  SP.planRoute=planRoute;
  SP.interactionGeometry=interactionGeometry;
  SP.interactionWitnesses=interactionWitnesses;
  SP.interactionPositions=interactionPositions;
  SP.bestInteractionPosition=bestInteractionPosition;
  SP.bestInteractionPositionResult=bestInteractionPositionResult;
  SP.isAtInteraction=isAtInteraction;
  SP.describePlace=describePlace;
  Object.assign(SP,{VERSION,SPATIAL_IDENTITY_VERSION,PICKUP_INTERACTION_VERSION,currentGeometryQuerySnapshot:geometrySnapshotFor,ORDINARY_OBJECT_INTERACTION_VERSION:'ordinary-object-interaction-v2',ROUTE_SEMANTICS_VERSION:'11.38.0-carried-handling-risk',STRUCTURE_TRAVERSAL_PROFILES,nodeKey,nodeSame,nodeForAgent,objectNode,nodeOccupantsAt,nodeWalkable,nodeLocomotionAccessible,traversalManeuver,traversalNeighbors,traversalEdgeCost,pathCost,pathDistance,pathDistances,traversalCost,travelTime,planRoute,routeDecisionScore,canInteract,surfaceEntries,surfaceEntry,surfaceAt,supportSurfaceForFurniture,surfaceStaticFitResult,surfaceNodeFitsMode,overheadAt,supportContactNodes,furnitureSolids,floorGeometry,movementEnvelopeFor,floorNodeFitsMode,slotApproachNodes,bestSlotApproachNode,slotEgressNodes,routeOriginsForAgent,bestSlotEgressNode});
})();