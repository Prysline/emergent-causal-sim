(() => {
  const SP=window.SimSpatial,P=window.SimPhysical,L=window.SimLocomotion;if(!SP||!P)return;
  const VERSION='11.31.0-crowding-8-direction';
  const SAME_DIRECTION_WEIGHT=.65,OPPOSITE_DIRECTION_WEIGHT=1.7;
  const interpolatedDirectionWeight=angle=>SAME_DIRECTION_WEIGHT+(OPPOSITE_DIRECTION_WEIGHT-SAME_DIRECTION_WEIGHT)*(angle/180);
  const CONFIG=Object.freeze({
    baseOccupantPressure:.35,
    maneuveringOtherWidthFactor:.65,
    narrownessStartRatio:.75,
    widthPressureScale:1.5,
    costPerPressure:2.5,
    delayTicksPerPressure:2,
    minSpeedMultiplier:.35,
    directionWeight:Object.freeze({
      same:SAME_DIRECTION_WEIGHT,
      angle45:interpolatedDirectionWeight(45),
      angle90:interpolatedDirectionWeight(90),
      angle135:interpolatedDirectionWeight(135),
      stationary:1,
      unknown:1,
      opposite:OPPOSITE_DIRECTION_WEIGHT
    })
  });

  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=(v,d=4)=>Math.round(v*10**d)/10**d;
  function agentFor(st,aOrId){return typeof aOrId==='string'?st.agents?.[aOrId]||null:aOrId||null;}
  function vec(a,b){return a&&b?{x:b.x-a.x,y:b.y-a.y,z:(SP.zOf?.(b)??b.z??0)-(SP.zOf?.(a)??a.z??0)}:null;}
  function sameVec(a,b){return !!a&&!!b&&a.x===b.x&&a.y===b.y&&a.z===b.z;}
  function reverseVec(a,b){return !!a&&!!b&&a.x===-b.x&&a.y===-b.y&&a.z===-b.z;}
  function standardHorizontalVec(v){return !!v&&v.z===0&&Number.isInteger(v.x)&&Number.isInteger(v.y)&&Math.abs(v.x)<=1&&Math.abs(v.y)<=1&&(v.x!==0||v.y!==0);}
  function horizontalAngleRelation(a,b){
    if(!standardHorizontalVec(a)||!standardHorizontalVec(b))return null;
    const denom=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);if(!(denom>0))return null;
    const cosine=clamp((a.x*b.x+a.y*b.y)/denom,-1,1),angle=Math.round((Math.acos(cosine)*180/Math.PI)/45)*45;
    if(angle===0)return'same';
    if(angle===45)return'angle45';
    if(angle===90)return'angle90';
    if(angle===135)return'angle135';
    if(angle===180)return'opposite';
    return null;
  }

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
    if(!here||!next)return null;
    return SP.traversalManeuver?.(st,here,next)?.directionVector||vec(here,next);
  }
  function directionRelationFromVector(st,mover,other){
    const otherDir=movementDirection(st,other);
    if(!otherDir)return other?.locomotion?.phase==='moving'?'unknown':'stationary';
    if(sameVec(mover,otherDir))return'same';
    if(reverseVec(mover,otherDir))return'opposite';
    return horizontalAngleRelation(mover,otherDir)||'unknown';
  }
  function directionRelation(st,moverFrom,moverTo,other){
    const mover=SP.traversalManeuver?.(st,moverFrom,moverTo)?.directionVector||vec(moverFrom,moverTo);
    return directionRelationFromVector(st,mover,other);
  }
  function effectiveWidth(a,mode=null){
    if(!a)return null;
    const resolved=mode||a.locomotion?.mode||L?.modeFromPosture?.(a)||null;
    const width=resolved?P.getMovementEnvelope?.(a,resolved)?.clearanceWidth:null;
    if(Number.isFinite(width)&&width>0)return width;
    const body=Number(a.physical?.bodyGeometry?.width);
    return Number.isFinite(body)&&body>0?body:null;
  }
  function maneuverInfluenceNodes(st,from,to,maneuver=null){
    const resolved=maneuver||SP.traversalManeuver?.(st,from,to)||null,nodes=resolved?.influenceNodes?.length?resolved.influenceNodes:[from,to],out=new Map();
    for(const node of nodes){const normalized=SP.normalizeNode(st,node);if(normalized)out.set(SP.nodeKey(st,normalized),normalized);}
    return [...out.values()];
  }
  function nearbyAgents(st,a,from,to,maneuver=null){
    const out=new Map();
    for(const node of maneuverInfluenceNodes(st,from,to,maneuver))for(const other of SP.nodeOccupantsAt?.(st,node,a?.id)||[])out.set(other.id,other);
    return [...out.values()];
  }
  function getCrowdingProfile(st,aOrId,from,to,mode='walk'){
    const feasibilitySnapshot=arguments[5]||null;
    const a=agentFor(st,aOrId),f=SP.normalizeNode(st,from),t=SP.normalizeNode(st,to);
    if(!a||!f||!t)return null;
    const maneuver=SP.traversalManeuver?.(st,f,t)||null,distanceMeters=maneuver?.distanceMeters??1,moverDirection=maneuver?.directionVector||vec(f,t);
    const feasibility=feasibilitySnapshot||SP.traversalFeasibility?.(st,a,f,t)||null,modeFact=feasibility?.modes?.[mode]||null,passageWidth=Number.isFinite(modeFact?.effectiveClearanceWidth)?modeFact.effectiveClearanceWidth:null,moverWidth=effectiveWidth(a,mode);
    const occupants=nearbyAgents(st,a,f,t,maneuver).map(other=>{
      const relation=directionRelationFromVector(st,moverDirection,other),otherWidth=effectiveWidth(other),directionWeight=CONFIG.directionWeight[relation]??1;
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
    const baseTicks=L?.edgeMoveTicks?.(a,mode,distanceMeters)??1,effectiveTicks=Number.isFinite(baseTicks)?baseTicks+delayTicks:Infinity;
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
    const crowdingSnapshot=arguments[5]||null;
    const a=agentFor(st,aOrId),distanceMeters=SP.traversalManeuver?.(st,from,to)?.distanceMeters??1,base=L?.edgeMoveTicks?.(a,mode,distanceMeters)??1,profile=crowdingSnapshot||getCrowdingProfile(st,a,from,to,mode);
    return Number.isFinite(base)?base+(profile?.delayTicks||0):Infinity;
  }

  const API={VERSION,CONFIG,getCrowdingProfile,getProfile:getCrowdingProfile,effectiveWidth,directionRelation,edgeMoveTicks};
  window.SimCrowding=API;
  SP.getCrowdingProfile=getCrowdingProfile;
  SP.CROWDING_VERSION=VERSION;
})();