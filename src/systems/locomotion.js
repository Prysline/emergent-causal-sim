(() => {
  const W=window.SimWorld,P=window.SimPhysical,C=window.SimEmbodimentCapabilities;if(!W||!P?.getMovementEnvelope)return;
  if(!C?.postureForMode||!C?.modeFromPosture)throw new Error('systems/locomotion.js requires embodiment-capabilities.js.');
  if(!W.registerInitialStateInitializer)throw new Error('systems/locomotion.js requires world.js initial-state pipeline.');
  const VERSION='11.50.0-agent-turn-execution';

  W.registerInitialStateInitializer('locomotion.schema',(st)=>{
    for(const a of Object.values(st.agents||{})){
      if(!a.locomotion)a.locomotion={mode:null,phase:'idle'};
    }
    return st;
  },1700);
  W.LOCOMOTION_SCHEMA_VERSION=VERSION;

  const POSTURE_BY_MODE=C.POSTURE_BY_MODE;
  const MODE_BY_POSTURE=C.MODE_BY_POSTURE;
  const FACING_DIRECTIONS=W.AGENT_FACING_DIRECTIONS;if(!Array.isArray(FACING_DIRECTIONS)||FACING_DIRECTIONS.length!==8)throw new Error('systems/locomotion.js requires canonical Agent facing directions from world.js.');
  const FACING_INDEX=new Map(FACING_DIRECTIONS.map((direction,index)=>[direction,index]));
  const ANGULAR_BURDEN_BY_DELTA=Object.freeze({0:0,45:1,90:2,135:3,180:4});
  const MODE_TRAVERSAL_BURDEN=Object.freeze({walk:0,kneelCrawl:1,proneCrawl:2});
  const MODE_TRANSITION_BURDEN=1;
  const SURFACE_TRAVERSAL_BURDEN_BY_KIND=Object.freeze({human:4,cat:1.1});
  const SURFACE_MANEUVER_BURDEN_BY_KIND=Object.freeze({human:9,cat:1.6});
  const SURFACE_MANEUVER_FAMILIES=new Set(['step','climb','jump']);
  const SURFACE_MANEUVER_DIRECTIONS=new Set(['up','down','level']);
  const HANDLING_EXPOSURE_BY_MODE=Object.freeze({walk:Object.freeze({tilt:.04,impact:.03,oscillation:.08}),kneelCrawl:Object.freeze({tilt:.12,impact:.04,oscillation:.12}),proneCrawl:Object.freeze({tilt:.20,impact:.05,oscillation:.15})});
  const HANDLING_EXPOSURE_BY_MANEUVER=Object.freeze({stepUp:Object.freeze({tilt:.08,impact:.04,oscillation:.02}),stepDown:Object.freeze({tilt:.10,impact:.10,oscillation:.02}),climbUp:Object.freeze({tilt:.22,impact:.08,oscillation:.08}),climbDown:Object.freeze({tilt:.26,impact:.12,oscillation:.09}),jumpUp:Object.freeze({tilt:.12,impact:.20,oscillation:.03}),jumpDown:Object.freeze({tilt:.14,impact:.32,oscillation:.03})});
  const HANDLING_EXPOSURE_BY_VERTICAL_DIRECTION=Object.freeze({up:Object.freeze({tilt:.05,impact:.03,oscillation:.03}),down:Object.freeze({tilt:.06,impact:.07,oscillation:.03}),level:Object.freeze({tilt:0,impact:0,oscillation:0})});

  function postureForMode(mode){return C.postureForMode(mode);}
  function modeFromPosture(agentOrPosture){
    const posture=typeof agentOrPosture==='string'?agentOrPosture:agentOrPosture?.posture?.kind;
    return C.modeFromPosture(posture);
  }
  function assertFacing(facing,label='facing'){if(!FACING_INDEX.has(facing))throw new Error(`Invalid ${label}: ${String(facing)}`);return facing;}
  function angularDelta(fromFacing,toFacing){assertFacing(fromFacing,'fromFacing');assertFacing(toFacing,'toFacing');const raw=Math.abs(FACING_INDEX.get(fromFacing)-FACING_INDEX.get(toFacing)),steps=Math.min(raw,FACING_DIRECTIONS.length-raw);return steps*45;}
  function angularCost(fromFacing,toFacing){const delta=angularDelta(fromFacing,toFacing),cost=ANGULAR_BURDEN_BY_DELTA[delta];if(!Number.isFinite(cost))throw new Error(`Unsupported angular delta: ${delta}`);return cost;}
  function beginTurnExecution(agent,toFacing){if(!agent)throw new Error('Turn execution requires an Agent.');const fromFacing=assertFacing(agent.facing,'Agent.facing');assertFacing(toFacing,'toFacing');const delta=angularDelta(fromFacing,toFacing);return Object.freeze({kind:'turn',fromFacing,toFacing,angularDelta:delta,angularCost:angularCost(fromFacing,toFacing)});}
  function completeTurnExecution(agent,evidence,{succeeded=true}={}){if(!agent)throw new Error('Turn completion requires an Agent.');if(!evidence||evidence.kind!=='turn')throw new Error('Turn completion requires turn execution evidence.');const fromFacing=assertFacing(evidence.fromFacing,'evidence.fromFacing'),toFacing=assertFacing(evidence.toFacing,'evidence.toFacing'),delta=angularDelta(fromFacing,toFacing),cost=angularCost(fromFacing,toFacing);if(evidence.angularDelta!==delta||evidence.angularCost!==cost)throw new Error('Turn execution evidence does not match canonical angular burden.');if(agent.facing!==fromFacing)throw new Error(`Stale turn execution evidence: Agent.facing=${String(agent.facing)}, fromFacing=${fromFacing}.`);const ok=succeeded===true;if(ok)agent.facing=toFacing;return Object.freeze({...evidence,completed:true,succeeded:ok});}
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
  function handlingExposureForEdge({mode='walk',distanceMeters=1,surfaceManeuver=null,traversalManeuver=null}={}){
    const base=HANDLING_EXPOSURE_BY_MODE[mode]||HANDLING_EXPOSURE_BY_MODE.walk,extra=HANDLING_EXPOSURE_BY_MANEUVER[surfaceManeuver?.kind]||{tilt:0,impact:0,oscillation:0};
    const dz=Number(traversalManeuver?.directionVector?.z)||0,vertical=surfaceManeuver?HANDLING_EXPOSURE_BY_VERTICAL_DIRECTION.level:HANDLING_EXPOSURE_BY_VERTICAL_DIRECTION[dz>0?'up':dz<0?'down':'level'];
    const distance=Number.isFinite(Number(distanceMeters))&&Number(distanceMeters)>0?Number(distanceMeters):1;
    return {tilt:Math.max(0,base.tilt+extra.tilt+vertical.tilt),impact:Math.max(0,base.impact+extra.impact+vertical.impact),oscillation:Math.max(0,(base.oscillation+extra.oscillation+vertical.oscillation)*distance)};
  }
  function executeSurfaceManeuver(agent,maneuver){return isSurfaceManeuver(maneuver)?{...maneuver}:null;}
  function modeLabel(mode){return C.modeLabel(mode);}
  function setState(agent,mode=null,phase='idle'){
    if(!agent)return null;
    agent.locomotion={mode:mode||null,phase:phase||'idle'};
    return agent.locomotion;
  }
  function clearState(agent){return setState(agent,null,'idle');}

  window.SimLocomotion={VERSION,FACING_DIRECTIONS,ANGULAR_BURDEN_BY_DELTA,POSTURE_BY_MODE,MODE_BY_POSTURE,MODE_TRAVERSAL_BURDEN,MODE_TRANSITION_BURDEN,SURFACE_TRAVERSAL_BURDEN_BY_KIND,SURFACE_MANEUVER_BURDEN_BY_KIND,postureForMode,modeFromPosture,angularDelta,angularCost,beginTurnExecution,completeTurnExecution,transitionTicks,movementTiming,edgeMoveTicks,modeTraversalBurden,modeTransitionBurden,isSurfaceManeuver,surfaceManeuverKey,surfaceTraversalBurden,surfaceManeuverBurden,surfaceManeuverTiming,selectSurfaceManeuver,HANDLING_EXPOSURE_BY_MODE,HANDLING_EXPOSURE_BY_MANEUVER,HANDLING_EXPOSURE_BY_VERTICAL_DIRECTION,handlingExposureForEdge,executeSurfaceManeuver,modeLabel,setState,clearState};
})();
