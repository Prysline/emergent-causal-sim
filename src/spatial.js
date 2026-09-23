(() => {
  const W=window.SimWorld;if(!W)return;
  const {WIDTH,HEIGHT,RESOURCE_TYPES}=W;
  const FLOOR='floor';
  const zOf=p=>p?.z??0;
  const position=(x,y,z=0)=>z===0?{x,y}:{x,y,z};
  const key=p=>p?(zOf(p)===0?`${p.x},${p.y}`:`${p.x},${p.y},${zOf(p)}`):'?';
  const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y&&zOf(a)===zOf(b);
  const manhattan=(a,b)=>a&&b?Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+Math.abs(zOf(a)-zOf(b)):Infinity;
  const clonePos=p=>p?position(p.x,p.y,zOf(p)):null;
  const inBounds=p=>!!p&&p.x>=0&&p.y>=0&&p.x<WIDTH&&p.y<HEIGHT&&Number.isInteger(zOf(p));
  const hasRole=(obj,role)=>!!obj?.roles?.includes(role);
  function boundaryIdBetween(a,b){
    if(!a||!b||zOf(a)!==zOf(b)||Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)return null;
    if(a.y===b.y)return 'v:'+Math.max(a.x,b.x)+','+a.y;
    return 'h:'+a.x+','+Math.max(a.y,b.y);
  }
  const boundaryRuntimeKey=(z,id)=>z+'|'+id;
  function boundaryById(st,z,id){return st.map?.boundaries?.[boundaryRuntimeKey(z,id)]||null;}
  function boundaryBetween(st,a,b){const id=boundaryIdBetween(a,b);return id?boundaryById(st,zOf(a),id):null;}
  function doorsForBoundary(st,z,id){return Object.values(st.doors||{}).filter(door=>door?.boundary?.z===z&&door?.boundary?.id===id);}
  function edgeStructurallyOpen(st,a,b){
    const id=boundaryIdBetween(a,b);if(!id)return false;
    const boundary=boundaryById(st,zOf(a),id);if(!boundary)return true;
    if(boundary.kind==='wall')return false;
    if(boundary.kind!=='opening')return false;
    return doorsForBoundary(st,zOf(a),id).every(door=>door.state==='open');
  }
  function allStructures(st){return Object.values(st.structures||{});}
  function getStructure(st,id){return st.structures?.[id]||null;}
  function structureEndpointMatches(node,endpoint){
    return !!node&&!!endpoint&&node.x===endpoint.x&&node.y===endpoint.y&&zOf(node)===zOf(endpoint)&&(node.surfaceId??'floor')==='floor';
  }
  function structureBetween(st,a,b){
    if(!a||!b)return null;
    return allStructures(st).find(structure=>
      (structureEndpointMatches(a,structure.lower)&&structureEndpointMatches(b,structure.upper))
      ||(structureEndpointMatches(a,structure.upper)&&structureEndpointMatches(b,structure.lower))
    )||null;
  }
  function structureNeighborNodes(st,p){
    if(!p||(p.surfaceId??'floor')!=='floor')return [];
    const out=[];
    for(const structure of allStructures(st)){
      if(structureEndpointMatches(p,structure.lower))out.push(normalizeNode(st,structure.upper,'floor'));
      else if(structureEndpointMatches(p,structure.upper))out.push(normalizeNode(st,structure.lower,'floor'));
    }
    return out.filter(Boolean);
  }
  function allExits(st){return Object.values(st.exits||{});}
  function getExit(st,id){return st.exits?.[id]||null;}
  function exitStructurallyAvailable(st,exitOrId){
    const exit=typeof exitOrId==='string'?getExit(st,exitOrId):exitOrId,ref=exit?.boundary;
    if(!exit||exit.kind!=='offMap'||!ref||!exit.access)return false;
    const boundary=boundaryById(st,ref.z,ref.id);
    return boundary?.kind==='opening'&&doorsForBoundary(st,ref.z,ref.id).every(door=>door.state==='open');
  }

  function tileAt(st,x,y,z=0){return st.map?.tiles?.[key({x,y,z})]||null;}
  function tileByPos(st,p){return p?tileAt(st,p.x,p.y,zOf(p)):null;}
  function furniture(st,id){return st.furniture?.[id]||null;}
  function allSlots(st){return Object.values(st.furniture||{}).flatMap(f=>(f.slots||[]).map(s=>({...s,furnitureId:f.id})));}
  function getSlot(st,id){return allSlots(st).find(s=>s.id===id)||null;}
  function slotsForFurniture(st,id){const f=furniture(st,id);return (f?.slots||[]).map(s=>({...s,furnitureId:id}));}
  function slotAllows(slot,a){return !slot?.allowKinds?.length||slot.allowKinds.includes(a?.kind);}
  function slotOccupant(st,slotId,except=null){return Object.values(st.agents||{}).find(a=>a.id!==except&&a.posture?.slotId===slotId)||null;}
  function slotReservedBy(st,slotId,except=null){const aid=st.reservations?.[`slot:${slotId}`];return aid&&aid!==except?st.agents[aid]||null:null;}
  function slotAvailable(st,slotId,agentId=null){return !!getSlot(st,slotId)&&!slotOccupant(st,slotId,agentId)&&!slotReservedBy(st,slotId,agentId);}
  function furnitureAt(st,p){const t=tileByPos(st,p);return (t?.furnitureIds||[]).map(id=>furniture(st,id)).filter(Boolean);}

  function holderOf(st,containerId){return Object.values(st.agents||{}).find(a=>a.held===containerId)||null;}
  function objectPosition(st,id){const c=st.containers?.[id];if(c){const holder=holderOf(st,id);return holder?clonePos(holder.position):clonePos(c.position);}return clonePos(st.sources?.[id]?.position);}
  function occupantsAt(st,p,except=null){return Object.values(st.agents||{}).filter(a=>!a.offMap&&a.id!==except&&same(a.position,p));}

  function blockerAt(st,p){
    const t=tileByPos(st,p);if(!t||!t.walkable)return t?`terrain:${t.terrain}`:'out-of-bounds';
    const fixedContainer=Object.values(st.containers||{}).find(c=>c.portable===false&&!c.supportId&&same(objectPosition(st,c.id),p));if(fixedContainer)return `container:${fixedContainer.id}`;
    const source=Object.values(st.sources||{}).find(s=>s.blocksMovement!==false&&same(s.position,p));if(source)return `source:${source.id}`;
    return null;
  }
  function walkable(st,p){return !blockerAt(st,p);}

  function isRoomFloor(t){return !!t&&t.terrain==='floor';}
  function recomputeRooms(st){
    const tiles=st.map.tiles;for(const t of Object.values(tiles))t.roomId=null;
    const rooms={};let seq=0;const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const t of Object.values(tiles)){
      if(!isRoomFloor(t)||t.roomId)continue;
      const id=`room${++seq}`,queue=[t],floors=[];t.roomId=id;
      while(queue.length){
        const cur=queue.shift();floors.push(cur.id);
        for(const [dx,dy] of dirs){
          const n=tileAt(st,cur.x+dx,cur.y+dy,zOf(cur));
          if(isRoomFloor(n)&&!n.roomId&&edgeStructurallyOpen(st,cur,n)){n.roomId=id;queue.push(n);}
        }
      }
      const floorSet=new Set(floors),boundarySet=new Set(),furnitureSet=new Set();
      for(const tid of floors){
        const ft=tiles[tid];
        for(const fid of ft.furnitureIds||[])furnitureSet.add(fid);
        for(const [dx,dy] of dirs){
          const q=position(ft.x+dx,ft.y+dy,zOf(ft)),bid=boundaryIdBetween(ft,q),boundary=bid&&boundaryById(st,zOf(ft),bid);
          if(boundary)boundarySet.add(boundaryRuntimeKey(zOf(ft),bid));
        }
      }
      rooms[id]={id,name:seq===1?'主室':`房間 ${seq}`,z:zOf(t),floorTiles:[...floorSet],wallBoundaries:[...boundarySet],furnitureIds:[...furnitureSet],area:floors.length};
    }
    st.map.rooms=rooms;st.map.roomRevision=(st.map.roomRevision||0)+1;return rooms;
  }
  function roomAt(st,p){return tileByPos(st,p)?.roomId||null;}
  function roomSpaceId(st,p){return p?.spaceId||roomAt(st,p)||'world';}
  function normalizeNode(st,p,surfaceId=null){if(!p)return null;const out={x:p.x,y:p.y,spaceId:roomSpaceId(st,p),surfaceId:surfaceId||p.surfaceId||FLOOR};if(zOf(p)!==0)out.z=zOf(p);return out;}
  function roomMetrics(st,id){const r=st.map.rooms?.[id];if(!r)return null;const sample=r.floorTiles.map(tid=>st.map.tiles[tid]);const avgNoise=sample.length?sample.reduce((s,t)=>s+noiseAt(st,t),0)/sample.length:0,avgComfort=sample.length?sample.reduce((s,t)=>s+comfortAt(st,t),0)/sample.length:0;return {...r,avgNoise,avgComfort};}

  function tileLiquidAmount(t){return Object.entries(t?.surface?.contents||{}).reduce((sum,[r,v])=>sum+(RESOURCE_TYPES[r]?.phase==='liquid'?v:0),0);}
  function floorSlipRiskAt(st,p){return Math.min(45,tileLiquidAmount(tileByPos(st,p))*.55);}
  function wettestTile(st){let best=null,amt=.1;for(const t of Object.values(st.map.tiles)){const v=tileLiquidAmount(t);if(v>amt){amt=v;best=t;}}return best;}
  function noiseAt(st,p){if(!p)return 0;const targetRoom=roomAt(st,p);let total=1;for(const n of st.noiseEvents||[]){if(!n.position)continue;const d=manhattan(p,n.position),sameRoom=roomAt(st,n.position)===targetRoom;total+=(n.amount||0)/(1+d*.75)*(sameRoom?1:.18);}total+=Math.max(0,occupantsAt(st,p).length-1)*.8;return total;}
  function nearbyRestQuality(st,p){let best=0;for(const slot of allSlots(st)){if(!slot.canRest||!slot.position)continue;const d=manhattan(p,slot.position);if(d<=2)best=Math.max(best,(slot.restQuality||0)*(1-d*.18));}return best;}
  function comfortAt(st,p){const t=tileByPos(st,p);if(!t)return 0;const wet=tileLiquidAmount(t),crowd=Math.max(0,occupantsAt(st,p).length-1);return Math.max(0,Math.min(100,48+nearbyRestQuality(st,p)*28-wet*1.2-crowd*5-noiseAt(st,p)*.35));}

  function tileCost(st,p,a){const t=tileByPos(st,p),wet=tileLiquidAmount(t),occupied=occupantsAt(st,p,a?.id).length;return 1+wet*(a?.kind==='cat'?.015:.07)+occupied*(a?.kind==='cat'?2.5:5);}
  function neighbors(st,p){const out=[],z=zOf(p);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=position(p.x+dx,p.y+dy,z);if(walkable(st,n)&&edgeStructurallyOpen(st,p,n))out.push(n);}return out;}
  function astar(st,start,goal,agentId=null){
    if(!start||!goal||!walkable(st,start)||!walkable(st,goal))return [];if(same(start,goal))return [clonePos(start)];
    const a=agentId?st.agents?.[agentId]:null,open=new Set([key(start)]),came={},g={[key(start)]:0},f={[key(start)]:manhattan(start,goal)},pos={[key(start)]:clonePos(start)};
    while(open.size){let ck=null,b=Infinity;for(const k of open){const v=f[k]??Infinity;if(v<b){b=v;ck=k;}}const cur=pos[ck];if(ck===key(goal)){const path=[clonePos(goal)];let k=ck;while(came[k]){k=came[k];path.unshift(clonePos(pos[k]));}return path;}open.delete(ck);for(const n of neighbors(st,cur)){const nk=key(n),tent=(g[ck]??Infinity)+tileCost(st,n,a);if(tent<(g[nk]??Infinity)){came[nk]=ck;g[nk]=tent;f[nk]=tent+manhattan(n,goal);pos[nk]=clonePos(n);open.add(nk);}}}
    return [];
  }
  function pathDistance(st,a,p){const path=astar(st,a.position,p,a.id);return path.length?path.length-1:Infinity;}
  function adjacentWalkable(st,p){const out=[],z=zOf(p);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const q=position(p.x+dx,p.y+dy,z);if(walkable(st,q)&&edgeStructurallyOpen(st,p,q))out.push(q);}return out;}
  function dedupeWalkable(st,list){const out=new Map();for(const p of list||[])if(p&&walkable(st,p))out.set(key(p),clonePos(p));return [...out.values()];}
  function reachPositions(st,p,{includeSelf=true}={}){if(!p)return [];const out=adjacentWalkable(st,p);if(includeSelf&&walkable(st,p))out.push(clonePos(p));return dedupeWalkable(st,out);}
  function interactionRule(obj,affordance){return obj?.interactions?.[affordance]||obj?.interactions?.default||null;}
  function interactionPortPositions(st,obj,affordance){return dedupeWalkable(st,(obj?.interactionPorts||[]).filter(p=>!p.affordances?.length||p.affordances.includes(affordance)).map(p=>p.position));}
  function supportReachPositions(st,supportId){const f=furniture(st,supportId);if(!f)return [];const out=[];for(const p of f.footprint||[])out.push(...adjacentWalkable(st,p));for(const slot of slotsForFurniture(st,supportId))if(slot.position)out.push(slot.position);return dedupeWalkable(st,out);}

  function interactionGeometry(st,target,agent=null,affordance='default'){
    if(!target)return {mode:'none',positions:[],target:null,affordance};
    if(target.kind==='slot'){const slot=getSlot(st,target.id),positions=slot?.position&&walkable(st,slot.position)?[clonePos(slot.position)]:[];return {mode:'slot',positions,target,affordance,slotId:slot?.id||null};}
    if(target.kind==='agent'){const other=st.agents?.[target.id];if(!other||other.offMap)return {mode:'socialReach',positions:[],target,affordance};return {mode:'socialReach',positions:reachPositions(st,other.position),target,affordance};}
    if(target.kind==='furniture'){const f=furniture(st,target.id);if(!f)return {mode:'furnitureReach',positions:[],target,affordance};const out=[];for(const slot of slotsForFurniture(st,f.id))if(slot.position)out.push(slot.position);for(const p of f.footprint||[])out.push(...adjacentWalkable(st,p));return {mode:'furnitureReach',positions:dedupeWalkable(st,out),target,affordance,furnitureId:f.id};}
    if(target.kind==='object'){
      const c=st.containers?.[target.id];if(!c)return {mode:'none',positions:[],target,affordance};const holder=holderOf(st,target.id),p=objectPosition(st,target.id);if(!p)return {mode:'none',positions:[],target,affordance};
      if(holder){const positions=holder.id===agent?.id?[clonePos(agent.position)]:reachPositions(st,p);return {mode:'heldReach',positions,target,affordance,holderId:holder.id};}
      const rule=interactionRule(c,affordance);
      if(rule?.mode==='port'){const positions=interactionPortPositions(st,c,affordance);return {mode:'port',positions,target,affordance,ports:c.interactionPorts||[]};}
      if(rule?.mode==='supportReach'&&c.supportId)return {mode:'supportReach',positions:supportReachPositions(st,c.supportId),target,affordance,supportId:c.supportId};
      if(rule?.mode==='occupy'&&walkable(st,p))return {mode:'occupy',positions:[clonePos(p)],target,affordance};
      if(rule?.mode==='reach')return {mode:'reach',positions:reachPositions(st,p),target,affordance};
      if(c.supportId)return {mode:'supportReach',positions:supportReachPositions(st,c.supportId),target,affordance,supportId:c.supportId};
      return {mode:'reach',positions:reachPositions(st,p),target,affordance};
    }
    if(target.kind==='source'){
      const src=st.sources?.[target.id],p=objectPosition(st,target.id);if(!src||!p)return {mode:'none',positions:[],target,affordance};const rule=interactionRule(src,affordance),ports=interactionPortPositions(st,src,affordance);
      if(rule?.mode==='occupy'&&walkable(st,p))return {mode:'occupy',positions:[clonePos(p)],target,affordance};
      if(rule?.mode==='reach')return {mode:'reach',positions:reachPositions(st,p),target,affordance};
      if(rule?.mode==='port'||ports.length)return {mode:'port',positions:ports,target,affordance,ports:src.interactionPorts||[]};
      return {mode:'reach',positions:reachPositions(st,p),target,affordance};
    }
    if(target.kind==='tile'){const positions=walkable(st,target.position)?[clonePos(target.position)]:[];return {mode:'tileContact',positions,target,affordance};}
    return {mode:'none',positions:[],target,affordance};
  }
  function interactionPositions(st,target,agent,affordance='default'){return interactionGeometry(st,target,agent,affordance).positions;}
  function bestInteractionPosition(st,a,target,affordance='default'){const list=interactionPositions(st,target,a,affordance).map(p=>({p,d:pathDistance(st,a,p),occ:occupantsAt(st,p,a.id).length})).filter(x=>Number.isFinite(x.d));list.sort((x,y)=>x.occ-y.occ||x.d-y.d||manhattan(a.position,x.p)-manhattan(a.position,y.p));return list[0]?.p||null;}
  function isAtInteraction(st,a,target,affordance='default'){return interactionPositions(st,target,a,affordance).some(p=>same(p,a.position));}

  function targetPathDistances(st,a,positions,runtime){
    if(!positions.length)return[];
    const batch=runtime.pathDistances?.(st,a,positions);
    if(Array.isArray(batch)&&batch.length===positions.length)return batch;
    return positions.map(p=>runtime.pathDistance?.(st,a,p)??Infinity);
  }
  function restTargets(st,a){
    const runtime=window.SimSpatial,run=()=>{
      const out=[],pending=[];
      for(const slot of allSlots(st)){
        if(!slot.canRest||!slotAllows(slot,a)||!slotAvailable(st,slot.id,a.id))continue;
        const approach=runtime.bestSlotApproachNode?.(st,slot,a,{mode:'walk',objective:'traversalCost'})||null;
        if(!approach)continue;
        pending.push({kind:'slot',id:slot.id,position:clonePos(approach),slotPosition:clonePos(slot.position),quality:slot.restQuality||0,posture:slot.restPosture||'sitting'});
      }
      if(a.kind==='cat')for(const t of Object.values(st.map.tiles)){
        if(!(runtime.nodeWalkable?.(st,t,a)??walkable(st,t))||tileLiquidAmount(t)>.1)continue;
        pending.push({kind:'floor',id:`floor:${t.id}`,position:clonePos(t),quality:.42,posture:'lying'});
      }
      const distances=targetPathDistances(st,a,pending.map(target=>target.position),runtime);
      for(let i=0;i<pending.length;i++){
        const target=pending[i],d=distances[i];if(!Number.isFinite(d))continue;
        const occupied=runtime.nodeOccupantsAt?.(st,target.position,a.id).length||0;
        const score=target.kind==='slot'
          ?d-target.quality*9+noiseAt(st,target.position)*.35+occupied*4
          :d-target.quality*7+noiseAt(st,target.position)*.45+occupied*3;
        out.push({...target,score});
      }
      out.sort((x,y)=>x.score-y.score);return out;
    };
    return typeof runtime.withGeometrySnapshot==='function'?runtime.withGeometrySnapshot(st,run):run();
  }
  function sleepTargets(st,a){
    const runtime=window.SimSpatial,run=()=>{
      const out=[],pending=[];
      for(const slot of allSlots(st)){
        if(!slot.canSleep||!slotAllows(slot,a)||!slotAvailable(st,slot.id,a.id))continue;
        const approach=runtime.bestSlotApproachNode?.(st,slot,a,{mode:'walk',objective:'traversalCost'})||null;
        if(!approach)continue;
        pending.push({kind:'slot',id:slot.id,position:clonePos(approach),slotPosition:clonePos(slot.position),quality:slot.sleepQuality??slot.restQuality??.35,posture:'lying'});
      }
      const distances=targetPathDistances(st,a,pending.map(target=>target.position),runtime);
      for(let i=0;i<pending.length;i++){
        const target=pending[i],d=distances[i];if(!Number.isFinite(d))continue;
        const occupied=runtime.nodeOccupantsAt?.(st,target.position,a.id).length||0;
        out.push({...target,score:d-target.quality*18+noiseAt(st,target.position)*.55+occupied*4});
      }
      out.sort((x,y)=>x.score-y.score);return out;
    };
    return typeof runtime.withGeometrySnapshot==='function'?runtime.withGeometrySnapshot(st,run):run();
  }

  function nearestLabel(st,p){if(!p)return '未知位置';const candidates=[];for(const f of Object.values(st.furniture||{}))for(const fp of f.footprint||[]){const d=manhattan(p,fp);if(d<=1)candidates.push({d,name:d===0?f.name:`${f.name}旁`});}for(const o of [...Object.values(st.containers||{}),...Object.values(st.sources||{})]){const op=objectPosition(st,o.id);if(!op)continue;const d=manhattan(p,op);if(d<=1)candidates.push({d,name:d===0?o.name:`${o.name}旁`});}candidates.sort((a,b)=>a.d-b.d);if(candidates.length)return candidates[0].name;const rid=roomAt(st,p);return st.map.rooms?.[rid]?.name||`(${p.x}, ${p.y})`;}
  function describePlace(st,aOrPos){if(aOrPos?.offMap)return '門外';const p=aOrPos?.position||aOrPos;return nearestLabel(st,p);}
  function entitiesWithRole(st,role,collections=['containers','sources']){return collections.flatMap(k=>Object.values(st[k]||{})).filter(x=>hasRole(x,role));}

  window.SimSpatial={zOf,key,same,manhattan,clonePos,inBounds,tileAt,tileByPos,walkable,blockerAt,furniture,furnitureAt,allSlots,getSlot,slotsForFurniture,slotAllows,slotOccupant,slotReservedBy,slotAvailable,holderOf,objectPosition,occupantsAt,recomputeRooms,roomAt,normalizeNode,roomMetrics,tileLiquidAmount,floorSlipRiskAt,wettestTile,noiseAt,comfortAt,nearbyRestQuality,astar,pathDistance,adjacentWalkable,interactionGeometry,interactionPositions,bestInteractionPosition,isAtInteraction,restTargets,sleepTargets,describePlace,entitiesWithRole,hasRole,boundaryIdBetween,boundaryById,boundaryBetween,doorsForBoundary,edgeStructurallyOpen,allStructures,getStructure,structureBetween,structureNeighborNodes,allExits,getExit,exitStructurallyAvailable};
})();
