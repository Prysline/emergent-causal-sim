(() => {
  const W=window.SimWorld,C=window.SimEmbodimentCapabilities,R=window.SimResources;
  if(!W?.registerInitialStateInitializer)throw new Error('systems/agent-carry.js requires world.js initial-state pipeline.');
  if(!C||!R)throw new Error('systems/agent-carry.js requires Embodiment Capabilities and Resources.');

  const VERSION='11.46.0-sleep-agent-carry-integration';
  const METHOD='twoArmCarry';
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

  function carryAttemptability(st,requesterOrId,observation,{method=METHOD,cooperationEvidence=null}={}){
    const requester=agentFor(st,requesterOrId),fail=(reason,extra={})=>Object.freeze({ok:false,reason,...extra});
    if(!requester)return fail('missing-requester');
    if(requester.offMap)return fail('requester-off-map');
    if(!observation?.observable||!observation.targetId)return fail('target-not-observed');
    if(observation.targetId===requester.id)return fail('self-carry-unsupported');
    if(!['human','animal'].includes(observation.observedAgentKind))return fail('observed-target-kind-unsupported');
    if(relationForCarrier(st,requester)||relationForCarried(st,requester))return fail('requester-already-in-carry-relation');
    const capability=capabilityFor(requester,method);if(!capability)return fail('carry-method-unsupported');
    const hands=handDemandWithExistingContainer(st,requester,capability);if(hands.totalHands>hands.capacity)return fail('hand-capacity-exceeded',hands);
    const observedSleeping=observation.observedActionKind==='sleep'&&observation.observedPosture==='lying';
    const cooperationMatches=!!cooperationEvidence&&cooperationEvidence.accepted===true&&cooperationEvidence.targetId===observation.targetId;
    if(!observedSleeping&&!cooperationMatches)return fail('awake-responder-needs-cooperation');
    return Object.freeze({ok:true,reason:null,requester,method,capability,hands,targetId:observation.targetId,responderBasis:observedSleeping?'observedSleeping':'cooperationEvidence'});
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

  function floorTargetCompatibility(st,carried,node){
    const SP=window.SimSpatial,n=SP?.normalizeNode?.(st,node,'floor');if(!n||n.surfaceId!=='floor')return {ok:false,reason:'invalid-floor-node'};
    if(!(SP.nodeLocomotionAccessible?.(st,n,carried)??SP.nodeWalkable?.(st,n,carried)??SP.walkable?.(st,n)))return {ok:false,reason:'floor-node-inaccessible'};
    if((SP.nodeOccupantsAt?.(st,n,carried.id)||SP.occupantsAt?.(st,n,carried.id)||[]).length)return {ok:false,reason:'floor-node-occupied'};
    return {ok:true,node:n};
  }

  function floorPlacement(st,carrier,carried,target){
    const SP=window.SimSpatial,compatibility=floorTargetCompatibility(st,carried,target?.position||target);if(!compatibility.ok)return compatibility;
    const node=compatibility.node,carrierNode=SP.nodeForAgent?.(st,carrier)||SP.normalizeNode?.(st,carrier.position);
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

  function nearbyRecoveryFloor(st,carrierOrId,{radius=2}={}){
    const SP=window.SimSpatial,carrier=agentFor(st,carrierOrId),relation=relationForCarrier(st,carrier);if(!SP||!carrier||!relation)return null;
    const carried=st.agents?.[relation.carriedAgentId],origin=SP.nodeForAgent?.(st,carrier);if(!carried||!origin)return null;
    const pairs=[];
    for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++){
      if(Math.abs(dx)+Math.abs(dy)>radius)continue;
      const node=SP.normalizeNode?.(st,{x:origin.x+dx,y:origin.y+dy,z:origin.z??0,spaceId:origin.spaceId,surfaceId:'floor'},'floor'),compatibility=floorTargetCompatibility(st,carried,node);
      if(!compatibility.ok)continue;
      const approaches=(SP.adjacentWalkable?.(st,compatibility.node)||[]).map(p=>SP.normalizeNode?.(st,p)).filter(Boolean);
      for(const approach of approaches)pairs.push({target:compatibility.node,approach});
    }
    if(!pairs.length)return null;
    const selector=SP.bestCandidateNodeResult?.(st,carrier,pairs.map(x=>x.approach),{mode:'auto',objective:'traversalCost'});if(!selector)return null;
    const matching=pairs.filter(x=>SP.nodeSame?.(st,x.approach,selector.node)).sort((a,b)=>String(SP.nodeKey?.(st,a.target)||'').localeCompare(String(SP.nodeKey?.(st,b.target)||'')));
    const winner=matching[0];if(!winner)return null;
    return Object.freeze({target:Object.freeze({kind:'floor',position:Object.freeze({...winner.target})}),approach:Object.freeze({...selector.node}),selector});
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
  window.SimAgentCarry=Object.freeze({VERSION,METHOD,relationForCarried,relationForCarrier,isCarried,isCarrier,capabilityFor,carryLocalEnvelope,carryingHandlingProfile,projectedPosition,carryAttemptability,canEstablishCarry,establishCarry,surfaceManeuverSupported,floorTargetCompatibility,placementLegality,bestPlacementApproach,nearbyRecoveryFloor,placeCarriedAgent});
})();