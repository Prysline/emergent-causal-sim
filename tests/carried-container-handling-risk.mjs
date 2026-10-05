import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,A=globalThis.SimWorldAuthoring,R=globalThis.SimResources,SP=globalThis.SimSpatial,L=globalThis.SimLocomotion,V=globalThis.SimValidator;
const APP_VERSION='11.46.0-sleep-carry-integration';
const RESOURCES_VERSION='11.39.0-carried-contents-loss';
const ROUTE_VERSION='11.38.0-carried-handling-risk';
const LOCOMOTION_VERSION='11.38.0-carried-handling-risk';
const DELIBERATION_VERSION='11.46.0-sleep-carry-integration';
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const coords=route=>(route?.path||[]).map(node=>[node.x,node.y,node.z??0,node.surfaceId||'floor']);
const objectiveFacts=route=>({traversalCost:route.traversalCost,travelTime:route.travelTime,handlingExposure:route.handlingExposure,handlingRisk:route.handlingRisk});
const highExposure={tilt:.8,impact:.7,oscillation:.6};

assert.equal(E.VERSION,APP_VERSION);
assert.equal(A.VERSION,'world-authoring-v11');
assert.equal(R.VERSION,RESOURCES_VERSION);
assert.equal(SP.ROUTE_SEMANTICS_VERSION,ROUTE_VERSION);
assert.equal(L.VERSION,LOCOMOTION_VERSION);
assert.equal(E.DELIBERATION_SCHEMA_VERSION,DELIBERATION_VERSION);
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,DELIBERATION_VERSION);

{
  const authored=A.DEFAULT_WORLD_AUTHORING,cup=authored.entities.containers.cupA,bottle=authored.entities.containers.alcoholBottle;
  assert.equal(cup.handling.containment,'open');
  assert.deepEqual(Object.keys(cup.handling.contentRetention).sort(),['impact','oscillation','tilt']);
  assert.deepEqual(Object.keys(cup.handling.contentRetention.tilt).sort(),['highRiskExposure','lowRiskExposure']);
  assert.equal(Object.hasOwn(cup.handling.contentRetention.tilt,'safe'),false,'legacy safe threshold must not survive world-authoring-v11');
  assert.equal(Object.hasOwn(cup.handling.contentRetention.tilt,'failure'),false,'legacy failure threshold must not survive world-authoring-v11');
  assert.equal(bottle.handling.containment,'sealed');
  assert.equal(Object.hasOwn(cup,'fillRatio'),false,'fillRatio must remain derived instead of authored');
  const invalid=A.cloneAuthoring(authored);
  delete invalid.entities.containers.cupA.handling.contentRetention;
  const report=A.validateAuthoring(invalid);
  assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='authoring_container_content_retention_invalid'));
  const legacy=A.cloneAuthoring(authored);
  legacy.entities.containers.cupA.handling.contentRetention.tilt={safe:.2,failure:.7};
  const legacyReport=A.validateAuthoring(legacy);
  assert.equal(legacyReport.ok,false);
  assert.ok(legacyReport.errors.some(issue=>issue.code==='authoring_container_content_retention_invalid'));
}

E.configureResetStateSource('handling-risk-test',seed=>A.createInitialStateFromAuthoring(A.DEFAULT_WORLD_AUTHORING,seed));
E.reset(38001);
let st=E.getState(),a=st.agents.zhen;
a.position=floor(st,3,3);a.posture={kind:'standing',slotId:null,furnitureId:null};
const cup=st.containers.cupA;cup.position={...a.position};cup.contents={water:cup.capacity*.72};a.held='cupA';

const nearby=floor(st,4,3),far=floor(st,6,3);
const nearRoute=SP.planRoute(st,a,nearby,{mode:'auto',objective:'traversalCost'}),farRoute=SP.planRoute(st,a,far,{mode:'auto',objective:'traversalCost'});
assert.ok(nearRoute&&farRoute);
assert.ok(nearRoute.handlingExposure&&farRoute.handlingExposure);
assert.ok(nearRoute.handlingRisk&&farRoute.handlingRisk);
assert.ok(nearRoute.handlingExposure.aggregate>=0&&nearRoute.handlingExposure.aggregate<=1);
assert.ok(farRoute.handlingRisk.aggregate>=0&&farRoute.handlingRisk.aggregate<=1);
assert.ok(Number.isFinite(nearRoute.pathDistance));
assert.ok(Number.isFinite(nearRoute.traversalCost));
assert.ok(Number.isFinite(nearRoute.travelTime));

const byPath=SP.planRoute(st,a,far,{mode:'auto',objective:'pathDistance'}),byTraversal=SP.planRoute(st,a,far,{mode:'auto',objective:'traversalCost'});
assert.ok(byPath&&byTraversal);
assert.equal(byPath.objective,'pathDistance');
assert.equal(byTraversal.objective,'traversalCost');
assert.equal(coords(byPath).length,coords(byTraversal).length);

const originalRisk=R.handlingRiskForExposure;
R.handlingRiskForExposure=()=>({tilt:.8,impact:.7,oscillation:.6,aggregate:.8,contributions:{tilt:.8,impact:.7,oscillation:.6}});
try{
  const risky=SP.planRoute(st,a,far,{mode:'auto',objective:'weighted',weights:{traversalCost:1,handlingRisk:10}});
  assert.ok(risky);
  assert.equal(risky.objective,'weighted');
  assert.ok(Number.isFinite(risky.objectiveCost));
}finally{R.handlingRiskForExposure=originalRisk;}

const choice=E.buildAction(a,{id:'wander',targetTile:far});
assert.ok(choice);
a.action=choice;
for(let i=0;i<20&&a.action;i++)E.tick();
assert.ok(!a.action||a.action.kind==='wander');
assert.equal(V.validateState(E.getState()).issueCount,0);

console.log('carried container handling risk regression: ok');
