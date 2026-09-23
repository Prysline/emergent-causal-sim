(() => {
  const SP=window.SimSpatial,P=window.SimPhysical,L=window.SimLocomotion;if(!SP||!P)return;
  const VERSION='11.28.0-effective-passage-width';
  const CONFIG=Object.freeze({
    baseOccupantPressure:.35,
    maneuveringOtherWidthFactor:.65,
    narrownessStartRatio:.75,
    widthPressureScale:1.5,
    costPerPressure:2.5,
    delayTicksPerPressure:2,
    minSpeedMultiplier:.35,
    directionWeight:Object.freeze({same:.65,stationary:1,unknown:1,opposite:1.7})
  });

  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=(v,d=4)=>Math.round(v*10**d)/10**d;
  function agentFor(st,aOrId){return typeof aOrId==='string'?st.agents?.[aOrId]||null:aOrId||null;}
  function vec(a,b){return a&&b?{x:b.x-a.x,y:b.y-a.y,z:(SP.zOf?.(b)??b.z??0)-(SP.zOf?.(a)??a.z??0)}:null;}
  function sameVec(a,b){return !!a&&!!b&&a.x===b.x&&a.y===b.y&&a.z===b.z;}
  function reverseVec(a,b){return !!a&&!!b&&a.x===-b.x&&a.y===-b.y&&a.z===-b.z;}

  function plannedNextNode(st,a){
    if(!a||a.offMap)return null;
    const pending=a.action?.locomotionStep?.to;
    if(pending)return SP.normalizeNode(st,pending);
    const here=SP.nodeForAgent(st,a),path=a.action?.lastPath||[];
    if(!here||!path.length)return null;
    const idx=path.findIndex(p=>SP.nodeSame(st,p,here));
    return idx>=0&&idx<path.length-1?SP.normalizeNode(st,path[idx+1]):null;
  }
  function movementDirection(st,a){
    const here=SP.nodeForAgent(st,a),next=plannedNextNode(st,a);
    return here&&next?vec(here,next):null;
  }
  function directionRelation(st,moverFrom,moverTo,other){
    const mover=vec(moverFrom,moverTo),otherDir=movementDirection(st,other);
    if(!otherDir)return other?.locomotion?.phase==='moving'?'unknown':'stationary';
    if(sameVec(mover,otherDir))return'same';
    if(reverseVec(mover,otherDir))return'opposite';
    return'unknown';
  }
  function effectiveWidth(a,mode=null){
    if(!a)return null;
    const resolved=mode||a.locomotion?.mode||L?.modeFromPosture?.(a)||null;
    const width=resolved?P.getMovementEnvelope?.(a,resolved)?.clearanceWidth:null;
    if(Number.isFinite(width)&&width>0)return width;
    const body=Number(a.physical?.bodyGeometry?.width);
    return Number.isFinite(body)&&body>0?body:null;
  }
  function nearbyAgents(st,a,from,to){
    const out=new Map();
    for(const node of [from,to])for(const other of SP.nodeOccupantsAt?.(st,node,a?.id)||[])out.set(other.id,other);
    return [...out.values()];
  }
  function getCrowdingProfile(st,aOrId,from,to,mode='walk'){
    const a=agentFor(st,aOrId),f=SP.normalizeNode(st,from),t=SP.normalizeNode(st,to);
    if(!a||!f||!t)return null;
    const feasibility=SP.traversalFeasibility?.(st,a,f,t)||null,modeFact=feasibility?.modes?.[mode]||null,passageWidth=Number.isFinite(modeFact?.effectiveClearanceWidth)?modeFact.effectiveClearanceWidth:null,moverWidth=effectiveWidth(a,mode);
    const occupants=nearbyAgents(st,a,f,t).map(other=>{
      const relation=directionRelation(st,f,t,other),otherWidth=effectiveWidth(other),directionWeight=CONFIG.directionWeight[relation]??1;
      let widthRatio=null,widthPressure=0;
      if(Number.isFinite(passageWidth)&&passageWidth>0&&Number.isFinite(moverWidth)&&Number.isFinite(otherWidth)){
        widthRatio=(moverWidth+otherWidth*CONFIG.maneuveringOtherWidthFactor)/passageWidth;
        widthPressure=Math.max(0,widthRatio-CONFIG.narrownessStartRatio)*CONFIG.widthPressureScale;
      }
      const pressure=(CONFIG.baseOccupantPressure+widthPressure)*directionWeight;
      return {
        agentId:other.id,
        mode:other.locomotion?.mode||L?.modeFromPosture?.(other)||null,
        effectiveWidth:Number.isFinite(otherWidth)?round(otherWidth):null,
        direction:relation,
        directionWeight:round(directionWeight),
        widthRatio:Number.isFinite(widthRatio)?round(widthRatio):null,
        pressure:round(pressure)
      };
    });
    const congestionPressure=occupants.reduce((sum,x)=>sum+x.pressure,0),congestionCost=congestionPressure*CONFIG.costPerPressure;
    const delayTicks=Math.max(0,Math.floor(congestionPressure*CONFIG.delayTicksPerPressure+1e-9));
    const baseTicks=L?.edgeMoveTicks?.(a,mode)??1,effectiveTicks=Number.isFinite(baseTicks)?baseTicks+delayTicks:Infinity;
    const speedMultiplier=Number.isFinite(effectiveTicks)&&effectiveTicks>0?clamp(baseTicks/effectiveTicks,CONFIG.minSpeedMultiplier,1):0;
    return {
      edgeKey:`${SP.nodeKey(st,f)}->${SP.nodeKey(st,t)}`,
      from:f,to:t,
      mover:{agentId:a.id,mode,effectiveWidth:Number.isFinite(moverWidth)?round(moverWidth):null},
      passageWidth,
      widthKnown:Number.isFinite(passageWidth),
      occupantCount:occupants.length,
      occupants,
      congestionPressure:round(congestionPressure),
      congestionCost:round(congestionCost),
      delayTicks,
      speedMultiplier:round(speedMultiplier),
      hardBlocked:false
    };
  }
  function edgeMoveTicks(st,aOrId,from,to,mode='walk'){
    const a=agentFor(st,aOrId),base=L?.edgeMoveTicks?.(a,mode)??1,profile=getCrowdingProfile(st,a,from,to,mode);
    return Number.isFinite(base)?base+(profile?.delayTicks||0):Infinity;
  }

  const API={VERSION,CONFIG,getCrowdingProfile,getProfile:getCrowdingProfile,effectiveWidth,directionRelation,edgeMoveTicks};
  window.SimCrowding=API;
  SP.getCrowdingProfile=getCrowdingProfile;
  SP.CROWDING_VERSION=VERSION;
})();