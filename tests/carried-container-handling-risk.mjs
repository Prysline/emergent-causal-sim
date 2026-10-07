import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,A=globalThis.SimWorldAuthoring,R=globalThis.SimResources,SP=globalThis.SimSpatial,L=globalThis.SimLocomotion,V=globalThis.SimValidator;
const APP_VERSION='11.48.1-sleep-perception-approach';
const RESOURCES_VERSION='11.39.0-carried-contents-loss';
const ROUTE_VERSION='11.38.0-carried-handling-risk';
const LOCOMOTION_VERSION='11.38.0-carried-handling-risk';
const DELIBERATION_VERSION='11.48.1-sleep-perception-approach';
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
  legacy.entities.containers.cupA.handling.contentRetention.tilt={safe:.06,failure:.34};
  const legacyReport=A.validateAuthoring(legacy);
  assert.equal(legacyReport.ok,false,'world-authoring-v11 must reject legacy safe/failure retention fields');
  assert.ok(legacyReport.errors.some(issue=>issue.code==='authoring_container_content_retention_invalid'));
}

{
  const walk=L.handlingExposureForEdge({mode:'walk',distanceMeters:1});
  const prone=L.handlingExposureForEdge({mode:'proneCrawl',distanceMeters:1});
  const longWalk=L.handlingExposureForEdge({mode:'walk',distanceMeters:2});
  const stepUp=L.handlingExposureForEdge({mode:'walk',distanceMeters:1,surfaceManeuver:{family:'step',direction:'up',kind:'stepUp'}});
  const stepDown=L.handlingExposureForEdge({mode:'walk',distanceMeters:1,surfaceManeuver:{family:'step',direction:'down',kind:'stepDown'}});
  const jumpDown=L.handlingExposureForEdge({mode:'walk',distanceMeters:1,surfaceManeuver:{family:'jump',direction:'down',kind:'jumpDown'}});
  assert.ok(prone.tilt>walk.tilt&&prone.oscillation>walk.oscillation,'prone crawl must expose more objective tilt/oscillation than walk');
  assert.ok(longWalk.oscillation>walk.oscillation,'distance must accumulate oscillation exposure');
  assert.ok(stepDown.impact>stepUp.impact,'step down impact calibration must exceed step up');
  assert.ok(jumpDown.impact>walk.impact,'jump landing must expose objective impact');
}

E.reset(13800);
{
  const st=E.getState(),basket=st.containers.basket,cup=st.containers.cupA,bottle=st.containers.alcoholBottle,plate=st.containers.plateA;
  basket.contents={};
  assert.equal(R.handlingRiskForContainer(st,basket,highExposure).contentsLoss,0,'empty basket may carry burden but cannot lose nonexistent contents');

  cup.contents={water:35};
  const band=cup.handling.contentRetention.tilt,span=band.highRiskExposure-band.lowRiskExposure;
  const tiltRisk=value=>R.handlingRiskForContainer(st,cup,{tilt:value,impact:0,oscillation:0}).contentsLoss;
  const assertNear=(actual,expected,eps=1e-9)=>assert.ok(Math.abs(actual-expected)<=eps,`expected ${expected}, got ${actual}`);
  assertNear(tiltRisk(0),0);
  assertNear(tiltRisk(band.lowRiskExposure/2),.005);
  assertNear(tiltRisk(band.lowRiskExposure),.01);
  assertNear(tiltRisk((band.lowRiskExposure+band.highRiskExposure)/2),.405);
  assertNear(tiltRisk(band.highRiskExposure),.80);
  assertNear(tiltRisk(band.highRiskExposure+span),.90);
  assert.ok(tiltRisk(band.highRiskExposure+span*20)<1,'finite exposure must approach but not hard-clamp to 100%');
  const walkExposure=L.handlingExposureForEdge({mode:'walk',distanceMeters:1});
  const walkRisk=R.handlingRiskForContainer(st,cup,walkExposure).contentsLoss;
  assert.ok(walkRisk>0&&walkRisk<.01,'normal walk below lowRiskExposure should remain low-risk, not hard-zero');

  cup.contents={water:17.5};
  const half=R.handlingRiskForContainer(st,cup,highExposure);
  cup.contents={water:33};
  const near=R.handlingRiskForContainer(st,cup,highExposure);
  assert.ok(near.contentsLoss>half.contentsLoss&&half.contentsLoss>0,'near-full open cup must have higher objective contents-loss risk than half-full cup');
  assert.equal(R.fillRatio(st,cup),33/35);

  bottle.contents={alcohol:120};
  const sealed=R.handlingRiskForContainer(st,bottle,highExposure);
  assert.equal(sealed.contentsLoss,0,'sealed Container normal movement contents-loss risk must be zero');
  assert.ok(sealed.containerDrop>0,'sealed Container may still have independent drop risk');

  plate.contents={food:8};
  assert.ok(R.handlingRiskForContainer(st,plate,highExposure).contentsLoss>0,'plate + solid food must retain generic contents-loss risk');
}

function prepare(careful){
  E.reset(13801);
  const st=E.getState(),a=st.agents.zhen,cup=st.containers.cupA;
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  a.position={...floor(st,2,4)};
  a.posture={kind:'standing',slotId:null,furnitureId:null};
  a.locomotion={mode:null,phase:'idle'};
  a.traits.careful=careful;
  a.held='cupA';
  cup.contents={water:33};
  return {st,a,goal:floor(st,6,4)};
}

