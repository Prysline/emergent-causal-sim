import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,A=globalThis.SimWorldAuthoring,R=globalThis.SimResources,SP=globalThis.SimSpatial,L=globalThis.SimLocomotion,V=globalThis.SimValidator;
const APP_VERSION='11.47.0-social-bid-carry-cooperation';
const RESOURCES_VERSION='11.39.0-carried-contents-loss';
const ROUTE_VERSION='11.38.0-carried-handling-risk';
const LOCOMOTION_VERSION='11.38.0-carried-handling-risk';
const DELIBERATION_VERSION='11.47.0-social-bid-carry-cooperation';
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
  const authored=A.DEFAULT_WORLD_AUTHORING,cup=authored.entities.containers.cupA,bottle=authored.entities.containers.alcoholBottle,plate=authored.entities.containers.plateA;
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
  legacy.entities.containers.cupA.handling.contentRetention.tilt={safe:.2,failure:.8};
  const legacyReport=A.validateAuthoring(legacy);
  assert.equal(legacyReport.ok,false);
  assert.ok(legacyReport.errors.some(issue=>issue.code==='authoring_container_content_retention_invalid'));
  assert.equal(plate.handling.containment,'open');
}

E.reset(13801);
let st=E.getState(),zhen=st.agents.zhen;
zhen.offMap=false;zhen.position=floor(st,3,3);zhen.posture={kind:'standing',slotId:null,furnitureId:null};zhen.action=null;zhen.activeIntent=null;
const cup=st.items.cupA;cup.position={kind:'held',agentId:zhen.id};zhen.held='cupA';cup.contents=[{resource:'water',amount:1.5}];
const shortRoute=SP.route(st,zhen.position,floor(st,5,3),{agent:zhen,mode:'walk',objective:'traversalCost'});
assert.ok(shortRoute);
assert.ok(shortRoute.handlingExposure);
assert.ok(shortRoute.handlingRisk);
assert.equal(shortRoute.handlingRisk.containerId,'cupA');
assert.equal(shortRoute.handlingRisk.containment,'open');
assert.equal(shortRoute.handlingRisk.contentAmount,1.5);
for(const axis of ['tilt','impact','oscillation']){
  assert.ok(Number.isFinite(shortRoute.handlingExposure[axis]));
  assert.ok(shortRoute.handlingExposure[axis]>=0);
  assert.ok(Number.isFinite(shortRoute.handlingRisk.axes[axis].risk));
  assert.ok(shortRoute.handlingRisk.axes[axis].risk>=0&&shortRoute.handlingRisk.axes[axis].risk<=1);
}
assert.equal(shortRoute.handlingRisk.aggregateRisk,Math.max(...Object.values(shortRoute.handlingRisk.axes).map(x=>x.risk)));

const exposureRoute=structuredClone(shortRoute);
exposureRoute.handlingExposure={...highExposure};
const evalHigh=R.evaluateContainerHandlingRisk(st,zhen,exposureRoute);
assert.equal(evalHigh.containerId,'cupA');
assert.equal(evalHigh.containment,'open');
assert.ok(evalHigh.aggregateRisk>0);
assert.ok(evalHigh.axes.tilt.risk>0);

const sealed=st.items.alcoholBottle;
sealed.position={kind:'held',agentId:zhen.id};zhen.held='alcoholBottle';
const sealedEval=R.evaluateContainerHandlingRisk(st,zhen,exposureRoute);
assert.equal(sealedEval.containment,'sealed');
assert.equal(sealedEval.aggregateRisk,0);
for(const axis of ['tilt','impact','oscillation'])assert.equal(sealedEval.axes[axis].risk,0);

sealed.position={kind:'world',position:floor(st,3,3)};cup.position={kind:'held',agentId:zhen.id};zhen.held='cupA';
const candidateA={id:'a',route:{...structuredClone(shortRoute),travelTime:8,handlingExposure:{tilt:.1,impact:.1,oscillation:.1}}};
const candidateB={id:'b',route:{...structuredClone(shortRoute),travelTime:5,handlingExposure:{tilt:.8,impact:.8,oscillation:.8}}};
for(const c of [candidateA,candidateB])c.route.handlingRisk=R.evaluateContainerHandlingRisk(st,zhen,c.route);
const cautious={routeRiskWeight:9,routeTimeWeight:1};
const reckless={routeRiskWeight:0,routeTimeWeight:1};
const cautiousA=E.routePreferenceForAction(st,zhen,{kind:'test',handlingPolicy:cautious},candidateA.route);
const cautiousB=E.routePreferenceForAction(st,zhen,{kind:'test',handlingPolicy:cautious},candidateB.route);
const recklessA=E.routePreferenceForAction(st,zhen,{kind:'test',handlingPolicy:reckless},candidateA.route);
const recklessB=E.routePreferenceForAction(st,zhen,{kind:'test',handlingPolicy:reckless},candidateB.route);
assert.ok(cautiousA<cautiousB,'handling risk should influence cautious route preference');
assert.ok(recklessB<recklessA,'without risk weight faster route should win');

E.reset(13802);st=E.getState();zhen=st.agents.zhen;zhen.offMap=false;zhen.position=floor(st,3,3);zhen.posture={kind:'standing',slotId:null,furnitureId:null};zhen.action=null;zhen.activeIntent=null;
const cup2=st.items.cupA;cup2.position={kind:'held',agentId:zhen.id};zhen.held='cupA';cup2.contents=[{resource:'water',amount:1.5}];
const route=SP.route(st,zhen.position,floor(st,8,3),{agent:zhen,mode:'walk',objective:'traversalCost'});assert.ok(route);
const facts=objectiveFacts(route);assert.ok(facts.handlingExposure);assert.ok(facts.handlingRisk);
const eventId=E.addEvent('handling route evidence','normal',[],{actor:zhen.id,action:'testHandlingRoute',routeHandlingExposure:facts.handlingExposure,routeHandlingRisk:facts.handlingRisk});
assert.deepEqual(st.causes[eventId].data.routeHandlingExposure,facts.handlingExposure);
assert.deepEqual(st.causes[eventId].data.routeHandlingRisk,facts.handlingRisk);

const validation=V.validateState(st);assert.equal(validation.issueCount,0,validation.issues.map(x=>x.code+': '+x.message).join(' | '));
console.log('carried-container-handling-risk: ok');
