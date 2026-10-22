import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const cleanEvents=st=>st.events.filter(e=>e.data?.action==='cleanFloor');
const reset=()=>{
  E.reset(20260911);
  const st=E.getState();
  st.agents.orange.offMap=true;
  st.agents.zhou.offMap=true;
  const a=st.agents.zhen;
  a.position=SP.normalizeNode(st,{x:2,y:6},'floor');
  a.action=null;a.activeIntent=null;
  return {st,a,node:SP.nodeForAgent(st,a)};
};
const valid=st=>assert.equal(V.validateState(st).issueCount,0,'canonical state invariants');

{
  const {st,a}=reset();
  SP.putEnvironmentResource(st,SP.normalizeNode(st,{x:8,y:6},'floor'),'water',20);
  assert.equal(E.localCleanFloorOpportunity(a),null,'distant wet World fact cannot become Agent knowledge');
  assert.equal(E.baseUtilityForAction(a,'cleanFloor'),0);
  assert.equal(E.utilityForIntent(st,a,'removeHazard'),0,'soft utility cannot read remote wetness');
  assert.equal(E.candidateIntents(st,a).some(c=>c.intentKind==='removeHazard'),false);
  assert.equal(E.buildAction(a,{id:'cleanFloor'}),null);
  E.tick();
  assert.equal(st.thoughts[a.id]?.options.some(c=>c.id==='cleanFloor'),false,'real initial chooser must not offer remote cleanup');
  assert.equal(cleanEvents(st).length,0);
  valid(st);
}
{
  const {st,a,node}=reset();
  SP.putEnvironmentResource(st,node,'water',4);
  const local=E.localCleanFloorOpportunity(a);
  assert.equal(local.amount,4);
  assert.equal(local.nodeKey,SP.nodeKey(st,node));
  assert.ok(E.baseUtilityForAction(a,'cleanFloor')>0);
  assert.ok(E.utilityForIntent(st,a,'removeHazard')>0,'soft uses same local evidence');
  const cand=E.candidateIntents(st,a).find(c=>c.intentKind==='removeHazard');
  assert.ok(cand,'soft can derive local cleanup');
  assert.ok(cand.decisionContributors.some(c=>c.key==='wetFloorAmount'&&c.source==='floorContact'&&c.nodeKey===local.nodeKey));
  assert.equal(E.buildAction(a,{id:'cleanFloor',targetTile:{x:8,y:6}}),null,'remote explicit target is never trusted');
  const action=E.buildAction(a,{id:'cleanFloor',targetTile:local.targetTile});
  assert.equal(action?.observedTick,st.tick);
  a.action=action;
  E.tick();
  assert.equal(a.action?.phase,'clean','first tick only advances phase');
  E.tick();
  assert.equal(a.action,null);
  assert.equal(cleanEvents(st).length,1,'one actual cleanup creates one event');
  const event=cleanEvents(st)[0];
  assert.equal(event.data.environmentEndpoint,SP.environmentEndpointId(st,node));
  assert.equal(event.data.effectNode,local.nodeKey);
  assert.ok(event.data.amount>0&&event.data.amount<=4);
  assert.ok(Math.abs(SP.environmentResourceAmount(st,node,'water')+event.data.amount-4)<1e-8);
  valid(st);
}
{
  const {st,a,node}=reset();
  SP.putEnvironmentResource(st,node,'water',2);
  a.action=E.buildAction(a,{id:'cleanFloor'});
  E.tick();
  assert.equal(a.action?.phase,'clean');
  SP.takeEnvironmentResource(st,node,'water',2);
  E.tick();
  assert.equal(cleanEvents(st).length,0,'invalidated work cannot emit successful cleanup');
  assert.ok(st.events.some(e=>e.data?.action==='abort'&&e.data?.actionKind==='cleanFloor'));
  assert.equal(SP.environmentResourceAmount(st,node,'water'),0);
  valid(st);
}
{
  const {st,a,node}=reset();
  SP.putEnvironmentResource(st,node,'water',5);
  const other=st.agents.zhou;
  other.offMap=false;other.position={...a.position};
  a.action=E.buildAction(a,{id:'cleanFloor'});
  other.action=E.buildAction(other,{id:'cleanFloor'});
  assert.ok(a.action&&other.action);
  E.tick();
  assert.equal(a.action?.phase,'clean');
  assert.equal(other.action?.phase,'clean');
  E.tick();
  assert.equal(cleanEvents(st).length,1,'competition at same node must not double-report success');
  assert.equal(SP.environmentResourceAmount(st,node,'water'),0);
  assert.ok(st.events.some(e=>e.data?.action==='abort'&&e.data?.actionKind==='cleanFloor'));
  valid(st);
}
{
  const {st,a,node}=reset();
  SP.putEnvironmentResource(st,node,'water',.2);
  assert.equal(E.localCleanFloorOpportunity(a),null,'strict >0.2 threshold');
  SP.putEnvironmentResource(st,node,'water',.01);
  assert.ok(E.localCleanFloorOpportunity(a));
  a.offMap=true;assert.equal(E.localCleanFloorOpportunity(a),null);a.offMap=false;
  a.kind='cat';assert.equal(E.localCleanFloorOpportunity(a),null);a.kind='human';
  a.posture.slotId='test-slot';assert.equal(E.localCleanFloorOpportunity(a),null);a.posture.slotId=null;
  a.position=SP.normalizeNode(st,{x:5,y:2},'diningTable:surface');
  assert.equal(E.localCleanFloorOpportunity(a),null,'furniture Surface wetness is not floor contact');
  assert.equal(E.buildAction(a,{id:'cleanFloor',targetTile:node}),null);
}
{
  const {st,a,node}=reset();
  SP.putEnvironmentResource(st,node,'water',3);
  const intent={id:'intent:'+a.id+':0:removeHazard',kind:'removeHazard',createdTick:0,lifecycle:'open',source:{type:'test'}};
  a.activeIntent=intent;
  assert.equal(E.planOpenIntent(st,a),true,'hard replan can bind a local cleaning Action');
  assert.equal(a.action?.kind,'cleanFloor');
  assert.equal(a.action?.intentId,intent.id);
  a.action=null;intent.lifecycle='open';
  SP.takeEnvironmentResource(st,node,'water',3);
  assert.equal(E.planOpenIntent(st,a),false,'hard replan cannot recreate a dry cleaning Action');
  valid(st);
}
console.log('Observed environmental cleaning v1: local contact, consumer gates, lifecycle and canonical effects ok');
