import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,M=globalThis.SimMentalRegulation,V=globalThis.SimValidator;
assert.ok(E&&M&&V,'production prefix must load Engine, Mental Regulation, and Validator');
assert.equal(M.VERSION,'mental-regulation-v4');
assert.equal(E.MENTAL_REGULATION_VERSION,'mental-regulation-v4');
assert.equal(globalThis.SimWorld.MENTAL_REGULATION_SCHEMA_VERSION,'mental-regulation-v4');
assert.equal(M.AWAKE_STIMULATION_BASELINE_GAIN,.08,'Stimulation baseline calibration must remain explicit and deterministic');
assert.ok(E.listDecisionOptionProviders().some(x=>x.id==='mentalRegulation.wander'),'Mental Regulation must extend existing deliberation through the provider seam');
assert.ok(E.listRuntimeHooks('afterTick').some(x=>x.id==='mentalRegulation.settle'&&x.order===50),'Mental Regulation must settle once after core execution');

E.reset(15200);
let st=E.getState(),a=st.agents.zhen,cat=st.agents.orange;
for(const key of M.NEED_KEYS){
  assert.ok(Object.prototype.hasOwnProperty.call(a.needs,key),`${key} must be an explicit canonical Agent-private Need`);
  assert.equal(a.needs[key],0,`${key} must initialize neutral`);
}
assert.equal(M.decisionOptionFor(a,'wander'),null,'zero Mental Regulation pressure must not add a new deliberation candidate before the first baseline settlement');
assert.equal(V.validateState(st).issueCount,0,'adding Mental Regulation state must preserve existing canonical validation invariants');

const catBefore={stimulation:cat.needs.stimulation,relaxation:cat.needs.relaxation};
const catSettlement=M.settleMentalRegulation(cat,{awake:true});
assert.equal(catSettlement.eligible,false,'non-human Agents without a Mental Regulation consumer must not accumulate pressure');
assert.deepEqual({stimulation:cat.needs.stimulation,relaxation:cat.needs.relaxation},catBefore);

Object.assign(a.needs,{stimulation:0,relaxation:0});
const asleepSettlement=M.settleMentalRegulation(a,{awake:false});
assert.deepEqual(asleepSettlement.appliedDelta,{stimulation:0,relaxation:0},'sleeping time must not create awake Stimulation baseline pressure');
assert.equal(asleepSettlement.contributors.some(x=>x.kind==='awake-baseline'),false);
const awakeSettlement=M.settleMentalRegulation(a,{awake:true});
assert.equal(awakeSettlement.appliedDelta.stimulation,.08);
assert.equal(awakeSettlement.appliedDelta.relaxation,0,'Relaxation must not have generic awake-time drift');
assert.deepEqual(awakeSettlement.contributors.map(x=>x.kind),['awake-baseline']);

Object.assign(a.needs,{stimulation:0,relaxation:0});
for(let i=0;i<20;i++)M.settleMentalRegulation(a,{awake:true});
assert.ok(Math.abs(a.needs.stimulation-1.6)<1e-9,'twenty feedback-free awake ticks must accumulate Stimulation slowly and monotonically');
assert.equal(a.needs.relaxation,0,'feedback-free awake time must not accumulate Relaxation');
assert.ok(a.needs.stimulation<5,'baseline calibration must not create a dominant pressure within a handful of ticks');

Object.assign(a.needs,{stimulation:10,relaxation:0});
const wanderSettlement=M.settleMentalRegulation(a,{awake:true,realizedActivities:[{activityKind:'wander',feedbackUnits:1}]});
assert.ok(Math.abs(wanderSettlement.rawDelta.stimulation-(.08-1.4))<1e-9,'realized wander feedback must offset the awake baseline in the same atomic settlement');
assert.ok(a.needs.stimulation<10,'one realized wander unit must more than offset one baseline tick');
assert.deepEqual(wanderSettlement.contributors.map(x=>x.kind),['awake-baseline','activity-stimulation','activity-mental-load','activity-relaxation']);
assert.ok(wanderSettlement.contributors.every(x=>Object.hasOwn(x,'source')&&Object.hasOwn(x,'realizedUnits')&&Object.hasOwn(x,'rawContribution')),'settlement contributors must retain minimal provenance');

