(() => {
  const E=window.SimEngine,SP=window.SimSpatial;
  if(!E||!SP||E.__furnitureV101)return;
  E.__furnitureV101=true;

  const baseTick=E.tick.bind(E);
  const baseReset=E.reset.bind(E);

  const DEFS={
    diningTable:{
      id:'diningTable',name:'餐桌',icon:'▰',kind:'table',zone:'table',blocksMovement:true,supportsObjects:true,
      footprint:[{x:5,y:1},{x:6,y:1},{x:5,y:2},{x:6,y:2}],displayAt:{x:5,y:1}
    },
    chairNW:{id:'chairNW',name:'餐椅 A',icon:'🪑',kind:'chair',zone:'table',occupiable:true,canRest:true,mealSeat:true,restQuality:.48,footprint:[{x:4,y:1}],displayAt:{x:4,y:1}},
    chairNE:{id:'chairNE',name:'餐椅 B',icon:'🪑',kind:'chair',zone:'table',occupiable:true,canRest:true,mealSeat:true,restQuality:.48,footprint:[{x:5,y:0}],displayAt:{x:5,y:0}},
    chairSW:{id:'chairSW',name:'餐椅 C',icon:'🪑',kind:'chair',zone:'table',occupiable:true,canRest:true,mealSeat:true,restQuality:.48,footprint:[{x:4,y:2}],displayAt:{x:4,y:2}},
    chairSE:{id:'chairSE',name:'餐椅 D',icon:'🪑',kind:'chair',zone:'table',occupiable:true,canRest:true,mealSeat:true,restQuality:.48,footprint:[{x:7,y:2}],displayAt:{x:7,y:2}},
    sofa:{
      id:'sofa',name:'沙發',icon:'🛋️',kind:'sofa',zone:'rest',occupiable:true,canRest:true,canSleep:true,restQuality:.82,
      footprint:[{x:9,y:1},{x:10,y:1}],displayAt:{x:9,y:1}
    },
    frontDoor:{
      id:'frontDoor',name:'大門',icon:'🚪',kind:'door',zone:'doorway',blocksMovement:true,canExit:true,
      footprint:[{x:0,y:6}],displayAt:{x:0,y:6}
    }
  };

  const TABLE_OBJECTS={mealTray:{x:5,y:1},cupA:{x:6,y:1},cupB:{x:6,y:2},alcoholBottle:{x:5,y:2}};
  const key=p=>`${p.x},${p.y}`;
  const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
  const clone=o=>JSON.parse(JSON.stringify(o));
  const inBounds=(p,st)=>p&&p.x>=0&&p.y>=0&&p.x<st.spatial.width&&p.y<st.spatial.height;

  function clearFurnitureTiles(st){
    for(const t of Object.values(st.spatial?.tiles||{})){
      t.furnitureIds=[];
      if(String(t.staticBlockedBy||'').startsWith('furniture:')){
        t.staticBlockedBy=null;
        t.walkable=true;
      }
    }
  }

  function applyFurniture(st){
    if(!st.spatial)return;
    clearFurnitureTiles(st);
    st.furniture=clone(DEFS);
    for(const f of Object.values(st.furniture)){
      for(const p of f.footprint){
        const t=st.spatial.tiles[key(p)];if(!t)continue;
        t.furnitureIds??=[];if(!t.furnitureIds.includes(f.id))t.furnitureIds.push(f.id);
        if(f.blocksMovement){t.walkable=false;t.staticBlockedBy=`furniture:${f.id}`;}
      }
    }
    for(const [id,p] of Object.entries(TABLE_OBJECTS)){
      const c=st.containers[id];if(!c)continue;
      if(!c.heldBy){c.position={...p};c.location='table';c.supportId='diningTable';}
    }
    if(st.spatial.zoneAnchors){
      st.spatial.zoneAnchors.table={x:4,y:1};
      st.spatial.zoneAnchors.rest={x:9,y:1};
      st.spatial.zoneAnchors.doorway={x:1,y:6};
    }
    st.spatial.furnitureVersion='10.3';
  }

  function initFurniture(st){applyFurniture(st);syncSupports(st);return st.furniture;}

  function furnitureAtTile(id,st=E.getState()){
    const t=st.spatial?.tiles?.[id];
    return (t?.furnitureIds||[]).map(fid=>st.furniture?.[fid]).filter(Boolean);
  }

  function targetPositions(targetId,st=E.getState()){
    const f=st.furniture?.[targetId];if(f)return f.footprint.map(p=>({...p}));
    const p=SP.objectPosition(targetId);return p?[p]:[];
  }

  function isWalkable(st,p){return inBounds(p,st)&&!!st.spatial.tiles[key(p)]?.walkable;}
  function occupiedByOther(st,p,agentId){return Object.values(st.agents).filter(a=>a.id!==agentId&&same(a.position,p)).length;}

  function candidateTiles(targetId,agentId,st=E.getState()){
    const f=st.furniture?.[targetId],positions=targetPositions(targetId,st),out=new Map();
    if(f?.occupiable){
      for(const p of positions)if(isWalkable(st,p))out.set(key(p),{...p});
    }
    for(const p of positions){
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const q={x:p.x+dx,y:p.y+dy};if(isWalkable(st,q))out.set(key(q),q);
      }
    }
    return [...out.values()];
  }

  function interactionGoal(targetId,agentId,st=E.getState()){
    const a=st.agents[agentId];if(!a?.position)return null;
    const list=candidateTiles(targetId,agentId,st).map(p=>{
      const path=SP.astar(a.position,p,agentId);
      return {...p,pathLength:path.length||999,occupied:occupiedByOther(st,p,agentId)};
    }).filter(p=>p.pathLength<999);
    list.sort((u,v)=>u.occupied-v.occupied||u.pathLength-v.pathLength||Math.abs(a.position.x-u.x)+Math.abs(a.position.y-u.y)-Math.abs(a.position.x-v.x)-Math.abs(a.position.y-v.y));
    return list[0]?{x:list[0].x,y:list[0].y}:null;
  }

  function isAtInteraction(agentId,targetId,st=E.getState()){
    const a=st.agents[agentId];if(!a?.position)return false;
    return candidateTiles(targetId,agentId,st).some(p=>same(p,a.position));
  }

  function syncSupports(st){
    const table=st.furniture?.diningTable;
    const tableKeys=new Set((table?.footprint||[]).map(key));
    for(const c of Object.values(st.containers||{})){
      if(c.heldBy){delete c.supportId;continue;}
      if(c.position&&tableKeys.has(key(c.position)))c.supportId='diningTable';
      else if(c.supportId==='diningTable')delete c.supportId;
    }
  }

  function tick(){baseTick();syncSupports(E.getState());}
  function reset(seed){const st=baseReset(seed);initFurniture(st);return st;}

  E.tick=tick;E.reset=reset;
  E.getFurniture=id=>E.getState().furniture?.[id]||null;
  window.SimFurniture={
    defs:DEFS,
    get:id=>E.getState().furniture?.[id]||null,
    all:()=>Object.values(E.getState().furniture||{}),
    furnitureAtTile,
    interactionGoal,
    isAtInteraction,
    targetPositions,
    init:()=>initFurniture(E.getState())
  };

  initFurniture(E.getState());
})();