(() => {
  const W=window.SimWorld,SP=window.SimSpatial;if(!W||!SP)return;
  const VERSION='11.11-spatial-traversal';
  const baseCreateInitialState=W.createInitialState;
  const baseInit=SP.init;
  const baseDescribePlace=SP.describePlace;
  const baseInteractionGeometry=SP.interactionGeometry;
  const baseObjectPosition=SP.objectPosition;
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
  const TRAVERSAL_PROFILES={
    human:{requiredClearance:1.65,surfaceMoveCost:4,transitionCost:9},
    cat:{requiredClearance:.32,surfaceMoveCost:1.1,transitionCost:1.6}
  };
  const FLOOR='floor';

  function cloneNode(p){return p?{x:p.x,y:p.y,spaceId:p.spaceId||null,surfaceId:p.surfaceId||FLOOR}:null;}
  function xySame(a,b){return !!a&&!!b&&a.x===b.x&&a.y===b.y;}
  function roomSpaceId(st,p){return p?.spaceId||SP.roomAt(st,p)||'world';}
  function normalizeNode(st,p,surfaceId=null){if(!p)return null;return {x:p.x,y:p.y,spaceId:roomSpaceId(st,p),surfaceId:surfaceId||p.surfaceId||FLOOR};}
  function nodeKey(st,p){const n=normalizeNode(st,p);return n?`${n.spaceId}|${n.surfaceId}|${n.x},${n.y}`:'?';}
  function nodeSame(st,a,b){if(!a||!b)return false;const x=normalizeNode(st,a),y=normalizeNode(st,b);return x.x===y.x&&x.y===y.y&&x.spaceId===y.spaceId&&x.surfaceId===y.surfaceId;}
  function profile(agent){return TRAVERSAL_PROFILES[agent?.kind]||TRAVERSAL_PROFILES.human;}

  function installSpatialDefs(st){
    const table=st.furniture?.diningTable;
    if(table){
      table.spatial??={};
      table.spatial.surface={id:'diningTable:surface',label:'餐桌桌面',traversable:true,allowKinds:['human','cat'],cells:(table.footprint||[]).map(p=>({x:p.x,y:p.y})),moveCost:{human:4,cat:1.1},transitionCost:{human:9,cat:1.6}};
      table.spatial.under={clearance:.72,cover:'overhead'};
    }
    return st;
  }
  function surfaceEntries(st){return Object.values(st.furniture||{}).flatMap(f=>f.spatial?.surface?[{furniture:f,surface:f.spatial.surface}]:[]);}
  function surfaceEntry(st,surfaceId){return surfaceEntries(st).find(x=>x.surface.id===surfaceId)||null;}
  function surfaceAt(st,p){return surfaceEntries(st).find(({surface})=>(surface.cells||[]).some(c=>xySame(c,p)))||null;}
  function overheadAt(st,p){return Object.values(st.furniture||{}).filter(f=>f.spatial?.under&&(f.footprint||[]).some(fp=>xySame(fp,p)));}
  function isSurfaceCell(entry,p){return !!entry&&(entry.surface.cells||[]).some(c=>xySame(c,p));}
  function isFootprintCell(entry,p){return !!entry&&(entry.furniture.footprint||[]).some(c=>xySame(c,p));}
  function agentFor(st,aOrId){if(typeof aOrId==='string')return st.agents?.[aOrId]||null;return aOrId||null;}

  function fixedFloorBlocker(st,p){
    const t=SP.tileByPos(st,p);if(!t||!t.walkable||t.terrain!=='floor')return t?`terrain:${t.terrain}`:'out-of-bounds';
    const furniture=(t.furnitureIds||[]).map(id=>st.furniture?.[id]).filter(Boolean);
    const solid=furniture.find(f=>f.blocksMovement&&!f.spatial?.under);if(solid)return `furniture:${solid.id}`;
    const fixedContainer=Object.values(st.containers||{}).find(c=>c.portable===false&&!c.supportId&&xySame(baseObjectPosition(st,c.id),p));if(fixedContainer)return `container:${fixedContainer.id}`;
    const source=Object.values(st.sources||{}).find(s=>s.blocksMovement!==false&&xySame(s.position,p));if(source)return `source:${source.id}`;
    return null;
  }
  function floorWalkable(st,p,agent=null){
    if(fixedFloorBlocker(st,p))return false;
    if(agent){const needed=window.SimPhysical?.requiredClearance?.(agent,'walk')??profile(agent).requiredClearance;for(const f of overheadAt(st,p)){if((f.spatial?.under?.clearance??Infinity)<needed)return false;}}
    return true;
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
  function nodeOccupantsAt(st,p,except=null){const n=normalizeNode(st,p);return Object.values(st.agents||{}).filter(a=>!a.offMap&&a.id!==except&&nodeSame(st,a.position,n));}

  function floorStepCost(st,node,a){const t=SP.tileByPos(st,node),wet=SP.tileLiquidAmount(t),occupied=nodeOccupantsAt(st,node,a?.id).length;return 1+wet*(a?.kind==='cat'?.015:.07)+occupied*(a?.kind==='cat'?2.5:5);}
  function surfaceStepCost(st,node,a){const entry=surfaceEntry(st,node.surfaceId),configured=entry?.surface?.moveCost?.[a?.kind];return configured??profile(a).surfaceMoveCost;}
  function traversalEdgeCost(st,from,to,a){
    if(from.surfaceId===to.surfaceId)return to.surfaceId===FLOOR?floorStepCost(st,to,a):surfaceStepCost(st,to,a);
    const surfaceNode=from.surfaceId===FLOOR?to:from,entry=surfaceEntry(st,surfaceNode.surfaceId);if(!entry)return Infinity;
    return entry.surface.transitionCost?.[a?.kind]??profile(a).transitionCost;
  }
  function walkEdgeFeasible(st,a,from,to){
    if(!a)return true;
    const check=SP.traversalFeasibility?.(st,a,from,to),walk=check?.modes?.walk;
    return walk?walk.feasible:true;
  }
  function outsidePerimeterFloorNodes(st,entry,agent){
    const out=new Map();for(const c of entry.surface.cells||[])for(const [dx,dy] of DIRS){const p={x:c.x+dx,y:c.y+dy};if(isFootprintCell(entry,p))continue;const n=normalizeNode(st,p,FLOOR);if(nodeWalkable(st,n,agent))out.set(nodeKey(st,n),n);}return [...out.values()];
  }
  function traversalNeighbors(st,p,aOrId=null){
    const a=agentFor(st,aOrId),n=normalizeNode(st,p),out=new Map();if(!n||!nodeWalkable(st,n,a))return [];
    if(n.surfaceId===FLOOR){
      for(const [dx,dy] of DIRS){const q=normalizeNode(st,{x:n.x+dx,y:n.y+dy},FLOOR);if(nodeWalkable(st,q,a)&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
      for(const entry of surfaceEntries(st)){
        if(entry.surface.allowKinds?.length&&a&&!entry.surface.allowKinds.includes(a.kind))continue;
        for(const c of entry.surface.cells||[]){if(Math.abs(c.x-n.x)+Math.abs(c.y-n.y)!==1||isFootprintCell(entry,n))continue;const q=normalizeNode(st,c,entry.surface.id);if(nodeWalkable(st,q,a)&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
      }
    }else{
      const entry=surfaceEntry(st,n.surfaceId);if(!entry)return [];
      for(const [dx,dy] of DIRS){const q=normalizeNode(st,{x:n.x+dx,y:n.y+dy},n.surfaceId);if(nodeWalkable(st,q,a)&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
      for(const q of outsidePerimeterFloorNodes(st,entry,a)){if(Math.abs(q.x-n.x)+Math.abs(q.y-n.y)===1&&walkEdgeFeasible(st,a,n,q))out.set(nodeKey(st,q),q);}
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
      for(const [dx,dy] of DIRS){const q=normalizeNode(st,{x:n.x+dx,y:n.y+dy},FLOOR);if(nodeLocomotionAccessible(st,q,a))out.set(nodeKey(st,q),q);}
      for(const entry of surfaceEntries(st)){
        if(entry.surface.allowKinds?.length&&a&&!entry.surface.allowKinds.includes(a.kind))continue;
        for(const cell of entry.surface.cells||[]){
          if(Math.abs(cell.x-n.x)+Math.abs(cell.y-n.y)!==1||isFootprintCell(entry,n))continue;
          const q=normalizeNode(st,cell,entry.surface.id);if(nodeLocomotionAccessible(st,q,a))out.set(nodeKey(st,q),q);
        }
      }
    }else{
      const entry=surfaceEntry(st,n.surfaceId);if(!entry)return [];
      for(const [dx,dy] of DIRS){const q=normalizeNode(st,{x:n.x+dx,y:n.y+dy},n.surfaceId);if(nodeLocomotionAccessible(st,q,a))out.set(nodeKey(st,q),q);}
      for(const cell of entry.surface.cells||[])for(const [dx,dy] of DIRS){
        const p={x:cell.x+dx,y:cell.y+dy};if(isFootprintCell(entry,p))continue;
        const q=normalizeNode(st,p,FLOOR);if(Math.abs(q.x-n.x)+Math.abs(q.y-n.y)===1&&nodeLocomotionAccessible(st,q,a))out.set(nodeKey(st,q),q);
      }
    }
    return [...out.values()];
  }
  function modeEdgeFeasible(st,a,from,to,mode){
    if(!a)return nodeLocomotionAccessible(st,to,null);
    const check=SP.traversalFeasibility?.(st,a,from,to),result=check?.modes?.[mode];
    if(result)return result.feasible===true;
    return mode==='walk'&&nodeWalkable(st,to,a)&&walkEdgeFeasible(st,a,from,to);
  }
  function modeRank(mode){return mode==='walk'?0:mode==='kneelCrawl'?1:mode==='proneCrawl'?2:9;}
  function currentLocomotionMode(a){return locomotionRuntime()?.modeFromPosture?.(a)||null;}
  function edgeMoveTicks(a,mode){const ticks=locomotionRuntime()?.edgeMoveTicks?.(a,mode);return Number.isFinite(ticks)&&ticks>0?ticks:1;}
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
        for(const nextMode of modes){
          if(!modeEdgeFeasible(st,a,cur.node,q,nextMode))continue;
          const transition=transitionTicks(cur.mode,nextMode),moveTicks=edgeMoveTicks(a,nextMode),edgeCost=traversalEdgeCost(st,cur.node,q,a);
          if(!Number.isFinite(edgeCost)||!Number.isFinite(moveTicks))continue;
          const nextScore={
            primary:best.primary+(objective==='pathDistance'?1:edgeCost),
            time:best.time+transition+moveTicks,
            transitions:best.transitions+(transition>0?1:0),
            modeRank:best.modeRank+modeRank(nextMode)
          };
          const qk=routeStateKey(st,q,nextMode);
          if(score[qk]&&compareRouteScore(nextScore,score[qk])>=0)continue;
          const step={from:cloneNode(cur.node),to:cloneNode(q),mode:nextMode,transitionTicks:transition,moveTicks,speedFactor:physicalRuntime()?.getMovementEnvelope?.(a,nextMode)?.speedFactor??1};
          came[qk]={prev:ck,step};score[qk]=nextScore;states[qk]={node:q,mode:nextMode};open.add(qk);
        }
      }
    }
    return {path:[],steps:[],startMode,requestedMode:requested};
  }
  function routeMetrics(st,a,route){
    if(!route?.path?.length)return {pathDistance:Infinity,traversalCost:Infinity,travelTime:Infinity,transitionTicks:Infinity};
    let traversalCost=0,travelTime=0,transitions=0;
    for(const step of route.steps||[]){traversalCost+=traversalEdgeCost(st,step.from,step.to,a);travelTime+=step.transitionTicks+step.moveTicks;transitions+=step.transitionTicks;}
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

  function floorReachNodes(st,p,agent,{includeSelf=true}={}){const out=new Map(),target=normalizeNode(st,p,FLOOR);for(const [dx,dy] of DIRS){const q=normalizeNode(st,{x:target.x+dx,y:target.y+dy},FLOOR);if(nodeWalkable(st,q,agent))out.set(nodeKey(st,q),q);}if(includeSelf&&nodeWalkable(st,target,agent))out.set(nodeKey(st,target),target);return [...out.values()];}
  function surfaceLocalReachNodes(st,node,agent){const target=normalizeNode(st,node),out=new Map();if(nodeWalkable(st,target,agent))out.set(nodeKey(st,target),target);for(const [dx,dy] of DIRS){const q=normalizeNode(st,{x:target.x+dx,y:target.y+dy},target.surfaceId);if(nodeWalkable(st,q,agent))out.set(nodeKey(st,q),q);}return [...out.values()];}
  function crossSurfaceContactNodes(st,node,agent,affordance){
    if(!agent||agent.kind!=='human')return [];
    const target=normalizeNode(st,node),entry=surfaceEntry(st,target.surfaceId);if(!entry)return [];
    const allowed=new Set(['pickup','serve','eatFrom','drinkFrom','fill','takeResource','deposit','receive','default']);if(!allowed.has(affordance))return [];
    const out=[];for(const [dx,dy] of DIRS){const p={x:target.x+dx,y:target.y+dy};if(isFootprintCell(entry,p))continue;const q=normalizeNode(st,p,FLOOR);if(nodeWalkable(st,q,agent))out.push(q);}return out;
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
    const target=nodeForAgent(st,targetAgent);if(!target)return [];
    if(target.surfaceId===FLOOR)return floorReachNodes(st,target,agent);
    const sameSurface=surfaceLocalReachNodes(st,target,agent),cross=agent?.kind==='human'?crossSurfaceContactNodes(st,target,agent,'default'):[];return dedupeNodes(st,[...sameSurface,...cross]);
  }
  function interactionGeometry(st,target,agent=null,affordance='default'){
    if(!target)return {mode:'none',positions:[],target:null,affordance};
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
    let list=interactionPositions(st,target,a,affordance).map(p=>({p,d:pathCost(st,a,p),occ:nodeOccupantsAt(st,p,a.id).length})).filter(x=>Number.isFinite(x.d));
    const current=nodeForAgent(st,a),differentNodeSameXY=x=>xySame(current,x.p)&&!nodeSame(st,current,x.p);if(list.some(x=>!differentNodeSameXY(x)))list=list.filter(x=>!differentNodeSameXY(x));
    list.sort((x,y)=>x.occ-y.occ||x.d-y.d||SP.manhattan(a.position,x.p)-SP.manhattan(a.position,y.p));return list[0]?.p||null;
  }
  function isAtInteraction(st,a,target,affordance='default'){const here=nodeForAgent(st,a);return interactionPositions(st,target,a,affordance).some(p=>nodeSame(st,here,p));}
  function canInteract(st,a,target,affordance='default'){return isAtInteraction(st,a,target,affordance);}

  function normalizePersistentPositions(st){
    for(const a of Object.values(st.agents||{})){if(!a.position)continue;const n=normalizeNode(st,a.position,a.position.surfaceId||FLOOR);a.position={...a.position,spaceId:n.spaceId,surfaceId:n.surfaceId};}
    for(const c of Object.values(st.containers||{})){if(!c.position)continue;const sid=c.supportId&&st.furniture?.[c.supportId]?.spatial?.surface?.id||c.position.surfaceId||FLOOR,n=normalizeNode(st,c.position,sid);c.position={...c.position,spaceId:n.spaceId,surfaceId:n.surfaceId};}
    for(const s of Object.values(st.sources||{})){if(!s.position)continue;const n=normalizeNode(st,s.position,s.position.surfaceId||FLOOR);s.position={...s.position,spaceId:n.spaceId,surfaceId:n.surfaceId};}
  }
  function init(st){installSpatialDefs(st);const result=baseInit(st);normalizePersistentPositions(st);return result;}
  function describePlace(st,aOrPos){if(aOrPos?.offMap)return '門外';const p=aOrPos?.position||aOrPos,n=normalizeNode(st,p);if(n.surfaceId!==FLOOR){const entry=surfaceEntry(st,n.surfaceId);if(entry)return entry.surface.label||`${entry.furniture.name}表面`;}
    const overhead=overheadAt(st,n);if(overhead.length)return `${overhead[0].name}下`;return baseDescribePlace(st,aOrPos);}

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{const st=baseCreateInitialState(seed);st.version=VERSION;installSpatialDefs(st);return st;};
  SP.init=init;
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
  Object.assign(SP,{VERSION,ROUTE_SEMANTICS_VERSION:'11.18.0-route-semantics-split',TRAVERSAL_PROFILES,normalizeNode,nodeKey,nodeSame,nodeForAgent,objectNode,nodeOccupantsAt,nodeWalkable,nodeLocomotionAccessible,traversalNeighbors,traversalEdgeCost,pathCost,pathDistance,traversalCost,travelTime,planRoute,canInteract,surfaceEntry,surfaceAt,overheadAt,supportContactNodes});
})();