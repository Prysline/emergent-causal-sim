import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,M=globalThis.SimMentalRegulation,SP=globalThis.SimSpatial,A=globalThis.SimWorldAuthoring,V=globalThis.SimValidator;
assert.equal(A.VERSION,'world-authoring-v13');
assert.equal(M.VERSION,'mental-regulation-v3');
assert.equal(E.READ_ACTIVITY_VERSION,'read-activity-v1');
assert.equal(SP.ORDINARY_OBJECT_INTERACTION_VERSION,'ordinary-object-interaction-v1');
assert.ok(E.listDecisionOptionProviders().some(x=>x.id==='mentalRegulation.read'));

const authored=A.DEFAULT_WORLD_AUTHORING,bookAuthored=authored.entities.objects.bookA;
assert.equal(bookAuthored.supportId,'diningTable');
assert.deepEqual(bookAuthored.affordances,['read']);
assert.equal(bookAuthored.interactions.read.mode,'supportReach');
assert.equal(A.validateAuthoring(authored).ok,true);
const collision=A.cloneAuthoring(authored);collision.entities.objects.cupA={...collision.entities.objects.bookA,id:'cupA'};
assert.ok(A.validateAuthoring(collision).errors.some(x=>x.code==='authoring_object_id_collision'),'ordinary object ids must not ambiguously collide with existing object/source identities');

E.reset(15300);
let st=E.getState(),a=st.agents.zhen,book=st.objects.bookA;
assert.ok(book&&book.id==='bookA','authored ordinary object must compile into state.objects exactly once');
assert.equal(M.decisionOptionFor(a,'read'),null,'neutral Mental Regulation pressure must not fabricate a reading motive');
const geometry=SP.interactionGeometry(st,{kind:'object',id:book.id},a,'read');
assert.equal(geometry.mode,'supportReach');
const access=SP.bestInteractionPositionResult(st,a,{kind:'object',id:book.id},'read');
assert.ok(access&&Number.isFinite(access.traversalCost),'read target must use canonical Interaction Geometry + traversal cost');

for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,stimulation:80,relaxation:60});
a.traits.alcoholLike=0;a.traits.social=0;a.traits.animalAffinity=0;
E.tick();st=E.getState();a=st.agents.zhen;
const readOption=st.thoughts.zhen.options.find(option=>option.id==='read');
assert.equal(readOption?.decisionProviderId,'mentalRegulation.read');
assert.equal(readOption?.targetObject,'bookA');
assert.ok(readOption?.decisionContributors.some(x=>x.kind==='spatial'&&x.key==='readAccessTraversalCost'));

// Arm the canonical read Action at a valid interaction position so the next core tick is genuine reading execution.
a.action=null;a.activeIntent=null;a.position={...SP.bestInteractionPositionResult(st,a,{kind:'object',id:'bookA'},'read').position};
const armed=E.buildAction(a,{id:'read',targetObject:'bookA'});assert.equal(armed?.kind,'read');assert.equal(armed.phase,'reading');a.action=armed;E.ensureIntentForAction(st,a);assert.equal(a.activeIntent?.kind,'read');
const before={stimulation:a.needs.stimulation,relaxation:a.needs.relaxation};
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(a.action?.kind,'read');assert.equal(a.action.feedbackUnits,1,'one valid reading execution tick must realize exactly one feedback unit');
assert.ok(a.needs.stimulation<before.stimulation,'realized reading feedback must reduce Stimulation pressure through Mental Regulation');
assert.ok(a.needs.relaxation<before.relaxation,'realized reading feedback must apply net Relaxation effect through Mental Regulation');

const realized={stimulation:a.needs.stimulation,relaxation:a.needs.relaxation};
a.action=null;a.activeIntent=null;
assert.deepEqual({stimulation:a.needs.stimulation,relaxation:a.needs.relaxation},realized,'interrupting reading must not roll back realized effects');

a.action={kind:'read',phase:'move',started:st.tick,wait:0,targetObject:'bookA',feedbackUnits:0,feedbackGoal:6};E.ensureIntentForAction(st,a);
const beforeMove={stimulation:a.needs.stimulation,relaxation:a.needs.relaxation};
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(a.needs.stimulation,beforeMove.stimulation,'moving toward a reading target must not grant Stimulation relief before realized reading feedback');
assert.equal(a.needs.relaxation,beforeMove.relaxation,'moving toward a reading target must not grant Relaxation relief before realized reading feedback');
assert.equal(V.validateState(st).issueCount,0);
assert.equal(Object.prototype.hasOwnProperty.call(a.needs,'overload'),false);
assert.equal(Object.prototype.hasOwnProperty.call(a,'activityEffectiveness'),false);
console.log('mental-regulation-reading-activity: ok');
