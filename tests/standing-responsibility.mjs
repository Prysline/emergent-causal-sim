import assert from 'node:assert/strict';
import {loadProductionBefore,loadScriptsInThisContext} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');
loadScriptsInThisContext(['src/editor-authoring-mutations.js','src/editor-standing-responsibility-authoring.js']);

const E=globalThis.SimEngine,S=globalThis.SimStandingResponsibility,A=globalThis.SimWorldAuthoring,M=globalThis.SimEditorAuthoringMutations,W=globalThis.SimWorld;
assert.ok(E&&S&&A&&M&&W,'Standing Responsibility production contracts must load');
assert.equal(A.DEFAULT_WORLD_AUTHORING.authoringSchema,A.VERSION,'Consumer must follow canonical current World Authoring generation');
assert.equal(S.VERSION,'standing-responsibility-v1');
assert.equal(W.STANDING_RESPONSIBILITY_SCHEMA_VERSION,S.VERSION);
assert.equal(S.STANDING_RESPONSIBILITY_MAX_DECISION_DELTA,8);

const defaultAssignment=A.DEFAULT_WORLD_AUTHORING.resourceResponsibilityAssignments.find(item=>item.id==='responsibility:zhen:restock:food');
assert.deepEqual(defaultAssignment,{id:'responsibility:zhen:restock:food',principal:{kind:'agent',id:'zhen'},responsibility:'restock',scope:{resource:'food'}});

let initialized=W.createInitialStateFromAuthoring(A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING),19001);
assert.deepEqual(initialized.resourceResponsibilityAssignments,[defaultAssignment],'canonical World factory must preserve responsibility truth once');
assert.deepEqual(initialized.agents.zhen.knownResponsibilityAssignmentIds,[defaultAssignment.id],'authored assignee must know own assignment on DAY 0');
assert.deepEqual(initialized.agents.zhou.knownResponsibilityAssignmentIds,[],'non-assignee must not inherit World responsibility knowledge');
assert.equal(Object.prototype.hasOwnProperty.call(initialized.agents.zhen,'resourceResponsibilityAssignments'),false,'Agent-private state must reference assignment IDs instead of copying canonical assignment truth');

const zhen=initialized.agents.zhen,zhou=initialized.agents.zhou,restockOption={id:'restockContainer',score:40,job:{resource:'food',destinationId:'mealTray',urgency:18}};
let contribution=S.decisionContributionForOption(initialized,zhen,restockOption);
assert.equal(contribution.scoreDelta,8,'responsibility contribution must remain bounded');
assert.equal(contribution.contributor.assignmentId,defaultAssignment.id,'responsibility evidence must trace to canonical assignment ID');
assert.equal(S.decisionContributionForOption(initialized,zhou,restockOption),null,'non-responsible Agent must not receive responsibility evidence');
zhou.knownResponsibilityAssignmentIds=[defaultAssignment.id];
assert.equal(S.decisionContributionForOption(initialized,zhou,restockOption),null,'arbitrary private knowledge ref must not override canonical principal ownership');
assert.equal(S.decisionContributionForOption(initialized,zhen,{id:'eat',score:90}),null,'responsibility must not contribute to unrelated options');

function neutralize(agent){
  Object.assign(agent.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,groomingNeed:0});
  if(agent.traits){agent.traits.alcoholLike=0;agent.traits.social=0;agent.traits.animalAffinity=0;agent.traits.curious=0;}
  agent.action=null;agent.activeIntent=null;agent.decisionEvidence=null;
}

E.reset(19002);
let st=E.getState();
for(const agent of Object.values(st.agents))neutralize(agent);
E.tick();
assert.equal(st.thoughts.zhen.options.some(option=>option.id==='restockContainer'),false,'responsibility alone must not create restock option while resource is not low');

