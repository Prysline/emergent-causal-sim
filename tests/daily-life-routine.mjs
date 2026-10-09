import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,R=globalThis.SimDailyLifeRoutine,V=globalThis.SimValidator,W=globalThis.SimWorld;
assert.ok(E&&R&&V&&W,'production prefix must load Engine, Routine, Validator, and World');
assert.equal(R.VERSION,'daily-life-routine-v1');
assert.equal(E.DAILY_LIFE_ROUTINE_VERSION,'daily-life-routine-v1');
assert.equal(W.DAILY_LIFE_ROUTINE_SCHEMA_VERSION,'daily-life-routine-v1');
assert.ok(E.listDecisionOptionProviders().some(entry=>entry.id==='dailyLifeRoutine.read'),'Routine must extend existing Deliberation through the provider seam');

function neutralize(st,a){
  for(const other of Object.values(st.agents||{}))if(other.id!==a.id)other.offMap=true;
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,stimulation:0,relaxation:0});
  a.traits.alcoholLike=0;a.traits.social=0;a.traits.animalAffinity=0;
  a.action=null;a.activeIntent=null;a.decisionEvidence=null;
}
function anchorMinute(a){
  const anchor=a.routine.anchors.find(item=>item.activityKind==='read');
  assert.ok(anchor,'DAY 0 Human must have a minimal read Routine anchor');
  return {anchor,minute:Math.floor((anchor.context.startMinute+anchor.context.endMinute)/2)};
}

E.reset(17001);
let st=E.getState(),a=st.agents.zhen;
assert.ok(a.routine&&Array.isArray(a.routine.anchors),'Routine truth must live on the Agent');
assert.equal(Object.prototype.hasOwnProperty.call(st,'routines'),false,'Routine must not create World-level personal schedule truth');
assert.deepEqual(E.getState().agents.zhen.routine,E.getState().agents.zhen.routine,'Routine anchor is canonical Agent-private state, not a UI projection');
const firstAnchor=structuredClone(anchorMinute(a).anchor);
assert.equal(Object.prototype.hasOwnProperty.call(firstAnchor,'status'),false,'Routine anchor must not carry success/failure lifecycle state');

neutralize(st,a);
let timing=anchorMinute(a);
st.minute=timing.minute;
const actionBefore=a.action,intentBefore=a.activeIntent;
const directOption=E.routineDecisionOption(st,a);
assert.equal(a.action,actionBefore,'Routine provider query must not directly create Action');
assert.equal(a.activeIntent,intentBefore,'Routine provider query must not directly create Active Intent');
assert.equal(directOption?.id,'read');
assert.equal(directOption?.targetObject,'bookA');
assert.ok(directOption.score<=R.ROUTINE_SCORE_MAX,'Routine evidence must remain bounded');
assert.ok(directOption.decisionContributors.some(x=>x.kind==='routine'&&x.boundedEvidence>0&&x.boundedEvidence<=1));

st.minute=timing.anchor.context.startMinute-1;
assert.equal(E.routineDecisionOption(st,a),null,'time is context/evidence; outside the anchor window Routine must not hard-trigger an Action');
st.minute=timing.minute;
E.tick();st=E.getState();a=st.agents.zhen;
const routineOption=st.thoughts.zhen.options.find(option=>option.decisionProviderId==='dailyLifeRoutine.read');
assert.ok(routineOption,'active Routine window must add one bounded read candidate');
assert.ok(st.thoughts.zhen.options.some(option=>option!==routineOption),'the same deliberation must still contain competing legal candidates');
assert.equal(st.thoughts.zhen.pick.decisionProviderId,'dailyLifeRoutine.read','with neutral competing pressure, Routine may win without bypassing Deliberation');
assert.equal(a.action?.kind,'read');
assert.equal(a.activeIntent?.kind,'read');
const evidence=E.currentDecisionEvidence(a);
assert.equal(evidence?.source?.providerId,'dailyLifeRoutine.read','adopted Decision Evidence must preserve Routine provider provenance');
assert.ok(evidence?.contributors?.some(x=>x.kind==='routine'),'adopted Decision Evidence must preserve bounded Routine evidence');
assert.deepEqual(a.routine.anchors.find(item=>item.id===firstAnchor.id),firstAnchor,'choosing the Routine Activity must not rewrite the anchor');

E.reset(17002);st=E.getState();a=st.agents.zhen;neutralize(st,a);timing=anchorMinute(a);st.minute=timing.minute;
a.needs.hunger=95;
E.tick();st=E.getState();a=st.agents.zhen;
const hungerRoutineOption=st.thoughts.zhen.options.find(option=>option.decisionProviderId==='dailyLifeRoutine.read');
assert.ok(hungerRoutineOption,'strong Need case must still contain the feasible Routine candidate for real competition');
assert.equal(st.thoughts.zhen.pick.id,'eat','strong physiological Need must be able to beat Routine');
assert.notEqual(st.thoughts.zhen.pick.decisionProviderId,'dailyLifeRoutine.read');
assert.equal(Object.prototype.hasOwnProperty.call(a.routine.anchors[0],'status'),false,'deviating from Routine is not a failure state');
assert.equal(st.events.some(event=>event.data?.action==='routineFailure'),false,'deviating from Routine must not fabricate a failure event');

E.reset(17003);st=E.getState();a=st.agents.zhen;neutralize(st,a);timing=anchorMinute(a);st.minute=timing.minute;
delete st.objects.bookA;
assert.equal(E.routineDecisionOption(st,a),null,'Routine must not fabricate a candidate when the Activity has no feasible readable target');
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(st.thoughts.zhen.options.some(option=>option.decisionProviderId==='dailyLifeRoutine.read'),false,'infeasible Routine must not enter canonical candidate competition');
assert.notEqual(a.action?.kind,'read','Routine must never fabricate an executable Action without feasibility');

E.reset(17004);st=E.getState();a=st.agents.zhen;
a.routine.anchors.push(structuredClone(a.routine.anchors[0]));
const validation=V.validateState(st);
assert.ok(validation.issues.some(issue=>issue.code==='routine_anchor_duplicate'),'Routine validator must reject duplicate Agent-private anchors loudly');

console.log('daily-life-routine: ok');
