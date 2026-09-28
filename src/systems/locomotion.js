(() => {
  const W=window.SimWorld,P=window.SimPhysical,C=window.SimEmbodimentCapabilities;if(!W||!P?.getMovementEnvelope)return;
  if(!C?.postureForMode||!C?.modeFromPosture)throw new Error('systems/locomotion.js requires embodiment-capabilities.js.');
  if(!W.registerInitialStateInitializer)throw new Error('systems/locomotion.js requires world.js initial-state pipeline.');
  const VERSION='11.34.0-surface-traversal-maneuvers';

  W.registerInitialStateInitializer('locomotion.schema',(st)=>{
    for(const a of Object.values(st.agents||{})){
      if(!a.locomotion)a.locomotion={mode:null,phase:'idle'};
    }
    return st;
  },1700);
  W.LOCOMOTION_SCHEMA_VERSION=VERSION;

  const POSTURE_BY_MODE=C.POSTURE_BY_MODE;
  const MODE_BY_POSTURE=C.MODE_BY_POSTURE;
  const MODE_TRAVERSAL_BURDEN=Object.freeze({walk:0,kneelCrawl:1,proneCrawl:2});
  const MODE_TRANSITION_BURDEN=1;
  const SURFACE_TRAVERSAL_BURDEN_BY_KIND=Object.freeze({human:4,cat:1.1});
  const SURFACE_MANEUVER_BURDEN_BY_KIND=Object.freeze({human:9,cat:1.6});
  const SURFACE_MANEUVER_FAMILIES=new Set(['step','climb','jump']);
  const SURFACE_MANEUVER_DIRECTIONS=new Set(['up','down','level']);

  function postureForMode(mode){return C.postureForMode(mode);}
  function modeFromPosture(agentOrPosture){
    const posture=typeof agentOrPosture==='string'?agentOrPosture:agentOrPosture?.posture?.kind;
    return C.modeFromPosture(posture);
  }
  function transitionTicks(fromMode,toMode){return fromMode===toMode?0:1;}
  function normalizedMovementCredit(value){const credit=Number(value);return Number.isFinite(credit)&&credit>0?Math.min(credit,1-1e-9):0;}
  function movementTiming(agent,mode,distanceMeters=1,movementCredit=0){
    const speed=Number(P.getMovementEnvelope(agent,mode)?.speedFactor),distance=Number(distanceMeters),credit=normalizedMovementCredit(movementCredit);
    if(!Number.isFinite(speed)||speed<=0||!Number.isFinite(distance)||distance<=0)return {movementTicks:Infinity,movementCreditAfter:0,requiredTicks:Infinity};
    const requiredTicks=distance/speed,effective=Math.max(0,requiredTicks-credit),movementTicks=Math.max(1,Math.ceil(effective-1e-12));
    const movementCreditAfter=normalizedMovementCredit(credit+movementTicks-requiredTicks);
    return {movementTicks,movementCreditAfter,requiredTicks};
  }
  function edgeMoveTicks(agent,mode,distanceMeters=1,movementCredit=0){return movementTiming(agent,mode,distanceMeters,movementCredit).movementTicks;}
  function modeTraversalBurden(agent,mode){
    const burden=MODE_TRAVERSAL_BURDEN[mode];
    return Number.isFinite(burden)&&burden>=0?burden:Infinity;
  }
  function modeTransitionBurden(agent,fromMode,toMode){
    if(fromMode===toMode)return 0;
    return Number.isFinite(modeTraversalBurden(agent,toMode))?MODE_TRANSITION_BURDEN:Infinity;
  }
  function calibratedKindBurden(table,agent){
    const burden=table[agent?.kind]??table.human;
    return Number.isFinite(burden)&&burden>=0?burden:Infinity;
  }
  function isSurfaceManeuver(maneuver){
    if(!maneuver||!SURFACE_MANEUVER_FAMILIES.has(maneuver.family)||!SURFACE_MANEUVER_DIRECTIONS.has(maneuver.direction))return false;
    const suffix=maneuver.direction==='up'?'Up':maneuver.direction==='down'?'Down':'Across';
    return maneuver.kind===maneuver.family+suffix;
  }
  function surfaceManeuverKey(maneuver){return isSurfaceManeuver(maneuver)?[maneuver.family,maneuver.direction,maneuver.kind].join(':'):null;}
  function surfaceTraversalBurden(agent){return calibratedKindBurden(SURFACE_TRAVERSAL_BURDEN_BY_KIND,agent);}
  function surfaceManeuverBurden(agent,maneuver){return isSurfaceManeuver(maneuver)?calibratedKindBurden(SURFACE_MANEUVER_BURDEN_BY_KIND,agent):Infinity;}
  function surfaceManeuverTiming(agent,mode,maneuver,distanceMeters=1,movementCredit=0){
    if(!isSurfaceManeuver(maneuver))return {movementTicks:Infinity,movementCreditAfter:0,requiredTicks:Infinity};
    return movementTiming(agent,mode,distanceMeters,movementCredit);
  }
  function selectSurfaceManeuver(agent,candidates,mode='walk',distanceMeters=1,movementCredit=0){
    let best=null;
    for(let index=0;index<(Array.isArray(candidates)?candidates.length:0);index++){
      const maneuver=candidates[index],burden=surfaceManeuverBurden(agent,maneuver),timing=surfaceManeuverTiming(agent,mode,maneuver,distanceMeters,movementCredit);
      if(!Number.isFinite(burden)||!Number.isFinite(timing.requiredTicks))continue;
      const score={burden,time:timing.requiredTicks,index};
      if(!best||score.burden<best.score.burden||(score.burden===best.score.burden&&(score.time<best.score.time||(score.time===best.score.time&&score.index<best.score.index))))best={maneuver,score};
    }
    return best?.maneuver||null;
  }
  function executeSurfaceManeuver(agent,maneuver){return isSurfaceManeuver(maneuver)?{...maneuver}:null;}
  function modeLabel(mode){return C.modeLabel(mode);}
  function setState(agent,mode=null,phase='idle'){
    if(!agent)return null;
    agent.locomotion={mode:mode||null,phase:phase||'idle'};
    return agent.locomotion;
  }
  function clearState(agent){return setState(agent,null,'idle');}

  window.SimLocomotion={VERSION,POSTURE_BY_MODE,MODE_BY_POSTURE,MODE_TRAVERSAL_BURDEN,MODE_TRANSITION_BURDEN,SURFACE_TRAVERSAL_BURDEN_BY_KIND,SURFACE_MANEUVER_BURDEN_BY_KIND,postureForMode,modeFromPosture,transitionTicks,movementTiming,edgeMoveTicks,modeTraversalBurden,modeTransitionBurden,isSurfaceManeuver,surfaceManeuverKey,surfaceTraversalBurden,surfaceManeuverBurden,surfaceManeuverTiming,selectSurfaceManeuver,executeSurfaceManeuver,modeLabel,setState,clearState};
})();
