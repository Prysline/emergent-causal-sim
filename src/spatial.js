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
    const old=st.spatial;
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
  function setActualPlan(a,p){const m=planMeta.get(a);if(m)m.value=p;else a.plan=p}

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
    return 1+wet*(a?.kind==='cat'?.015:.07)+occupied*6;
  }
  function neighbors(st,p,a){
    const out=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=p.x+dx,y=p.y+dy,t=tileAt(st,x,y);if(!t||!t.walkable)continue;out.push({x,y});
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
    return [clonePos(start)];
  }
  function zoneTiles(st,zone){return Object.values(st.spatial.tiles).filter(t=>t.zone===zone&&t.walkable)}
  function bestZoneTile(st,a,zone,p){
    if(!zone)return null;
    if(p?.__spatialGoalZone===zone&&p.__spatialGoal){const t=tileAt(st,p.__spatialGoal.x,p.__spatialGoal.y);if(t?.walkable)return clonePos(p.__spatialGoal)}
    const anchor=st.spatial.zoneAnchors[zone]||{x:0,y:0};
    const list=zoneTiles(st,zone).sort((u,v)=>{
      const au=manhattan(u,anchor),av=manhattan(v,anchor);if(au!==av)return au-av;
      return astar(st,a.position,u,a).length-astar(st,a.position,v,a).length;
    });
    const goal=list.find(t=>occupantsAt(st,t.x,t.y,a.id).length===0)||list[0]||null;
    if(goal&&p){p.__spatialGoal={x:goal.x,y:goal.y};p.__spatialGoalZone=zone;}
    return goal?{x:goal.x,y:goal.y}:null;
  }
  function interactionTile(st,a,targetPos){
    if(!targetPos)return null;
    const cands=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=targetPos.x+dx,y=targetPos.y+dy,t=tileAt(st,x,y);if(!t?.walkable)continue;cands.push({x,y});
    }
    cands.sort((u,v)=>{
      const ou=occupantsAt(st,u.x,u.y,a.id).length,ov=occupantsAt(st,v.x,v.y,a.id).length;if(ou!==ov)return ou-ov;
      return astar(st,a.position,u,a).length-astar(st,a.position,v,a).length;
    });
    return cands[0]||null;
  }
  function wettestTile(st,zone=null){
    let best=null,bestAmt=.1;for(const t of Object.values(st.spatial.tiles)){
      if(zone&&t.zone!==zone)continue;const amt=tileLiquidAmount(t);if(amt>bestAmt){bestAmt=amt;best=t;}}return best?{x:best.x,y:best.y}:null;
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
      const goal=interactionTile(st,a,objectPosition(st,c.id));const distance=goal?Math.max(0,astar(st,a.position,goal,a).length-1):99;
      let v=(c.drinkPreference??.5)*0045-distance*4;if(filled)v+=25;else if(empty)v+=12;if(foreign)v-=35;return v;
    };
    candidates.sort((x,y)=>score(y)-score(x));const pick=candidates[0];
    if(pick){p.container=pick.id;p.phase='toVessel';}
    return pick||null;
  }
  function planGoal(st,a,p){
    if(!p||p===SENTINEL)return null;
    const objectGoal=id=>interactionTile(st,a,objectPosition(st,id));
    const agentGoal=id=>interactionTile(st,a,agentPosition(st,id));
    if(p.intent==='eat')return objectGoal(p.targetObject||	mealTray');
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
    if(p.intent==='cleanFloor')return wettestTile(st,p.targetZone)||bestZoneTile(st,a,p.targetZone,p);
    if(p.intent==='wander')return bestZoneTile(st,a,p.targetZone,p);
    return null;
  }
