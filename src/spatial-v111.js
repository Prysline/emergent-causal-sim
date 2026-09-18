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
  function heuristic(st,a,b){const x=normalizeNode(st,a),y=normalizeNode(st,b);return Math.abs(x.x-y.x)+Math.abs(x.y-y.y)+(x.surfaceId===y.surfaceId?0:1);}
  function routeSearch(st,start,goal,aOrId=null,{objective='traversalCost'}={}){
    if(objective!=='traversalCost'&&objective!=='pathDistance')throw new RangeError(`Unsupported route objective: ${objective}`);
    const a=agentFor(st,aOrId),s=normalizeNode(st,start),g=normalizeNode(st,goal);if(!s||!g||!nodeWalkable(st,s,a)||!nodeWalkable(st,g,a))return [];if(nodeSame(st,s,g))return [cloneNode(s)];
    const sk=nodeKey(st,s),gk=nodeKey(st,g),open=new Set([sk]),came={},score={[sk]:0},f={[sk]:heuristic(st,s,g)},pos={[sk]:s};
    while(open.size){let ck=null,best=Infinity;for(const k of open){const v=f[k]??Infinity;if(v<best){best=v;ck=k;}}const cur=pos[ck];if(ck===gk){const path=[cloneNode(g)];let k=ck;while(came[k]){k=came[k];path.unshift(cloneNode(pos[k]));}return path;}open.delete(ck);for(const q of traversalNeighbors(st,cur,a)){const qk=nodeKey(st,q),edge=objective==='pathDistance'?1:traversalEdgeCost(st,cur,q,a),tent=(score[ck]??Infinity)+edge;if(tent<(score[qk]??Infinity)){came[qk]=ck;score[qk]=tent;f[qk]=tent+heuristic(st,q,g);pos[qk]=q;open.add(qk);}}}
    return [];
  }
  function routeMetrics(st,a,path){
    if(!path?.length)return {pathDistance:Infinity,traversalCost:Infinity,travelTime:Infinity};
    let traversalCost=0;for(let i=1;i<path.length;i++)traversalCost+=traversalEdgeCost(st,path[i-1],path[i],a);
    const pathDistance=Math.max(0,path.length-1);
    return {pathDistance,traversalCost,travelTime:pathDistance};
  }
  function planRoute(st,aOrId,goal,{mode='walk',objective='traversalCost'}={}){
    const a=agentFor(st,aOrId);if(!a)return {path:[],mode,objective,pathDistance:Infinity,traversalCost:Infinity,travelTime:Infinity};
    if(mode!=='walk')throw new RangeError(`Route execution currently supports walk only, got: ${mode}`);
    const path=routeSearch(st,a.position,goal,a,{objective}),metrics=routeMetrics(st,a,path);
    return {path,mode,objective,...metrics};
  }
  function astar(st,start,goal,agentId=null){return routeSearch(st,start,goal,agentId,{objective:'traversalCost'});}
  function traversalCost(st,aOrId,p){return planRoute(st,aOrId,p,{mode:'walk',objective:'traversalCost'}).traversalCost;}
  function pathCost(st,aOrId,p){return traversalCost(st,aOrId,p);}
  function pathDistance(st,aOrId,p){return planRoute(st,aOrId,p,{mode:'walk',objective:'pathDistance'}).pathDistance;}
  function travelTime(st,aOrId,p){return planRoute(st,aOrId,p,{mode:'walk',objective:'traversalCost'}).travelTime;}

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
  Object.assign(SP,{VERSION,ROUTE_SEMANTICS_VERSION:'11.18.0-route-semantics-split',TRAVERSAL_PROFILES,normalizeNode,nodeKey,nodeSame,nodeForAgent,objectNode,nodeOccupantsAt,nodeWalkable,traversalNeighbors,traversalEdgeCost,pathCost,pathDistance,traversalCost,travelTime,planRoute,canInteract,surfaceEntry,surfaceAt,overheadAt,supportContactNodes});
})();