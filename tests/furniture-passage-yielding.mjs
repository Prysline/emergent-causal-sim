import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const A=globalThis.SimWorldAuthoring,D=globalThis.SimFurnitureDefinitions,W=globalThis.SimWorld,E=globalThis.SimEngine,SP=globalThis.SimSpatial,P=globalThis.SimPerception,F=globalThis.SimFurniturePassageYielding,R=globalThis.SimFurniturePassageYieldingRuntime;
assert.ok(A&&D&&W&&E&&SP&&P&&F&&R,'Furniture Passage Yielding production contracts must load');
assert.equal(A.VERSION,'world-authoring-v17');
assert.equal(D.VERSION,'furniture-definitions-v13','Furniture Definition schema must remain unchanged');
assert.equal(P.VISUAL_LOS_VERSION,'perception-visual-los-v3-runtime-furniture');
assert.equal(P.VISUAL_SIGHT_SAMPLES_VERSION,'perception-visual-sight-samples-v2-furniture-target');
assert.equal(P.VISUAL_AVAILABILITY_VERSION,'perception-visual-availability-v2-furniture-target');
assert.equal(SP.ROUTE_SEMANTICS_VERSION,'11.38.0-carried-handling-risk','Passage Yielding must not fake-bump Route own generation');
assert.equal(SP.PASSAGE_YIELDING_VERSION,'furniture-passage-yielding-v1');

const clone=value=>JSON.parse(JSON.stringify(value));
function corridorAuthoring(){
  const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
  for(const id of ['chairNE','chairSW','chairSE'])delete authored.furniture[id];
  authored.furniture.chairNW={id:'chairNW',definitionId:'chair-basic',origin:{x:4,y:4,z:0},orientation:'north',name:'讓路椅',passageYielding:true};
  authored.residents.zhen.initial.placement={mode:'exact',node:{x:3,y:5,z:0}};
  authored.residents.zhen.initial.facing='northEast';
  const layer=authored.map.layers.find(item=>item.z===0);
  const corridor=[{x:3,y:5,z:0},{x:4,y:5,z:0},{x:4,y:4,z:0},{x:5,y:4,z:0},{x:6,y:4,z:0},{x:4,y:3,z:0}],inside=new Set(corridor.map(cell=>`${cell.x},${cell.y}`));
  for(const cell of corridor)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const neighbor={x:cell.x+dx,y:cell.y+dy,z:0};
    if(inside.has(`${neighbor.x},${neighbor.y}`))continue;
    const boundaryId=A.boundaryIdBetween(cell,neighbor);if(boundaryId)layer.boundaries[boundaryId]={kind:'wall',material:'stone'};
  }
  return A.canonicalizeAuthoring(authored);
}
function addWalkableLowCeiling(st){
  const ceiling={
    id:'testLowCeiling',name:'測試低天花板',kind:'test',orientation:'south',
    footprint:[{x:4,y:4,z:0}],displayAt:{x:4,y:4,z:0},slots:[],
    spatial:{solids:[{key:'ceiling',layerZ:0,bounds:{x:4,y:4,z:1.8,width:1,depth:1,height:.2}}],surfaces:[]}
  };
  st.furniture[ceiling.id]=ceiling;
  const tile=SP.tileByPos(st,{x:4,y:4,z:0});if(tile&&!tile.furnitureIds.includes(ceiling.id))tile.furnitureIds.push(ceiling.id);
  return ceiling;
}
function runtime(authored=corridorAuthoring()){const st=W.createInitialStateFromAuthoring(authored,26016);addWalkableLowCeiling(st);return st;}

