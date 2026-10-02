import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
function quiet(a){for(const k of ['hunger','thirst','fatigue','sleepNeed','social','groomingNeed'])if(a.needs&&k in a.needs)a.needs[k]=0;if(a.traits){a.traits.social=0;a.traits.animalAffinity=0;a.traits.alcoholLike=0;}}

E.reset(3600);
let st=E.getState(),a=st.agents.zhen;
assert.equal(st.version,'11.44.0-sleep-slot-conflict');
assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.44.0-sleep-slot-conflict');
for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
quiet(a);a.needs.hunger=95;
const rngBefore=st.rngState;E.decisionContributorsForAction(a,'eat');assert.equal(st.rngState,rngBefore,'capturing structured contributors must not consume chooser RNG');
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(a.action?.kind,'eat');
assert.ok(a.action?.decisionId,'adopted initial Action must reference a Decision Evidence id');
assert.equal(a.decisionEvidence?.id,a.action.decisionId);
assert.equal(a.decisionEvidence?.source?.type,'initialDeliberation');
assert.ok(a.decisionEvidence.contributors.some(c=>c.kind==='need'&&c.key==='hunger'&&c.value>=95),'initial evidence must freeze the selected hunger contributor');
assert.equal(E.decisionEvidenceMatchesAction(a),true);
noIssues('initial adopted evidence');

E.reset(3601);st=E.getState();a=st.agents.zhen;st.tick=2;for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;quiet(a);a.needs.hunger=80;
a.activeIntent={id:'intent:zhen:0:explore',kind:'explore',createdTick:0,lifecycle:'actionBound',source:{type:'test',tick:0}};
a.action={kind:'wander',phase:'move',started:0,wait:0,targetTile:{x:2,y:6},oneShot:true,intentId:a.activeIntent.id};
const priorSoft=E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:0,intentKind:'explore'},contributors:[]}).id;
assert.equal(E.applySoftReconsideration(st,a),true);
assert.notEqual(a.action.decisionId,priorSoft,'soft reconsideration must adopt a new concrete decision identity');
assert.equal(a.decisionEvidence.source.type,'softReconsideration');
assert.equal(a.decisionEvidence.priorDecisionId,priorSoft);
assert.ok(a.decisionEvidence.contributors.some(c=>c.kind==='need'&&c.key==='hunger'),'soft challenger evidence must carry structured motive contributors');
noIssues('soft adopted evidence');

E.reset(3602);st=E.getState();let cat=st.agents.orange;cat.needs.thirst=72;st.containers.waterBucket.contents.water=0;st.containers.cupB.contents.water=18;
cat.activeIntent={id:'intent:orange:0:drinkWater',kind:'drinkWater',createdTick:0,lifecycle:'actionBound',source:{type:'test',tick:0}};
cat.action={kind:'drinkWater',phase:'move',started:0,wait:0,targetObject:'waterBucket',resource:'water',intentId:cat.activeIntent.id};
const priorHard=E.adoptDecisionEvidence(st,cat,cat.action,{source:{type:'test',tick:0,intentKind:'drinkWater'},contributors:E.decisionContributorsForAction(cat,'drinkWater')}).id;
cat.action=null;cat.activeIntent.lifecycle='open';cat.activeIntent.replanCount=1;
assert.equal(E.planOpenIntent(st,cat),true);
assert.equal(cat.activeIntent.id,'intent:orange:0:drinkWater','hard replan must keep Intent identity');
assert.equal(cat.action?.targetObject,'cupB');
assert.notEqual(cat.action?.decisionId,priorHard,'replacement Action under the same Intent must get a new Decision identity');
assert.equal(cat.decisionEvidence.source.type,'hardReplan');
assert.equal(cat.decisionEvidence.priorDecisionId,priorHard);
assert.equal(E.decisionEvidenceMatchesAction(cat),true);
noIssues('hard replan identity');

E.reset(3603);st=E.getState();a=st.agents.zhen;quiet(a);a.needs.thirst=99;
a.activeIntent={id:'intent:zhen:0:explore',kind:'explore',createdTick:0,lifecycle:'actionBound',source:{type:'test',tick:0}};
a.action={kind:'wander',phase:'move',started:0,wait:0,targetTile:{x:2,y:6},oneShot:true,intentId:a.activeIntent.id};
const priorEmergency=E.adoptDecisionEvidence(st,a,a.action,{source:{type:'test',tick:0,intentKind:'explore'},contributors:[]}).id;
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(a.activeIntent?.source?.type,'emergency');
assert.equal(a.action?.kind,'drinkWater');
assert.notEqual(a.action?.decisionId,priorEmergency);
assert.equal(a.decisionEvidence?.source?.type,'emergency');
assert.equal(a.decisionEvidence?.priorDecisionId,priorEmergency);
assert.ok(a.decisionEvidence?.contributors.some(c=>c.kind==='need'&&c.key==='thirst'&&c.role==='emergency'));
noIssues('emergency adopted evidence');

E.reset(3604);st=E.getState();a=st.agents.zhen;quiet(a);a.needs.social=95;a.traits.social=1;st.agents.orange.offMap=true;const zhou=st.agents.zhou;zhou.offMap=false;zhou.action=null;zhou.activeIntent=null;
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(a.action?.kind,'talk','focused social setup should choose talk');
const targetEvidence=a.decisionEvidence?.contributors.find(c=>c.kind==='socialTarget');
assert.ok(targetEvidence,'final social decision must freeze selected target ranking evidence');
assert.equal(targetEvidence.targetAgent,a.action.targetAgent);
assert.equal(E.decisionEvidenceMatchesAction(a),true);
noIssues('selected target evidence');

console.log('v11.36.0 adopted Decision Evidence regression: ok');
