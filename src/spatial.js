(() => {
  const E=window.SimEngine;
  if(!E||E.__spatialV10)return;
  E.__spatialV10=true;

  const baseTick=E.tick.bind(E);
  const baseReset=E.reset.bind(E);
  const WIDTH=12,HEIGHT=8;
  const SENTINEL=Object.freeze({intent:'__spatialMove',phase:'move'});
  const planMeta=new WeakMap();
  let inTick=false,spatialEventSeq=0;

  const OBJECT_START={
    foodPantry:{x:1,y:1},mealTray:{x:5,y:1},cupA:{x:6,y:1},cupB:{x:6,y:2},alcoholBottle:{x:5,y:2},
    waterBucket:{x:5,y:5},tap:{x:6,y:5}
  };
  const AGENT_START={zhen:{x:9,y:1},zhou:{x:7,y:2},orange:{x:1,y:6}};
  const ZONE_ORDER=[
    ['pantry','table','rest'],
    ['doorway','sink','hearth']
  ];
  const ZONE_ANCHORS={pantry:{x:2,y:2},table:{x:6,y:2},rest:{x:10,y:2},doorway:{x:2,y:6},sink:{x:6,y:6},hearth:{x:10,y:6}};

  const key=(x,y)=>`${x},${y}`;
  const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
  const manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const clonePos=p=>p?{x:p.x,y:p.y}:null;
  const inBounds=(x,y)=>x>=0&&y>=0&&x<WIDTH&&y<HEIGHT;
  function zoneForXY(x,y){
    if(!inBounds(x,y))return null;
    const col=Math.min(2,Math.floor(x/4)),row=Math.min(1,Math.floor(y/4));
    return ZONE_ORDER[row][col];
  }
  function tileAt(st,x,y){return st.spatial?.tiles?.[key(x,y)]||null}
  function zoneAt(st,pos){return pos?tileAt(st,pos.x,pos.y)?.zone||null:null}

  function initTiles(st){
    const tiles={};
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
      const zone=zoneForXY(x,y);
      tiles[key(x,y)]={id:key(x,y),x,y,zone,walkable:true,staticBlockedBy:null,contents:{}};
    }
    return tiles;
  }
  function initSpatial(st){
    st.spatial={
      version:10,width:WIDTH,height:HEIGHT,tiles:initTiles(st),zoneAnchors:{...ZONE_ANCHORS},
      rngState:((st.seed^0x19a7c10d)>>>0)||0x19a7c10d,
      surfaceSnapshot:{},debug:{lastPathByAgent:{}},
      stats:{tileSteps:0,reroutes:0}
    };
    const s=st.spatial;
    for(const [id,p] of Object.entries(OBJECT_START)){
      const obj=st.containers[id]||st.sources[id];if(!obj)continue;
      obj.position=clonePos(p);
      if((st.sources[id]||obj.portable===false)&&tileAt(st,p.x,p.y)){
        const t=tileAt(st,p.x,p.y);t.walkable=false;t.staticBlockedBy=id;
      }
    }
    for(const [id,p] of Object.entries(AGENT_START)){
      const a=st.agents[id];if(!a)continue;a.position=clonePos(p);a.location=zoneAt(st,p)||a.location;installPlanGate(a);
    }
    for(const z of Object.keys(st.zones)){
      const floor=st.surfaces[`floor:${z}`];
      s.surfaceSnapshot[z]={...(floor?.contents||{})};
      if(floor)projectExistingSurface(st,z,floor.contents);
    }
    return s;
  }
  function projectExistingSurface(st,zone,contents){
    const pos=ZONE_ANCHORS[zone];if(!pos)return;const t=tileAt(st,pos.x,pos.y);if(!t)return;
    for(const [r,v] of Object.entries(contents||{}))if(v>0)t.contents[r]=(t.contents[r]||0)+v;
  }
  function installPlanGate(a){
    if(planMeta.has(a))return;
    const meta={value:a.plan||null,block:false,justStarted:false};planMeta.set(a,meta);
    Object.defineProperty(a,'plan',{
      configurable:true,enumerable:true,
      get(){return inTick&&(meta.block||meta.justStarted)?SENTINEL:meta.value},
      set(v){const was=meta.value;meta.value=v;if(inTick&&v&&v!==SENTINEL&&!was)meta.justStarted=true;}
    });
  }
  function actualPlan(a){const m=planMeta.get(a);return m?m.value:a.plan}

  function spatialRandom(st){
    const s=st.spatial;s.rngState=(s.rngState+0x6D2B79F5)>>>0;let t=s.rngState;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;
  }
  function addSpatialEvent(st,text,type='normal',data={},causeIds=[]){
    const id=`x${++spatialEventSeq}`;
    const e={id,time:E.timeStr(),text,type,causeIds:[...new Set(causeIds.filter(Boolean))],data:{...data,system:'spatial'}};
    st.events.unshift(e);st.causes[id]=e;
    if(st.events.length>260){const old=st.events.pop();if(old?.id?.startsWith('x'))delete st.causes[old.id];}
    return id;
  }

  function objectPosition(st,id){
    const c=st.containers[id];
    if(c){if(c.heldBy&&st.agents[c.heldBy])return clonePos(st.agents[c.heldBy].position);return clonePos(c.position)}
    const s=st.sources[id];return s?clonePos(s.position):null;
  }
  function agentPosition(st,id){return clonePos(st.agents[id]?.position)}
  function occupantsAt(st,x,y,exceptId=null){return Object.values(st.agents).filter(a=>a.id!==exceptId&&a.position?.x===x&&a.position?.y===y)}
  function tileLiquidAmount(tile){return Object.entries(tile?.contents||{}).reduce((sum,[r,v])=>sum+(E.RESOURCE_TYPES[r]?.phase==='liquid'?v:0),0)}
  function tileCost(st,tile,a){
    const wet=tileLiquidAmount(tile),occupied=occupantsAt(st,tile.x,tile.y,a?.id).length;
    const crowding=occupied*(a?.kind==='cat'?2.5:5);
    return 1+wet*(a?.kind==='cat'?.015:.07)+crowding;
  }
  function neighbors(st,p,a){
    const out=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=p.x+dx,y=p.y+dy,t=tileAt(st,x,y);
      if(!t||!t.walkable)continue;
      out.push({x,y});
    }return out;
  }
  function astar(st,start,goal,a){
    if(!start||!goal)return [];if(same(start,goal))return [clonePos(start)];
    const open=new Set([key(start.x,start.y)]),came={},g={[key(start.x,start.y)]:0},f={[key(start.x,start.y)]:manhattan(start,goal)};
    const posByKey={[key(start.x,start.y)]:clonePos(start)};
    while(open.size){
      let curKey=null,best=Infinity;for(const k of open){const v=f[k]??Infinity;if(v<best){best=v;curKey=k;}}
      const cur=posByKey[curKey]||(()=>{const [x,y]=curKey.split(',').map(Number);return{x,y}})();
      if(curKey===key(goal.x,goal.y)){
        const path=[clonePos(goal)];let k=curKey;while(came[k]){k=came[k];const [x,y]=k.split(',').map(Number);path.unshift({x,y});}return path;
      }
      open.delete(curKey);
      for(const n of neighbors(st,cur,a)){
        const nk=key(n.x,n.y),tent=(g[curKey]??Infinity)+tileCost(st,tileAt(st,n.x,n.y),a);
        if(tent<(g[nk]??Infinity)){came[nk]=curKey;g[nk]=tent;f[nk]=tent+manhattan(n,goal);posByKey[nk]=n;open.add(nk);}
      }
    }
    return [];
  }
  const pathDistance=(st,a,p)=>{const path=astar(st,a.position,p,a);return path.length?path.length-1:Infinity;};
  function zoneTiles(st,zone){return Object.values(st.spatial.tiles).filter(t=>t.zone===zone&&t.walkable)}
  function bestZoneTile(st,a,zone,p){
    if(!zone)return null;
    if(p?.__spatialGoalZone===zone&&p.__spatialGoal){
      const t=tileAt(st,p.__spatialGoal.x,p.__spatialGoal.y);
      if(t?.walkable&&!occupantsAt(st,t.x,t.y,a.id).length&&astar(st,a.position,t,a).length)return clonePos(p.__spatialGoal);
    }
    const anchor=st.spatial.zoneAnchors[zone]||{x:0,y:0};
    const list=zoneTiles(st,zone).filter(t=>astar(st,a.position,t,a).length).sort((u,v)=>{
      const ou=occupantsAt(st,u.x,u.y,a.id).length,ov=occupantsAt(st,v.x,v.y,a.id).length;if(ou!==ov)return ou-ov;
      const au=manhattan(u,anchor),av=manhattan(v,anchor);if(au!==av)return au-av;
      return pathDistance(st,a,u)-pathDistance(st,a,v);
    });
    const goal=list[0]||null;
    if(goal&&p){p.__spatialGoal={x:goal.x,y:goal.y};p.__spatialGoalZone=zone;}
    return goal?{x:goal.x,y:goal.y}:null;
  }
  function interactionTile(st,a,targetPos){
    if(!targetPos)return null;
    const cands=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=targetPos.x+dx,y=targetPos.y+dy,t=tileAt(st,x,y);
      if(!t?.walkable)continue;
      const path=astar(st,a.position,{x,y},a);if(!path.length)continue;
      cands.push({x,y,distance:path.length-1,occupied:occupantsAt(st,x,y,a.id).length});
    }
    cands.sort((u,v)=>u.occupied-v.occupied||u.distance-v.distance);
    return cands[0]?{x:cands[0].x,y:cands[0].y}:null;
  }
  function wettestTile(st,zone=null){
    let best=null,bestAmt=.1;for(const t of Object.values(st.spatial.tiles)){
      if(zone&&t.zone!==zone)continue;const amt=tileLiquidAmount(t);if(amt>bestAmt){bestAmt=amt;best=t;}
    }return best?{x:best.x,y:best.y}:null;
  }
  function selectDrinkVessel(st,a,p){
    const resource=p.resource,desperate=(a.needs?.thirst||0)>=88;
    const list=Object.values(st.containers).filter(c=>c.portable&&c.canDrinkFrom&&(!c.heldBy||c.heldBy===a.id));
    const candidates=list.filter(c=>{
      const foreign=Object.entries(c.contents||{}).some(([r,v])=>r!==resource&&v>.1);
      return desperate||!foreign;
    });
    const score=c=>{
      const filled=(c.contents?.[resource]||0)>0,empty=Object.values(c.contents||{}).reduce((x,y)=>x+y,0)<=.1;
      const foreign=Object.entries(c.contents||{}).some(([r,v])=>r!==resource&&v>.1);
      const goal=interactionTile(st,a,objectPosition(st,c.id));
      const path=goal?astar(st,a.position,goal,a):[];
      const distance=path.length?path.length-1:99;
      let v=(c.drinkPreference??.5)*45-distance*4;if(filled)v+=25;else if(empty)v+=12;if(foreign)v-=35;return v;
    };
    candidates.sort((x,y)=>score(y)-score(x));const pick=candidates[0];
    if(pick){p.container=pick.id;p.phase='toVessel';}
    return pick||null;
  }
  function planGoal(st,a,p){
    if(!p||p===SENTINEL)return null;
    const objectGoal=id=>interactionTile(st,a,objectPosition(st,id));
    const agentGoal=id=>interactionTile(st,a,agentPosition(st,id));
    if(p.intent==='eat')return objectGoal(p.targetObject||'mealTray');
    if(p.intent==='drinkWater'&&a.kind==='cat')return objectGoal(p.targetObject||'waterBucket');
    if((p.intent==='drinkWater'||p.intent==='drinkAlcohol')&&a.kind==='human'){
      if(p.phase==='findVessel')selectDrinkVessel(st,a,p);
      if(p.phase==='toVessel'&&p.container)return objectGoal(p.container);
      if(p.phase==='toSource'&&p.sourceObject)return objectGoal(p.sourceObject);
      return null;
    }
    if(p.intent==='refillWater')return objectGoal('waterBucket');
    if(p.intent==='refillFood')return p.phase==='toSource'?objectGoal(p.sourceObject||'foodPantry'):p.phase==='toTarget'?objectGoal(p.targetObject||'mealTray'):null;
    if(p.intent==='rest')return bestZoneTile(st,a,p.targetZone,p);
    if(p.intent==='talk'||p.intent==='petCat'||p.intent==='seekHuman')return agentGoal(p.targetAgent);
    if(p.intent==='cleanFloor'){
      const wet=wettestTile(st,p.targetZone);
      if(wet&&astar(st,a.position,wet,a).length)return wet;
      return bestZoneTile(st,a,p.targetZone,p);
    }
    if(p.intent==='wander')return bestZoneTile(st,a,p.targetZone,p);
    return null;
  }
  function syncSnapshotResource(st,zone,resource){
    const floor=st.surfaces[`floor:${zone}`];st.spatial.surfaceSnapshot[zone]??={};
    if(floor?.contents?.[resource]>0)st.spatial.surfaceSnapshot[zone][resource]=floor.contents[resource];else delete st.spatial.surfaceSnapshot[zone][resource];
  }
  function spillHeldLocally(st,a,tile,causeIds=[]){
    const c=a.held&&st.containers[a.held];if(!c)return;
    for(const [r,amt] of Object.entries({...c.contents||{}})){
      if(E.RESOURCE_TYPES[r]?.phase!=='liquid'||amt<=0)continue;
      const moved=Math.min(amt,amt*(.14+spatialRandom(st)*.20));if(moved<=0)continue;
      c.contents[r]-=moved;if(c.contents[r]<.001)delete c.contents[r];tile.contents[r]=(tile.contents[r]||0)+moved;
      const floor=st.surfaces[`floor:${tile.zone}`];if(floor){floor.contents[r]=(floor.contents[r]||0)+moved;syncSnapshotResource(st,tile.zone,r);}
      addSpatialEvent(st,`${a.name}踉蹌時，${E.resourceName(r)}從${c.name}灑在腳下的地面。`,'bad',{action:'tileSpill',resource:r,amount:moved,location:tile.zone,position:tile.id,container:c.id},causeIds);
    }
  }
  function onEnterTile(st,a,tile){
    const wet=tileLiquidAmount(tile);if(wet<=.1)return;
    if(a.kind==='cat'){
      for(const [r,amt] of Object.entries({...tile.contents})){
        if(E.RESOURCE_TYPES[r]?.phase!=='liquid'||amt<=0)continue;
        const picked=Math.min(amt,amt*(.08+spatialRandom(st)*.12));if(picked<=0)continue;
        tile.contents[r]-=picked;if(tile.contents[r]<.001)delete tile.contents[r];
        const floor=st.surfaces[`floor:${tile.zone}`];if(floor?.contents?.[r]!=null){floor.contents[r]=Math.max(0,floor.contents[r]-picked);if(floor.contents[r]<.001)delete floor.contents[r];syncSnapshotResource(st,tile.zone,r);}
        a.contacts.paws??={};a.contacts.paws[r]=(a.contacts.paws[r]||0)+picked;
        const ev=addSpatialEvent(st,`${a.name}真的踩過 (${tile.x}, ${tile.y}) 的${E.resourceName(r)}，腳掌沾上了一些。`,'warn',{action:'tileContact',transfer:'tile_to_contact',resource:r,amount:picked,location:tile.zone,position:tile.id});
        a.causes?.contacts?.paws&&(a.causes.contacts.paws[r]=ev);
      }
      return;
    }
    const intox=a.status?.intoxication||0,fatigue=a.needs?.fatigue||0;
    const risk=Math.min(45,wet*.55+Math.max(0,intox-10)*.16+Math.max(0,fatigue-75)*.24);
    if(spatialRandom(st)*100<risk){
      if(a.wellbeing){a.wellbeing.comfort=E.clamp(a.wellbeing.comfort-(3+spatialRandom(st)*5));a.wellbeing.safety=E.clamp(a.wellbeing.safety-(4+spatialRandom(st)*7));}
      const slip=addSpatialEvent(st,`${a.name}踩到 (${tile.x}, ${tile.y}) 的濕地，腳下一滑。`,'warn',{action:'tileSlip',environmentRisk:risk,location:tile.zone,position:tile.id});
      spillHeldLocally(st,a,tile,[slip]);
    }
  }
  function moveOneTile(st,a,goal,reason){
    const path=astar(st,a.position,goal,a);a.__spatialPath=path.map(clonePos);st.spatial.debug.lastPathByAgent[a.id]=a.__spatialPath;
    if(path.length<2)return false;
    const from=clonePos(a.position),oldZone=a.location,next=path[1],nextZone=zoneAt(st,next)||oldZone;
    a.position=clonePos(next);a.location=nextZone;st.spatial.stats.tileSteps++;
    let cost=.10;if(a.held)cost+=.03;if(a.carrying)cost+=.05+Math.min(.05,(a.carrying.amount||0)*.0015);
    E.applyExertion(a,cost,a.carrying?'搬運中步行':a.held?'拿著物品步行':'步行',{thirstFactor:.18,hungerFactor:.05});
    if(a.held&&st.containers[a.held]){st.containers[a.held].position=clonePos(next);st.containers[a.held].location=nextZone;}
    onEnterTile(st,a,tileAt(st,next.x,next.y));
    if(oldZone!==nextZone)addSpatialEvent(st,`${a.name}從${E.zoneName(oldZone)}走進${E.zoneName(nextZone)}。`,'normal',{action:'tileMove',from:oldZone,to:nextZone,position:key(next.x,next.y),reason,location:nextZone});
    return true;
  }
  function prepareAgentMovement(st,a){
    installPlanGate(a);const meta=planMeta.get(a);meta.block=false;meta.justStarted=false;
    const p=meta.value;if(!p){a.__spatialPath=[];return;}
    const goal=planGoal(st,a,p);if(!goal){a.__spatialPath=[];return;}
    p.__spatialTarget=clonePos(goal);
    if(!same(a.position,goal))moveOneTile(st,a,goal,p.intent);
    if(!same(a.position,goal))meta.block=true;
  }
  function removeNewEvents(st,oldIds,predicate){
    const removed=[];st.events=st.events.filter(e=>{if(oldIds.has(e.id)||!predicate(e))return true;removed.push(e.id);return false;});
    for(const id of removed)delete st.causes[id];
  }
  function postCorrectEngineMovement(st,before,oldEventIds){
    for(const a of Object.values(st.agents)){
      installPlanGate(a);const b=before[a.id];if(!b)continue;
      const physicalZone=zoneAt(st,a.position)||b.location;
      if(a.location!==physicalZone){
        const engineZone=a.location;a.location=physicalZone;
        if(a.held&&st.containers[a.held])st.containers[a.held].location=physicalZone;
        removeNewEvents(st,oldEventIds,e=>e.data?.action==='move'&&e.text?.startsWith(a.name));
        st.spatial.stats.reroutes++;
        const p=actualPlan(a);if(p?.targetZone===engineZone)p.__spatialGoalZone=null;
      }
      if(a.held&&a.held!==b.held){
        const c=st.containers[a.held],cp=c?.position;
        if(c&&cp&&manhattan(a.position,cp)>1){
          const grabbed=a.held;c.heldBy=null;c.location=zoneAt(st,cp)||c.location;a.held=b.held||null;
          const p=actualPlan(a);if(p&&(p.intent==='drinkWater'||p.intent==='drinkAlcohol'))p.phase='toVessel';
          removeNewEvents(st,oldEventIds,e=>e.data?.action==='takeContainer'&&e.data?.container===grabbed&&e.text?.startsWith(a.name));
        }
      }
      if(a.held&&st.containers[a.held]){const c=st.containers[a.held];c.position=clonePos(a.position);c.location=a.location;}
      if(b.held&&!a.held&&st.containers[b.held]){const c=st.containers[b.held];c.position=clonePos(a.position);c.location=a.location;}
    }
  }

  function eventActorPosition(st,e){
    for(const a of Object.values(st.agents))if(e.text?.includes(a.name)&&a.location===e.data?.location&&a.position)return clonePos(a.position);
    return null;
  }
  function adjustTileResource(st,zone,resource,delta,newEvents){
    if(Math.abs(delta)<.0001)return;
    if(delta>0){
      const ev=newEvents.find(e=>e.data?.location===zone&&(e.data?.resource===resource||e.text?.includes(E.resourceName(resource))));
      const pos=eventActorPosition(st,ev||{})||st.spatial.zoneAnchors[zone];const t=pos&&tileAt(st,pos.x,pos.y);if(t)t.contents[resource]=(t.contents[resource]||0)+delta;return;
    }
    let left=-delta;const tiles=Object.values(st.spatial.tiles).filter(t=>t.zone===zone&&(t.contents[resource]||0)>0).sort((a,b)=>(b.contents[resource]||0)-(a.contents[resource]||0));
    for(const t of tiles){const take=Math.min(left,t.contents[resource]||0);t.contents[resource]-=take;left-=take;if(t.contents[resource]<.001)delete t.contents[resource];if(left<=.0001)break;}
  }
  function syncTileSurfaces(st,oldEventIds){
    const newEvents=st.events.filter(e=>!oldEventIds.has(e.id));
    for(const z of Object.keys(st.zones)){
      const floor=st.surfaces[`floor:${z}`],prev=st.spatial.surfaceSnapshot[z]||{},now=floor?.contents||{};
      const resources=new Set([...Object.keys(prev),...Object.keys(now)]);
      for(const r of resources)adjustTileResource(st,z,r,(now[r]||0)-(prev[r]||0),newEvents);
      st.spatial.surfaceSnapshot[z]={...now};
    }
  }

  function captureBeforeEngine(st){
    const out={};for(const a of Object.values(st.agents))out[a.id]={location:a.location,position:clonePos(a.position),held:a.held};return out;
  }
  function tick(){
    const st=E.getState();ensureSpatial(st);
    for(const a of Object.values(st.agents))prepareAgentMovement(st,a);
    const before=captureBeforeEngine(st),oldEventIds=new Set(st.events.map(e=>e.id));
    inTick=true;try{baseTick();}finally{inTick=false;for(const a of Object.values(E.getState().agents)){const m=planMeta.get(a);if(m){m.block=false;m.justStarted=false;}}}
    const next=E.getState();postCorrectEngineMovement(next,before,oldEventIds);syncTileSurfaces(next,oldEventIds);
  }
  function reset(seed){
    spatialEventSeq=0;const st=baseReset(seed);initSpatial(st);
    addSpatialEvent(st,'v10 Spatial Grid 已啟用：Zone 保留作語意層，角色與物件新增 tile 座標，移動以 A* 尋路逐格進行。','system',{action:'spatialInit',grid:`${WIDTH}x${HEIGHT}`});
    return st;
  }
  function ensureSpatial(st){if(!st.spatial||st.spatial.version!==10)initSpatial(st);for(const a of Object.values(st.agents))installPlanGate(a);return st.spatial}
  function tileInfo(id){const st=E.getState(),t=st.spatial?.tiles?.[id];if(!t)return null;return {...t,occupants:occupantsAt(st,t.x,t.y).map(a=>a.id),liquid:tileLiquidAmount(t)};}
  function status(){const st=E.getState();ensureSpatial(st);return {width:WIDTH,height:HEIGHT,tileSteps:st.spatial.stats.tileSteps,reroutes:st.spatial.stats.reroutes};}

  Object.assign(E.DATA_ZH||{}, {position:'Tile 座標',grid:'格狀尺寸',system:'系統',tile:'格子'});
  E.tick=tick;E.reset=reset;
  E.positionOf=id=>objectPosition(E.getState(),id)||agentPosition(E.getState(),id);
  E.tileInfo=tileInfo;
  E.spatialStatus=status;
  E.zoneAtPosition=pos=>zoneAt(E.getState(),pos);
  window.SimSpatial={WIDTH,HEIGHT,key,tileAt:(x,y)=>tileAt(E.getState(),x,y),tileInfo,objectPosition:id=>objectPosition(E.getState(),id),agentPosition:id=>agentPosition(E.getState(),id),astar:(start,goal,agentId)=>astar(E.getState(),start,goal,E.getState().agents[agentId]),zoneAt:pos=>zoneAt(E.getState(),pos),status};

  initSpatial(E.getState());
  addSpatialEvent(E.getState(),'v10 Spatial Grid 模組已載入；空白地板使用 CSS tile，不以字元填滿。','system',{action:'spatialInit',grid:`${WIDTH}x${HEIGHT}`});
})();