(() => {
  const W=window.SimWorld,SP=window.SimSpatial,D=window.SimFurnitureDefinitions,C=window.SimEmbodimentCapabilities;if(!W||!SP||!D)return;
  if(!W.registerInitialStateInitializer)throw new Error('spatial-traversal.js requires world.js initial-state pipeline.');
  const VERSION='11.28.0-furniture-local-geometry';
  const SPATIAL_IDENTITY_VERSION='11.22.0-spatial-z-identity';
  const baseDescribePlace=SP.describePlace;
  const baseInteractionGeometry=SP.interactionGeometry;
  const baseObjectPosition=SP.objectPosition;
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
  const TRAVERSAL_PROFILES={
    human:{requiredClearance:1.65,surfaceMoveCost:4,transitionCost:9},
    cat:{requiredClearance:.32,surfaceMoveCost:1.1,transitionCost:1.6}
  };
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
  function profile(agent){return TRAVERSAL_PROFILES[agent?.kind]||TRAVERSAL_PROFILES.human;}

  function ensureSpatialDefs(st){
    for(const furniture of Object.values(st.furniture||{})){
      if(!Array.isArray(furniture.spatial?.solids)||!furniture.spatial.solids.length)throw new Error('Furniture '+furniture.id+' has invalid runtime metric solids.');
      const surface=furniture.spatial?.surface;
      if(surface&&(!surface.id||!Array.isArray(surface.cells)||!surface.sourceSolidKey))throw new Error('Furniture '+furniture.id+' has invalid runtime surface geometry.');
    }
    return st;
  }
  function surfaceEntries(st){return Object.values(st.furniture||{}).flatMap(f=>f.spatial?.surface?[{furniture:f,surface:f.spatial.surface}]:[]);}
  function surfaceEntry(st,surfaceId){return surfaceEntries(st).find(x=>x.surface.id===surfaceId)||null;}
  function surfaceAt(st,p){return surfaceEntries(st).find(({surface})=>(surface.cells||[]).some(c=>localSame(c,p)))||null;}
  function furnitureSolids(st,z){return Object.values(st.furniture||{}).flatMap(f=>f.spatial?.solids||[]).filter(solid=>solid.layerZ===z);}
  function floorGeometry(st,p){return D.analyzeFloorTile(furnitureSolids(st,zOf(p)),p.x,p.y,zOf(p));}
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
      const envelope=movementEnvelopeFor(agent,'walk');
      if(!envelope||!D.envelopeFitsTile(furnitureSolids(st,zOf(p)),p.x,p.y,zOf(p),envelope.clearanceHeight,envelope.clearanceWidth))return false;
    }
    return true;
  }
  function movementEnvelopeFor(agent,mode='walk'){
    const runtime=physicalRuntime()?.getMovementEnvelope?.(agent,mode);
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
  function floorNodeFitsMode(st,p,agent,mode='walk'){
    const n=normalizeNode(st,p,FLOOR);if(!n||fixedFloorBlocker(st,n))return false;
    if(!agent)return true;
    const envelope=movementEnvelopeFor(agent,mode);if(!envelope)return false;
    return D.envelopeFitsTile(furnitureSolids(st,zOf(n)),n.x,n.y,zOf(n),envelope.clearanceHeight,envelope.clearanceWidth);
  }
  function surfaceWalkable(st,node,agent=null){
    const entry=surfaceEntry(st,node.surfaceId);if(!entry||!entry.surface.traversable||!isSurfaceCell(entry,node))return false;
    return !agent||!entry.surface.allowKinds?.length||entry.surface.allowKinds.includes(agent.kind);
  }
  function nodeWalkable(st,p,aOrId=null){const a=agentFor(st,aOrId),n=normalizeNode(st,p);if(!n)return false;return n.surfaceId===FLOOR?floorWalkable(st,n,a):surfaceWalkable(st,n,a);}

  function nodeForAgent(st,a){return normalizeNode(st,a?.position);}
  function objectNode(st,id){
    const holder=SP.holderOf(st,id);if(holder)return nodeForAgent(st,holder);
    const c=st.containers?.[id],s=st.sources?.[id],obj=c||s;if(!obj?.position)return null;
    let surfaceId=obj.position.surfaceId||FLOOR;
    if(c?.supportId){const entry=st.furniture?.[c.supportId]?.spatial?.surface; if(entry)surfaceId=entry.id;}
    return normalizeNode(st,obj.position,surfaceId);
  }
  function nodeOccupantsAt(st,p,except=null){const n=normalizeNode(st,p);return Object.values(st.agents||{}).filter(a=>!a.offMap&&!a.posture?.slotId&&a.id!==except&&nodeSame(st,a.position,n));}

  const APPROACH_DELTA=Object.freeze({north:[0,-1],east:[1,0],south:[0,1],west:[-1,0]});
  function slotApproachNodes(st,slotOrId,aOrId=null,mode='walk'){
    const slot=typeof slotOrId==='string'?SP.getSlot?.(st,slotOrId):slotOrId,a=agentFor(st,aOrId),out=new Map();
    if(!slot?.position)return[];
    const anchor=normalizeNode(st,slot.position,FLOOR),geometry=floorGeometry(st,anchor);
    if(floorNodeFitsMode(st,anchor,a,mode)){
      for(const edge of slot.approachEdges||[])if((geometry.edgeIntervals?.[edge]||[]).length){out.set(nodeKey(st,anchor),anchor);break;}
    }
    for(const edge of slot.approachEdges||[]){
      const delta=APPROACH_DELTA[edge];if(!delta)continue;
      const q=normalizeNode(st,localPos(anchor.x+delta[0],anchor.y+delta[1],zOf(anchor)),FLOOR);
      if(!floorNodeFitsMode(st,q,a,mode))continue;
      if(SP.edgeStructurallyOpen&&!SP.edgeStructurallyOpen(st,anchor,q))continue;
      out.set(nodeKey(st,q),q);
    }
    return [...out.values()];
  }
  function bestSlotApproachNode(st,slotOrId,aOrId=null,{mode='walk',objective='traversalCost'}={}){
    const a=agentFor(st,aOrId),candidates=slotApproachNodes(st,slotOrId,a,mode),ranked=[];
    for(const node of candidates){
      const route=a?planRoute(st,a,node,{mode:locomotionRuntime()?'auto':mode,objective}):null;
      const value=route?.[objective]??(route?.pathDistance??Infinity);
      if(!a||Number.isFinite(value))ranked.push({node,value,pathDistance:route?.pathDistance??0});
    }
    ranked.sort((x,y)=>x.value-y.value||x.pathDistance-y.pathDistance||nodeKey(st,x.node).localeCompare(nodeKey(st,y.node)));
    return ranked[0]?.node||null;
  }
  function slotEgressNodes(st,slotOrId,aOrId=null,mode='walk'){
    const a=agentFor(st,aOrId);
    return slotApproachNodes(st,slotOrId,a,mode).filter(node=>nodeOccupantsAt(st,node,a?.id).length===0);
  }
  function crowdingRuntime(){return window.SimCrowding||null;}
  function floorStepCost(st,node,a){const t=SP.tileByPos(st,node),wet=SP.tileLiquidAmount(t);let cost=1+wet*(a?.kind==='cat'?.015:.07);if(!crowdingRuntime()){const occupied=nodeOccupantsAt(st,node,a?.id).length;cost+=occupied*(a?.kind==='cat'?2.5:5);}return cost;}
  function surfaceStepCost(st,node,a){const entry=surfaceEntry(st,node.surfaceId),configured=entry?.surface?.moveCost?.[a?.kind];return configured??profile(a).surfaceMoveCost;}
  function baseTraversalEdgeCost(st,from,to,a){
    const structure=SP.structureBetween?.(st,from,to)||null;
    if(structure){
      const profile=STRUCTURE_TRAVERSAL_PROFILES[structure.kind];if(!profile)return Infinity;
      const direction=zOf(to)>zOf(from)?'up':'down';
      return floorStepCost(st,to,a)+(direction==='up'?profile.upBurden:profile.downBurden);
    }
    if(from.surfaceId===to.surfaceId)return to.surfaceId===FLOOR?floorStepCost(st,to,a):surfaceStepCost(st,to,a);
    const surfaceNode=from.surfaceId===FLOOR?to:from,entry=surfaceEntry(st,surfaceNode.surfaceId);if(!entry)return Infinity;
    return entry.surface.transitionCost?.[a?.kind]??profile(a).transitionCost;
  }
  function traversalEdgeCost(st,from,to,a,mode=null,fromMode=mode){
    const crowdingSnapshot=arguments[6]||null;
    const base=baseTraversalEdgeCost(st,from,to,a);if(!Number.isFinite(base))return base;
    const resolvedMode=mode||a?.locomotion?.mode||locomotionRuntime()?.modeFromPosture?.(a)||'walk';
    const locomotion=locomotionRuntime(),modeBurden=locomotion?.modeTraversalBurden?.(a,resolvedMode)??0,transitionBurden=locomotion?.modeTransitionBurden?.(a,fromMode,resolvedMode)??0;
    if(!Number.isFinite(modeBurden)||!Number.isFinite(transitionBurden))return Infinity;
    const crowding=crowdingSnapshot||crowdingRuntime()?.getCrowdingProfile?.(st,a,from,to,resolvedMode)||null;
    return base+modeBurden+transitionBurden+(crowding?.congestionCost||0);
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
      for(const [dx,dy] of DIRS){const q=normalizeNode(st,localPos(n.x+dx,n.y+dy,zOf(n)),FLOOR);if(nodeWalkable(st,q,a)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,n,q))&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
      for(const q of SP.structureNeighborNodes?.(st,n)||[])if(nodeWalkable(st,q,a)&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);
      for(const entry of surfaceEntries(st)){
        if(entry.surface.allowKinds?.length&&a&&!entry.surface.allowKinds.includes(a.kind))continue;
        for(const c of entry.surface.cells||[]){if(!sameLayer(c,n)||Math.abs(c.x-n.x)+Math.abs(c.y-n.y)!==1||isFootprintCell(entry,n))continue;const q=normalizeNode(st,c,entry.surface.id);if(nodeWalkable(st,q,a)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,n,c))&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
      }
    }else{
      const entry=surfaceEntry(st,n.surfaceId);if(!entry)return [];
      for(const [dx,dy] of DIRS){const q=normalizeNode(st,localPos(n.x+dx,n.y+dy,zOf(n)),n.surfaceId);if(nodeWalkable(st,q,a)&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
      for(const q of outsidePerimeterFloorNodes(st,entry,a)){if(sameLayer(q,n)&&Math.abs(q.x-n.x)+Math.abs(q.y-n.y)===1&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
    }
    return [...out.values()];
  }
  function locomotionRuntime(){return window.SimLocomotion||null;}
  function physicalRuntime(){return window.SimPhysical||null;}
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
  function candidateTraversalNeighbors(st,p,aOrId=null){
    const a=agentFor(st,aOrId),n=normalizeNode(st,p),out=new Map();if(!n||!nodeLocomotionAccessible(st,n,a))return [];
    if(n.surfaceId===FLOOR){
      for(const [dx,dy] of DIRS){const q=normalizeNode(st,localPos(n.x+dx,n.y+dy,zOf(n)),FLOOR);if(nodeLocomotionAccessible(st,q,a)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,n,q)))out.set(nodeKey(st,q),q);}
      for(const q of SP.structureNeighborNodes?.(st,n)||[])if(nodeLocomotionAccessible(st,q,a))out.set(nodeKey(st,q),q);
      for(const entry of surfaceEntries(st)){
        if(entry.surface.allowKinds?.length&&a&&!entry.surface.allowKinds.includes(a.kind))continue;
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
  function edgeMoveTicks(st,a,from,to,mode,crowdingSnapshot=null){const C=crowdingRuntime(),ticks=C?.edgeMoveTicks?.(st,a,from,to,mode,crowdingSnapshot)??locomotionRuntime()?.edgeMoveTicks?.(a,mode);return Number.isFinite(ticks)&&ticks>0?ticks:1;}
  function transitionTicks(fromMode,toMode){const ticks=locomotionRuntime()?.transitionTicks?.(fromMode,toMode);return Number.isFinite(ticks)&&ticks>=0?ticks:(fromMode===toMode?0:0);}
  function routeStateKey(st,node,mode){return `${nodeKey(st,node)}|mode:${mode||'none'}`;}
  function compareRouteScore(a,b){return (a.primary-b.primary)||(a.time-b.time)||(a.transitions-b.transitions)||(a.modeRank-b.modeRank);}
  function routeSearch(st,start,goal,aOrId=null,{objective='traversalCost',mode=null}={}){
    if(objective!=='traversalCost'&&objective!=='pathDistance')throw new RangeError(`Unsupported route objective: ${objective}`);
    const a=agentFor(st,aOrId),s=normalizeNode(st,start),g=normalizeNode(st,goal),requested=resolvedRequestedMode(mode),modes=availableModes(a,requested);
    if(!s||!g||!nodeLocomotionAccessible(st,s,a)||!nodeLocomotionAccessible(st,g,a))return {path:[],steps:[],startMode:currentLocomotionMode(a),requestedMode:requested};
    const startMode=currentLocomotionMode(a);
    if(nodeSame(st,s,g))return {path:[cloneNode(s)],steps:[],startMode,requestedMode:requested};
    const sk=routeStateKey(st,s,startMode),open=new Set([sk]),came={},score={[sk]:{primary:0,time:0,transitions:0,modeRank:0}},states={[sk]:{node:s,mode:startMode}};
    while(open.size){
      let ck=null,best=null;
      for(const k of open){const value=score[k];if(!best||compareRouteScore(value,best)<0){best=value;ck=k;}}
      const cur=states[ck];open.delete(ck);
      if(nodeSame(st,cur.node,g)){
        const steps=[];let k=ck;
        while(came[k]){steps.unshift(came[k].step);k=came[k].prev;}
        return {path:[cloneNode(s),...steps.map(step=>cloneNode(step.to))],steps,startMode,requestedMode:requested};
      }
      for(const q of candidateTraversalNeighbors(st,cur.node,a)){
        const feasibility=SP.traversalFeasibility?.(st,a,cur.node,q)||null;
        for(const nextMode of modes){
          if(!modeEdgeFeasible(st,a,cur.node,q,nextMode,feasibility))continue;
          const transition=transitionTicks(cur.mode,nextMode),crowding=crowdingRuntime()?.getCrowdingProfile?.(st,a,cur.node,q,nextMode,feasibility)||null,moveTicks=edgeMoveTicks(st,a,cur.node,q,nextMode,crowding),edgeCost=traversalEdgeCost(st,cur.node,q,a,nextMode,cur.mode,crowding);
          if(!Number.isFinite(edgeCost)||!Number.isFinite(moveTicks))continue;
          const nextScore={
            primary:best.primary+(objective==='pathDistance'?1:edgeCost),
            time:best.time+transition+moveTicks,
            transitions:best.transitions+(transition>0?1:0),
            modeRank:best.modeRank+modeRank(nextMode)
          };
          const qk=routeStateKey(st,q,nextMode);
          if(score[qk]&&compareRouteScore(nextScore,score[qk])>=0)continue;
          const step={from:cloneNode(cur.node),to:cloneNode(q),fromMode:cur.mode,mode:nextMode,transitionTicks:transition,moveTicks,speedFactor:physicalRuntime()?.getMovementEnvelope?.(a,nextMode)?.speedFactor??1,modeTraversalBurden:locomotionRuntime()?.modeTraversalBurden?.(a,nextMode)??0,modeTransitionBurden:locomotionRuntime()?.modeTransitionBurden?.(a,cur.mode,nextMode)??0,edgeTraversalCost:edgeCost,congestion:crowding};
          came[qk]={prev:ck,step};score[qk]=nextScore;states[qk]={node:q,mode:nextMode};open.add(qk);
        }
      }
    }
    return {path:[],steps:[],startMode,requestedMode:requested};
  }
  function routeMetrics(st,a,route){
    if(!route?.path?.length)return {pathDistance:Infinity,traversalCost:Infinity,travelTime:Infinity,transitionTicks:Infinity};
    let traversalCost=0,travelTime=0,transitions=0;
    for(const step of route.steps||[]){traversalCost+=Number.isFinite(step.edgeTraversalCost)?step.edgeTraversalCost:traversalEdgeCost(st,step.from,step.to,a,step.mode,step.fromMode??step.mode);travelTime+=step.transitionTicks+step.moveTicks;transitions+=step.transitionTicks;}
    return {pathDistance:Math.max(0,route.path.length-1),traversalCost,travelTime,transitionTicks:transitions};
  }
  function planRoute(st,aOrId,goal,{mode=null,objective='traversalCost'}={}){
    const a=agentFor(st,aOrId),requested=resolvedRequestedMode(mode);
    if(!a)return {path:[],steps:[],mode:requested,requestedMode:requested,objective,pathDistance:Infinity,traversalCost:Infinity,travelTime:Infinity,transitionTicks:Infinity};
    const route=routeSearch(st,a.position,goal,a,{objective,mode:requested}),metrics=routeMetrics(st,a,route),used=[...new Set((route.steps||[]).map(step=>step.mode))];
    const selectedMode=used.length===1?used[0]:used.length>1?'mixed':route.startMode||requested;
    return {path:route.path,steps:route.steps,mode:selectedMode,requestedMode:requested,objective,startMode:route.startMode,...metrics};
  }
  function astar(st,start,goal,agentId=null){const a=agentFor(st,agentId),requested=locomotionRuntime()?'auto':'walk';return routeSearch(st,start,goal,a,{objective:'traversalCost',mode:requested}).path;}
  function traversalCost(st,aOrId,p){return planRoute(st,aOrId,p,{mode:locomotionRuntime()?'auto':'walk',objective:'traversalCost'}).traversalCost;}
  function pathCost(st,aOrId,p){return traversalCost(st,aOrId,p);}
  function pathDistance(st,aOrId,p){return planRoute(st,aOrId,p,{mode:locomotionRuntime()?'auto':'walk',objective:'pathDistance'}).pathDistance;}
  function travelTime(st,aOrId,p){return planRoute(st,aOrId,p,{mode:locomotionRuntime()?'auto':'walk',objective:'traversalCost'}).travelTime;}

  function floorReachNodes(st,p,agent,{includeSelf=true}={}){const out=new Map(),target=normalizeNode(st,p,FLOOR);for(const [dx,dy] of DIRS){const q=normalizeNode(st,localPos(target.x+dx,target.y+dy,zOf(target)),FLOOR);if(nodeWalkable(st,q,agent)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,target,q)))out.set(nodeKey(st,q),q);}if(includeSelf&&nodeWalkable(st,target,agent))out.set(nodeKey(st,target),target);return [...out.values()];}
  function surfaceLocalReachNodes(st,node,agent){const target=normalizeNode(st,node),out=new Map();if(nodeWalkable(st,target,agent))out.set(nodeKey(st,target),target);for(const [dx,dy] of DIRS){const q=normalizeNode(st,localPos(target.x+dx,target.y+dy,zOf(target)),target.surfaceId);if(nodeWalkable(st,q,agent))out.set(nodeKey(st,q),q);}return [...out.values()];}
  function crossSurfaceContactNodes(st,node,agent,affordance){
    if(!agent||agent.kind!=='human')return [];
    const target=normalizeNode(st,node),entry=surfaceEntry(st,target.surfaceId);if(!entry)return [];
    const allowed=new Set(['pickup','serve','eatFrom','drinkFrom','fill','takeResource','deposit','receive','default']);if(!allowed.has(affordance))return [];
    const out=[];for(const [dx,dy] of DIRS){const p=localPos(target.x+dx,target.y+dy,zOf(target));if(isFootprintCell(entry,p))continue;const q=normalizeNode(st,p,FLOOR);if(nodeWalkable(st,q,agent)&&(!SP.edgeStructurallyOpen||SP.edgeStructurallyOpen(st,target,q)))out.push(q);}return out;
  }
  function supportContactNodes(st,supportId,agent){
    const f=st.furniture?.[supportId],entry=f?.spatial?.surface;if(!f)return [];
    const out=new Map();
    if(entry){for(const q of outsidePerimeterFloorNodes(st,{furniture:f,surface:entry},agent))out.set(nodeKey(st,q),q);for(const c of entry.cells||[]){const q=normalizeNode(st,c,entry.id);if(nodeWalkable(st,q,agent))out.set(nodeKey(st,q),q);}}
    else for(const p of baseInteractionGeometry(st,{kind:'furniture',id:supportId},agent,'default').positions||[]){const q=normalizeNode(st,p,FLOOR);if(nodeWalkable(st,q,agent))out.set(nodeKey(st,q),q);}
    return [...out.values()];
  }
  function dedupeNodes(st,list){const out=new Map();for(const p of list||[]){const n=normalizeNode(st,p);if(n)out.set(nodeKey(st,n),n);}return [...out.values()];}

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
      const c=st.containers?.[target.id];if(!c)return {mode:'none',positions:[],target,affordance};
      const holder=SP.holderOf(st,target.id),node=objectNode(st,target.id);if(!node)return {mode:'none',positions:[],target,affordance};
      if(holder){const positions=holder.id===agent?.id?[nodeForAgent(st,agent)]:agentContactNodes(st,holder,agent);return {mode:'heldReach',positions:dedupeNodes(st,positions),target,affordance,holderId:holder.id};}
      const rule=c.interactions?.[affordance]||c.interactions?.default||null;
      if(rule?.mode==='supportReach'&&c.supportId)return {mode:'supportReach',positions:supportContactNodes(st,c.supportId,agent),target,affordance,supportId:c.supportId};
      if(rule?.mode==='occupy')return {mode:'occupy',positions:nodeWalkable(st,node,agent)?[node]:[],target,affordance};
      if(node.surfaceId!==FLOOR){
        const local=surfaceLocalReachNodes(st,node,agent),cross=crossSurfaceContactNodes(st,node,agent,affordance);
        if(rule?.mode==='reach'||affordance==='eatFrom'||affordance==='drinkFrom'||affordance==='pickup')return {mode:'reach',positions:dedupeNodes(st,[...local,...cross]),target,affordance,surfaceId:node.surfaceId};
        if(c.supportId)return {mode:'supportReach',positions:supportContactNodes(st,c.supportId,agent),target,affordance,supportId:c.supportId};
        return {mode:'reach',positions:dedupeNodes(st,[...local,...cross]),target,affordance,surfaceId:node.surfaceId};
      }
      if(rule?.mode==='reach')return {mode:'reach',positions:floorReachNodes(st,node,agent),target,affordance};
      const legacy=baseInteractionGeometry(st,target,agent,affordance);return {...legacy,positions:(legacy.positions||[]).map(p=>normalizeNode(st,p,FLOOR))};
    }
    const legacy=baseInteractionGeometry(st,target,agent,affordance);return {...legacy,positions:(legacy.positions||[]).map(p=>normalizeNode(st,p,FLOOR))};
  }
  function interactionPositions(st,target,agent,affordance='default'){return interactionGeometry(st,target,agent,affordance).positions;}
  function bestInteractionPosition(st,a,target,affordance='default'){
    const C=crowdingRuntime();let list=interactionPositions(st,target,a,affordance).map(p=>({p,d:pathCost(st,a,p),occ:nodeOccupantsAt(st,p,a.id).length})).filter(x=>Number.isFinite(x.d));
    const current=nodeForAgent(st,a),differentNodeSameXY=x=>localSame(current,x.p)&&!nodeSame(st,current,x.p);if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));
    list.sort((x,y)=>(C?0:x.occ-y.occ)||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));return list[0]?.p||null;
  }
  function isAtInteraction(st,a,target,affordance='default'){const here=nodeForAgent(st,a);return interactionPositions(st,target,a,affordance).some(p=>nodeSame(st,here,p));}
  function canInteract(st,a,target,affordance='default'){return isAtInteraction(st,a,target,affordance);}


  function describePlace(st,aOrPos){if(aOrPos?.offMap)return '門外';const p=aOrPos?.position||aOrPos,n=normalizeNode(st,p);if(n.surfaceId!==FLOOR){const entry=surfaceEntry(st,n.surfaceId);if(entry)return entry.surface.label||`${entry.furniture.name}表面`;}
    const overhead=overheadAt(st,n);if(overhead.length)return `${overhead[0].name}下`;return baseDescribePlace(st,aOrPos);}
  W.registerInitialStateInitializer('spatial.schema',(st)=>{ensureSpatialDefs(st);},10);
  SP.walkable=(st,p)=>nodeWalkable(st,p,null);
  SP.astar=astar;
  SP.pathDistance=pathDistance;
  SP.traversalCost=traversalCost;
  SP.travelTime=travelTime;
  SP.planRoute=planRoute;
  SP.interactionGeometry=interactionGeometry;
  SP.interactionPositions=interactionPositions;
  SP.bestInteractionPosition=bestInteractionPosition;
  SP.isAtInteraction=isAtInteraction;
  SP.describePlace=describePlace;
  Object.assign(SP,{VERSION,SPATIAL_IDENTITY_VERSION,ROUTE_SEMANTICS_VERSION:'11.24.0-route-locomotion-cost',TRAVERSAL_PROFILES,STRUCTURE_TRAVERSAL_PROFILES,nodeKey,nodeSame,nodeForAgent,objectNode,nodeOccupantsAt,nodeWalkable,nodeLocomotionAccessible,traversalNeighbors,traversalEdgeCost,pathCost,pathDistance,traversalCost,travelTime,planRoute,canInteract,surfaceEntry,surfaceAt,overheadAt,supportContactNodes,furnitureSolids,floorGeometry,movementEnvelopeFor,floorNodeFitsMode,slotApproachNodes,bestSlotApproachNode,slotEgressNodes});
})();