{
  const authored=corridorAuthoring(),chair=authored.furniture.chairNW,contract=A.resolveFurniturePassageYieldingContract(chair);
  assert.deepEqual(contract.homePlacement,{origin:{x:4,y:4,z:0},orientation:'north'});
  assert.deepEqual(contract.parkedPlacement,{origin:{x:4,y:3,z:0},orientation:'north'},'default parked placement must derive once from authored home + facing');
  chair.origin={x:8,y:6,z:0};
  assert.deepEqual(contract.parkedPlacement,{origin:{x:4,y:3,z:0},orientation:'north'},'resolved parked reference must not drift with later current placement mutation');

  const explicit=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);explicit.furniture.chairNW.passageYielding=true;explicit.furniture.chairNW.parkedPlacement={origin:{x:5,y:2,z:0},orientation:'east'};
  assert.deepEqual(A.resolveFurniturePassageYieldingContract(A.canonicalizeAuthoring(explicit).furniture.chairNW).parkedPlacement,{origin:{x:5,y:2,z:0},orientation:'east'});
  for(const [placement,code] of [
    [{origin:{x:6,y:2,z:0},orientation:'east'},'authoring_furniture_parked_displacement_invalid'],
    [{origin:{x:4,y:2,z:1},orientation:'east'},'authoring_furniture_parked_displacement_invalid'],
    [{origin:{x:5,y:2,z:0},orientation:'north'},'authoring_furniture_parked_rotation_unsupported']
  ]){
    const bad=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);bad.furniture.chairNW.passageYielding=true;bad.furniture.chairNW.parkedPlacement=placement;const report=A.validateAuthoring(bad);
    assert.equal(report.ok,false);assert.ok(report.errors.some(issue=>issue.code===code),code);
  }
}

{
  const st=runtime(),chair=st.furniture.chairNW,a=st.agents.zhen;
  assert.equal(chair.definitionId,'chair-basic');assert.deepEqual(chair.origin,{x:4,y:4,z:0});
  assert.equal(F.placementLegality(st,chair).ok,true,'empty chair must have a legal bounded parked transaction');
  st.reservations['slot:chairNW:seat']='zhou';assert.equal(F.dependencyLegality(st,chair).reason,'reserved-slot');delete st.reservations['slot:chairNW:seat'];
  st.objects.bookA.supportId=chair.id;assert.equal(F.dependencyLegality(st,chair).reason,'supported-object');st.objects.bookA.supportId='diningTable';
  st.objects.bookA.containedBy=chair.id;assert.equal(F.dependencyLegality(st,chair).reason,'contained-object');delete st.objects.bookA.containedBy;
  st.usageClaims.push({id:'claim:chair',claimant:{kind:'agent',id:'zhou'},activity:'sleep',target:{kind:'slot',id:'chairNW:seat'},role:'primary'});assert.equal(F.dependencyLegality(st,chair).reason,'durable-usage-relation');st.usageClaims=[];
  st.agents.zhou.posture={kind:'sitting',slotId:'chairNW:seat',furnitureId:'chairNW'};assert.equal(F.dependencyLegality(st,chair).reason,'occupied-or-posture-bound');st.agents.zhou.offMap=true;st.agents.zhou.posture={kind:'standing'};

  const contact=F.interactionPositions(st,a,chair,F.geometryLegality(st,chair).displacement);
  assert.ok(contact.length>0,'canonical support/contact geometry must provide reachable opposite-side interaction position');
  assert.ok(contact.every(entry=>entry.position.y===5),'northward parked translation must be operated from its south/opposite side');
}

{
  const st=runtime(),chair=st.furniture.chairNW;
  const blocker=D.resolveInstance({id:'blockingCabinet',definitionId:'cabinet-tall',origin:{x:4,y:3,z:0},orientation:'south'});blocker.definitionId='cabinet-tall';blocker.origin={x:4,y:3,z:0};st.furniture[blocker.id]=blocker;
  const blocked=F.geometryLegality(st,chair);assert.equal(blocked.ok,false);assert.ok(['destination-solid-overlap','transition-solid-overlap'].includes(blocked.reason),'destination/sweep must use full resolved 3D solids');
}