Object.assign(a.needs,{stimulation:10,relaxation:0});
const readSettlement=M.settleMentalRegulation(a,{awake:true,realizedActivities:[{activityKind:'read',feedbackUnits:1}]});
assert.ok(Math.abs(readSettlement.rawDelta.stimulation-(.08-1.8))<1e-9,'realized read feedback must offset the awake baseline');
assert.equal(a.needs.relaxation,0,'net-relaxing read at Relaxation 0 must not create a sequential-clamp artifact');
assert.ok(Math.abs(readSettlement.rawDelta.relaxation-(.35-.65))<1e-9,'mentalLoad and relaxationProvision must remain independent contributors before one final clamp');

Object.assign(a.needs,{stimulation:0,relaxation:0});
const loadOnly=M.settleMentalRegulation(a,{contributors:[{kind:'activity-mental-load',need:'relaxation',source:'test-realized-activity',activityKind:'fixture',realizedUnits:1,rawContribution:.35}]});
assert.equal(loadOnly.appliedDelta.relaxation,.35,'realized mentalLoad must be able to generate Relaxation pressure');
const reliefOnly=M.settleMentalRegulation(a,{contributors:[{kind:'activity-relaxation',need:'relaxation',source:'test-realized-activity',activityKind:'fixture',realizedUnits:1,rawContribution:-.2}]});
assert.ok(Math.abs(reliefOnly.appliedDelta.relaxation+.2)<1e-9,'realized relaxationProvision must independently reduce Relaxation pressure');
assert.ok(Math.abs(a.needs.relaxation-.15)<1e-9);

Object.assign(a.needs,{stimulation:99.98,relaxation:99.9});
const capped=M.settleMentalRegulation(a,{awake:true,contributors:[{kind:'activity-mental-load',need:'relaxation',source:'fixture',realizedUnits:1,rawContribution:1}]});
assert.equal(a.needs.stimulation,100);assert.equal(a.needs.relaxation,100);
assert.ok(capped.rawDelta.stimulation>capped.appliedDelta.stimulation,'settlement provenance must distinguish raw contribution from clamp-limited applied delta');
Object.assign(a.needs,{stimulation:.02,relaxation:.1});
M.settleMentalRegulation(a,{realizedActivities:[{activityKind:'read',feedbackUnits:1}]});
assert.equal(a.needs.stimulation,0);assert.equal(a.needs.relaxation,0,'Need settlement must clamp only once to the canonical 0..100 range');

for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
delete st.objects.bookA;
Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,stimulation:80,relaxation:60});
a.traits.alcoholLike=0;a.traits.social=0;a.traits.animalAffinity=0;
const option=M.decisionOptionFor(a,'wander');
assert.equal(option.id,'wander');
assert.ok(option.score>10,'high regulation pressure may make the existing exploration Activity competitive without hard-triggering it');
const stimulationContributor=option.decisionContributors.find(x=>x.kind==='need'&&x.key==='stimulation');
const relaxationContributor=option.decisionContributors.find(x=>x.kind==='need'&&x.key==='relaxation');
assert.equal(stimulationContributor.value,80);assert.equal(stimulationContributor.boundedEvidence,.8);
assert.equal(relaxationContributor.value,60);assert.equal(relaxationContributor.boundedEvidence,.6);
assert.ok(option.decisionContributors.some(x=>x.kind==='activityProfile'&&x.key==='wander'),'Activity profile must remain an effect opportunity, not a second Need truth');