const originalExposure=L.handlingExposureForEdge;
L.handlingExposureForEdge=({traversalManeuver}={})=>{
  const from=traversalManeuver?.from,to=traversalManeuver?.to;
  const risky=from?.y===4&&to?.y===4;
  return risky?{tilt:.8,impact:.7,oscillation:.25}:{tilt:.02,impact:.02,oscillation:.04};
};
try{
  {
    const {st,a,goal}=prepare(0);
    const carelessPreference=E.routePreferenceForAction(st,a,{kind:'wander'});
    const baseline=SP.planRoute(st,a,goal,{mode:'walk',objective:'traversalCost'});
    const careless=SP.planRoute(st,a,goal,{mode:'walk',objective:'weighted',weights:carelessPreference.weights});
    assert.deepEqual(coords(careless),coords(baseline),'careless zero handling weights must preserve canonical traversal-cost route');

    const carelessFacts=objectiveFacts(baseline);
    a.traits.careful=1;
    const carefulFacts=objectiveFacts(SP.planRoute(st,a,goal,{mode:'walk',objective:'traversalCost'}));
    assert.deepEqual(carefulFacts,carelessFacts,'careful/careless must not change objective traversal, time, exposure, or risk facts');
  }

  {
    const {st,a,goal}=prepare(1);
    const preference=E.routePreferenceForAction(st,a,{kind:'wander'});
    const baseline=SP.planRoute(st,a,goal,{mode:'walk',objective:'traversalCost'});
    const safer=SP.planRoute(st,a,goal,{mode:'walk',objective:'weighted',weights:preference.weights});
    assert.notDeepEqual(coords(safer),coords(baseline),'weighted search must discover a distinct safer alternative, not post-score one canonical route');
    assert.ok(safer.traversalCost>baseline.traversalCost,'reference safer route must cost more movement burden');
    assert.ok(safer.handlingRisk.contentsLoss<baseline.handlingRisk.contentsLoss,'reference safer route must reduce objective contents-loss risk');
    assert.ok(SP.routeDecisionScore(safer,preference.weights)<SP.routeDecisionScore(baseline,preference.weights),'careful subjective weights must prefer the safer route without rewriting objective facts');

    a.activeIntent={id:'intent:zhen:0:explore',kind:'explore',createdTick:st.tick,lifecycle:'actionBound',source:{type:'test',tick:st.tick}};
    a.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...goal},oneShot:true,intentId:a.activeIntent.id};
    st.thoughts[a.id]={options:[],pick:{id:'wander',score:1,decisionContributors:[]},tick:st.tick};
    assert.equal(a.decisionEvidence,null);
    const staged=E.captureHandlingRouteDecisionEvidence(st,a,safer,baseline,preference);
    assert.ok(staged&&staged.kind==='handlingRisk');
    E.finalizeInitialDecisionEvidence(st);
    const contributor=a.decisionEvidence?.contributors?.find(c=>c.kind==='handlingRisk'&&c.key==='routeSelection');
    assert.ok(contributor,'initial adopted Decision Evidence must freeze a staged handling-risk route contributor');
    assert.equal(contributor.containerId,'cupA');
    assert.ok(contributor.selected.handlingRisk.contentsLoss<contributor.baseline.handlingRisk.contentsLoss);
    assert.equal(JSON.stringify(contributor).includes('"path":'),false,'Decision Evidence must not persist path nodes as a second Route truth');

    const before=JSON.stringify({containers:st.containers,map:st.map,events:st.events,rngState:st.rngState});
    SP.planRoute(st,a,goal,{mode:'walk',objective:'weighted',weights:preference.weights});
    const after=JSON.stringify({containers:st.containers,map:st.map,events:st.events,rngState:st.rngState});
    assert.equal(after,before,'planning-only handling evaluation must not mutate world state, events, contents, or RNG');
  }

  {
    const {st,a,goal}=prepare(1);
    const preference=E.routePreferenceForAction(st,a,{kind:'wander'});
    a.held=null;
    const baseline=SP.planRoute(st,a,goal,{mode:'walk',objective:'traversalCost'});
    const weighted=SP.planRoute(st,a,goal,{mode:'walk',objective:'weighted',weights:preference.weights});
    assert.deepEqual(coords(weighted),coords(baseline),'no-held-Container parity must preserve the existing route');
    assert.deepEqual(weighted.handlingRisk,{contentsLoss:0,containerDrop:0});
  }

  {
    const {st,a,goal}=prepare(1);
    a.activeIntent={id:'intent:zhen:0:explore',kind:'explore',createdTick:0,lifecycle:'actionBound',source:{type:'test',tick:0}};
    a.action={kind:'wander',phase:'move',started:0,wait:0,targetTile:{...goal},oneShot:true,intentId:a.activeIntent.id};
    E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:0,intentKind:'explore'},contributors:[]});
    E.tick();
    assert.ok(a.action?.lastPath?.some(node=>node.y!==4),'production movement must execute the handling-weighted route instead of falling back to traversalCost');
    assert.ok(a.decisionEvidence?.contributors?.some(c=>c.kind==='handlingRisk'&&c.key==='routeSelection'),'production route adoption must capture handling-risk evidence when risk changes the winner');
  }
}finally{
  L.handlingExposureForEdge=originalExposure;
}

assert.equal(V.validateState(E.getState()).issueCount,0);
console.log('Carried Container handling-risk Route/Deliberation regression: ok');