{
  const st=runtime(),a=st.agents.zhen,chair=st.furniture.chairNW,goal=SP.normalizeNode(st,{x:6,y:4,z:0},'floor');
  assert.equal(SP.floorNodeFitsMode(st,{x:4,y:4,z:0},a,'walk'),false,'chair + 1.8m ceiling must block Human floor walking in the bottleneck cell');
  assert.equal(SP.surfaceNodeFitsMode(st,{x:4,y:4,z:0,surfaceId:'chairNW:seat'},a,'walk'),false,'same ceiling must block standing/walking on the chair seat while remaining high enough for floor walking after relocation');
  const current=F.basePlanRoute(st,a,goal,{mode:'walk',objective:'traversalCost'});assert.equal(Number.isFinite(current.traversalCost),false,'fixture must make current normal walk unreachable');
  const observation=P.classifyFurnitureVisualSensoryAvailability(st,a,chair);assert.equal(observation.visualAvailable,true,'candidate Furniture must be observed through Furniture sensory evidence');
  const candidate=F.candidateForNavigation(st,a,goal);assert.ok(candidate,'observed empty chair whose parked counterfactual restores walk must be a candidate');
  assert.equal(Number.isFinite(candidate.parkedWalk.traversalCost),true);
  a.facing='southWest';assert.equal(F.candidateForNavigation(st,a,goal),null,'unobserved Furniture must not be selected from hidden World truth');a.facing='northEast';

  a.action={kind:'wander',phase:'move',spatialGoal:clone(goal),started:st.tick,wait:0,intentId:'intent:passage-test'};
  a.activeIntent={id:'intent:passage-test',kind:'explore',lifecycle:'actionBound',source:{type:'test'}};
  const routed=SP.planRoute(st,a,goal,{mode:'auto',objective:'traversalCost'});
  assert.ok(a.action.passageYieldingRecovery,'production route query must synchronously arm bounded recovery before core execution can abort the Action');
  assert.equal(a.activeIntent.id,'intent:passage-test','recovery must preserve the original high-level Intent truth');
  assert.deepEqual(routed.path.at(-1),a.action.passageYieldingRecovery.interactionPosition,'recovery route must target canonical opposite-side interaction position');

  a.position=clone(a.action.passageYieldingRecovery.interactionPosition);
  const beforeEvents=st.events.filter(event=>event.data?.action==='furniturePassageYielding').length;
  assert.equal(R.settleRecovery(st,a),true,'execution-time recovery must complete at legal contact');
  const events=st.events.filter(event=>event.data?.action==='furniturePassageYielding');assert.equal(events.length,beforeEvents+1,'Furniture move must emit exactly one canonical World Event');
  assert.deepEqual(st.furniture.chairNW.origin,{x:4,y:3,z:0});
  assert.equal(st.map.tiles['4,4'].furnitureIds.includes('chairNW'),false);assert.equal(st.map.tiles['4,3'].furnitureIds.includes('chairNW'),true,'runtime transaction must atomically refresh tile Furniture membership');
  assert.equal(F.candidateForNavigation(st,a,goal),null,'already parked Furniture must never yield again');
  assert.equal(SP.floorNodeFitsMode(st,{x:4,y:4,z:0},a,'walk'),true,'1.8m ceiling alone must remain walkable after chair relocation');
  assert.equal(Number.isFinite(F.basePlanRoute(st,a,goal,{mode:'walk',objective:'traversalCost'}).traversalCost),true,'route re-query must immediately consume new runtime geometry without stale cross-tick cache');
}

{
  const authored=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);authored.furniture.visualCabinet={id:'visualCabinet',definitionId:'cabinet-tall',origin:{x:3,y:4,z:0},orientation:'south'};const st=W.createInitialStateFromAuthoring(A.canonicalizeAuthoring(authored),26017),cabinet=st.furniture.visualCabinet;
  const projection=P.projectRuntimeVisualOpacity(st,0);assert.ok(projection.some(item=>item.source?.furnitureId==='visualCabinet'));
  const withoutSelf=P.projectRuntimeVisualOpacity(st,0,{excludeFurnitureId:'visualCabinet'});assert.equal(withoutSelf.some(item=>item.source?.furnitureId==='visualCabinet'),false,'target-specific visibility must exclude target Furniture self-occlusion only');
  const oldRect=projection.find(item=>item.source?.furnitureId==='visualCabinet').geometry;
  const moved=D.resolveInstance({id:'visualCabinet',definitionId:'cabinet-tall',origin:{x:8,y:4,z:0},orientation:'south'});moved.definitionId='cabinet-tall';moved.origin={x:8,y:4,z:0};st.furniture.visualCabinet=moved;
  const newRect=P.projectRuntimeVisualOpacity(st,0).find(item=>item.source?.furnitureId==='visualCabinet').geometry;assert.notDeepEqual(newRect,oldRect,'runtime Furniture opacity projection must follow current canonical resolved geometry, not stale authoring placement');
}

{
  const st=runtime(),a=st.agents.zhen,goal=SP.normalizeNode(st,{x:4,y:5,z:0},'floor');
  assert.equal(Number.isFinite(F.basePlanRoute(st,a,goal,{mode:'walk',objective:'traversalCost'}).traversalCost),true);
  assert.equal(F.candidateForNavigation(st,a,goal),null,'an existing normal walk route must suppress Passage Yielding entirely');
}

console.log('furniture passage yielding regression passed');