const beforeIntentOnly={stimulation:a.needs.stimulation,relaxation:a.needs.relaxation,position:{...a.position}};
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(st.thoughts.zhen.pick.decisionProviderId,'mentalRegulation.wander','bounded Mental Regulation evidence must flow through canonical initial deliberation');
assert.equal(a.action?.kind,'wander');
assert.equal(a.activeIntent?.kind,'explore');
const decision=E.currentDecisionEvidence(a);
assert.equal(decision?.source?.providerId,'mentalRegulation.wander','Decision Evidence must retain Mental Regulation provenance');
assert.ok(decision?.contributors?.some(x=>x.kind==='need'&&x.key==='stimulation'));
assert.ok(decision?.contributors?.some(x=>x.kind==='need'&&x.key==='relaxation'));
assert.deepEqual(a.position,beforeIntentOnly.position,'forming the Intent/Action must not itself fabricate execution progress');
assert.ok(Math.abs(a.needs.stimulation-(beforeIntentOnly.stimulation+.08))<1e-9,'Intent/Action formation must not satisfy Stimulation; only the independent awake baseline may apply');
assert.equal(a.needs.relaxation,beforeIntentOnly.relaxation,'Intent/Action formation must not satisfy Relaxation');

let moved=false,preMove=null,postMove=null;
for(let i=0;i<20&&!moved;i++){
  const before={stimulation:a.needs.stimulation,relaxation:a.needs.relaxation,position:{...a.position}};
  E.tick();st=E.getState();a=st.agents.zhen;
  if(a.position.x!==before.position.x||a.position.y!==before.position.y||(a.position.z??0)!==(before.position.z??0)){
    moved=true;preMove=before;postMove={stimulation:a.needs.stimulation,relaxation:a.needs.relaxation,position:{...a.position}};
  }
}
assert.equal(moved,true,'the regression fixture must observe actual wander execution');
assert.ok(postMove.stimulation<preMove.stimulation,'actual exploration movement must realize Stimulation relief greater than the same-tick baseline');
assert.ok(postMove.relaxation<preMove.relaxation,'actual exploration movement must realize net Relaxation relief');

const realized={stimulation:a.needs.stimulation,relaxation:a.needs.relaxation};
a.action=null;a.activeIntent=null;
Object.assign(a.needs,{hunger:95,thirst:0,fatigue:0,sleepNeed:0,social:0});
E.tick();st=E.getState();a=st.agents.zhen;
assert.ok(a.needs.stimulation>=realized.stimulation,'interruption/replacement must not roll back already realized Stimulation effect');
assert.ok(a.needs.relaxation>=realized.relaxation,'interruption/replacement must not roll back already realized Relaxation effect');

const beforeNoFeedback={stimulation:a.needs.stimulation,relaxation:a.needs.relaxation};
a.action={kind:'wander',phase:'move',started:st.tick,targetTile:{...a.position}};
E.tick();st=E.getState();a=st.agents.zhen;
assert.ok(a.needs.stimulation>=beforeNoFeedback.stimulation,'a nominal wander tick with no realized movement must not fabricate Stimulation relief');
assert.equal(a.needs.relaxation,beforeNoFeedback.relaxation,'a nominal wander tick with no realized movement must not fabricate Relaxation relief');

const fatigueBefore=a.needs.fatigue;
M.settleMentalRegulation(a,{awake:true,realizedActivities:[{activityKind:'wander',feedbackUnits:1}]});
assert.equal(a.needs.fatigue,fatigueBefore,'Mental Regulation settlement must not mutate Fatigue');

const mentalSource=fs.readFileSync(new URL('../src/systems/mental-regulation/runtime.js',import.meta.url),'utf8');
assert.ok(!/noiseAt|noiseEvents|environmentInterference/.test(mentalSource),'World noise / Environment Interference must not directly enter Mental Regulation runtime in this slice');
for(const key of ['overload','workload','lastMeaningfulFeedbackTick','ticksSinceLastFeedback']){
  assert.equal(Object.prototype.hasOwnProperty.call(a.needs,key),false,`${key} must not become a parallel persistent Need/history truth`);
  assert.equal(Object.prototype.hasOwnProperty.call(a,key),false,`${key} must not become Agent persistent state`);
}
assert.equal(Object.prototype.hasOwnProperty.call(a,'activityEffectiveness'),false,'first generation slice must not create a universal activityEffectiveness truth');
assert.equal(V.validateState(st).issueCount,0,'Mental Regulation generation must preserve canonical validation invariants');
console.log('mental-regulation-stimulation-relaxation: ok');
