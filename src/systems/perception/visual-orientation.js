(() => {
  const W=window.SimWorld;
  if(!W?.AGENT_FACING_DIRECTIONS)throw new Error('systems/perception/visual-orientation.js requires canonical Agent facing from world.js.');

  const VERSION='perception-visual-orientation-v1';
  const FACING_DIRECTIONS=W.AGENT_FACING_DIRECTIONS;
  const FACING_SET=new Set(FACING_DIRECTIONS);
  const ANGLE_BY_DIRECTION=Object.freeze({
    east:0,
    southEast:45,
    south:90,
    southWest:135,
    west:180,
    northWest:225,
    north:270,
    northEast:315
  });
  const DIRECTION_BY_OCTANT=Object.freeze(['east','southEast','south','southWest','west','northWest','north','northEast']);

  function finitePoint(point,label){
    if(!point||!Number.isFinite(Number(point.x))||!Number.isFinite(Number(point.y)))throw new Error(`${label} requires finite x/y coordinates.`);
    return {x:Number(point.x),y:Number(point.y)};
  }

  function requireFacing(facing,label='facing'){
    if(!FACING_SET.has(facing))throw new Error(`Invalid ${label}: ${String(facing)}`);
    return facing;
  }

  function visualOrientation(agent){
    if(!agent)throw new Error('visualOrientation requires an Agent.');
    return requireFacing(agent.facing,'Agent.facing');
  }

  function captureVisualOrientationSnapshot(st,observer){
    if(!st||!Number.isInteger(st.tick)||st.tick<0)throw new Error('Visual orientation snapshot requires a non-negative integer state tick.');
    if(!observer?.id)throw new Error('Visual orientation snapshot requires an observer id.');
    return Object.freeze({observerId:observer.id,snapshotTick:st.tick,facing:visualOrientation(observer)});
  }

  function directionToward(observerPosition,targetPosition){
    const from=finitePoint(observerPosition,'observerPosition'),to=finitePoint(targetPosition,'targetPosition');
    const dx=to.x-from.x,dy=to.y-from.y;
    if(Math.abs(dx)<1e-12&&Math.abs(dy)<1e-12)throw new Error('Visual bearing requires distinct observer and target representative positions.');
    const degrees=(Math.atan2(dy,dx)*180/Math.PI+360)%360;
    return DIRECTION_BY_OCTANT[Math.round(degrees/45)%8];
  }

  function relativeBearingDegrees(facing,targetDirection){
    const fromAngle=ANGLE_BY_DIRECTION[requireFacing(facing,'facing')];
    const toAngle=ANGLE_BY_DIRECTION[requireFacing(targetDirection,'targetDirection')];
    const delta=Math.abs(fromAngle-toAngle)%360;
    return Math.min(delta,360-delta);
  }

  function visualFieldClass(relativeBearing){
    const bearing=Number(relativeBearing);
    if(!Number.isFinite(bearing)||bearing<0||bearing>180||bearing%45!==0)throw new Error(`Invalid 8-direction visual relative bearing: ${String(relativeBearing)}`);
    if(bearing<=45)return'direct';
    if(bearing===90)return'peripheral';
    return'unavailable';
  }

  function classifyVisualBearing(snapshot,observerPosition,targetPosition){
    if(!snapshot?.observerId||!Number.isInteger(snapshot.snapshotTick))throw new Error('classifyVisualBearing requires a visual orientation snapshot.');
    const facing=requireFacing(snapshot.facing,'snapshot.facing');
    const targetDirection=directionToward(observerPosition,targetPosition);
    const relativeBearing=relativeBearingDegrees(facing,targetDirection);
    return Object.freeze({
      observerId:snapshot.observerId,
      snapshotTick:snapshot.snapshotTick,
      facing,
      targetDirection,
      relativeBearing,
      visualClass:visualFieldClass(relativeBearing)
    });
  }

  const P=window.SimPerception||{};
  if(P.VISUAL_ORIENTATION_VERSION)throw new Error('Visual orientation perception foundation is already registered.');
  Object.assign(P,{
    VISUAL_ORIENTATION_VERSION:VERSION,
    FACING_DIRECTIONS,
    visualOrientation,
    captureVisualOrientationSnapshot,
    directionToward,
    relativeBearingDegrees,
    visualFieldClass,
    classifyVisualBearing
  });
  window.SimPerception=P;
})();
