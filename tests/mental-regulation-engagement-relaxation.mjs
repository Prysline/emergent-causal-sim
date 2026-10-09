import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,M=globalThis.SimMentalRegulation,V=globalThis.SimValidator;
assert.ok(E&&M&&V,'production prefix must load Engine, Mental Regulation, and Validator');
assert.equal(M.VERSION,'mental-regulation-v1');
assert.equal(E.MENTAL_REGULATION_VERSION,'mental-regulation-v1');
assert.equal(globalThis.SimWorld.MENTAL_REGULATION_SCHEMA_VERSION,'mental-regulation-v1');
assert.ok(E.listDecisionOptionProviders().some(x=>x.id==='mentalRegulation.wander'),'Mental Regulation must extend existing deliberation through the provider seam');

E.reset(15200);
let st=E.getState(),a=st.agents.zhen;
assert.notEqual(a.needs.engagement,a.needs.relaxation,'Engagement and Relaxation must remain separate canonical Agent-private values');
for(const key of M.NEED_KEYS)assert.ok(Number.isFinite(a.needs[key])&&a.needs[key]>=0&&a.needs[key]<=100,`${key} must initialize as a bounded canonical Need`);
assert.equal(V.validateState(st).issueCount,0,'adding Mental Regulation state must preserve existing canonical validation invariants');

for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,engagement:80,relaxation:60});
a.traits.alcoholLike=0;a.traits.social=0;a.traits.animalAffinity=0;
const option=M.decisionOptionFor(a,'wander');
assert.equal(option.id,'wander');
assert.ok(option.score>10,'high regulation pressure may make the existing exploration Activity competitive without hard-triggering it');
const engagementContributor=option.decisionContributors.find(x=>x.kind==='need'&&x.key==='engagement');
const relaxationContributor=option.decisionContributors.find(x=>x.kind==='need'&&x.key==='relaxation');
assert.equal(engagementContributor.value,80);assert.equal(engagementContributor.boundedEvidence,.8);
assert.equal(relaxationContributor.value,60);assert.equal(relaxationContributor.boundedEvidence,.6);
assert.ok(option.decisionContributors.some(x=>x.kind==='activityProfile'&&x.key==='wander'),'Activity profile must remain an effect opportunity, not a second Need truth');

const beforeIntentOnly={engagement:a.needs.engagement,relaxation:a.needs.relaxation,position:{...a.position}};
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(st.thoughts.zhen.pick.decisionProviderId,'mentalRegulation.wander','bounded Mental Regulation evidence must flow through canonical initial deliberation');
assert.equal(a.action?.kind,'wander');
assert.equal(a.activeIntent?.kind,'explore');
const decision=E.currentDecisionEvidence(a);
assert.equal(decision?.source?.providerId,'mentalRegulation.wander','Decision Evidence must retain Mental Regulation provenance');
assert.ok(decision?.contributors?.some(x=>x.kind==='need'&&x.key==='engagement'));
assert.ok(decision?.contributors?.some(x=>x.kind==='need'&&x.key==='relaxation'));
assert.deepEqual(a.position,beforeIntentOnly.position,'forming the Intent/Action must not itself fabricate execution progress');
assert.ok(a.needs.engagement>=beforeIntentOnly.engagement,'unexecuted Intent must not reduce Engagement Need');
assert.ok(a.needs.relaxation>=beforeIntentOnly.relaxation,'unexecuted Intent must not reduce Relaxation Need');

let moved=false,preMove=null,postMove=null;
for(let i=0;i<20&&!moved;i++){
  const before={engagement:a.needs.engagement,relaxation:a.needs.relaxation,position:{...a.position}};
  E.tick();st=E.getState();a=st.agents.zhen;
  if(a.position.x!==before.position.x||a.position.y!==before.position.y||(a.position.z??0)!==(before.position.z??0)){
    moved=true;preMove=before;postMove={engagement:a.needs.engagement,relaxation:a.needs.relaxation,position:{...a.position}};
  }
}
assert.equal(moved,true,'the regression fixture must observe actual wander execution');
assert.ok(postMove.engagement<preMove.engagement,'actual exploration movement must realize Engagement relief');
assert.ok(postMove.relaxation<preMove.relaxation,'actual exploration movement must realize net Relaxation relief');

const realized={engagement:a.needs.engagement,relaxation:a.needs.relaxation};
a.action=null;a.activeIntent=null;
Object.assign(a.needs,{hunger:95,thirst:0,fatigue:0,sleepNeed:0,social:0});
E.tick();st=E.getState();a=st.agents.zhen;
assert.ok(a.needs.engagement>=realized.engagement,'interruption/replacement must not roll back already realized Engagement effect');
assert.ok(a.needs.relaxation>=realized.relaxation,'interruption/replacement must not roll back already realized Relaxation effect');

const beforeNoFeedback={engagement:a.needs.engagement,relaxation:a.needs.relaxation};
a.action={kind:'wander',phase:'move',started:st.tick,targetTile:{...a.position}};
E.tick();st=E.getState();a=st.agents.zhen;
assert.ok(a.needs.engagement>=beforeNoFeedback.engagement,'a nominal wander tick with no realized movement must not grant Engagement relief');
assert.ok(a.needs.relaxation>=beforeNoFeedback.relaxation,'a nominal wander tick with no realized movement must not grant Relaxation relief');

assert.equal(Object.prototype.hasOwnProperty.call(a.needs,'overload'),false,'first slice must not create a persistent Overload Need');
assert.equal(Object.prototype.hasOwnProperty.call(a,'activityEffectiveness'),false,'first slice must not create a universal activityEffectiveness truth');
console.log('mental-regulation-engagement-relaxation: ok');