E.reset(19003);st=E.getState();for(const agent of Object.values(st.agents))neutralize(agent);st.objects.mealTray.contents.food=0;
E.tick();
const responsibleOption=st.thoughts.zhen.options.find(option=>option.id==='restockContainer'&&option.job?.resource==='food');
const nonResponsibleOption=st.thoughts.zhou.options.find(option=>option.id==='restockContainer'&&option.job?.resource==='food');
assert.ok(responsibleOption,'existing legal restock candidate must remain available to responsible Agent');
assert.ok(nonResponsibleOption,'existing legal restock candidate must remain available to non-responsible Agent');
assert.ok(responsibleOption.decisionContributors.some(item=>item.kind==='environment'&&item.key==='resourceLow'),'objective necessity evidence must remain distinct');
const responsibilityContributors=responsibleOption.decisionContributors.filter(item=>item.kind==='standingResponsibility');
assert.equal(responsibilityContributors.length,1,'existing restock option must receive exactly one responsibility contributor');
assert.equal(responsibilityContributors[0].assignmentId,defaultAssignment.id);
assert.equal(nonResponsibleOption.decisionContributors.some(item=>item.kind==='standingResponsibility'),false,'non-responsible Agent must not receive responsibility contributor');
assert.equal(responsibilityContributors.some(item=>item.kind==='routine'||item.kind==='obligation'),false,'responsibility evidence must not mirror Routine or Obligation evidence');

E.reset(19004);st=E.getState();for(const agent of Object.values(st.agents))neutralize(agent);st.objects.mealTray.contents.food=0;st.agents.zhen.knownResponsibilityAssignmentIds=[];
E.tick();
const worldOnly=st.thoughts.zhen.options.find(option=>option.id==='restockContainer'&&option.job?.resource==='food');
assert.ok(worldOnly,'objective restock candidate must still exist');
assert.equal(worldOnly.decisionContributors.some(item=>item.kind==='standingResponsibility'),false,'World assignment must not be read directly as Agent knowledge');

E.reset(19005);st=E.getState();for(const agent of Object.values(st.agents))neutralize(agent);st.objects.mealTray.contents.food=0;
const durableBefore=JSON.stringify(st.resourceResponsibilityAssignments),knownBefore=[...st.agents.zhen.knownResponsibilityAssignmentIds];
let completed=false;
for(let i=0;i<100&&!completed;i++){
  E.tick();
  completed=st.events.some(event=>event.data?.actor==='zhen'&&event.data?.action==='restockContainer'&&event.data?.to==='mealTray');
}
assert.equal(completed,true,'fixture must complete at least one responsible food restock');
assert.equal(JSON.stringify(st.resourceResponsibilityAssignments),durableBefore,'restock completion must not delete durable World responsibility assignment');
assert.deepEqual(st.agents.zhen.knownResponsibilityAssignmentIds,knownBefore,'restock completion must not delete Agent-private known responsibility refs');

function invalid(mutator,expectedCode){
  const authoring=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);mutator(authoring);
  const report=A.validateAuthoring(authoring);
  assert.equal(report.ok,false,`fixture must be invalid for ${expectedCode}`);
  assert.ok(report.errors.some(item=>item.code===expectedCode),`validator must fail loudly with ${expectedCode}`);
}
invalid(authoring=>authoring.resourceResponsibilityAssignments.push({...authoring.resourceResponsibilityAssignments[0]}),'authoring_resource_responsibility_id_duplicate');
invalid(authoring=>authoring.resourceResponsibilityAssignments.push({id:'semantic-duplicate',principal:{kind:'agent',id:'zhen'},responsibility:'restock',scope:{resource:'food'}}),'authoring_resource_responsibility_duplicate');
invalid(authoring=>{authoring.resourceResponsibilityAssignments[0].principal.id='missing';},'authoring_resource_responsibility_principal_invalid');
invalid(authoring=>{authoring.resourceResponsibilityAssignments[0].responsibility='clean';},'authoring_resource_responsibility_kind_invalid');
invalid(authoring=>{authoring.resourceResponsibilityAssignments[0].scope={};},'authoring_resource_responsibility_scope_invalid');

const editorResult=M.setResidentRestockResponsibility(A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING),{residentId:'zhen',resource:'water',assigned:true});
assert.equal(editorResult.ok,true,'Editor mutation must author a second replenishment responsibility through canonical World relation');
const serialized=A.serializeAuthoring(editorResult.candidate),parsed=A.parseAuthoringJSON(serialized);
initialized=W.createInitialStateFromAuthoring(parsed,19006);
assert.deepEqual(initialized.agents.zhen.knownResponsibilityAssignmentIds.sort(),['responsibility:zhen:restock:food','responsibility:zhen:restock:water'],'Editor authoring → export → canonical World initial-state pipeline must preserve assignment linkage');
assert.equal(initialized.resourceResponsibilityAssignments.length,2);

console.log('standing responsibility regression passed');
