(() => {
  const W=window.SimWorld,C=window.SimEmbodimentCapabilities,R=window.SimResources;
  if(!W?.registerInitialStateInitializer)throw new Error('systems/agent-carry.js requires world.js initial-state pipeline.');
  if(!C||!R)throw new Error('systems/agent-carry.js requires Embodiment Capabilities and Resources.');

  const VERSION='11.46.0-sleep-carry-integration';
  const METHOD='twoArmCarry';
  const RECOVERY_RADIUS=2;
  const clone=p=>p?{...p}:null;
  const relations=st=>st?.agentCarries||{};
  const agentFor=(st,aOrId)=>typeof aOrId==='string'?st?.agents?.[aOrId]:aOrId;
  const isSleeping=a=>a?.action?.kind==='sleep'&&a.action?.phase==='sleeping';

  function relationForCarried(st,aOrId){const a=agentFor(st,aOrId);return a?relations(st)[a.id]||null:null;}
  function relationForCarrier(st,aOrId){const a=agentFor(st,aOrId);return a?Object.values(relations(st)).find(r=>r?.carrierId===a.id)||null:null;}
  function isCarried(st,aOrId){return !!relationForCarried(st,aOrId);}
  function isCarrier(st,aOrId){return !!relationForCarrier(st,aOrId);}

  function capabilityFor(agent,method=METHOD){return C.agentCarryCapabilityForKind?.(agent?.kind,method)||null;}
  function carryLocalEnvelope(carried,method=METHOD){
    const methodProfile=C.agentCarryMethod?.(method),body=carried?.physical?.bodyGeometry,cal=methodProfile?.carriedGeometryCalibration;
    if(!body||!cal)return null;
    const height=Number(body.width),bodyHeight=Number(body.height),bodyWidth=Number(body.width),bodyLength=Number(body.length);
    if(![height,bodyHeight,bodyWidth,bodyLength].every(v=>Number.isFinite(v)&&v>0))return null;
    return Object.freeze({
      height,
      width:Math.max(bodyWidth,bodyHeight*cal.widthFromHeightFactor),
      length:Math.max(bodyLength,bodyHeight*cal.lengthFromHeightFactor)
    });
  }

  function carryingHandlingProfile(st,carrierOrId){
    const relation=relationForCarrier(st,carrierOrId);if(!relation)return null;
    const carried=st.agents?.[relation.carriedAgentId],carrier=st.agents?.[relation.carrierId],capability=capabilityFor(carrier,relation.method),carryGeometry=carryLocalEnvelope(carried,relation.method);
    if(!carried||!carrier||!capability||!carryGeometry)return null;
    return Object.freeze({relationId:relation.id,carrierId:carrier.id,carriedAgentId:carried.id,method:relation.method,handsRequired:capability.handsRequired,mass:carried.physical?.mass??null,carryGeometry});
  }

  function projectedPosition(st,aOrId){
    const a=agentFor(st,aOrId);if(!a)return null;
    const relation=relationForCarried(st,a);if(!relation)return clone(a.position);
    const carrier=st.agents?.[relation.carrierId];return clone(carrier?.position);
  }

  function handDemandWithExistingContainer(st,carrier,capability){
    const held=R.getCarriedHandlingProfile?.(st,carrier),containerHands=held?.handsRequired||0;
    return {containerHands,agentHands:capability?.handsRequired||0,totalHands:containerHands+(capability?.handsRequired||0),capacity:Number(carrier?.physical?.manipulation?.handCapacity)||0};
  }

  function candidateAttemptability(st,carrierOrId,observation,{method=METHOD,cooperationEvidence=null}={}){
    const carrier=agentFor(st,carrierOrId),fail=(reason,extra={})=>Object.freeze({ok:false,reason,...extra});
    if(!carrier)return fail('missing-carrier');
    if(carrier.offMap)return fail('carrier-off-map');
    if(relationForCarrier(st,carrier)||relationForCarried(st,carrier))return fail('carrier-already-in-carry-relation');
    const capability=capabilityFor(carrier,method);if(!capability)return fail('carry-method-unsupported');
    const hands=handDemandWithExistingContainer(st,carrier,capability);if(hands.totalHands>hands.capacity)return fail('hand-capacity-exceeded',hands);
    if(!observation?.observable||!observation.targetId)return fail('target-unobserved');
    if(!['human','animal'].includes(observation.observedAgentKind))return fail('observed-target-kind-unsupported');
    const observedSleeping=observation.observedActionKind==='sleep'&&observation.observedPosture==='lying';
    const cooperative=!!cooperationEvidence?.accepted;
    if(!observedSleeping&&!cooperative)return fail('no-observed-sleep-or-cooperation');
    return Object.freeze({ok:true,reason:null,carrierId:carrier.id,targetId:observation.targetId,method,capability,hands,observedSleeping,cooperative});
  }

  function canEstablishCarry(st,carrierOrId,carriedOrId,{method=METHOD,cooperative=false}={}){
    const carrier=agentFor(st,carrierOrId),carried=agentFor(st,carriedOrId);
    const fail=(reason,extra={})=>Object.freeze({ok:false,reason,...extra});
    if(!carrier||!carried)return fail('missing-agent');
    if(carrier.id===carried.id)return fail('self-carry-unsupported');
    if(carrier.offMap||carried.offMap)return fail('off-map');
    if(relationForCarrier(st,carrier)||relationForCarried(st,carrier)||relationForCarrier(st,carried)||relationForCarried(st,carried))return fail('agent-already-in-carry-relation');
    const capability=capabilityFor(carrier,method);if(!capability)return fail('carry-method-unsupported');
    const mass=Number(carried.physical?.mass);if(!Number.isFinite(mass)||mass<=0)return fail('carried-mass-missing');
    if(mass>capability.massCapacity)return fail('mass-capacity-exceeded',{mass,massCapacity:capability.massCapacity});
    if(carried.held)return fail('nested-held-container-unsupported');
    const hands=handDemandWithExistingContainer(st,carrier,capability);if(hands.totalHands>hands.capacity)return fail('hand-capacity-exceeded',hands);
    const responderMode=isSleeping(carried)?'sleeping':cooperative===true?'cooperative':null;
    if(!responderMode)return fail('awake-responder-not-cooperative');
    const carryGeometry=carryLocalEnvelope(carried,method);if(!carryGeometry)return fail('carried-geometry-missing');
    return Object.freeze({ok:true,reason:null,carrier,carried,method,capability,responderMode,mass,hands,carryGeometry});
  }

  function establishCarry(st,carrierOrId,carriedOrId,options={}){
    const feasibility=canEstablishCarry(st,carrierOrId,carriedOrId,options);if(!feasibility.ok)return feasibility;
    const {carrier,carried,method,responderMode}=feasibility;
    const relation={id:`agent-carry:${carrier.id}:${carried.id}`,carrierId:carrier.id,carriedAgentId:carried.id,method,responderMode,establishedTick:st.tick};
    st.agentCarries[carried.id]=relation;
    carried.position=null;
    carried.posture={kind:'carried',slotId:null,furnitureId:null};
    window.SimLocomotion?.clearState?.(carried);
    return Object.freeze({ok:true,reason:null,relation});
  }

  function surfaceManeuverSupported(st,carrierOrId,family){
    const relation=relationForCarrier(st,carrierOrId);if(!relation)return true;
    const capability=capabilityFor(agentFor(st,carrierOrId),relation.method);if(!capability)return false;
    if(family==='jump')return capability.surfaceManeuvers?.jump===true;
    return true;
  }

  function floorPlacement(st,carrier,carried,target){
    const SP=window.SimSpatial,node=SP?.normalizeNode?.(st,target?.position||target,'floor');
    if(!node||node.surfaceId!=='floor')return {ok:false,reason:'invalid-floor-node'};
    if(!(SP.nodeLocomotionAccessible?.(st,node,carried)??SP.nodeWalkable?.(st,node,carried)??SP.walkable?.(st,node)))return {ok:false,reason:'floor-node-inaccessible'};
    if((SP.nodeOccupantsAt?.(st,node,carried.id)||SP.occupantsAt?.(st,node,carried.id)||[]).length)return {ok:false,reason:'floor-node-occupied'};
    const carrierNode=SP.nodeForAgent?.(st,carrier)||SP.normalizeNode?.(st,carrier.position);
    if(!carrierNode||(!SP.nodeSame?.(st,carrierNode,node)&&(SP.manhattan?.(carrierNode,node)??Infinity)!==1))return {ok:false,reason:'carrier-not-at-placement-reach'};
    const posture=isSleeping(carried)?'lying':'standing';
    return {ok:true,kind:'floor',position:node,posture};
  }

  function slotPlacement(st,carrier,carried,target){
    const SP=window.SimSpatial,slot=SP?.getSlot?.(st,target?.id);if(!slot)return {ok:false,reason:'missing-slot'};
    if(!SP.slotAllows?.(slot,carried))return {ok:false,reason:'slot-kind-mismatch'};
    if(!SP.slotAvailable?.(st,slot.id,carried.id))return {ok:false,reason:'slot-unavailable'};
    const requested=target?.posture;
    let posture=null;
    if(isSleeping(carried))posture=slot.canSleep&&SP.slotPoseFits?.(slot,carried,'lying')?'lying':null;
    else if(requested==='sitting'&&SP.slotPoseFits?.(slot,carried,'sitting'))posture='sitting';
    else if(requested==='lying'&&SP.slotPoseFits?.(slot,carried,'lying'))posture='lying';
    else if((slot.canRest||slot.mealSeat)&&SP.slotPoseFits?.(slot,carried,'sitting'))posture='sitting';
    else if((slot.canRest||slot.canSleep)&&SP.slotPoseFits?.(slot,carried,'lying'))posture='lying';
    if(!posture)return {ok:false,reason:'slot-posture-illegal'};
    const carrierNode=SP.nodeForAgent?.(st,carrier),approaches=SP.slotApproachNodes?.(st,slot,carrier,'walk')||[];
    if(!carrierNode||!approaches.some(n=>SP.nodeSame?.(st,n,carrierNode)))return {ok:false,reason:'carrier-not-at-slot-approach'};
    return {ok:true,kind:'slot',slot,position:{...slot.position},posture};
  }

  function placementLegality(st,carrierOrId,target){
    const carrier=agentFor(st,carrierOrId),relation=relationForCarrier(st,carrier);if(!carrier||!relation)return {ok:false,reason:'no-carry-relation'};
    const carried=st.agents?.[relation.carriedAgentId];if(!carried)return {ok:false,reason:'missing-carried-agent'};
    if(target?.kind==='slot')return slotPlacement(st,carrier,carried,target);
    if(target?.kind==='floor')return floorPlacement(st,carrier,carried,target);
    return {ok:false,reason:'placement-kind-unsupported'};
  }

  function bestPlacementApproach(st,carrierOrId,target){
    const SP=window.SimSpatial,carrier=agentFor(st,carrierOrId);if(!SP||!carrier||!target)return null;
    if(target.kind==='slot'){
      const slot=SP.getSlot?.(st,target.id);return slot?SP.bestSlotApproachNode?.(st,slot,carrier,{mode:'walk',objective:'traversalCost'})||null:null;
    }
    if(target.kind==='floor'){
      const node=SP.normalizeNode?.(st,target.position||target,'floor');if(!node)return null;
      const candidates=(SP.adjacentWalkable?.(st,node)||[]).map(p=>SP.normalizeNode?.(st,p)).filter(Boolean);
      return SP.bestCandidateNode?.(st,carrier,candidates,{mode:'auto',objective:'traversalCost'})||null;
    }
    return null;
  }

  function recoveryFloorCandidates(st,carrierOrId,{radius=RECOVERY_RADIUS}={}){
    const SP=window.SimSpatial,carrier=agentFor(st,carrierOrId),relation=relationForCarrier(st,carrier),carried=relation&&st.agents?.[relation.carriedAgentId];
    const origin=carrier&&SP?.nodeForAgent?.(st,carrier);if(!carrier||!carried||!origin)return [];
    const out=new Map(),z=SP.zOf?.(origin)??origin.z??0;
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      if(Math.abs(dx)+Math.abs(dy)>radius)continue;
      const node=SP.normalizeNode?.(st,{x:origin.x+dx,y:origin.y+dy,z,spaceId:origin.spaceId,surfaceId:'floor'},'floor');
      if(!node||node.surfaceId!=='floor')continue;
      if(!(SP.nodeLocomotionAccessible?.(st,node,carried)??SP.nodeWalkable?.(st,node,carried)??SP.walkable?.(st,node)))continue;
      if((SP.nodeOccupantsAt?.(st,node,carried.id)||SP.occupantsAt?.(st,node,carried.id)||[]).length)continue;
      const target={kind:'floor',position:{...node}},approach=bestPlacementApproach(st,carrier,target);if(!approach)continue;
      out.set(SP.nodeKey?.(st,node)||`${node.x},${node.y},${z}`,{target,approach});
    }
    return [...out.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([,entry])=>entry);
  }

  function recoveryPlacement(st,carrierOrId,options={}){
    const SP=window.SimSpatial,candidates=recoveryFloorCandidates(st,carrierOrId,options);if(!candidates.length)return null;
    const winner=SP.bestCandidateNodeResult?.(st,carrierOrId,candidates.map(x=>x.approach),{mode:'auto',objective:'traversalCost'});if(!winner)return null;
    const matches=candidates.filter(x=>SP.nodeSame?.(st,x.approach,winner.node));
    return matches[0]?.target||null;
  }

  function placeCarriedAgent(st,carrierOrId,target){
    const legality=placementLegality(st,carrierOrId,target);if(!legality.ok)return legality;
    const carrier=agentFor(st,carrierOrId),relation=relationForCarrier(st,carrier),carried=st.agents[relation.carriedAgentId];
    carried.position={...legality.position};
    carried.posture=legality.kind==='slot'?{kind:legality.posture,slotId:legality.slot.id,furnitureId:legality.slot.furnitureId}:{kind:legality.posture,slotId:null,furnitureId:null};
    delete st.agentCarries[carried.id];
    return Object.freeze({ok:true,reason:null,relation,carriedAgentId:carried.id,placementKind:legality.kind,position:{...legality.position},posture:legality.posture,slotId:legality.slot?.id||null});
  }

  function initializeState(st){st.agentCarryVersion=VERSION;st.agentCarries={};return st;}
  W.registerInitialStateInitializer('agentCarry.schema',initializeState,1550);
  W.AGENT_CARRY_SCHEMA_VERSION=VERSION;
  window.SimAgentCarry=Object.freeze({VERSION,METHOD,RECOVERY_RADIUS,relationForCarried,relationForCarrier,isCarried,isCarrier,capabilityFor,carryLocalEnvelope,carryingHandlingProfile,projectedPosition,candidateAttemptability,canEstablishCarry,establishCarry,surfaceManeuverSupported,placementLegality,bestPlacementApproach,recoveryFloorCandidates,recoveryPlacement,placeCarriedAgent});
})();