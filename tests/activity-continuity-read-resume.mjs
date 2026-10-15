import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,C=globalThis.SimActivityContinuityState,SP=globalThis.SimSpatial;
const events=action=>E.getState().events.filter(event=>event.data?.action===action);
const isolate=st=>{for(const a of Object.values(st.agents))if(a.id!=='zhen')a.offMap=true;};
const quiet=a=>{Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,stimulation:0,relaxation:0});a.traits.alcoholLike=0;a.traits.social=0;a.traits.animalAffinity=0;};
function armRead(st,a,units=0){
  a.position={...SP.bestInteractionPositionResult(st,a,{kind:'object',id:'bookA'},'read').position};
  a.action=E.buildAction(a,{id:'read',targetObject:'bookA'});
  assert.equal(a.action?.phase,'reading');
  a.action.feedbackUnits=units;
  E.ensureIntentForAction(st,a);
}
function finishEmergency(maxTicks=40){
  for(let i=0;i<maxTicks;i++){
    const st=E.getState(),a=st.agents.zhen;
    if(a.action?.kind!=='drinkWater'&&a.activeIntent?.source?.type!=='emergency')return;
    E.tick();
  }
  assert.fail('emergency drink did not finish within bounded regression window');
}

assert.equal(C.VERSION,'activity-continuity-v1');
assert.equal(E.ACTIVITY_CONTINUITY_VERSION,C.VERSION);
assert.ok(E.listDecisionOptionProviders().some(x=>x.id==='activityContinuity.resumeRead'));
assert.ok(E.EMERGENCY_PREEMPTIBLE.has('read'),'Activity Continuity v1 must explicitly opt read into emergency preemption');

// Real production lifecycle: realized read -> emergency suspension -> deliberative resume -> natural completion.
E.reset(6110);
let st=E.getState(),a=st.agents.zhen;
isolate(st);quiet(a);
assert.equal(a.activityEpisode,null);
assert.equal(Object.prototype.hasOwnProperty.call(st,'activityEpisode'),false,'Activity Continuity must remain Agent-private');
armRead(st,a,1);
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(a.action?.feedbackUnits,2);
const episodeId=a.activityEpisode?.id;
assert.ok(episodeId,'first realized unfinished read must establish one canonical episode');
assert.equal(a.activityEpisode.lifecycle,'ongoing');
assert.equal(a.activityEpisode.target.id,'bookA');
assert.equal(a.activityEpisode.boundActionStartedTick,a.action.started);
assert.equal(a.activityEpisode.suspendedProgress,null,'ongoing progress must remain owned by the live Action');
assert.equal(C.validEpisode(a.activityEpisode),true);

const realizedBeforeSuspend=a.action.feedbackUnits;
a.needs.thirst=99;
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(a.action?.kind,'drinkWater','emergency thirst must use the existing canonical preemption path');
assert.equal(a.activeIntent?.source?.type,'emergency');
assert.equal(a.activityEpisode.id,episodeId,'suspension must preserve episode identity');
assert.equal(a.activityEpisode.lifecycle,'suspended');
assert.deepEqual(a.activityEpisode.suspendedProgress,{feedbackUnits:realizedBeforeSuspend,feedbackGoal:6});
assert.equal(a.activityEpisode.boundActionStartedTick,null);
assert.ok(events('activitySuspended').some(event=>event.data.activityEpisodeId===episodeId&&event.data.emergencyNeed==='thirst'));
assert.ok(events('intentPreempt').some(event=>event.data.priorActionKind==='read'&&event.data.emergencyNeed==='thirst'),'read suspension must still be followed by the canonical emergency preemption event');

finishEmergency();
st=E.getState();a=st.agents.zhen;quiet(a);
assert.equal(a.activityEpisode.lifecycle,'suspended','finishing the interrupting emergency must not auto-resume the episode');
const resumeOption=E.activityContinuityResumeOption(st,a);
assert.equal(resumeOption?.id,'read');
assert.equal(resumeOption?.targetObject,'bookA');
assert.ok(resumeOption?.decisionContributors.some(c=>c.kind==='activityContinuity'&&c.episodeId===episodeId));

// Let normal core Deliberation choose. At the book interaction position, continuity beats only idle human wander.
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(st.thoughts.zhen.pick?.id,'read');
assert.equal(st.thoughts.zhen.pick?.decisionProviderId,'activityContinuity.resumeRead');
assert.equal(a.action?.kind,'read');
assert.equal(a.action?.feedbackUnits,realizedBeforeSuspend,'resume must transfer suspended progress into the new concrete Action');
assert.equal(a.activityEpisode.id,episodeId);
assert.equal(a.activityEpisode.lifecycle,'ongoing');
assert.equal(a.activityEpisode.suspendedProgress,null,'progress must not remain duplicated after resume');
assert.equal(a.activityEpisode.boundActionStartedTick,a.action.started);
assert.ok(events('activityResumed').some(event=>event.data.activityEpisodeId===episodeId));

for(let i=0;i<10&&a.activityEpisode.lifecycle!=='completed';i++){E.tick();st=E.getState();a=st.agents.zhen;}
assert.equal(a.activityEpisode.id,episodeId);
assert.equal(a.activityEpisode.lifecycle,'completed','domain natural completion must terminate the same episode');
assert.equal(a.activityEpisode.suspendedProgress,null);
assert.equal(E.activityContinuityResumeOption(st,a),null);
assert.ok(events('activityCompleted').some(event=>event.data.activityEpisodeId===episodeId));
assert.ok(events('read').some(event=>event.data.actor==='zhen'&&event.data.feedbackUnits>=6),'canonical read completion event must remain the domain completion evidence');

// Competing ordinary activity: resume evidence may lose, and losing terminates this bounded v1 episode instead of forcing a return.
E.reset(6111);st=E.getState();a=st.agents.zhen;isolate(st);quiet(a);armRead(st,a,2);E.tick();st=E.getState();a=st.agents.zhen;
const abandonedId=a.activityEpisode.id;a.needs.thirst=99;E.tick();finishEmergency();st=E.getState();a=st.agents.zhen;
quiet(a);a.needs.hunger=80;
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(st.thoughts.zhen.pick?.id,'eat','a stronger ordinary Need must be able to beat resume evidence');
assert.equal(a.activityEpisode.id,abandonedId);
assert.equal(a.activityEpisode.lifecycle,'abandoned','v1 keeps at most one suspended episode and ends it when ordinary deliberation chooses another Activity');
assert.ok(events('activityAbandoned').some(event=>event.data.activityEpisodeId===abandonedId));

// Permanent target invalidation terminates a suspended episode; temporary reachability is not conflated with invalidation.
E.reset(6112);st=E.getState();a=st.agents.zhen;isolate(st);quiet(a);armRead(st,a,2);E.tick();st=E.getState();a=st.agents.zhen;
a.needs.thirst=99;E.tick();st=E.getState();a=st.agents.zhen;const invalidatedId=a.activityEpisode.id;
st.objects.bookA.affordances=st.objects.bookA.affordances.filter(x=>x!=='read');
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(a.activityEpisode.id,invalidatedId);
assert.equal(a.activityEpisode.lifecycle,'invalidated');
assert.ok(events('activityInvalidated').some(event=>event.data.activityEpisodeId===invalidatedId&&event.data.reason==='read-affordance-missing'));

console.log('activity-continuity-read-resume: ok');
